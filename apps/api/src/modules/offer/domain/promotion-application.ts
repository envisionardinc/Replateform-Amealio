import {
  normalizePromoCode,
  type EligiblePromotionQuote,
  type PromotionRejectionReason,
} from './promotion-evaluation';

/**
 * Phase 2 public rejection codes (doc 108). Mapped from the Phase 1 kernel
 * reasons. Callers must not invent a second eligibility language.
 */
export const PROMOTION_PUBLIC_CODES = [
  'INVALID_CODE',
  'NOT_ACTIVE',
  'EXPIRED',
  'NOT_YET_ACTIVE',
  'MINIMUM_NOT_MET',
  'MAXIMUM_EXCEEDED',
  'NOT_ELIGIBLE',
  'USAGE_LIMIT_REACHED',
  'ALREADY_USED',
  'SERVICE_TYPE_NOT_ALLOWED',
  'RESTAURANT_NOT_ALLOWED',
  'UNSUPPORTED_PROMOTION',
] as const;

export type PromotionPublicCode = (typeof PROMOTION_PUBLIC_CODES)[number];

export class PromotionApplicationError extends Error {
  constructor(
    readonly code: PromotionPublicCode,
    message: string,
  ) {
    super(message);
    this.name = 'PromotionApplicationError';
  }
}

export const KERNEL_TO_PUBLIC: Record<PromotionRejectionReason, PromotionPublicCode> = {
  INVALID_CODE: 'INVALID_CODE',
  PROMOTION_NOT_FOUND: 'NOT_ELIGIBLE',
  PROMOTION_INACTIVE: 'NOT_ACTIVE',
  PROMOTION_NOT_YET_VALID: 'NOT_YET_ACTIVE',
  PROMOTION_EXPIRED: 'EXPIRED',
  NOT_FOR_RESTAURANT: 'RESTAURANT_NOT_ALLOWED',
  NOT_FOR_MERCHANT: 'RESTAURANT_NOT_ALLOWED',
  NOT_FOR_ORDER: 'NOT_ELIGIBLE',
  INVALID_SERVICE_TYPE: 'SERVICE_TYPE_NOT_ALLOWED',
  BELOW_MINIMUM: 'MINIMUM_NOT_MET',
  ABOVE_MAXIMUM: 'MAXIMUM_EXCEEDED',
  INVALID_BENEFIT: 'UNSUPPORTED_PROMOTION',
  USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',
  CUSTOMER_USAGE_LIMIT_REACHED: 'ALREADY_USED',
  MISSING_CONTEXT: 'NOT_ELIGIBLE',
  NO_ELIGIBLE_PROMOTION: 'NOT_ELIGIBLE',
};

export const PUBLIC_MESSAGES: Record<PromotionPublicCode, string> = {
  INVALID_CODE: 'Invalid coupon code',
  NOT_ACTIVE: 'This promotion is not active',
  EXPIRED: 'This promotion has expired',
  NOT_YET_ACTIVE: 'This promotion is not yet active',
  MINIMUM_NOT_MET: 'Order does not meet the minimum amount for this promotion',
  MAXIMUM_EXCEEDED: 'Order exceeds the maximum amount for this promotion',
  NOT_ELIGIBLE: 'This promotion is not eligible',
  USAGE_LIMIT_REACHED: 'This promotion has reached its usage limit',
  ALREADY_USED: 'You have already used this promotion',
  SERVICE_TYPE_NOT_ALLOWED: 'This promotion is not valid for this service type',
  RESTAURANT_NOT_ALLOWED: 'This promotion is not valid for this restaurant',
  UNSUPPORTED_PROMOTION: 'This promotion type is not supported',
};

export function intentCouponCode(raw?: string | null): string | null {
  if (raw == null) return null;
  const code = normalizePromoCode(raw);
  return code.length > 0 ? code : null;
}

export function publicCodeFor(reason: PromotionRejectionReason): PromotionPublicCode {
  return KERNEL_TO_PUBLIC[reason];
}

export function rejectionError(reason: PromotionRejectionReason): PromotionApplicationError {
  const code = publicCodeFor(reason);
  return new PromotionApplicationError(code, PUBLIC_MESSAGES[code]);
}

export interface AppliedPromotionView {
  offerId: string;
  couponId: string | null;
  couponCode: string | null;
  title: string;
  source: 'CODE' | 'AUTOMATIC';
}

export function viewOf(quote: EligiblePromotionQuote): AppliedPromotionView {
  return {
    offerId: quote.offerId,
    couponId: quote.couponId,
    couponCode: quote.couponCode,
    title: quote.title,
    source: quote.source,
  };
}

export function serializePromotion(view: AppliedPromotionView | null) {
  if (!view) return null;
  return {
    offerId: view.offerId,
    couponId: view.couponId,
    couponCode: view.couponCode,
    title: view.title,
    source: view.source,
  };
}
