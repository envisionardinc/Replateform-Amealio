import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { EvaluableCoupon, EvaluablePromotion } from '../domain/promotion-evaluation';
import { normalizePromoCode } from '../domain/promotion-evaluation';

const OFFER_SELECT = {
  id: true,
  title: true,
  description: true,
  termsAndConditions: true,
  active: true,
  deletedAt: true,
  isGlobal: true,
  merchantId: true,
  restaurantId: true,
  discountPercent: true,
  discountMinor: true,
  maxDiscountMinor: true,
  minOrderMinor: true,
  maxOrderMinor: true,
  serviceTypes: true,
  validFrom: true,
  validTo: true,
  maxUsageLimit: true,
  perUserLimit: true,
  useLimit: true,
  useFrequency: true,
  coupons: { select: { id: true, code: true } },
} as const;

/**
 * Read-only loader for Phase 1 evaluation. No create/update/delete on Offer,
 * Coupon, CouponRedemption, User, or Order.
 */
@Injectable()
export class PromotionEvaluationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCouponByCodeInsensitive(
    rawCode: string,
  ): Promise<{ coupon: EvaluableCoupon; promotion: EvaluablePromotion } | null> {
    const code = normalizePromoCode(rawCode);
    if (!code) return null;

    const rows = await this.prisma.coupon.findMany({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { id: true, code: true, offer: { select: OFFER_SELECT } },
    });
    if (rows.length === 0) return null;

    const exact = rows.find((r) => r.code === code) ?? (rows.length === 1 ? rows[0] : null);
    if (!exact) return null;

    return {
      coupon: { id: exact.id, code: exact.code },
      promotion: toEvaluable(exact.offer, { id: exact.id, code: exact.code }),
    };
  }

  async findAutomaticCandidates(
    restaurantId: string,
    merchantId: string,
  ): Promise<EvaluablePromotion[]> {
    const rows = await this.prisma.offer.findMany({
      where: {
        deletedAt: null,
        active: true,
        coupons: { none: {} },
        OR: [{ isGlobal: true }, { restaurantId }, { merchantId, restaurantId: null }],
      },
      select: OFFER_SELECT,
    });
    return rows.map((row) => toEvaluable(row, null));
  }

  async countActiveRedemptions(couponId: string): Promise<number> {
    return this.prisma.couponRedemption.count({
      where: { couponId, status: 'ACTIVE' },
    });
  }

  async countActiveRedemptionsForUser(couponId: string, userId: string): Promise<number> {
    return this.prisma.couponRedemption.count({
      where: { couponId, userId, status: 'ACTIVE' },
    });
  }

  async countActiveRedemptionsForUserInWindow(
    couponId: string,
    userId: string,
    start: Date,
    endExclusive: Date,
  ): Promise<number> {
    return this.prisma.couponRedemption.count({
      where: {
        couponId,
        userId,
        status: 'ACTIVE',
        createdAt: { gte: start, lt: endExclusive },
      },
    });
  }
}

function toEvaluable(
  row: {
    id: string;
    title: string;
    description: string | null;
    termsAndConditions: string | null;
    active: boolean;
    deletedAt: Date | null;
    isGlobal: boolean;
    merchantId: string | null;
    restaurantId: string | null;
    discountPercent: number | null;
    discountMinor: bigint | null;
    maxDiscountMinor: bigint | null;
    minOrderMinor: bigint | null;
    maxOrderMinor: bigint | null;
    serviceTypes: unknown;
    validFrom: Date | null;
    validTo: Date | null;
    maxUsageLimit: number | null;
    perUserLimit: number | null;
    useLimit: number | null;
    useFrequency: string | null;
    coupons: Array<{ id: string; code: string }>;
  },
  coupon: EvaluableCoupon | null,
): EvaluablePromotion {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    termsAndConditions: row.termsAndConditions,
    active: row.active,
    deletedAt: row.deletedAt,
    isGlobal: row.isGlobal,
    merchantId: row.merchantId,
    restaurantId: row.restaurantId,
    discountPercent: row.discountPercent,
    discountMinor: row.discountMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    minOrderMinor: row.minOrderMinor,
    maxOrderMinor: row.maxOrderMinor,
    serviceTypes: Array.isArray(row.serviceTypes) ? (row.serviceTypes as string[]) : null,
    validFrom: row.validFrom,
    validTo: row.validTo,
    maxUsageLimit: row.maxUsageLimit,
    perUserLimit: row.perUserLimit,
    useLimit: row.useLimit,
    useFrequency: row.useFrequency,
    priority: 0,
    coupon,
  };
}
