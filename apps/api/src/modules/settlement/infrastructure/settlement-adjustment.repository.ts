import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementAdjustmentDirection, SettlementAdjustmentType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CreateSettlementAdjustmentInput,
  SettlementAdjustmentPosition,
  SettlementAdjustmentResult,
} from '../domain/settlement-adjustment.types';

/**
 * Append-only settlement adjustment ledger (P1.7.44).
 *
 * Historical Settlement rows are never rewritten. Each adjustment is an
 * independent, immutable debit/credit against that historical settlement.
 * Idempotency is DB-enforced by SettlementAdjustment.idempotencyKey @unique.
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
        // Serialize creation against the historical settlement so a caller cannot
        // attach an adjustment to a concurrently deleted/changed settlement.
        const settlement = await tx.settlement.findUnique({
          where: { id: args.settlementId },
          select: { id: true, merchantId: true, currencyCode: true },
        });
        if (!settlement) throw new NotFoundException('Settlement not found');
        if (settlement.merchantId !== args.merchantId) {
          throw new BadRequestException('Settlement does not belong to the merchant');
        }
        if (settlement.currencyCode !== args.currencyCode) {
          throw new BadRequestException('Adjustment currency must match the settlement currency');
        }

        const existing = await tx.settlementAdjustment.findUnique({
          where: { idempotencyKey: args.idempotencyKey },
        });
        if (existing) {
          this.assertSameRequest(existing, args);
          return { ...this.toResult(existing), created: false };
        }

        const created = await tx.settlementAdjustment.create({
          data: {
            settlementId: args.settlementId,
            merchantId: args.merchantId,
            orderId: args.orderId ?? null,
            paymentIntentId: args.paymentIntentId ?? null,
            tipPaymentId: args.tipPaymentId ?? null,
            refundId: args.refundId ?? null,
            type: args.type as SettlementAdjustmentType,
            direction: args.direction as SettlementAdjustmentDirection,
            amountMinor: args.amountMinor,
            currencyCode: args.currencyCode,
            idempotencyKey: args.idempotencyKey,
            reason: args.reason ?? null,
          },
        });
        return { ...this.toResult(created), created: true };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existing = await this.prisma.settlementAdjustment.findUnique({
          where: { idempotencyKey: args.idempotencyKey },
        });
        if (existing) {
          this.assertSameRequest(existing, args);
          return { ...this.toResult(existing), created: false };
        }
      }
      throw error;
    }
  }

  async getPosition(settlementId: string): Promise<SettlementAdjustmentPosition> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { id: true, amountMinor: true, status: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');

    const [debits, credits] = await Promise.all([
      this.prisma.settlementAdjustment.aggregate({
        where: { settlementId, direction: 'DEBIT' },
        _sum: { amountMinor: true },
      }),
      this.prisma.settlementAdjustment.aggregate({
        where: { settlementId, direction: 'CREDIT' },
        _sum: { amountMinor: true },
      }),
    ]);

    const debitAmountMinor = debits._sum.amountMinor ?? 0n;
    const creditAmountMinor = credits._sum.amountMinor ?? 0n;
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
    const adjustment = await this.prisma.settlementAdjustment.findUnique({
      where: { idempotencyKey },
    });
    return adjustment ? { ...this.toResult(adjustment), created: false } : null;
  }

  private validateInput(args: CreateSettlementAdjustmentInput): void {
    if (!args.settlementId) throw new BadRequestException('settlementId is required');
    if (!args.merchantId) throw new BadRequestException('merchantId is required');
    if (!args.currencyCode) throw new BadRequestException('currencyCode is required');
    if (!args.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required');
    if (args.amountMinor <= 0n) {
      throw new BadRequestException('Adjustment amount must be greater than zero');
    }
    if (!['ORDER_REFUND', 'TIP_REFUND'].includes(args.type)) {
      throw new BadRequestException(`Unsupported settlement adjustment type ${args.type}`);
    }
    if (!['DEBIT', 'CREDIT'].includes(args.direction)) {
      throw new BadRequestException(`Unsupported settlement adjustment direction ${args.direction}`);
    }
  }

  private assertSameRequest(
    existing: {
      settlementId: string;
      merchantId: string;
      type: SettlementAdjustmentType;
      direction: SettlementAdjustmentDirection;
      amountMinor: bigint;
      currencyCode: string;
      orderId: string | null;
      paymentIntentId: string | null;
      tipPaymentId: string | null;
      refundId: string | null;
    },
    requested: CreateSettlementAdjustmentInput,
  ): void {
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

  private toResult(row: {
    id: string;
    settlementId: string;
    merchantId: string;
    type: SettlementAdjustmentType;
    direction: SettlementAdjustmentDirection;
    amountMinor: bigint;
    currencyCode: string;
    idempotencyKey: string;
    orderId: string | null;
    paymentIntentId: string | null;
    tipPaymentId: string | null;
    refundId: string | null;
    reason: string | null;
    createdAt: Date;
  }): SettlementAdjustmentResult {
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
