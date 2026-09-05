import { BadRequestException, ForbiddenException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import { OrderRepository } from '../src/modules/ordering/infrastructure/order.repository';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import type { CreateOrderInput } from '../src/modules/ordering/domain/ordering.types';

/**
 * P1.7.25 — Order cancellation → coupon redemption reversal.
 *
 * Integration against the TEST DB. Cancelling a coupon order reverses its ACTIVE
 * `CouponRedemption` (ACTIVE→REVERSED + reversedAt) in the SAME transaction as the
 * `→ CANCELLED` status change, releasing derived usage. Reversal is exactly-once
 * (idempotent under retries/concurrency), merchant-scoped, and never touches a
 * redemption belonging to another order. Payment/refund reversal is out of scope.
 */
describe('Offer redemption reversal on cancellation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let orders: OrderService;
  let orderRepo: OrderRepository;

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

  // Subtotal for baseInput = 25000*2 + 5000*3 = 65000 minor units.
  const baseInput = (
    restaurantId: string,
    over: Partial<CreateOrderInput> = {},
  ): CreateOrderInput => ({
    orderNumber: uniq('ORD'),
    restaurantId,
    type: 'HOME_DELIVERY',
    items: [
      { nameSnapshot: 'Paneer Tikka', unitPriceMinor: 25000n, quantity: 2 },
      { nameSnapshot: 'Naan', unitPriceMinor: 5000n, quantity: 3 },
    ],
    ...over,
  });

  const seedOffer = async (
    merchantId: string,
    restaurantId: string,
    over: Record<string, unknown> = {},
  ) => {
    const code = uniq('SAVE').toUpperCase();
    const offer = await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: true,
        isGlobal: false,
        merchantId,
        restaurantId,
        discountPercent: 10,
        ...over,
        coupons: { create: [{ code }] },
      },
      include: { coupons: true },
    });
    return { offerId: offer.id, code: offer.coupons[0].code };
  };

  const activeCount = (offerId: string) =>
    prisma.couponRedemption.count({ where: { coupon: { offerId }, status: 'ACTIVE' } });

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
    orderRepo = app.get(OrderRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reverses the ACTIVE redemption on cancellation (status REVERSED + reversedAt)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code } = await seedOffer(merchantId, restaurantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    expect((await orderRepo.findRedemptionByOrder(order.id))!.status).toBe('ACTIVE');

    const cancelled = await orders.transitionStatus(staff, order.id, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
    const redemption = await orderRepo.findRedemptionByOrder(order.id);
    expect(redemption!.status).toBe('REVERSED');
    expect(redemption!.reversedAt).not.toBeNull();
  });

  it('reversed redemption no longer counts toward usage', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code, offerId } = await seedOffer(merchantId, restaurantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    expect(await activeCount(offerId)).toBe(1);
    await orders.transitionStatus(staff, order.id, 'CANCELLED');
    expect(await activeCount(offerId)).toBe(0);
  });

  it('records the CANCELLED OrderStatusEvent', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code } = await seedOffer(merchantId, restaurantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    const cancelled = await orders.transitionStatus(staff, order.id, 'CANCELLED');
    const events = cancelled.statusEvents;
    // creation (null->INITIAL) + INITIAL->CANCELLED = 2, exactly one CANCELLED event
    expect(events.filter((e) => e.toStatus === 'CANCELLED')).toHaveLength(1);
    const cancelEvent = events.find((e) => e.toStatus === 'CANCELLED')!;
    expect(cancelEvent.fromStatus).toBe('INITIAL');
  });

  it('is atomic: a failed cancellation leaves the redemption ACTIVE', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code } = await seedOffer(merchantId, restaurantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    // DELIVERED is not reachable from INITIAL -> invalid transition rejected; no
    // partial state (status unchanged, redemption still ACTIVE).
    await expect(orders.transitionStatus(staff, order.id, 'DELIVERED')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const after = await orderRepo.findById(order.id);
    expect(after!.status).toBe('INITIAL');
    expect((await orderRepo.findRedemptionByOrder(order.id))!.status).toBe('ACTIVE');
  });

  it('does not double-reverse: same-status cancel is idempotent and redemption stays REVERSED once', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code } = await seedOffer(merchantId, restaurantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    await orders.transitionStatus(staff, order.id, 'CANCELLED');
    const first = await orderRepo.findRedemptionByOrder(order.id);
    // Doc 88: same toStatus is idempotent (200 / no new event), not a 400.
    const again = await orders.transitionStatus(staff, order.id, 'CANCELLED');
    expect(again.status).toBe('CANCELLED');
    const second = await orderRepo.findRedemptionByOrder(order.id);
    expect(second!.status).toBe('REVERSED');
    expect(second!.reversedAt!.getTime()).toBe(first!.reversedAt!.getTime()); // not re-stamped
  });

  it('leaves a non-coupon order cancellation unchanged (no redemption to reverse)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const order = await orders.createOrder(
      staff,
      baseInput(restaurantId, { discountTotalMinor: 5000n }),
    );
    const cancelled = await orders.transitionStatus(staff, order.id, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
    expect(await orderRepo.findRedemptionByOrder(order.id)).toBeNull();
  });

  it('is merchant-scoped: another merchant cannot cancel the order', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const { code } = await seedOffer(a.merchantId, a.restaurantId);
    const order = await orders.createOrder(
      staffOf(a.merchantId),
      baseInput(a.restaurantId, { couponCode: code }),
    );
    await expect(
      orders.transitionStatus(staffOf(b.merchantId), order.id, 'CANCELLED'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // redemption untouched
    expect((await orderRepo.findRedemptionByOrder(order.id))!.status).toBe('ACTIVE');
  });

  it('reverses only the target order, never another order sharing the same coupon', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code, offerId } = await seedOffer(merchantId, restaurantId);
    const o1 = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    const o2 = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    expect(await activeCount(offerId)).toBe(2);
    await orders.transitionStatus(staff, o1.id, 'CANCELLED');
    expect((await orderRepo.findRedemptionByOrder(o1.id))!.status).toBe('REVERSED');
    expect((await orderRepo.findRedemptionByOrder(o2.id))!.status).toBe('ACTIVE');
    expect(await activeCount(offerId)).toBe(1);
  });

  it('releases maxUsageLimit after cancellation', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code } = await seedOffer(merchantId, restaurantId, { maxUsageLimit: 1 });
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    // limit reached
    await expect(
      orders.createOrder(staff, baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeTruthy();
    // cancel releases the slot
    await orders.transitionStatus(staff, order.id, 'CANCELLED');
    const again = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    expect(again.discountTotalMinor).toBe(6500n);
  });

  it('releases perUserLimit after cancellation', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const user = await seedUser();
    const { code } = await seedOffer(merchantId, restaurantId, { perUserLimit: 1 });
    const order = await orders.createOrder(
      staff,
      baseInput(restaurantId, { couponCode: code, userId: user.id }),
    );
    await expect(
      orders.createOrder(staff, baseInput(restaurantId, { couponCode: code, userId: user.id })),
    ).rejects.toBeTruthy();
    await orders.transitionStatus(staff, order.id, 'CANCELLED');
    const again = await orders.createOrder(
      staff,
      baseInput(restaurantId, { couponCode: code, userId: user.id }),
    );
    expect(again.discountTotalMinor).toBe(6500n);
  });

  it('keeps redemption state consistent under concurrent cancellation (reversed exactly once)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code } = await seedOffer(merchantId, restaurantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    // Two concurrent cancellations. Compare-and-set => at most one applies; the
    // other is an idempotent no-op or an upstream terminal-transition rejection.
    const results = await Promise.allSettled([
      orders.transitionStatus(staff, order.id, 'CANCELLED'),
      orders.transitionStatus(staff, order.id, 'CANCELLED'),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const redemption = await orderRepo.findRedemptionByOrder(order.id);
    expect(redemption!.status).toBe('REVERSED');
    // exactly one CANCELLED status event (no duplicate from the race)
    const events = await prisma.orderStatusEvent.count({
      where: { orderId: order.id, toStatus: 'CANCELLED' },
    });
    expect(events).toBe(1);
  });

  // --- useLimit / useFrequency reconciliation (P1.7.25 Phase 3, CASE B) ---
  // The per-user-per-calendar-period rule is source-established, but the window
  // timezone anchor + week-start convention are NOT source-pinned (runtime/locale
  // config). Per the slice's no-invention rule these remain an owner decision, so
  // the fields are preserved but NOT enforced. This regression test documents that
  // an offer carrying useLimit/useFrequency still redeems normally (they do not
  // silently block or alter the discount) — it does NOT encode invented semantics.
  it('preserves P1.7.24 behavior for offers carrying useLimit/useFrequency (not enforced)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const user = await seedUser();
    const { code } = await seedOffer(merchantId, restaurantId, {
      useLimit: 1,
      useFrequency: 'DAILY',
    });
    const first = await orders.createOrder(
      staff,
      baseInput(restaurantId, { couponCode: code, userId: user.id }),
    );
    const second = await orders.createOrder(
      staff,
      baseInput(restaurantId, { couponCode: code, userId: user.id }),
    );
    // Both succeed with the correct server discount (useLimit/useFrequency are not
    // enforced — deferred owner decision), and maxUsageLimit/perUserLimit are the
    // only usage gates (unset here).
    expect(first.discountTotalMinor).toBe(6500n);
    expect(second.discountTotalMinor).toBe(6500n);
  });
});
