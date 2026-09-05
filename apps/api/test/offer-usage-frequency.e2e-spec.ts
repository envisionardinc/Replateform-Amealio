import { ConflictException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import { istUsagePeriodWindow } from '../src/modules/ordering/domain/usage-frequency';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import type { CreateOrderInput } from '../src/modules/ordering/domain/ordering.types';

/**
 * P1.7.26B — Offer usage-frequency enforcement (useLimit / useFrequency).
 *
 * Reconciled behavior (doc 55 / P1.7.26A): for GLOBAL offers only, a user may
 * redeem at most `useLimit` times within the current `useFrequency` calendar
 * period, anchored to Asia/Kolkata (IST, UTC+05:30) with Sunday-start weeks.
 * Usage is DERIVED from ACTIVE CouponRedemption rows (no mutable counters) and
 * checked under the existing per-coupon FOR UPDATE lock at order creation.
 */
describe('Offer usage-frequency (P1.7.26B)', () => {
  // ---------------------------------------------------------------------------
  // Pure IST period-window semantics (deterministic; no DB). IST midnight of a
  // civil day D is the UTC instant D-1 at 18:30:00.000Z (offset +05:30).
  // ---------------------------------------------------------------------------
  describe('istUsagePeriodWindow (IST calendar boundaries)', () => {
    // 2026-01-01 is a Thursday; 2026-03-01 is a Sunday; 2026-03-04 is a Wednesday.
    const wed = new Date('2026-03-04T06:00:00.000Z'); // IST 2026-03-04 11:30

    it('DAILY → current IST day, [00:00 IST, next 00:00 IST)', () => {
      const w = istUsagePeriodWindow('DAILY', wed)!;
      expect(w.start.toISOString()).toBe('2026-03-03T18:30:00.000Z'); // IST 03-04 00:00
      expect(w.endExclusive.toISOString()).toBe('2026-03-04T18:30:00.000Z'); // IST 03-05 00:00
    });

    it('DAILY → IST-midnight boundary is handled (23:59:59.999 IST vs 00:00 IST)', () => {
      const justBeforeMidnight = new Date('2026-03-03T18:29:59.999Z'); // IST 03-03 23:59:59.999
      const atMidnight = new Date('2026-03-03T18:30:00.000Z'); // IST 03-04 00:00:00.000
      expect(istUsagePeriodWindow('DAILY', justBeforeMidnight)!.start.toISOString()).toBe(
        '2026-03-02T18:30:00.000Z', // still the 03-03 IST day
      );
      expect(istUsagePeriodWindow('DAILY', atMidnight)!.start.toISOString()).toBe(
        '2026-03-03T18:30:00.000Z', // rolls to the 03-04 IST day
      );
    });

    it('WEEKLY → Sunday 00:00 IST start, next Sunday 00:00 IST end (Sunday→Saturday)', () => {
      const w = istUsagePeriodWindow('WEEKLY', wed)!;
      expect(w.start.toISOString()).toBe('2026-02-28T18:30:00.000Z'); // Sun 03-01 00:00 IST
      expect(w.endExclusive.toISOString()).toBe('2026-03-07T18:30:00.000Z'); // Sun 03-08 00:00 IST
      // start is a Sunday and the last instant of the period is a Saturday (IST).
      const istDow = (d: Date) => new Date(d.getTime() + 330 * 60_000).getUTCDay();
      expect(istDow(w.start)).toBe(0); // Sunday
      expect(istDow(new Date(w.endExclusive.getTime() - 1))).toBe(6); // Saturday
      // Monday is still inside the Sunday-start week.
      const monday = new Date(w.start.getTime() + 24 * 3600_000);
      expect(istDow(monday)).toBe(1);
      expect(monday >= w.start && monday < w.endExclusive).toBe(true);
    });

    it('WEEKLY → a Sunday belongs to the week it starts (not the prior one)', () => {
      const sunday = new Date('2026-02-28T18:30:00.000Z'); // IST Sun 03-01 00:00
      const w = istUsagePeriodWindow('WEEKLY', sunday)!;
      expect(w.start.toISOString()).toBe('2026-02-28T18:30:00.000Z');
      expect(w.endExclusive.toISOString()).toBe('2026-03-07T18:30:00.000Z');
    });

    it('MONTHLY → 1st of IST month to 1st of next IST month', () => {
      const w = istUsagePeriodWindow('MONTHLY', wed)!;
      expect(w.start.toISOString()).toBe('2026-02-28T18:30:00.000Z'); // IST 03-01 00:00
      expect(w.endExclusive.toISOString()).toBe('2026-03-31T18:30:00.000Z'); // IST 04-01 00:00
    });

    it('YEARLY → Jan 1 IST to Jan 1 next IST year', () => {
      const w = istUsagePeriodWindow('YEARLY', wed)!;
      expect(w.start.toISOString()).toBe('2025-12-31T18:30:00.000Z'); // IST 2026-01-01 00:00
      expect(w.endExclusive.toISOString()).toBe('2026-12-31T18:30:00.000Z'); // IST 2027-01-01 00:00
    });

    it('is case-insensitive and returns null for unknown frequency', () => {
      expect(istUsagePeriodWindow('daily', wed)).not.toBeNull();
      expect(istUsagePeriodWindow('BIWEEKLY', wed)).toBeNull();
      expect(istUsagePeriodWindow('', wed)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Enforcement (integration against the TEST DB).
  // ---------------------------------------------------------------------------
  describe('enforcement (integration)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let provisioning: MerchantProvisioningService;
    let orders: OrderService;

    const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const superAdmin: StaffPrincipal = {
      staffMemberId: '00000000-0000-0000-0000-0000000000aa',
      actorType: 'STAFF',
      staffRole: 'SUPER_ADMIN',
      merchantId: null,
    };
    const staffOf = (merchantId: string): StaffPrincipal => ({
      staffMemberId: '00000000-0000-0000-0000-0000000000bb',
      actorType: 'STAFF',
      staffRole: 'MERCHANT_STAFF',
      merchantId,
    });

    const seedMerchantRestaurant = async () => {
      const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
      const r = await provisioning.createRestaurant(staffOf(m.id), {
        merchantId: m.id,
        name: uniq('R'),
        city: 'Bengaluru',
      });
      return { merchantId: m.id, restaurantId: r.id };
    };

    let userSeq = 0;
    const seedUser = async () =>
      prisma.user.create({
        data: { phoneCountryCode: '+91', phone: `${Date.now()}${userSeq++}` },
      });

    const baseInput = (
      restaurantId: string,
      over: Partial<CreateOrderInput> = {},
    ): CreateOrderInput => ({
      orderNumber: uniq('ORD'),
      restaurantId,
      type: 'HOME_DELIVERY',
      items: [{ nameSnapshot: 'Item', unitPriceMinor: 20000n, quantity: 1 }],
      ...over,
    });

    // Seed an Offer (+ coupon) directly for full control over scope/frequency.
    const seedOffer = async (over: Record<string, unknown> = {}) => {
      const code = uniq('FREQ').toUpperCase();
      const offer = await prisma.offer.create({
        data: {
          title: uniq('Offer'),
          active: true,
          isGlobal: true,
          discountPercent: 10,
          ...over,
          coupons: { create: [{ code }] },
        },
        include: { coupons: true },
      });
      return { offerId: offer.id, couponId: offer.coupons[0].id, code: offer.coupons[0].code };
    };

    // Seed a redemption row directly (orderId null is fine — usage is derived by
    // couponId + userId + status + createdAt, independent of the order link).
    const seedRedemption = (
      couponId: string,
      userId: string,
      createdAt: Date,
      status: 'ACTIVE' | 'REVERSED' = 'ACTIVE',
    ) =>
      prisma.couponRedemption.create({
        data: { couponId, userId, orderId: null, status, createdAt, discountAppliedMinor: 0n },
      });

    // An instant guaranteed inside the current IST period for `freq` (its start,
    // which is always <= now within the period).
    const inCurrentPeriod = (freq: string) => istUsagePeriodWindow(freq, new Date())!.start;
    // An instant in the immediately-previous period.
    const inPreviousPeriod = (freq: string) =>
      new Date(istUsagePeriodWindow(freq, new Date())!.start.getTime() - 1);

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnv,
            envFilePath: ['.env', '../../.env'],
          }),
          PrismaModule,
          OnboardingModule,
          OrderingModule,
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
      provisioning = app.get(MerchantProvisioningService);
      orders = app.get(OrderService);
    });

    afterAll(async () => {
      await app.close();
    });

    it('allows when no prior redemption exists (DAILY, useLimit 1)', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const { code } = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n);
    });

    it('allows when in-period count is below the limit (useLimit 2)', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const { code, couponId } = await seedOffer({ useLimit: 2, useFrequency: 'DAILY' });
      await seedRedemption(couponId, user.id, inCurrentPeriod('DAILY')); // 1 < 2
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n);
    });

    it('blocks when in-period count equals the limit (DAILY, useLimit 1)', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const { code, couponId } = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      await seedRedemption(couponId, user.id, inCurrentPeriod('DAILY'));
      await expect(
        orders.createOrder(
          staffOf(merchantId),
          baseInput(restaurantId, { couponCode: code, userId: user.id }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not count a redemption from the previous IST day (DAILY)', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const { code, couponId } = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      await seedRedemption(couponId, user.id, inPreviousPeriod('DAILY')); // prior day
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n);
    });

    it('does not count a redemption from the previous week / month / year', async () => {
      for (const freq of ['WEEKLY', 'MONTHLY', 'YEARLY']) {
        const { merchantId, restaurantId } = await seedMerchantRestaurant();
        const user = await seedUser();
        const { code, couponId } = await seedOffer({ useLimit: 1, useFrequency: freq });
        await seedRedemption(couponId, user.id, inPreviousPeriod(freq));
        const order = await orders.createOrder(
          staffOf(merchantId),
          baseInput(restaurantId, { couponCode: code, userId: user.id }),
        );
        expect(order.discountTotalMinor).toBe(2000n);
      }
    });

    it('counts an in-period redemption for WEEKLY/MONTHLY/YEARLY and blocks at the limit', async () => {
      for (const freq of ['WEEKLY', 'MONTHLY', 'YEARLY']) {
        const { merchantId, restaurantId } = await seedMerchantRestaurant();
        const user = await seedUser();
        const { code, couponId } = await seedOffer({ useLimit: 1, useFrequency: freq });
        await seedRedemption(couponId, user.id, inCurrentPeriod(freq));
        await expect(
          orders.createOrder(
            staffOf(merchantId),
            baseInput(restaurantId, { couponCode: code, userId: user.id }),
          ),
        ).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('does NOT apply the frequency gate to a non-global offer', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      // non-global offer must be scoped to the order's merchant/restaurant to be eligible
      const { code, couponId } = await seedOffer({
        isGlobal: false,
        merchantId,
        restaurantId,
        useLimit: 1,
        useFrequency: 'DAILY',
      });
      await seedRedemption(couponId, user.id, inCurrentPeriod('DAILY')); // would block if gated
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n); // allowed: gate is global-only
    });

    it('counts ACTIVE redemptions but not REVERSED ones', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const { code, couponId } = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      await seedRedemption(couponId, user.id, inCurrentPeriod('DAILY'), 'REVERSED'); // ignored
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n);
    });

    it("isolates by user — another user's in-period redemption does not count", async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const other = await seedUser();
      const { code, couponId } = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      await seedRedemption(couponId, other.id, inCurrentPeriod('DAILY'));
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n);
    });

    it("isolates by coupon — another coupon's in-period redemption does not count", async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const target = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      const otherCoupon = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      await seedRedemption(otherCoupon.couponId, user.id, inCurrentPeriod('DAILY'));
      const order = await orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: target.code, userId: user.id }),
      );
      expect(order.discountTotalMinor).toBe(2000n);
    });

    it('cannot oversubscribe the last period slot under concurrent redemption (same user)', async () => {
      const { merchantId, restaurantId } = await seedMerchantRestaurant();
      const user = await seedUser();
      const { code, couponId, offerId } = await seedOffer({ useLimit: 1, useFrequency: 'DAILY' });
      const results = await Promise.allSettled([
        orders.createOrder(
          staffOf(merchantId),
          baseInput(restaurantId, { couponCode: code, userId: user.id }),
        ),
        orders.createOrder(
          staffOf(merchantId),
          baseInput(restaurantId, { couponCode: code, userId: user.id }),
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const active = await prisma.couponRedemption.count({
        where: { coupon: { offerId }, userId: user.id, status: 'ACTIVE' },
      });
      expect(active).toBe(1);
      expect(couponId).toBeTruthy();
    });
  });
});
