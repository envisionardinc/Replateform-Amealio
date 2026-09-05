import { intentCouponCode, publicCodeFor, rejectionError } from './promotion-application';

describe('promotion application adapter (Stage E)', () => {
  it('treats blank and whitespace codes as no intent', () => {
    expect(intentCouponCode(undefined)).toBeNull();
    expect(intentCouponCode(null)).toBeNull();
    expect(intentCouponCode('')).toBeNull();
    expect(intentCouponCode('   ')).toBeNull();
    expect(intentCouponCode(' SAVE10 ')).toBe('SAVE10');
  });

  it('maps kernel reasons to the public Phase 2 codes', () => {
    expect(publicCodeFor('INVALID_CODE')).toBe('INVALID_CODE');
    expect(publicCodeFor('PROMOTION_INACTIVE')).toBe('NOT_ACTIVE');
    expect(publicCodeFor('PROMOTION_EXPIRED')).toBe('EXPIRED');
    expect(publicCodeFor('PROMOTION_NOT_YET_VALID')).toBe('NOT_YET_ACTIVE');
    expect(publicCodeFor('BELOW_MINIMUM')).toBe('MINIMUM_NOT_MET');
    expect(publicCodeFor('ABOVE_MAXIMUM')).toBe('MAXIMUM_EXCEEDED');
    expect(publicCodeFor('USAGE_LIMIT_REACHED')).toBe('USAGE_LIMIT_REACHED');
    expect(publicCodeFor('CUSTOMER_USAGE_LIMIT_REACHED')).toBe('ALREADY_USED');
    expect(publicCodeFor('INVALID_SERVICE_TYPE')).toBe('SERVICE_TYPE_NOT_ALLOWED');
    expect(publicCodeFor('NOT_FOR_RESTAURANT')).toBe('RESTAURANT_NOT_ALLOWED');
    expect(publicCodeFor('INVALID_BENEFIT')).toBe('UNSUPPORTED_PROMOTION');
    expect(publicCodeFor('NO_ELIGIBLE_PROMOTION')).toBe('NOT_ELIGIBLE');
  });

  it('does not leak raw kernel reason strings as the public code', () => {
    const err = rejectionError('PROMOTION_EXPIRED');
    expect(err.code).toBe('EXPIRED');
    expect(err.message).toMatch(/expired/i);
  });
});
