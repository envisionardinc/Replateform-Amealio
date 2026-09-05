import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PromotionEvaluationRepository } from '../infrastructure/promotion-evaluation.repository';
import { PromotionEvaluationService } from './promotion-evaluation.service';

/**
 * Phase 1 evaluation kernel against the TEST database. Isolated fixtures only.
 * Proves quote-only: no Offer / Coupon / CouponRedemption / User / Order writes.
 */
describe('PromotionEvaluationService', () => {
  const prisma = new PrismaService();
  const service = new PromotionEvaluationService(new PromotionEvaluationRepository(prisma));

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seedMerchantRestaurant = async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    return { merchantId: merchant.id, restaurantId: restaurant.id };
  };

  let userSeq = 0;
  const seedUser = () =>
    prisma.user.create({
      data: { phoneCountryCode: '+91', phone: `${Date.now()}${userSeq++}`.slice(0, 14) },
    });

  const seedOffer = async (opts: {
    merchantId?: string | null;
    restaurantId?: string | null;
    isGlobal?: boolean;
    active?: boolean;
    deletedAt?: Date | null;
    discountPercent?: number | null;
    discountMinor?: bigint | null;
    maxDiscountMinor?: bigint | null;
    minOrderMinor?: bigint | null;
    maxOrderMinor?: bigint | null;
    serviceTypes?: string[] | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    maxUsageLimit?: number | null;
    perUserLimit?: number | null;
    useLimit?: number | null;
    useFrequency?: string | null;
    couponCode?: string | null;
    title?: string;
  }) => {
    const offer = await prisma.offer.create({
      data: {
        title: opts.title ?? uniq('Offer'),
        merchantId: opts.merchantId ?? null,
        restaurantId: opts.restaurantId ?? null,
        isGlobal: opts.isGlobal ?? false,
        active: opts.active ?? true,
        deletedAt: opts.deletedAt ?? null,
        discountPercent: opts.discountPercent ?? 10,
        discountMinor: opts.discountMinor ?? null,
        maxDiscountMinor: opts.maxDiscountMinor ?? null,
        minOrderMinor: opts.minOrderMinor ?? null,
        maxOrderMinor: opts.maxOrderMinor ?? null,
        serviceTypes: (opts.serviceTypes ?? undefined) as never,
        validFrom: opts.validFrom ?? null,
        validTo: opts.validTo ?? null,
        maxUsageLimit: opts.maxUsageLimit ?? null,
        perUserLimit: opts.perUserLimit ?? null,
        useLimit: opts.useLimit ?? null,
        useFrequency: opts.useFrequency ?? null,
        ...(opts.couponCode ? { coupons: { create: [{ code: opts.couponCode }] } } : {}),
      },
      include: { coupons: true },
    });
    return offer;
  };

  const snapshot = async (ids: {
    offerIds: string[];
    couponIds: string[];
    userIds: string[];
    orderIds: string[];
  }) => {
    const [offers, coupons, redemptions, users, orders, redemptionCount] = await Promise.all([
      prisma.offer.findMany({ where: { id: { in: ids.offerIds } } }),
      prisma.coupon.findMany({ where: { id: { in: ids.couponIds } } }),
      prisma.couponRedemption.findMany({
        where: { couponId: { in: ids.couponIds } },
        orderBy: { id: 'asc' },
      }),
      prisma.user.findMany({ where: { id: { in: ids.userIds } } }),
      ids.orderIds.length
        ? prisma.order.findMany({ where: { id: { in: ids.orderIds } } })
        : Promise.resolve([]),
      prisma.couponRedemption.count(),
    ]);
    return { offers, coupons, redemptions, users, orders, redemptionCount };
  };

  const baseCtx = (
    restaurantId: string,
    merchantId: string,
    over: Record<string, unknown> = {},
  ) => ({
    restaurantId,
    merchantId,
    orderType: 'HOME_DELIVERY' as const,
    subtotalMinor: 10_000n,
    userId: null as string | null,
    now: new Date('2026-06-15T12:00:00.000Z'),
    ...over,
  });

  describe('resolution', () => {
    it('resolves a valid coupon case-insensitively', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('Save'),
      });
      const code = offer.coupons[0].code;
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: `  ${code.toLowerCase()}  ` }),
      );
      expect(result.eligible).toBe(true);
      if (result.eligible) {
        expect(result.offerId).toBe(offer.id);
        expect(result.couponId).toBe(offer.coupons[0].id);
        expect(result.source).toBe('CODE');
        expect(result.discountMinor).toBe(1_000n);
      }
    });

    it('rejects an invalid coupon', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: uniq('NOPE') }),
      );
      expect(result).toMatchObject({ eligible: false, reason: 'INVALID_CODE' });
    });

    it('rejects an inactive offer behind a real code', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        active: false,
        couponCode: uniq('DEAD'),
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: offer.coupons[0].code }),
      );
      expect(result).toMatchObject({
        eligible: false,
        reason: 'PROMOTION_INACTIVE',
        offerId: offer.id,
      });
    });

    it('rejects an expired coded offer', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('OLD'),
        validTo: new Date('2020-01-01T00:00:00.000Z'),
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: offer.coupons[0].code }),
      );
      expect(result).toMatchObject({ eligible: false, reason: 'PROMOTION_EXPIRED' });
    });

    it('selects a code-less automatic promotion for the restaurant', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        discountPercent: 15,
      });
      const result = await service.evaluate(baseCtx(restaurantId, merchantId));
      expect(result.eligible).toBe(true);
      if (result.eligible) {
        expect(result.offerId).toBe(offer.id);
        expect(result.couponId).toBeNull();
        expect(result.source).toBe('AUTOMATIC');
        expect(result.discountMinor).toBe(1_500n);
      }
    });

    it('picks the largest-discount automatic promotion when priorities tie', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      await seedOffer({ merchantId, restaurantId, discountPercent: 10, title: uniq('Small') });
      const bigger = await seedOffer({
        merchantId,
        restaurantId,
        discountPercent: 25,
        title: uniq('Big'),
      });
      const result = await service.evaluate(baseCtx(restaurantId, merchantId));
      expect(result.eligible).toBe(true);
      if (result.eligible) {
        expect(result.offerId).toBe(bigger.id);
        expect(result.discountMinor).toBe(2_500n);
      }
    });

    it('lets an explicit eligible code beat a better automatic promotion', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      await seedOffer({ merchantId, restaurantId, discountPercent: 40 });
      const coded = await seedOffer({
        merchantId,
        restaurantId,
        discountPercent: 5,
        couponCode: uniq('CODE'),
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: coded.coupons[0].code }),
      );
      expect(result.eligible).toBe(true);
      if (result.eligible) {
        expect(result.offerId).toBe(coded.id);
        expect(result.source).toBe('CODE');
        expect(result.discountMinor).toBe(500n);
      }
    });

    it('does not treat a coded offer as automatic', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const coded = await seedOffer({
        merchantId,
        restaurantId,
        discountPercent: 50,
        couponCode: uniq('HIDDEN'),
      });
      const result = await service.evaluate(baseCtx(restaurantId, merchantId));
      if (result.eligible) {
        expect(result.offerId).not.toBe(coded.id);
        expect(result.source).toBe('AUTOMATIC');
      } else {
        expect(result.reason).toBe('NO_ELIGIBLE_PROMOTION');
      }
    });
  });

  describe('scope, type, amount', () => {
    it('rejects a restaurant-scoped code at another restaurant', async () => {
      const a = await seedMerchantRestaurant();
      const b = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId: a.merchantId,
        restaurantId: a.restaurantId,
        couponCode: uniq('HERE'),
      });
      const result = await service.evaluate(
        baseCtx(b.restaurantId, b.merchantId, { couponCode: offer.coupons[0].code }),
      );
      expect(result).toMatchObject({ eligible: false, reason: 'NOT_FOR_RESTAURANT' });
    });

    it('applies a merchant-scoped automatic promotion across that merchant restaurants', async () => {
      const { merchantId } = await seedMerchantRestaurant();
      const other = await prisma.restaurant.create({
        data: { merchantId, name: uniq('R2') },
      });
      const offer = await seedOffer({
        merchantId,
        restaurantId: null,
        discountPercent: 10,
      });
      const result = await service.evaluate(baseCtx(other.id, merchantId));
      expect(result.eligible).toBe(true);
      if (result.eligible) expect(result.offerId).toBe(offer.id);
    });

    it('applies a global automatic promotion', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        isGlobal: true,
        merchantId: null,
        restaurantId: null,
        discountPercent: 8,
      });
      const result = await service.evaluate(baseCtx(restaurantId, merchantId));
      expect(result.eligible).toBe(true);
      if (result.eligible) expect(result.offerId).toBe(offer.id);
      await prisma.offer.update({ where: { id: offer.id }, data: { deletedAt: new Date() } });
    });

    it('rejects an ineligible service type', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('DINE'),
        serviceTypes: ['DINE_IN'],
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: offer.coupons[0].code }),
      );
      expect(result).toMatchObject({ eligible: false, reason: 'INVALID_SERVICE_TYPE' });
    });

    it('rejects below minimum and accepts at minimum', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('MIN'),
        minOrderMinor: 10_000n,
      });
      const below = await service.evaluate(
        baseCtx(restaurantId, merchantId, {
          couponCode: offer.coupons[0].code,
          subtotalMinor: 9_999n,
        }),
      );
      expect(below).toMatchObject({ eligible: false, reason: 'BELOW_MINIMUM' });
      const at = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: offer.coupons[0].code }),
      );
      expect(at.eligible).toBe(true);
    });
  });

  describe('usage and identity', () => {
    it('rejects exhausted global usage without writing', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('CAP'),
        maxUsageLimit: 1,
      });
      await prisma.couponRedemption.create({
        data: { couponId: offer.coupons[0].id, userId: user.id, status: 'ACTIVE' },
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, {
          couponCode: offer.coupons[0].code,
          userId: user.id,
        }),
      );
      expect(result).toMatchObject({ eligible: false, reason: 'USAGE_LIMIT_REACHED' });
    });

    it("does not treat another user's redemptions as the caller's per-user usage", async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const other = await seedUser();
      const caller = await seedUser();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('MINE'),
        perUserLimit: 1,
      });
      await prisma.couponRedemption.create({
        data: { couponId: offer.coupons[0].id, userId: other.id, status: 'ACTIVE' },
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, {
          couponCode: offer.coupons[0].code,
          userId: caller.id,
        }),
      );
      expect(result.eligible).toBe(true);
      if (result.eligible) expect(result.offerId).toBe(offer.id);
    });

    it('rejects when the authenticated caller has exhausted per-user usage', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const caller = await seedUser();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('USED'),
        perUserLimit: 1,
      });
      await prisma.couponRedemption.create({
        data: { couponId: offer.coupons[0].id, userId: caller.id, status: 'ACTIVE' },
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, {
          couponCode: offer.coupons[0].code,
          userId: caller.id,
        }),
      );
      expect(result).toMatchObject({
        eligible: false,
        reason: 'CUSTOMER_USAGE_LIMIT_REACHED',
      });
    });

    it('ignores REVERSED redemptions when counting usage', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const caller = await seedUser();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('REV'),
        maxUsageLimit: 1,
      });
      await prisma.couponRedemption.create({
        data: {
          couponId: offer.coupons[0].id,
          userId: caller.id,
          status: 'REVERSED',
          reversedAt: new Date(),
        },
      });
      const result = await service.evaluate(
        baseCtx(restaurantId, merchantId, {
          couponCode: offer.coupons[0].code,
          userId: caller.id,
        }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  describe('mutation safety', () => {
    it('does not mutate Offer, Coupon, CouponRedemption, User, or Order', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const offer = await seedOffer({
        merchantId,
        restaurantId,
        couponCode: uniq('SAFE'),
        maxUsageLimit: 10,
      });
      const couponId = offer.coupons[0].id;
      await prisma.couponRedemption.create({
        data: { couponId, userId: user.id, status: 'ACTIVE' },
      });

      const ids = {
        offerIds: [offer.id],
        couponIds: [couponId],
        userIds: [user.id],
        orderIds: [] as string[],
      };
      const before = await snapshot(ids);

      const first = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: offer.coupons[0].code, userId: user.id }),
      );
      const second = await service.evaluate(
        baseCtx(restaurantId, merchantId, { couponCode: offer.coupons[0].code, userId: user.id }),
      );
      await service.evaluate(baseCtx(restaurantId, merchantId, { userId: user.id }));

      expect(first.eligible).toBe(true);
      expect(second.eligible).toBe(true);

      const after = await snapshot(ids);
      expect(after.offers).toEqual(before.offers);
      expect(after.coupons).toEqual(before.coupons);
      expect(after.redemptions).toEqual(before.redemptions);
      expect(after.users).toEqual(before.users);
      expect(after.orders).toEqual(before.orders);
      expect(after.redemptionCount).toBe(before.redemptionCount);
    });

    it('fails closed on missing context without touching the ledger', async () => {
      const before = await prisma.couponRedemption.count();
      const result = await service.evaluate({
        restaurantId: '',
        merchantId: '',
        orderType: 'HOME_DELIVERY',
        subtotalMinor: 1000n,
      });
      expect(result).toMatchObject({ eligible: false, reason: 'MISSING_CONTEXT' });
      expect(await prisma.couponRedemption.count()).toBe(before);
    });
  });
});
