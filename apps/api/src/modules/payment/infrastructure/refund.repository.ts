import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { RefundMethodName, RefundResult } from '../domain/refund.types';

/** PaymentIntent statuses a refund may be issued against. */
const REFUNDABLE_STATUSES: PaymentStatus[] = [
  PaymentStatus.CAPTURED,
  PaymentStatus.PARTIALLY_REFUNDED,
];

/** Statuses that RESERVE part of the captured amount (exclude only FAILURE).
 *  Counting INITIATED prevents async provider refunds from over-subscribing. */
const RESERVING_STATUSES = ['INITIATED', 'PROCESSED'] as const;

interface RefundRow {
  id: string;
  paymentIntentId: string | null;
  orderId: string | null;
  amountMinor: bigint;
  currencyCode: string;
  status: string;
  method: string;
  providerRefundId: string | null;
}

/** Order/restaurant context behind a payment intent (for refund authorization). */
export interface RefundAuthContext {
  intentStatus: PaymentStatus;
  orderId: string | null;
  restaurantId: string | null;
}

interface EffectContext {
  refundId: string;
  intentId: string;
  intentAmountMinor: bigint;
  orderId: string | null;
  userId: string;
  merchantId: string | null;
  amount: bigint;
  currencyCode: string;
  /** Σ(PROCESSED refunds) EXCLUDING this refund — used to decide full vs partial. */
  processedBefore: bigint;
}

/**
 * Refund write access over the EXISTING `Refund`/`Wallet`/`WalletEntry`/
 * `Transaction`/`CouponRedemption` (P1.7.29 + P1.7.30). Every mutation runs in one
 * `prisma.$transaction` under a per-PaymentIntent row lock (serializes the
 * refundable-amount check: total refunds can never exceed the captured amount) and
 * a per-Wallet row lock (serializes the balance). Idempotency is DB-enforced by
 * `Refund.idempotencyKey @unique` (request) and `Refund.providerRefundId @unique`
 * (provider). Financial effects are shared by the synchronous WALLET path and the
 * asynchronous RAZORPAY completion path (never duplicated).
 */
@Injectable()
export class RefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- lookups ----

  async findRefundByIdempotencyKey(idempotencyKey: string): Promise<RefundResult | null> {
    const refund = await this.prisma.refund.findUnique({ where: { idempotencyKey } });
    return refund ? this.toResult(refund) : null;
  }

  async findRefundByProviderRefundId(providerRefundId: string): Promise<RefundResult | null> {
    const refund = await this.prisma.refund.findUnique({ where: { providerRefundId } });
    return refund ? this.toResult(refund) : null;
  }

  /** Authorization context: the order + restaurant behind a payment intent. */
  async findAuthContext(paymentIntentId: string): Promise<RefundAuthContext | null> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      select: { status: true, orderId: true, order: { select: { restaurantId: true } } },
    });
    if (!intent) return null;
    return {
      intentStatus: intent.status,
      orderId: intent.orderId,
      restaurantId: intent.order?.restaurantId ?? null,
    };
  }

  /** The captured provider payment id to refund against (Razorpay payment id). */
  async findCapturedProviderPaymentId(paymentIntentId: string): Promise<string | null> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { paymentIntentId, status: 'CAPTURED', razorpayPaymentId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { razorpayPaymentId: true },
    });
    return attempt?.razorpayPaymentId ?? null;
  }

  // ---- synchronous WALLET refund (P1.7.29) ----

  async processWalletRefund(args: {
    paymentIntentId: string;
    requestedAmountMinor: bigint | null;
    idempotencyKey: string;
  }): Promise<RefundResult> {
    return this.prisma.$transaction(async (tx) => {
      const { intent, order, amount, processedBefore } = await this.lockAndValidate(
        tx,
        args.paymentIntentId,
        args.requestedAmountMinor,
      );

      const refund = await tx.refund.create({
        data: {
          orderId: intent.orderId,
          paymentIntentId: intent.id,
          method: 'WALLET',
          amountMinor: amount,
          currencyCode: order.currencyCode,
          status: 'PROCESSED',
          idempotencyKey: args.idempotencyKey,
        },
        select: { id: true },
      });

      const effects = await this.applyEffects(tx, {
        refundId: refund.id,
        intentId: intent.id,
        intentAmountMinor: intent.amountMinor,
        orderId: intent.orderId,
        userId: order.userId,
        merchantId: order.merchantId,
        amount,
        currencyCode: order.currencyCode,
        processedBefore,
      });

      return {
        refundId: refund.id,
        paymentIntentId: intent.id,
        amountMinor: amount,
        currencyCode: order.currencyCode,
        status: 'PROCESSED',
        providerRefundId: null,
        walletEntryId: effects.walletEntryId,
        transactionId: effects.transactionId,
        walletBalanceMinor: effects.walletBalanceMinor,
        intentStatus: effects.intentStatus,
        fullyRefunded: effects.fullyRefunded,
        couponReversed: effects.couponReversed,
        created: true,
      };
    });
  }

  // ---- asynchronous RAZORPAY refund (P1.7.30) ----

  /** Reserve a provider refund: validate + create an INITIATED Refund (which
   *  reserves the amount). NO financial effects yet. Returns the provider payment
   *  id to call Razorpay with. */
  async reserveProviderRefund(args: {
    paymentIntentId: string;
    requestedAmountMinor: bigint | null;
    idempotencyKey: string;
  }): Promise<{ refundId: string; amount: bigint; providerPaymentId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const { intent, order, amount } = await this.lockAndValidate(
        tx,
        args.paymentIntentId,
        args.requestedAmountMinor,
      );
      const attempt = await tx.paymentAttempt.findFirst({
        where: { paymentIntentId: intent.id, status: 'CAPTURED', razorpayPaymentId: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { razorpayPaymentId: true },
      });
      if (!attempt?.razorpayPaymentId) {
        throw new BadRequestException('No captured provider payment to refund');
      }
      const refund = await tx.refund.create({
        data: {
          orderId: intent.orderId,
          paymentIntentId: intent.id,
          method: 'RAZORPAY',
          amountMinor: amount,
          currencyCode: order.currencyCode,
          status: 'INITIATED',
          idempotencyKey: args.idempotencyKey,
        },
        select: { id: true },
      });
      return { refundId: refund.id, amount, providerPaymentId: attempt.razorpayPaymentId };
    });
  }

  async attachProviderRefundId(
    refundId: string,
    providerRefundId: string,
    payload: Prisma.InputJsonValue | undefined,
  ): Promise<void> {
    await this.prisma.refund.update({
      where: { id: refundId },
      data: { providerRefundId, gatewayPayload: payload },
    });
  }

  async markInitiatedFailed(refundId: string): Promise<void> {
    // Release the reservation only if still INITIATED (compare-and-set).
    await this.prisma.refund.updateMany({
      where: { id: refundId, status: 'INITIATED' },
      data: { status: 'FAILURE' },
    });
  }

  /**
   * Complete a provider refund (authoritative PROCESSED point). Idempotent: the
   * INITIATED→PROCESSED compare-and-set applies the financial effects exactly once;
   * a duplicate webhook / synchronous+webhook both converge on the same state.
   */
  async completeProviderRefund(providerRefundId: string): Promise<RefundResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { providerRefundId } });
      if (!refund || !refund.paymentIntentId) return null;
      if (refund.status !== 'INITIATED') {
        return this.toResultFromRow(tx, refund); // already processed/failed — no-op
      }

      // Lock the intent, then flip the refund INITIATED→PROCESSED (exactly-once).
      await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id = ${refund.paymentIntentId}::uuid FOR UPDATE`;
      const flipped = await tx.refund.updateMany({
        where: { id: refund.id, status: 'INITIATED' },
        data: { status: 'PROCESSED' },
      });
      if (flipped.count === 0) {
        return this.toResultFromRow(
          tx,
          await tx.refund.findUniqueOrThrow({ where: { id: refund.id } }),
        );
      }

      const intent = await tx.paymentIntent.findUniqueOrThrow({
        where: { id: refund.paymentIntentId },
      });
      const order = refund.orderId
        ? await tx.order.findUnique({
            where: { id: refund.orderId },
            select: { userId: true, merchantId: true, currencyCode: true },
          })
        : null;
      if (!order?.userId) {
        throw new BadRequestException('Refund requires an order with a customer wallet owner');
      }
      // Σ(PROCESSED) excluding this refund (which we just flipped).
      const agg = await tx.refund.aggregate({
        where: { paymentIntentId: intent.id, status: 'PROCESSED', id: { not: refund.id } },
        _sum: { amountMinor: true },
      });
      const effects = await this.applyEffects(tx, {
        refundId: refund.id,
        intentId: intent.id,
        intentAmountMinor: intent.amountMinor,
        orderId: refund.orderId,
        userId: order.userId,
        merchantId: order.merchantId,
        amount: refund.amountMinor,
        currencyCode: refund.currencyCode,
        processedBefore: agg._sum.amountMinor ?? 0n,
      });

      return {
        refundId: refund.id,
        paymentIntentId: intent.id,
        amountMinor: refund.amountMinor,
        currencyCode: refund.currencyCode,
        status: 'PROCESSED' as const,
        providerRefundId,
        walletEntryId: effects.walletEntryId,
        transactionId: effects.transactionId,
        walletBalanceMinor: effects.walletBalanceMinor,
        intentStatus: effects.intentStatus,
        fullyRefunded: effects.fullyRefunded,
        couponReversed: effects.couponReversed,
        created: true,
      };
    });
  }

  async failProviderRefund(providerRefundId: string): Promise<void> {
    await this.prisma.refund.updateMany({
      where: { providerRefundId, status: 'INITIATED' },
      data: { status: 'FAILURE' },
    });
  }

  async getResult(refundId: string): Promise<RefundResult> {
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    return this.toResult(refund);
  }

  // ---- shared internals ----

  /** Lock the intent, validate it is refundable, and resolve the refund amount +
   *  the customer wallet owner. `remaining` reserves INITIATED + PROCESSED refunds. */
  private async lockAndValidate(
    tx: Prisma.TransactionClient,
    paymentIntentId: string,
    requestedAmountMinor: bigint | null,
  ) {
    await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id = ${paymentIntentId}::uuid FOR UPDATE`;
    const intent = await tx.paymentIntent.findUnique({ where: { id: paymentIntentId } });
    if (!intent) throw new NotFoundException('PaymentIntent not found');
    if (!REFUNDABLE_STATUSES.includes(intent.status)) {
      throw new BadRequestException('Payment is not captured; cannot refund');
    }
    const agg = await tx.refund.aggregate({
      where: { paymentIntentId: intent.id, status: { in: [...RESERVING_STATUSES] } },
      _sum: { amountMinor: true },
    });
    const reserved = agg._sum.amountMinor ?? 0n;
    const remaining = intent.amountMinor - reserved;
    const amount = requestedAmountMinor ?? remaining;
    if (amount <= 0n) throw new BadRequestException('Refund amount must be greater than zero');
    if (amount > remaining) {
      throw new BadRequestException('Refund amount exceeds the remaining refundable amount');
    }
    const order = intent.orderId
      ? await tx.order.findUnique({
          where: { id: intent.orderId },
          select: { userId: true, merchantId: true, currencyCode: true },
        })
      : null;
    if (!order?.userId) {
      throw new BadRequestException('Refund requires an order with a customer wallet owner');
    }
    return {
      intent,
      order: {
        userId: order.userId,
        merchantId: order.merchantId,
        currencyCode: order.currencyCode ?? intent.currencyCode,
      },
      amount,
      processedBefore: reserved, // for WALLET (no INITIATED) reserved == Σ PROCESSED
    };
  }

  /** Wallet credit + WalletEntry + Transaction + intent advance + full-refund
   *  coupon reversal — the single, shared financial effect (P1.7.29). */
  private async applyEffects(tx: Prisma.TransactionClient, c: EffectContext) {
    await tx.wallet.upsert({
      where: { userId: c.userId },
      create: { userId: c.userId, balanceMinor: 0n, currencyCode: c.currencyCode },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${c.userId}::uuid FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: c.userId } });
    const newBalance = wallet.balanceMinor + c.amount;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: newBalance } });
    const walletEntry = await tx.walletEntry.create({
      data: {
        walletId: wallet.id,
        direction: 'CREDIT',
        amountMinor: c.amount,
        balanceAfterMinor: newBalance,
        refType: 'REFUND',
        refId: c.refundId,
      },
      select: { id: true },
    });
    const transaction = await tx.transaction.create({
      data: {
        type: 'REFUND',
        direction: 'CREDIT',
        amountMinor: c.amount,
        currencyCode: c.currencyCode,
        userId: c.userId,
        merchantId: c.merchantId,
        orderId: c.orderId,
        paymentIntentId: c.intentId,
        walletEntryId: walletEntry.id,
      },
      select: { id: true },
    });

    const fullyRefunded = c.processedBefore + c.amount === c.intentAmountMinor;
    await tx.paymentIntent.updateMany({
      where: { id: c.intentId, status: { in: REFUNDABLE_STATUSES } },
      data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });

    let couponReversed = false;
    if (fullyRefunded && c.orderId) {
      const reversal = await tx.couponRedemption.updateMany({
        where: { orderId: c.orderId, status: 'ACTIVE' },
        data: { status: 'REVERSED', reversedAt: new Date() },
      });
      couponReversed = reversal.count > 0;
    }

    return {
      walletEntryId: walletEntry.id,
      transactionId: transaction.id,
      walletBalanceMinor: newBalance,
      intentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      fullyRefunded,
      couponReversed,
    };
  }

  private async toResultFromRow(
    tx: Prisma.TransactionClient,
    refund: RefundRow,
  ): Promise<RefundResult> {
    const entry = await tx.walletEntry.findFirst({
      where: { refType: 'REFUND', refId: refund.id },
      orderBy: { createdAt: 'asc' },
    });
    const intent = refund.paymentIntentId
      ? await tx.paymentIntent.findUnique({ where: { id: refund.paymentIntentId } })
      : null;
    const txn = entry
      ? await tx.transaction.findFirst({
          where: { walletEntryId: entry.id },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    return this.buildResult(refund, entry, txn, intent);
  }

  private async toResult(refund: RefundRow): Promise<RefundResult> {
    const entry = await this.prisma.walletEntry.findFirst({
      where: { refType: 'REFUND', refId: refund.id },
      orderBy: { createdAt: 'asc' },
    });
    const intent = refund.paymentIntentId
      ? await this.prisma.paymentIntent.findUnique({ where: { id: refund.paymentIntentId } })
      : null;
    const txn = entry
      ? await this.prisma.transaction.findFirst({
          where: { walletEntryId: entry.id },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    return this.buildResult(refund, entry, txn, intent);
  }

  private buildResult(
    refund: RefundRow,
    entry: { id: string; balanceAfterMinor: bigint } | null,
    txn: { id: string } | null,
    intent: { status: string } | null,
  ): RefundResult {
    return {
      refundId: refund.id,
      paymentIntentId: refund.paymentIntentId ?? '',
      amountMinor: refund.amountMinor,
      currencyCode: refund.currencyCode,
      status: refund.status as RefundResult['status'],
      providerRefundId: refund.providerRefundId,
      walletEntryId: entry?.id ?? '',
      transactionId: txn?.id ?? '',
      walletBalanceMinor: entry?.balanceAfterMinor ?? 0n,
      intentStatus: intent?.status ?? 'UNKNOWN',
      fullyRefunded: intent?.status === 'REFUNDED',
      couponReversed: false,
      created: false,
    };
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export type { RefundMethodName };
