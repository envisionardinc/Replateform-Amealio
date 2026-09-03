import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { RefundResult } from '../domain/refund.types';

/** PaymentIntent statuses a refund may be issued against. */
const REFUNDABLE_STATUSES: PaymentStatus[] = [
  PaymentStatus.CAPTURED,
  PaymentStatus.PARTIALLY_REFUNDED,
];

interface ProcessArgs {
  paymentIntentId: string;
  requestedAmountMinor: bigint | null; // null => full remaining
  idempotencyKey: string;
}

/**
 * Refund write access over the EXISTING `Refund`/`Wallet`/`WalletEntry`/
 * `Transaction`/`CouponRedemption` (P1.7.29). One `prisma.$transaction` performs
 * the whole refund atomically under a per-PaymentIntent row lock (serializes the
 * refundable-amount check so total refunds can never exceed the captured amount)
 * and a per-Wallet row lock (serializes the balance update). Idempotency is
 * DB-enforced by `Refund.idempotencyKey @unique`.
 */
@Injectable()
export class RefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRefundByIdempotencyKey(idempotencyKey: string): Promise<RefundResult | null> {
    const refund = await this.prisma.refund.findUnique({ where: { idempotencyKey } });
    if (!refund) return null;
    return this.hydrateExisting(refund);
  }

  async processRefund(args: ProcessArgs): Promise<RefundResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1) Serialize refunds for this payment (consistent remaining-amount check).
      await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id = ${args.paymentIntentId}::uuid FOR UPDATE`;

      const intent = await tx.paymentIntent.findUnique({ where: { id: args.paymentIntentId } });
      if (!intent) throw new NotFoundException('PaymentIntent not found');
      if (!REFUNDABLE_STATUSES.includes(intent.status)) {
        throw new BadRequestException('Payment is not captured; cannot refund');
      }

      // 2) Remaining refundable = captured - Σ(PROCESSED refunds).
      const agg = await tx.refund.aggregate({
        where: { paymentIntentId: intent.id, status: 'PROCESSED' },
        _sum: { amountMinor: true },
      });
      const alreadyRefunded = agg._sum.amountMinor ?? 0n;
      const remaining = intent.amountMinor - alreadyRefunded;

      const amount = args.requestedAmountMinor ?? remaining;
      if (amount <= 0n) throw new BadRequestException('Refund amount must be greater than zero');
      if (amount > remaining) {
        throw new BadRequestException('Refund amount exceeds the remaining refundable amount');
      }

      // 3) Wallet owner = the order's customer (target Wallet is user-owned).
      const order = intent.orderId
        ? await tx.order.findUnique({
            where: { id: intent.orderId },
            select: { id: true, userId: true, merchantId: true, currencyCode: true },
          })
        : null;
      if (!order?.userId) {
        throw new BadRequestException('Refund requires an order with a customer wallet owner');
      }
      const currencyCode = order.currencyCode ?? intent.currencyCode;

      // 4) Refund record (PROCESSED — wallet credit is synchronous in this slice).
      const refund = await tx.refund.create({
        data: {
          orderId: intent.orderId,
          paymentIntentId: intent.id,
          method: 'WALLET',
          amountMinor: amount,
          currencyCode,
          status: 'PROCESSED',
          idempotencyKey: args.idempotencyKey,
        },
        select: { id: true },
      });

      // 5) Wallet credit under a wallet row lock (balance = Σ entries invariant).
      await tx.wallet.upsert({
        where: { userId: order.userId },
        create: { userId: order.userId, balanceMinor: 0n, currencyCode },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${order.userId}::uuid FOR UPDATE`;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: order.userId } });
      const newBalance = wallet.balanceMinor + amount;
      await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: newBalance } });
      const walletEntry = await tx.walletEntry.create({
        data: {
          walletId: wallet.id,
          direction: 'CREDIT',
          amountMinor: amount,
          balanceAfterMinor: newBalance,
          refType: 'REFUND',
          refId: refund.id,
        },
        select: { id: true },
      });

      // 6) One authoritative financial transaction for the refund/wallet-credit.
      const transaction = await tx.transaction.create({
        data: {
          type: 'REFUND',
          direction: 'CREDIT',
          amountMinor: amount,
          currencyCode,
          userId: order.userId,
          merchantId: order.merchantId,
          orderId: intent.orderId,
          paymentIntentId: intent.id,
          walletEntryId: walletEntry.id,
        },
        select: { id: true },
      });

      // 7) Advance the PaymentIntent (compare-and-set; never backward).
      const newTotalRefunded = alreadyRefunded + amount;
      const fullyRefunded = newTotalRefunded === intent.amountMinor;
      await tx.paymentIntent.updateMany({
        where: { id: intent.id, status: { in: REFUNDABLE_STATUSES } },
        data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });

      // 8) FULL refund only: reverse the order's ACTIVE coupon redemption (OD-REF-1).
      //    Predicated on status=ACTIVE => idempotent; partial refunds never reach here.
      let couponReversed = false;
      if (fullyRefunded && intent.orderId) {
        const reversal = await tx.couponRedemption.updateMany({
          where: { orderId: intent.orderId, status: 'ACTIVE' },
          data: { status: 'REVERSED', reversedAt: new Date() },
        });
        couponReversed = reversal.count > 0;
      }

      return {
        refundId: refund.id,
        paymentIntentId: intent.id,
        amountMinor: amount,
        currencyCode,
        status: 'PROCESSED' as const,
        walletEntryId: walletEntry.id,
        transactionId: transaction.id,
        walletBalanceMinor: newBalance,
        intentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        fullyRefunded,
        couponReversed,
        created: true,
      };
    });
  }

  /** Reconstruct a result for an idempotent replay (no re-application of effects). */
  private async hydrateExisting(refund: {
    id: string;
    paymentIntentId: string | null;
    amountMinor: bigint;
    currencyCode: string;
    status: string;
  }): Promise<RefundResult> {
    const entry = await this.prisma.walletEntry.findFirst({
      where: { refType: 'REFUND', refId: refund.id },
      orderBy: { createdAt: 'asc' },
    });
    const txn = await this.prisma.transaction.findFirst({
      where: { walletEntryId: entry?.id ?? '00000000-0000-0000-0000-000000000000' },
      orderBy: { createdAt: 'asc' },
    });
    const intent = refund.paymentIntentId
      ? await this.prisma.paymentIntent.findUnique({ where: { id: refund.paymentIntentId } })
      : null;
    return {
      refundId: refund.id,
      paymentIntentId: refund.paymentIntentId ?? '',
      amountMinor: refund.amountMinor,
      currencyCode: refund.currencyCode,
      status: refund.status as RefundResult['status'],
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
