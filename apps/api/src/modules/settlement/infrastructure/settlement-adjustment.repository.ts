import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CreateSettlementAdjustmentInput,
  SettlementAdjustmentPosition,
  SettlementAdjustmentResult,
} from '../domain/settlement-adjustment.types';

type AdjustmentRow = {
  id: string;
  settlementId: string;
  merchantId: string;
  type: 'ORDER_REFUND' | 'TIP_REFUND';
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: bigint;
  currencyCode: string;
  idempotencyKey: string;
  orderId: string | null;
  paymentIntentId: string | null;
  tipPaymentId: string | null;
  refundId: string | null;
  reason: string | null;
  createdAt: Date;
};

/**
 * Append-only settlement adjustment ledger (P1.7.44).
 *
 * The P1.5 Prisma schema is intentionally left untouched in this phase: the
 * adjustment table is introduced by SQL migration and accessed through
 * parameterized SQL until the next deliberate Prisma schema/client regeneration.
 * Historical Settlement/Payout rows are never rewritten.
 */
@Injectable()
export class SettlementAdjustmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAdjustment(
    args: CreateSettlementAdjustmentInput,
  ): Promise<SettlementAdjustmentResult> {
    this.validateInput(args);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const settlements = await tx.$queryRaw<Array<{
          id: string;
          merchantId: string;
          currencyCode: string;
        }>>`
          SELECT "id", "merchantId", "currencyCode"
          FROM "Settlement"
          WHERE "id" = ${args.settlementId}::uuid
          FOR UPDATE
        `;
        const settlement = settlements[0];
        if (!settlement) throw new NotFoundException('Settlement not found');
        if (settlement.merchantId !== args.merchantId) {
          throw new BadRequestException('Settlement does not belong to the merchant');
        }
        if (settlement.currencyCode !== args.currencyCode) {
          throw new BadRequestException('Adjustment currency must match the settlement currency');
        }

        const existing = await tx.$queryRaw<AdjustmentRow[]>`
          SELECT
            "id", "settlementId", "merchantId", "type", "direction", "amountMinor",
            "currencyCode", "idempotencyKey", "orderId", "paymentIntentId",
            "tipPaymentId", "refundId", "reason", "createdAt"
          FROM "SettlementAdjustment"
          WHERE "idempotencyKey" = ${args.idempotencyKey}
          LIMIT 1
        `;
        if (existing[0]) {
          this.assertSameRequest(existing[0], args);
          return { ...this.toResult(existing[0]), created: false };
        }

        await this.validateSource(tx, args);

        const created = await tx.$queryRaw<AdjustmentRow[]>`
          INSERT INTO "SettlementAdjustment" (
            "settlementId", "merchantId", "orderId", "paymentIntentId",
            "tipPaymentId", "refundId", "type", "direction", "amountMinor",
            "currencyCode", "idempotencyKey", "reason"
          ) VALUES (
            ${args.settlementId}::uuid,
            ${args.merchantId}::uuid,
            ${args.orderId ?? null}::uuid,
            ${args.paymentIntentId ?? null}::uuid,
            ${args.tipPaymentId ?? null}::uuid,
            ${args.refundId ?? null}::uuid,
            ${args.type}::"SettlementAdjustmentType",
            ${args.direction}::"SettlementAdjustmentDirection",
            ${args.amountMinor},
            ${args.currencyCode},
            ${args.idempotencyKey},
            ${args.reason ?? null}
          )
          RETURNING
            "id", "settlementId", "merchantId", "type", "direction", "amountMinor",
            "currencyCode", "idempotencyKey", "orderId", "paymentIntentId",
            "tipPaymentId", "refundId", "reason", "createdAt"
        `;

        if (!created[0]) throw new Error('Settlement adjustment insert returned no row');
        return { ...this.toResult(created[0]), created: true };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existing = await this.prisma.$queryRaw<AdjustmentRow[]>`
          SELECT
            "id", "settlementId", "merchantId", "type", "direction", "amountMinor",
            "currencyCode", "idempotencyKey", "orderId", "paymentIntentId",
            "tipPaymentId", "refundId", "reason", "createdAt"
          FROM "SettlementAdjustment"
          WHERE "idempotencyKey" = ${args.idempotencyKey}
          LIMIT 1
        `;
        if (existing[0]) {
          this.assertSameRequest(existing[0], args);
          return { ...this.toResult(existing[0]), created: false };
        }
      }
      throw error;
    }
  }

  async getPosition(settlementId: string): Promise<SettlementAdjustmentPosition> {
    const settlements = await this.prisma.$queryRaw<Array<{
      id: string;
      amountMinor: bigint;
      status: string;
    }>>`
      SELECT "id", "amountMinor", "status"
      FROM "Settlement"
      WHERE "id" = ${settlementId}::uuid
      LIMIT 1
    `;
    const settlement = settlements[0];
    if (!settlement) throw new NotFoundException('Settlement not found');

    const totals = await this.prisma.$queryRaw<Array<{
      debitAmountMinor: bigint | null;
      creditAmountMinor: bigint | null;
    }>>`
      SELECT
        COALESCE(SUM(CASE WHEN "direction" = 'DEBIT' THEN "amountMinor" ELSE 0 END), 0)::bigint
          AS "debitAmountMinor",
        COALESCE(SUM(CASE WHEN "direction" = 'CREDIT' THEN "amountMinor" ELSE 0 END), 0)::bigint
          AS "creditAmountMinor"
      FROM "SettlementAdjustment"
      WHERE "settlementId" = ${settlementId}::uuid
    `;

    const debitAmountMinor = totals[0]?.debitAmountMinor ?? 0n;
    const creditAmountMinor = totals[0]?.creditAmountMinor ?? 0n;
    const adjustedAmountMinor = settlement.amountMinor + creditAmountMinor - debitAmountMinor;

    return {
      settlementId: settlement.id,
      settlementAmountMinor: settlement.amountMinor,
      debitAmountMinor,
      creditAmountMinor,
      adjustedAmountMinor,
      payableAmountMinor: adjustedAmountMinor > 0n ? adjustedAmountMinor : 0n,
      recoverableAmountMinor: adjustedAmountMinor < 0n ? -adjustedAmountMinor : 0n,
      settlementStatus: settlement.status,
    };
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<SettlementAdjustmentResult | null> {
    const rows = await this.prisma.$queryRaw<AdjustmentRow[]>`
      SELECT
        "id", "settlementId", "merchantId", "type", "direction", "amountMinor",
        "currencyCode", "idempotencyKey", "orderId", "paymentIntentId",
        "tipPaymentId", "refundId", "reason", "createdAt"
      FROM "SettlementAdjustment"
      WHERE "idempotencyKey" = ${idempotencyKey}
      LIMIT 1
    `;
    return rows[0] ? { ...this.toResult(rows[0]), created: false } : null;
  }

  private async validateSource(
    tx: Prisma.TransactionClient,
    args: CreateSettlementAdjustmentInput,
  ): Promise<void> {
    if (args.type === 'ORDER_REFUND') {
      if (!args.orderId || !args.paymentIntentId || !args.refundId) {
        throw new BadRequestException(
          'ORDER_REFUND requires orderId, paymentIntentId, and refundId',
        );
      }

      const refunds = await tx.$queryRaw<Array<{
        id: string;
        orderId: string | null;
        paymentIntentId: string | null;
        amountMinor: bigint;
        currencyCode: string;
        status: string;
      }>>`
        SELECT "id", "orderId", "paymentIntentId", "amountMinor", "currencyCode", "status"
        FROM "Refund"
        WHERE "id" = ${args.refundId}::uuid
        FOR UPDATE
      `;
      const refund = refunds[0];
      if (!refund) throw new NotFoundException('Refund not found');
      if (refund.status !== 'PROCESSED') {
        throw new BadRequestException('Only PROCESSED refunds can create settlement adjustments');
      }
      if (refund.orderId !== args.orderId || refund.paymentIntentId !== args.paymentIntentId) {
        throw new BadRequestException('Refund source does not match the supplied order/payment intent');
      }
      if (refund.currencyCode !== args.currencyCode) {
        throw new BadRequestException('Refund currency must match the adjustment currency');
      }
      if (args.amountMinor > refund.amountMinor) {
        throw new BadRequestException('Adjustment amount cannot exceed the refund amount');
      }

      const paymentIntents = await tx.$queryRaw<Array<{
        id: string;
        orderId: string | null;
        currencyCode: string;
      }>>`
        SELECT "id", "orderId", "currencyCode"
        FROM "PaymentIntent"
        WHERE "id" = ${args.paymentIntentId}::uuid
        FOR UPDATE
      `;
      const paymentIntent = paymentIntents[0];
      if (!paymentIntent) throw new NotFoundException('Payment intent not found');
      if (paymentIntent.orderId !== args.orderId) {
        throw new BadRequestException('Payment intent does not belong to the supplied order');
      }
      if (paymentIntent.currencyCode !== args.currencyCode) {
        throw new BadRequestException('Payment intent currency must match the adjustment currency');
      }

      const orders = await tx.$queryRaw<Array<{
        id: string;
        merchantId: string;
      }>>`
        SELECT "id", "merchantId"
        FROM "Order"
        WHERE "id" = ${args.orderId}::uuid
        FOR UPDATE
      `;
      const order = orders[0];
      if (!order) throw new NotFoundException('Order not found');
      if (order.merchantId !== args.merchantId) {
        throw new BadRequestException('Order does not belong to the merchant');
      }

      const settlementItems = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "SettlementItem"
        WHERE "settlementId" = ${args.settlementId}::uuid
          AND "paymentIntentId" = ${args.paymentIntentId}::uuid
        LIMIT 1
      `;
      if (!settlementItems[0]) {
        throw new BadRequestException('Payment intent is not settled in the supplied settlement');
      }
      return;
    }

    if (!args.tipPaymentId) {
      throw new BadRequestException('TIP_REFUND requires tipPaymentId');
    }

    const tips = await tx.$queryRaw<Array<{
      id: string;
      orderId: string;
      merchantId: string;
      amountMinor: bigint;
      refundedAmountMinor: bigint;
      currencyCode: string;
    }>>`
      SELECT
        "id", "orderId", "merchantId", "amountMinor", "refundedAmountMinor", "currencyCode"
      FROM "TipPayment"
      WHERE "id" = ${args.tipPaymentId}::uuid
      FOR UPDATE
    `;
    const tip = tips[0];
    if (!tip) throw new NotFoundException('Tip payment not found');
    if (tip.merchantId !== args.merchantId) {
      throw new BadRequestException('Tip payment does not belong to the merchant');
    }
    if (tip.currencyCode !== args.currencyCode) {
      throw new BadRequestException('Tip payment currency must match the adjustment currency');
    }
    if (tip.refundedAmountMinor <= 0n || tip.refundedAmountMinor > tip.amountMinor) {
      throw new BadRequestException('Tip payment does not contain a valid processed refund amount');
    }

    const existingTipAdjustments = await tx.$queryRaw<Array<{
      debitAmountMinor: bigint | null;
    }>>`
      SELECT
        COALESCE(SUM("amountMinor"), 0)::bigint AS "debitAmountMinor"
      FROM "SettlementAdjustment"
      WHERE "tipPaymentId" = ${args.tipPaymentId}::uuid
        AND "type" = 'TIP_REFUND'
        AND "direction" = 'DEBIT'
    `;
    const existingTipAdjustmentTotal = existingTipAdjustments[0]?.debitAmountMinor ?? 0n;
    if (existingTipAdjustmentTotal + args.amountMinor > tip.refundedAmountMinor) {
      throw new BadRequestException(
        'Cumulative tip refund adjustments cannot exceed the processed tip refund amount',
      );
    }

    const orders = await tx.$queryRaw<Array<{
      id: string;
      merchantId: string;
    }>>`
      SELECT "id", "merchantId"
      FROM "Order"
      WHERE "id" = ${tip.orderId}::uuid
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.merchantId !== args.merchantId) {
      throw new BadRequestException('Tip payment order does not belong to the merchant');
    }

    const settlementItems = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "SettlementItem"
      WHERE "settlementId" = ${args.settlementId}::uuid
        AND "tipPaymentId" = ${args.tipPaymentId}::uuid
      LIMIT 1
    `;
    if (!settlementItems[0]) {
      throw new BadRequestException('Tip payment is not settled in the supplied settlement');
    }
  }

  private validateInput(args: CreateSettlementAdjustmentInput): void {
    if (!args.settlementId) throw new BadRequestException('settlementId is required');
    if (!args.merchantId) throw new BadRequestException('merchantId is required');
    if (!args.currencyCode?.trim()) throw new BadRequestException('currencyCode is required');
    if (!args.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required');
    if (args.amountMinor <= 0n) {
      throw new BadRequestException('Adjustment amount must be greater than zero');
    }
    if (!['ORDER_REFUND', 'TIP_REFUND'].includes(args.type)) {
      throw new BadRequestException(`Unsupported settlement adjustment type ${args.type}`);
    }
    if (args.direction !== 'DEBIT') {
      throw new BadRequestException('Refund settlement adjustments must use DEBIT direction');
    }
    if (args.type === 'ORDER_REFUND' && !args.refundId) {
      throw new BadRequestException('ORDER_REFUND requires refundId');
    }
    if (args.type === 'TIP_REFUND' && !args.tipPaymentId) {
      throw new BadRequestException('TIP_REFUND requires tipPaymentId');
    }
  }

  private assertSameRequest(existing: AdjustmentRow, requested: CreateSettlementAdjustmentInput): void {
    const same =
      existing.settlementId === requested.settlementId &&
      existing.merchantId === requested.merchantId &&
      existing.type === requested.type &&
      existing.direction === requested.direction &&
      existing.amountMinor === requested.amountMinor &&
      existing.currencyCode === requested.currencyCode &&
      existing.orderId === (requested.orderId ?? null) &&
      existing.paymentIntentId === (requested.paymentIntentId ?? null) &&
      existing.tipPaymentId === (requested.tipPaymentId ?? null) &&
      existing.refundId === (requested.refundId ?? null);
    if (!same) {
      throw new BadRequestException('Idempotency key was already used for a different adjustment');
    }
  }

  private toResult(row: AdjustmentRow): SettlementAdjustmentResult {
    return {
      adjustmentId: row.id,
      settlementId: row.settlementId,
      merchantId: row.merchantId,
      type: row.type,
      direction: row.direction,
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      idempotencyKey: row.idempotencyKey,
      orderId: row.orderId,
      paymentIntentId: row.paymentIntentId,
      tipPaymentId: row.tipPaymentId,
      refundId: row.refundId,
      reason: row.reason,
      createdAt: row.createdAt,
      created: false,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
