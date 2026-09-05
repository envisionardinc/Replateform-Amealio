import { calculateDiscountMinor } from '../../ordering/domain/offer-discount';
import type { AppliedOffer, OrderTypeName } from '../../ordering/domain/ordering.types';
import { istUsagePeriodWindow } from '../../ordering/domain/usage-frequency';

/**
 * Phase 1 promotion evaluation kernel (doc 101).
 *
 * Quote-only: classify eligibility and compute a server-authoritative discount.
 * Never writes Offer / Coupon / CouponRedemption / User / Order. Final redemption
 * remains the existing order-create / payment-capture commit path.
 */

export const PROMOTION_REJECTION_REASONS = [
  'INVALID_CODE',
  'PROMOTION_NOT_FOUND',
  'PROMOTION_INACTIVE',
  'PROMOTION_NOT_YET_VALID',
  'PROMOTION_EXPIRED',
  'NOT_FOR_RESTAURANT',
  'NOT_FOR_MERCHANT',
  'NOT_FOR_ORDER',
  'INVALID_SERVICE_TYPE',
  'BELOW_MINIMUM',
  'ABOVE_MAXIMUM',
  'INVALID_BENEFIT',
  'USAGE_LIMIT_REACHED',
  'CUSTOMER_USAGE_LIMIT_REACHED',
  'MISSING_CONTEXT',
  'NO_ELIGIBLE_PROMOTION',
] as const;

export type PromotionRejectionReason = (typeof PROMOTION_REJECTION_REASONS)[number];

export type PromotionBenefitType = 'PERCENTAGE' | 'FIXED';

export interface PromotionEvaluationLine {
  lineTotalMinor: bigint;
}

export interface PromotionEvaluationContext {
  restaurantId: string;
  merchantId: string;
  orderType: OrderTypeName;
  /** Server-calculated subtotal. Ignored when `lines` are present. */
  subtotalMinor?: bigint;
  /** When present, eligible subtotal is the sum of line totals (never a client total). */
  lines?: PromotionEvaluationLine[];
  /** Authenticated consumer. Required when the promotion has per-user / frequency caps. */
  userId?: string | null;
  /** Server clock. Callers must not pass a client-supplied "now" from the diner. */
  now?: Date;
  /** Optional vanity code. Trimmed + resolved case-insensitively. */
  couponCode?: string | null;
}

export interface EvaluableCoupon {
  id: string;
  code: string;
}

export interface EvaluablePromotion {
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
  serviceTypes: string[] | null;
  validFrom: Date | null;
  validTo: Date | null;
  maxUsageLimit: number | null;
  perUserLimit: number | null;
  useLimit: number | null;
  useFrequency: string | null;
  /** Implicit v1 priority. Schema has no column; default 0. */
  priority: number;
  coupon: EvaluableCoupon | null;
}

export interface PromotionUsageSnapshot {
  activeTotal: number;
  activeForUser: number;
  activeForUserInPeriod: number;
}

export interface EligiblePromotionQuote {
  eligible: true;
  offerId: string;
  couponId: string | null;
  couponCode: string | null;
  title: string;
  description: string | null;
  termsAndConditions: string | null;
  benefitType: PromotionBenefitType;
  discountPercent: number | null;
  discountMinorConfigured: bigint | null;
  maxDiscountMinor: bigint | null;
  minOrderMinor: bigint | null;
  maxOrderMinor: bigint | null;
  validFrom: Date | null;
  validTo: Date | null;
  discountMinor: bigint;
  subtotalMinor: bigint;
  source: 'CODE' | 'AUTOMATIC';
}

export interface RejectedPromotionQuote {
  eligible: false;
  reason: PromotionRejectionReason;
  offerId: string | null;
  couponId: string | null;
}

export type PromotionEvaluationResult = EligiblePromotionQuote | RejectedPromotionQuote;

export function normalizePromoCode(code: string): string {
  return code.trim();
}

export function resolveEligibleSubtotal(
  context: PromotionEvaluationContext,
): { ok: true; subtotalMinor: bigint } | { ok: false; reason: 'MISSING_CONTEXT' } {
  if (context.lines && context.lines.length > 0) {
    let sum = 0n;
    for (const line of context.lines) {
      if (line.lineTotalMinor < 0n) return { ok: false, reason: 'MISSING_CONTEXT' };
      sum += line.lineTotalMinor;
    }
    return { ok: true, subtotalMinor: sum };
  }
  if (context.subtotalMinor === undefined || context.subtotalMinor < 0n) {
    return { ok: false, reason: 'MISSING_CONTEXT' };
  }
  return { ok: true, subtotalMinor: context.subtotalMinor };
}

export function contextIsComplete(
  context: PromotionEvaluationContext,
): context is PromotionEvaluationContext & {
  restaurantId: string;
  merchantId: string;
  orderType: OrderTypeName;
} {
  return (
    typeof context.restaurantId === 'string' &&
    context.restaurantId.length > 0 &&
    typeof context.merchantId === 'string' &&
    context.merchantId.length > 0 &&
    typeof context.orderType === 'string' &&
    context.orderType.length > 0
  );
}

export function benefitTypeOf(promotion: EvaluablePromotion): PromotionBenefitType | null {
  const hasPercent = promotion.discountPercent !== null && promotion.discountPercent > 0;
  const hasFixed = promotion.discountMinor !== null;
  if (hasPercent && !hasFixed) return 'PERCENTAGE';
  if (hasFixed && !hasPercent) return 'FIXED';
  return null;
}

function toAppliedOffer(promotion: EvaluablePromotion): AppliedOffer {
  return {
    offerId: promotion.id,
    couponId: promotion.coupon?.id ?? '',
    active: promotion.active,
    deletedAt: promotion.deletedAt,
    isGlobal: promotion.isGlobal,
    merchantId: promotion.merchantId,
    restaurantId: promotion.restaurantId,
    discountPercent: promotion.discountPercent,
    discountMinor: promotion.discountMinor,
    maxDiscountMinor: promotion.maxDiscountMinor,
    minOrderMinor: promotion.minOrderMinor,
    maxOrderMinor: promotion.maxOrderMinor,
    serviceTypes: promotion.serviceTypes,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
    maxUsageLimit: promotion.maxUsageLimit,
    perUserLimit: promotion.perUserLimit,
    useLimit: promotion.useLimit,
    useFrequency: promotion.useFrequency,
  };
}

/**
 * Classify a single already-loaded promotion. Pure. Does not throw for business
 * ineligibility — callers map the reason onto the quote DTO.
 */
export function classifyPromotion(
  promotion: EvaluablePromotion,
  context: PromotionEvaluationContext,
  usage: PromotionUsageSnapshot,
  now: Date,
  subtotalMinor: bigint,
): PromotionRejectionReason | null {
  if (promotion.deletedAt !== null) return 'PROMOTION_NOT_FOUND';
  if (!promotion.active) return 'PROMOTION_INACTIVE';
  if (promotion.validFrom && now < promotion.validFrom) return 'PROMOTION_NOT_YET_VALID';
  if (promotion.validTo && now > promotion.validTo) return 'PROMOTION_EXPIRED';

  if (!promotion.isGlobal) {
    if (promotion.restaurantId) {
      if (promotion.restaurantId !== context.restaurantId) return 'NOT_FOR_RESTAURANT';
    } else if (promotion.merchantId) {
      if (promotion.merchantId !== context.merchantId) return 'NOT_FOR_MERCHANT';
    } else {
      return 'NOT_FOR_ORDER';
    }
  }

  if (promotion.serviceTypes && promotion.serviceTypes.length > 0) {
    const allowed = promotion.serviceTypes.map((s) => s.trim().toUpperCase());
    if (!allowed.includes('ALL') && !allowed.includes(context.orderType)) {
      return 'INVALID_SERVICE_TYPE';
    }
  }

  if (promotion.minOrderMinor !== null && subtotalMinor < promotion.minOrderMinor) {
    return 'BELOW_MINIMUM';
  }
  if (promotion.maxOrderMinor !== null && subtotalMinor > promotion.maxOrderMinor) {
    return 'ABOVE_MAXIMUM';
  }

  if (benefitTypeOf(promotion) === null) return 'INVALID_BENEFIT';

  if (promotion.maxUsageLimit !== null && usage.activeTotal >= promotion.maxUsageLimit) {
    return 'USAGE_LIMIT_REACHED';
  }

  const needsUser =
    promotion.perUserLimit !== null ||
    (promotion.isGlobal && promotion.useLimit !== null && !!promotion.useFrequency);
  if (needsUser && !context.userId) return 'MISSING_CONTEXT';

  if (
    promotion.perUserLimit !== null &&
    context.userId &&
    usage.activeForUser >= promotion.perUserLimit
  ) {
    return 'CUSTOMER_USAGE_LIMIT_REACHED';
  }

  if (
    promotion.isGlobal &&
    promotion.useLimit !== null &&
    promotion.useFrequency &&
    context.userId
  ) {
    const window = istUsagePeriodWindow(promotion.useFrequency, now);
    if (window && usage.activeForUserInPeriod >= promotion.useLimit) {
      return 'CUSTOMER_USAGE_LIMIT_REACHED';
    }
  }

  return null;
}

export function quoteEligiblePromotion(
  promotion: EvaluablePromotion,
  subtotalMinor: bigint,
  source: EligiblePromotionQuote['source'],
): EligiblePromotionQuote {
  const benefitType = benefitTypeOf(promotion);
  if (!benefitType) {
    throw new Error('quoteEligiblePromotion requires a valid benefit');
  }
  const discountMinor = calculateDiscountMinor(toAppliedOffer(promotion), subtotalMinor);
  return {
    eligible: true,
    offerId: promotion.id,
    couponId: promotion.coupon?.id ?? null,
    couponCode: promotion.coupon?.code ?? null,
    title: promotion.title,
    description: promotion.description,
    termsAndConditions: promotion.termsAndConditions,
    benefitType,
    discountPercent: promotion.discountPercent,
    discountMinorConfigured: promotion.discountMinor,
    maxDiscountMinor: promotion.maxDiscountMinor,
    minOrderMinor: promotion.minOrderMinor,
    maxOrderMinor: promotion.maxOrderMinor,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
    discountMinor,
    subtotalMinor,
    source,
  };
}

/** v1: highest priority, then largest discount, then stable offer id. */
export function selectBestEligible(
  quotes: EligiblePromotionQuote[],
  priorities: ReadonlyMap<string, number>,
): EligiblePromotionQuote | null {
  if (quotes.length === 0) return null;
  return [...quotes].sort((a, b) => {
    const pa = priorities.get(a.offerId) ?? 0;
    const pb = priorities.get(b.offerId) ?? 0;
    if (pb !== pa) return pb - pa;
    if (b.discountMinor !== a.discountMinor) return b.discountMinor > a.discountMinor ? 1 : -1;
    return a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0;
  })[0];
}

export function rejected(
  reason: PromotionRejectionReason,
  offerId: string | null = null,
  couponId: string | null = null,
): RejectedPromotionQuote {
  return { eligible: false, reason, offerId, couponId };
}
