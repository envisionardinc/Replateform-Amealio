import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { PayoutResult, SettlementResult } from '../domain/settlement.types';

/** A captured payment's net-of-refund contribution to a merchant settlement. */
export interface EligibleContribution {
  paymentIntentId: string;
  orderId: string | null;
  /** Net-of-refund captured amount — the merchant payout-pool contribution. */
  netMinor: bigint;
  /** Commissionable basis (subtotal − vendor-funded discount; ADMIN discount not
   *  subtracted; refund-independent) — VERIFIED legacy commission basis. */
  commissionBasisMinor: bigint;
  currencyCode: string;
  /** Capture instant (earliest CAPTURED attempt) — drives the settleAfter window. */
  capturedAt: Date | null;
}

/**
 * Settlement/payout write access over the EXISTING `Settlement`/`SettlementItem`/
 * `Payout` (P1.7.31). Settlement is DERIVED from captured `PaymentIntent`s net of
 * PROCESSED `Refund`s. Idempotency is DB-enforced: `SettlementItem.paymentIntentId
 * @unique` (a payment settles once) and `Payout.idempotencyKey`/`providerPayoutId
 * @unique`. Merchant isolation is enforced by filtering on `Order.merchantId`.
 */
@Injectable()
export class SettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The authoritative commission rate + owning merchant for a restaurant. */
  async getRestaurantForSettlement(
    restaurantId: string,
  ): Promise<{ merchantId: string; commissionBps: number | null } | null> {
    return this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantId: true, commissionBps: true },
    });
  }

  /**
   * Captured, not-yet-settled payments for a merchant's restaurant, with each
   * payment's net-of-refund contribution + capture instant. Only payments whose
   * ORDER is COMPLETED are eligible (P1.7.33; VERIFIED legacy rule — settlement
   * requires `order_status = COMPLETED`, doc 61 §4). Fully-refunded (net ≤ 0)
   * payments are excluded. Merchant + restaurant isolated. The settleAfter window
   * is applied by the service (needs config + `now`).
   */
  async findEligibleContributions(
    merchantId: string,
    restaurantId: string,
  ): Promise<EligibleContribution[]> {
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
        settlementItems: { none: {} },
        order: { is: { merchantId, restaurantId, status: 'COMPLETED' } },
      },
      select: {
        id: true,
        orderId: true,
        amountMinor: true,
        currencyCode: true,
        refunds: { where: { status: 'PROCESSED' }, select: { amountMinor: true } },
        attempts: {
          where: { status: 'CAPTURED' },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        // For the commissionable basis (P1.7.34): pre-discount item subtotal, the
        // discount, and the offer's funding party (ADMIN-funded discount is NOT
        // subtracted from the basis; VERIFIED legacy `totalComission`).
        order: {
          select: {
            subtotalMinor: true,
            discountTotalMinor: true,
            offer: { select: { settlementType: true } },
          },
        },
      },
    });

    const out: EligibleContribution[] = [];
    for (const i of intents) {
      const refunded = i.refunds.reduce((a, r) => a + r.amountMinor, 0n);
      const net = i.amountMinor - refunded;
      if (net <= 0n) continue; // fully refunded / no payout contribution

      const subtotal = i.order?.subtotalMinor ?? 0n;
      const discount = i.order?.discountTotalMinor ?? 0n;
      const adminFunded = i.order?.offer?.settlementType === 'ADMIN';
      let basis = subtotal - (adminFunded ? 0n : discount);
      if (basis < 0n) basis = 0n; // never negative

      out.push({
        paymentIntentId: i.id,
        orderId: i.orderId,
        netMinor: net,
        commissionBasisMinor: basis,
        currencyCode: i.currencyCode,
        capturedAt: i.attempts[0]?.createdAt ?? null,
      });
    }
    return out;
  }

  /**
   * Create a Settlement + its SettlementItems atomically. `commissionMinor` is
   * computed by the caller (exact). The `SettlementItem.paymentIntentId @unique`
   * guarantees no payment is settled twice, even under concurrency (a competing run
   * hits the unique constraint → this transaction rolls back).
   */
  async createSettlement(args: {
    merchantId: string;
    restaurantId: string | null;
    currencyCode: string;
    commissionBps: number;
    commissionBasisMinor: bigint;
    commissionMinor: bigint;
    grossAmountMinor: bigint;
    netAmountMinor: bigint;
    items: Array<{ paymentIntentId: string; orderId: string | null; amountMinor: bigint }>;
  }): Promise<SettlementResult> {
    const created = await this.prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.create({
        data: {
          merchantId: args.merchantId,
          restaurantId: args.restaurantId,
          payoutType: 'ORDER',
          status: 'PENDING',
          grossAmountMinor: args.grossAmountMinor,
          commissionBasisMinor: args.commissionBasisMinor,
          commissionMinor: args.commissionMinor,
          commissionBps: args.commissionBps,
          amountMinor: args.netAmountMinor,
          currencyCode: args.currencyCode,
          items: {
            create: args.items.map((it) => ({
              orderId: it.orderId,
              paymentIntentId: it.paymentIntentId,
              amountMinor: it.amountMinor,
            })),
          },
        },
        select: { id: true },
      });
      return settlement.id;
    });
    return this.getSettlement(created);
  }

  async getSettlement(settlementId: string): Promise<SettlementResult> {
    const s = await this.prisma.settlement.findUniqueOrThrow({
      where: { id: settlementId },
      include: { _count: { select: { items: true } } },
    });
    return {
      settlementId: s.id,
      merchantId: s.merchantId,
      restaurantId: s.restaurantId,
      grossAmountMinor: s.grossAmountMinor,
      commissionBasisMinor: s.commissionBasisMinor,
      commissionMinor: s.commissionMinor,
      commissionBps: s.commissionBps,
      netAmountMinor: s.amountMinor,
      currencyCode: s.currencyCode,
      itemCount: s._count.items,
      status: s.status as SettlementResult['status'],
    };
  }

  // ---- payout ----

  async findPayoutByIdempotencyKey(idempotencyKey: string): Promise<PayoutResult | null> {
    const p = await this.prisma.payout.findUnique({ where: { idempotencyKey } });
    return p ? this.toPayoutResult(p) : null;
  }

  async loadSettlementForPayout(
    settlementId: string,
  ): Promise<{ id: string; amountMinor: bigint; status: string }> {
    const s = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { id: true, amountMinor: true, status: true },
    });
    if (!s) throw new NotFoundException('Settlement not found');
    return s;
  }

  /** Reserve a payout (PENDING) with the request idempotency key. */
  async reservePayout(
    settlementId: string,
    amountMinor: bigint,
    idempotencyKey: string,
  ): Promise<string> {
    if (amountMinor <= 0n) {
      throw new BadRequestException('Payout amount must be greater than zero');
    }
    const payout = await this.prisma.payout.create({
      data: { settlementId, amountMinor, status: 'PENDING', idempotencyKey },
      select: { id: true },
    });
    return payout.id;
  }

  async attachProviderPayoutId(
    payoutId: string,
    providerPayoutId: string,
    payload: Prisma.InputJsonValue | undefined,
  ): Promise<void> {
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { providerPayoutId, payload },
    });
  }

  /** Mark a payout COMPLETED (idempotent) and advance the settlement to COMPLETED. */
  async completePayout(providerPayoutId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { providerPayoutId } });
      if (!payout) return;
      const flipped = await tx.payout.updateMany({
        where: { id: payout.id, status: 'PENDING' },
        data: { status: 'COMPLETED' },
      });
      if (flipped.count === 0) return; // already terminal — idempotent no-op
      await tx.settlement.updateMany({
        where: { id: payout.settlementId, status: { in: ['PENDING', 'PARTIAL'] } },
        data: { status: 'COMPLETED' },
      });
    });
  }

  async failPayout(providerPayoutId: string): Promise<void> {
    await this.prisma.payout.updateMany({
      where: { providerPayoutId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  }

  async getPayout(payoutId: string): Promise<PayoutResult> {
    const p = await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    return this.toPayoutResult(p);
  }

  private toPayoutResult(p: {
    id: string;
    settlementId: string;
    providerPayoutId: string | null;
    amountMinor: bigint;
    status: string;
  }): PayoutResult {
    return {
      payoutId: p.id,
      settlementId: p.settlementId,
      providerPayoutId: p.providerPayoutId,
      amountMinor: p.amountMinor,
      status: p.status as PayoutResult['status'],
      created: false,
    };
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
