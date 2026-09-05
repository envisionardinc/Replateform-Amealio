import { calculateDiscountMinor } from '../../ordering/domain/offer-discount';
import type { AppliedOffer } from '../../ordering/domain/ordering.types';
import {
  classifyPromotion,
  contextIsComplete,
  normalizePromoCode,
  quoteEligiblePromotion,
  resolveEligibleSubtotal,
  selectBestEligible,
  type EvaluablePromotion,
  type PromotionEvaluationContext,
  type PromotionUsageSnapshot,
} from './promotion-evaluation';

const ZERO_USAGE: PromotionUsageSnapshot = {
  activeTotal: 0,
  activeForUser: 0,
  activeForUserInPeriod: 0,
};

const NOW = new Date('2026-06-15T12:00:00.000Z');

function promo(over: Partial<EvaluablePromotion> = {}): EvaluablePromotion {
  return {
    id: over.id ?? '11111111-1111-1111-1111-111111111111',
    title: over.title ?? 'Lunch deal',
    description: over.description ?? '10% off',
    termsAndConditions: over.termsAndConditions ?? null,
    active: over.active ?? true,
    deletedAt: over.deletedAt ?? null,
    isGlobal: over.isGlobal ?? false,
    merchantId: 'merchantId' in over ? (over.merchantId ?? null) : 'merchant-1',
    restaurantId: 'restaurantId' in over ? (over.restaurantId ?? null) : 'restaurant-1',
    discountPercent: over.discountPercent === undefined ? 10 : over.discountPercent,
    discountMinor: over.discountMinor ?? null,
    maxDiscountMinor: over.maxDiscountMinor ?? null,
    minOrderMinor: over.minOrderMinor ?? null,
    maxOrderMinor: over.maxOrderMinor ?? null,
    serviceTypes: over.serviceTypes ?? null,
    validFrom: over.validFrom ?? null,
    validTo: over.validTo ?? null,
    maxUsageLimit: over.maxUsageLimit ?? null,
    perUserLimit: over.perUserLimit ?? null,
    useLimit: over.useLimit ?? null,
    useFrequency: over.useFrequency ?? null,
    priority: over.priority ?? 0,
    coupon: over.coupon === undefined ? null : over.coupon,
  };
}

function ctx(over: Partial<PromotionEvaluationContext> = {}): PromotionEvaluationContext {
  return {
    restaurantId: over.restaurantId ?? 'restaurant-1',
    merchantId: over.merchantId ?? 'merchant-1',
    orderType: over.orderType ?? 'HOME_DELIVERY',
    ...('subtotalMinor' in over
      ? { subtotalMinor: over.subtotalMinor }
      : { subtotalMinor: 10_000n }),
    lines: over.lines,
    userId: 'userId' in over ? over.userId : 'user-1',
    now: over.now ?? NOW,
    couponCode: over.couponCode,
  };
}

function classify(
  overPromo: Partial<EvaluablePromotion> = {},
  overCtx: Partial<PromotionEvaluationContext> = {},
  usage: PromotionUsageSnapshot = ZERO_USAGE,
  subtotal = 10_000n,
) {
  return classifyPromotion(promo(overPromo), ctx(overCtx), usage, overCtx.now ?? NOW, subtotal);
}

describe('promotion-evaluation domain', () => {
  describe('normalization and context', () => {
    it('trims promo codes', () => {
      expect(normalizePromoCode('  SAVE10  ')).toBe('SAVE10');
    });

    it('requires restaurant, merchant, and order type', () => {
      expect(contextIsComplete(ctx())).toBe(true);
      expect(contextIsComplete(ctx({ restaurantId: '' }))).toBe(false);
      expect(contextIsComplete(ctx({ merchantId: '' }))).toBe(false);
    });

    it('uses line totals as the authoritative subtotal when lines are present', () => {
      const resolved = resolveEligibleSubtotal(
        ctx({
          subtotalMinor: 99_999n,
          lines: [{ lineTotalMinor: 4000n }, { lineTotalMinor: 6000n }],
        }),
      );
      expect(resolved.ok).toBe(true);
      if (resolved.ok) expect(resolved.subtotalMinor).toBe(10_000n);
    });

    it('rejects missing or negative subtotal when there are no lines', () => {
      const missing = resolveEligibleSubtotal(ctx({ subtotalMinor: undefined }));
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.reason).toBe('MISSING_CONTEXT');
      const negative = resolveEligibleSubtotal(ctx({ subtotalMinor: -1n }));
      expect(negative.ok).toBe(false);
      if (!negative.ok) expect(negative.reason).toBe('MISSING_CONTEXT');
    });
  });

  describe('timing', () => {
    it('rejects before validFrom', () => {
      expect(classify({ validFrom: new Date('2026-07-01T00:00:00.000Z') })).toBe(
        'PROMOTION_NOT_YET_VALID',
      );
    });

    it('accepts inside the window', () => {
      expect(
        classify({
          validFrom: new Date('2026-06-01T00:00:00.000Z'),
          validTo: new Date('2026-06-30T23:59:59.000Z'),
        }),
      ).toBeNull();
    });

    it('rejects after validTo', () => {
      expect(classify({ validTo: new Date('2026-06-01T00:00:00.000Z') })).toBe('PROMOTION_EXPIRED');
    });
  });

  describe('scope', () => {
    it('accepts a matching restaurant', () => {
      expect(classify()).toBeNull();
    });

    it('rejects the wrong restaurant', () => {
      expect(classify({}, { restaurantId: 'other-restaurant' })).toBe('NOT_FOR_RESTAURANT');
    });

    it('accepts merchant-scoped when restaurantId is empty and merchant matches', () => {
      expect(classify({ restaurantId: null, merchantId: 'merchant-1' })).toBeNull();
    });

    it('rejects merchant-scoped for another merchant', () => {
      expect(
        classify({ restaurantId: null, merchantId: 'merchant-1' }, { merchantId: 'm-2' }),
      ).toBe('NOT_FOR_MERCHANT');
    });

    it('accepts global regardless of restaurant', () => {
      expect(
        classify({ isGlobal: true, restaurantId: null, merchantId: null }, { restaurantId: 'x' }),
      ).toBeNull();
    });

    it('rejects unscoped non-global', () => {
      expect(classify({ isGlobal: false, restaurantId: null, merchantId: null })).toBe(
        'NOT_FOR_ORDER',
      );
    });
  });

  describe('service type', () => {
    it('accepts an eligible type and ALL wildcard', () => {
      expect(classify({ serviceTypes: ['home_delivery', 'TAKE_AWAY'] })).toBeNull();
      expect(classify({ serviceTypes: ['ALL'] }, { orderType: 'DINE_IN' })).toBeNull();
    });

    it('rejects an ineligible type', () => {
      expect(classify({ serviceTypes: ['TAKE_AWAY'] })).toBe('INVALID_SERVICE_TYPE');
    });
  });

  describe('order amount', () => {
    it('rejects below minimum', () => {
      expect(classify({ minOrderMinor: 10_001n }, {}, ZERO_USAGE, 10_000n)).toBe('BELOW_MINIMUM');
    });

    it('accepts at minimum', () => {
      expect(classify({ minOrderMinor: 10_000n }, {}, ZERO_USAGE, 10_000n)).toBeNull();
    });

    it('rejects above maximum', () => {
      expect(classify({ maxOrderMinor: 9_999n }, {}, ZERO_USAGE, 10_000n)).toBe('ABOVE_MAXIMUM');
    });

    it('accepts at maximum', () => {
      expect(classify({ maxOrderMinor: 10_000n }, {}, ZERO_USAGE, 10_000n)).toBeNull();
    });
  });

  describe('publication', () => {
    it('rejects inactive and soft-deleted promotions', () => {
      expect(classify({ active: false })).toBe('PROMOTION_INACTIVE');
      expect(classify({ deletedAt: NOW })).toBe('PROMOTION_NOT_FOUND');
    });

    it('rejects a missing or mixed benefit', () => {
      expect(classify({ discountPercent: null, discountMinor: null })).toBe('INVALID_BENEFIT');
      expect(classify({ discountPercent: 10, discountMinor: 100n })).toBe('INVALID_BENEFIT');
    });
  });

  describe('usage', () => {
    it('allows remaining global usage', () => {
      expect(classify({ maxUsageLimit: 5 }, {}, { ...ZERO_USAGE, activeTotal: 4 })).toBeNull();
    });

    it('rejects exhausted global usage', () => {
      expect(classify({ maxUsageLimit: 5 }, {}, { ...ZERO_USAGE, activeTotal: 5 })).toBe(
        'USAGE_LIMIT_REACHED',
      );
    });

    it('rejects exhausted per-user usage', () => {
      expect(classify({ perUserLimit: 1 }, {}, { ...ZERO_USAGE, activeForUser: 1 })).toBe(
        'CUSTOMER_USAGE_LIMIT_REACHED',
      );
    });

    it('fails closed when per-user limit exists and caller is anonymous', () => {
      expect(classify({ perUserLimit: 1 }, { userId: null })).toBe('MISSING_CONTEXT');
    });

    it('rejects exhausted global frequency for the caller only', () => {
      expect(
        classify(
          {
            isGlobal: true,
            restaurantId: null,
            merchantId: null,
            useLimit: 1,
            useFrequency: 'DAILY',
          },
          {},
          { ...ZERO_USAGE, activeForUserInPeriod: 1 },
        ),
      ).toBe('CUSTOMER_USAGE_LIMIT_REACHED');
    });
  });

  describe('money', () => {
    it('computes percentage, fixed, and cap via the existing discount function', () => {
      const percent = quoteEligiblePromotion(promo({ discountPercent: 10 }), 10_000n, 'CODE');
      expect(percent.discountMinor).toBe(1_000n);
      expect(percent.benefitType).toBe('PERCENTAGE');

      const fixed = quoteEligiblePromotion(
        promo({ discountPercent: null, discountMinor: 2_500n }),
        10_000n,
        'CODE',
      );
      expect(fixed.discountMinor).toBe(2_500n);
      expect(fixed.benefitType).toBe('FIXED');

      const capped = quoteEligiblePromotion(
        promo({ discountPercent: 50, maxDiscountMinor: 1_200n }),
        10_000n,
        'CODE',
      );
      expect(capped.discountMinor).toBe(1_200n);
    });

    it('clamps discount so it cannot exceed the subtotal', () => {
      const quote = quoteEligiblePromotion(
        promo({ discountPercent: null, discountMinor: 50_000n }),
        10_000n,
        'AUTOMATIC',
      );
      expect(quote.discountMinor).toBe(10_000n);
    });

    it('returns zero discount on a zero subtotal', () => {
      const quote = quoteEligiblePromotion(
        promo({ discountPercent: null, discountMinor: 500n }),
        0n,
        'CODE',
      );
      expect(quote.discountMinor).toBe(0n);
    });

    it('matches calculateDiscountMinor for the same inputs', () => {
      const p = promo({ discountPercent: 15, maxDiscountMinor: 800n });
      const applied: AppliedOffer = {
        offerId: p.id,
        couponId: '',
        active: true,
        deletedAt: null,
        isGlobal: false,
        merchantId: p.merchantId,
        restaurantId: p.restaurantId,
        discountPercent: p.discountPercent,
        discountMinor: p.discountMinor,
        maxDiscountMinor: p.maxDiscountMinor,
        minOrderMinor: null,
        maxOrderMinor: null,
        serviceTypes: null,
        validFrom: null,
        validTo: null,
        maxUsageLimit: null,
        perUserLimit: null,
        useLimit: null,
        useFrequency: null,
      };
      expect(quoteEligiblePromotion(p, 10_000n, 'CODE').discountMinor).toBe(
        calculateDiscountMinor(applied, 10_000n),
      );
    });
  });

  describe('stacking selection', () => {
    it('picks the highest priority, then the largest discount', () => {
      const low = quoteEligiblePromotion(
        promo({ id: 'a', discountPercent: 50 }),
        10_000n,
        'AUTOMATIC',
      );
      const highPri = quoteEligiblePromotion(
        promo({ id: 'b', discountPercent: 10 }),
        10_000n,
        'AUTOMATIC',
      );
      const bigger = quoteEligiblePromotion(
        promo({ id: 'c', discountPercent: 20 }),
        10_000n,
        'AUTOMATIC',
      );
      const winner = selectBestEligible(
        [low, highPri, bigger],
        new Map([
          ['a', 0],
          ['b', 2],
          ['c', 0],
        ]),
      );
      expect(winner?.offerId).toBe('b');

      const tied = selectBestEligible(
        [low, bigger],
        new Map([
          ['a', 0],
          ['c', 0],
        ]),
      );
      expect(tied?.offerId).toBe('a');
    });
  });
});
