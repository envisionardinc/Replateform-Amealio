import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  PaymentStatusName,
  RefundStatusName,
  TipBeneficiaryPolicyName,
  TipPaymentRecord,
} from '../domain/tip.types';

/** Order context needed to establish tip ownership, basis, and currency. */
export interface OrderTipContext {
  id: string;
  merchantId: string;
  grandTotalMinor: bigint;
  currencyCode: string;
  status: string;
}

interface TipRow {
  id: string;
  orderId: string;
  merchantId: string;
  basisMinor: bigint;
  percentBps: number | null;
  isCustom: boolean;
  amountMinor: bigint;
  currencyCode: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  capturedAt: Date | null;
  refundedAmountMinor: bigint;
  refundStatus: string | null;
  providerRefundId: string | null;
  refundedAt: Date | null;
  beneficiaryPolicy: string;
  createdAt: Date;
}

/**
 * Write/read access to `TipPayment` (P1.7.38). Fully isolated from the order
 * payment: this repository never reads or writes `PaymentIntent`, the order total,
 * the commission basis, or settlement. Idempotency is DB-enforced:
 * `razorpayOrderId @unique` (one tip intent per provider order),
 * `razorpayPaymentId @unique` (one capture per provider payment), and the partial
 * unique index `tip_one_captured_per_order` (at most one CAPTURED tip per order).
 */
@Injectable()
export class TipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderForTip(orderId: string): Promise<OrderTipContext | null> {
    try {
      return await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          merchantId: true,
          grandTotalMinor: true,
          currencyCode: true,
          status: true,
        },
      });
    } catch {
      return null;
    }
  }

  async findByRazorpayOrderId(razorpayOrderId: string): Promise<TipPaymentRecord | null> {
    const row = await this.prisma.tipPayment.findUnique({ where: { razorpayOrderId } });
    return row ? toTip(row) : null;
  }

  async findById(id: string): Promise<TipPaymentRecord | null> {
    const row = await this.prisma.tipPayment.findUnique({ where: { id } });
    return row ? toTip(row) : null;
  }

  async findByOrder(orderId: string): Promise<TipPaymentRecord[]> {
    const rows = await this.prisma.tipPayment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toTip);
  }

  /**
   * Create a tip payment. Idempotent per provider order id: if one already exists
   * for `razorpayOrderId`, the existing record is returned (no duplicate).
   */
  async createTip(args: {
    orderId: string;
    merchantId: string;
    basisMinor: bigint;
    percentBps: number | null;
    isCustom: boolean;
    amountMinor: bigint;
    currencyCode: string;
    beneficiaryPolicy: TipBeneficiaryPolicyName;
    razorpayOrderId: string;
  }): Promise<{ tip: TipPaymentRecord; created: boolean }> {
    try {
      const row = await this.prisma.tipPayment.create({
        data: {
          orderId: args.orderId,
          merchantId: args.merchantId,
          basisMinor: args.basisMinor,
          percentBps: args.percentBps,
          isCustom: args.isCustom,
          amountMinor: args.amountMinor,
          currencyCode: args.currencyCode,
          status: 'CREATED',
          beneficiaryPolicy: args.beneficiaryPolicy,
          razorpayOrderId: args.razorpayOrderId,
        },
      });
      return { tip: toTip(row), created: true };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await this.prisma.tipPayment.findUnique({
          where: { razorpayOrderId: args.razorpayOrderId },
        });
        if (existing) return { tip: toTip(existing), created: false };
      }
      throw e;
    }
  }

  /**
   * Record a verified capture: compare-and-set the tip to CAPTURED (only from a
   * non-captured status), stamping the provider payment id + capture time. Returns
   * `created:false` when the tip was already captured with the same provider
   * payment (idempotent). The partial unique index guarantees at most one CAPTURED
   * tip per order even under concurrency (a second captured tip throws P2002).
   */
  async recordCapture(
    tipId: string,
    razorpayPaymentId: string,
  ): Promise<{ tip: TipPaymentRecord; created: boolean }> {
    const changed = await this.prisma.tipPayment.updateMany({
      where: { id: tipId, status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
      data: { status: 'CAPTURED', razorpayPaymentId, capturedAt: new Date() },
    });
    const row = await this.prisma.tipPayment.findUniqueOrThrow({ where: { id: tipId } });
    return { tip: toTip(row), created: changed.count === 1 };
  }

  /** Mark a tip payment FAILED without overwriting a captured/refunded state. */
  async markFailed(tipId: string): Promise<void> {
    await this.prisma.tipPayment.updateMany({
      where: {
        id: tipId,
        status: { notIn: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      data: { status: 'FAILED' },
    });
  }

  /**
   * Record refund STATE on a captured tip (foundation only — the refund lifecycle
   * rides the order/payment refund flow, P1.7.39+). Idempotent via
   * `providerRefundId @unique`; the refunded amount cannot exceed the collected
   * amount. Sets PARTIALLY_REFUNDED / REFUNDED and the refund audit fields.
   */
  async recordRefundState(args: {
    tipId: string;
    amountMinor: bigint;
    providerRefundId: string;
    refundStatus: RefundStatusName;
  }): Promise<TipPaymentRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TipPayment" WHERE id = ${args.tipId}::uuid FOR UPDATE`;
      const tip = await tx.tipPayment.findUniqueOrThrow({ where: { id: args.tipId } });
      // Idempotency: a redelivered event with the SAME provider refund id is a
      // no-op (never double-applies). A single refund reference is a deliberate
      // foundation limitation — a full multi-refund ledger is deferred to the
      // refund-lifecycle slice (P1.7.39+).
      if (tip.providerRefundId === args.providerRefundId) {
        return toTip(tip);
      }
      const alreadyRefunded = tip.refundedAmountMinor;
      const newRefunded = alreadyRefunded + args.amountMinor;
      const status =
        args.refundStatus === 'PROCESSED'
          ? newRefunded >= tip.amountMinor
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED'
          : tip.status;
      const updated = await tx.tipPayment.update({
        where: { id: args.tipId },
        data: {
          refundedAmountMinor: args.refundStatus === 'PROCESSED' ? newRefunded : alreadyRefunded,
          refundStatus: args.refundStatus,
          providerRefundId: args.providerRefundId,
          refundedAt: args.refundStatus === 'PROCESSED' ? new Date() : tip.refundedAt,
          status,
        },
      });
      return toTip(updated);
    });
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function toTip(row: TipRow): TipPaymentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    merchantId: row.merchantId,
    basisMinor: row.basisMinor,
    percentBps: row.percentBps,
    isCustom: row.isCustom,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    status: row.status as PaymentStatusName,
    razorpayOrderId: row.razorpayOrderId,
    razorpayPaymentId: row.razorpayPaymentId,
    capturedAt: row.capturedAt,
    refundedAmountMinor: row.refundedAmountMinor,
    refundStatus: row.refundStatus as RefundStatusName | null,
    providerRefundId: row.providerRefundId,
    refundedAt: row.refundedAt,
    beneficiaryPolicy: row.beneficiaryPolicy as TipBeneficiaryPolicyName,
    createdAt: row.createdAt,
  };
}
