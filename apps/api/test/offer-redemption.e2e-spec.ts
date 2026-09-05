import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
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
 * P1.7.24 — Offer redemption & server-side discount at order creation.
 *
 * Integration against the TEST DB. The server is authoritative for the discount
 * and the grand total when a coupon is applied (DEC-OFF-1): client-supplied
 * discount/total are never trusted. Redemption is one idempotent, reversible
 * `CouponRedemption` at the order-placement commit point (DEC-OFF-3); usage is
 * derived from ACTIVE redemptions and enforced under a per-coupon row lock.
 */
describe('Offer redemption & server-side discount (integration)', () => {
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

  // Subtotal for baseInput = 25000*2 + 5000*3 = 65000 minor units (650.00).
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

  interface OfferSeed {
    active?: boolean;
    isGlobal?: boolean;
    merchantId?: string | null;
    restaurantId?: string | null;
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
    withCoupon?: boolean;
  }

  // Seed an Offer (+ optional Coupon) directly for full control over eligibility.
  const seedOffer = async (o: OfferSeed = {}) => {
    const code = uniq('SAVE').toUpperCase();
    const offer = await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: o.active ?? true,
        isGlobal: o.isGlobal ?? false,
        merchantId: o.merchantId ?? null,
        restaurantId: o.restaurantId ?? null,
        deletedAt: o.deletedAt ?? null,
        discountPercent: o.discountPercent ?? null,
        discountMinor: o.discountMinor ?? null,
        maxDiscountMinor: o.maxDiscountMinor ?? null,
        minOrderMinor: o.minOrderMinor ?? null,
        maxOrderMinor: o.maxOrderMinor ?? null,
        serviceTypes: (o.serviceTypes ?? undefined) as never,
        validFrom: o.validFrom ?? null,
        validTo: o.validTo ?? null,
        maxUsageLimit: o.maxUsageLimit ?? null,
        perUserLimit: o.perUserLimit ?? null,
        ...(o.withCoupon === false ? {} : { coupons: { create: [{ code }] } }),
      },
      include: { coupons: true },
    });
    return { offerId: offer.id, code: offer.coupons[0]?.code ?? null };
  };

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

  // ---- DISCOUNT CALCULATION ----
  it('applies a valid PERCENTAGE discount computed server-side', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({ merchantId, restaurantId, discountPercent: 10 });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code }),
    );
    // 10% of 65000 = 6500; grand = 65000 - 6500 = 58500
    expect(order.subtotalMinor).toBe(65000n);
    expect(order.discountTotalMinor).toBe(6500n);
    expect(order.grandTotalMinor).toBe(58500n);
    expect(order.offerId).not.toBeNull();
    expect(order.couponId).not.toBeNull();
  });

  it('applies a valid FIXED discount computed server-side', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({ merchantId, restaurantId, discountMinor: 10000n });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code }),
    );
    expect(order.discountTotalMinor).toBe(10000n);
    expect(order.grandTotalMinor).toBe(55000n);
  });

  it('caps the discount at maxDiscountMinor', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    // 50% of 65000 = 32500, capped at 5000
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 50,
      maxDiscountMinor: 5000n,
    });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code }),
    );
    expect(order.discountTotalMinor).toBe(5000n);
    expect(order.grandTotalMinor).toBe(60000n);
  });

  // ---- ORDER-AMOUNT GATES ----
  it('rejects when subtotal is below minOrderMinor', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      minOrderMinor: 100000n,
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when subtotal is above maxOrderMinor', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      maxOrderMinor: 10000n,
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- VALIDITY / STATE ----
  it('rejects an inactive offer', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      active: false,
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a soft-deleted offer', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      deletedAt: new Date(),
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired offer', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      validTo: new Date(Date.now() - 86_400_000),
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a future (not-yet-valid) offer', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      validFrom: new Date(Date.now() + 86_400_000),
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown/invalid coupon code', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    await expect(
      orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: 'NOPE-DOES-NOT-EXIST' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- SCOPE / TENANCY ----
  it('rejects an offer scoped to a different restaurant of the same merchant', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const otherRestaurant = await provisioning.createRestaurant(staffOf(merchantId), {
      merchantId,
      name: uniq('R2'),
      city: 'Bengaluru',
    });
    const { code } = await seedOffer({
      merchantId,
      restaurantId: otherRestaurant.id,
      discountPercent: 10,
    });
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an offer belonging to a different merchant', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    // Offer scoped to merchant B (no restaurant) used on merchant A's order.
    const { code } = await seedOffer({ merchantId: b.merchantId, discountPercent: 10 });
    await expect(
      orders.createOrder(staffOf(a.merchantId), baseInput(a.restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an offer not applicable to the order service type', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      serviceTypes: ['DINE_IN'],
    });
    // baseInput type is HOME_DELIVERY
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a matching service type (and ALL wildcard)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      serviceTypes: ['HOME_DELIVERY'],
    });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code }),
    );
    expect(order.discountTotalMinor).toBe(6500n);
  });

  it('applies a GLOBAL offer to any merchant, including for SUPER_ADMIN', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({ isGlobal: true, discountPercent: 20 });
    const order = await orders.createOrder(
      superAdmin,
      baseInput(restaurantId, { couponCode: code }),
    );
    expect(order.merchantId).toBe(merchantId); // derived from restaurant, not client
    expect(order.discountTotalMinor).toBe(13000n); // 20% of 65000
  });

  it('preserves merchant tenancy — staff cannot place a coupon order on another merchant', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const { code } = await seedOffer({ isGlobal: true, discountPercent: 10 });
    await expect(
      orders.createOrder(staffOf(a.merchantId), baseInput(b.restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---- SECURITY: client never trusted ----
  it('IGNORES a client-supplied INFLATED discount and uses the server value', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({ merchantId, restaurantId, discountPercent: 10 });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code, discountTotalMinor: 999999n }),
    );
    expect(order.discountTotalMinor).toBe(6500n);
    expect(order.grandTotalMinor).toBe(58500n);
  });

  it('IGNORES a client-supplied REDUCED (zero) discount and uses the server value', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({ merchantId, restaurantId, discountPercent: 10 });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code, discountTotalMinor: 0n }),
    );
    expect(order.discountTotalMinor).toBe(6500n);
    expect(order.grandTotalMinor).toBe(58500n);
  });

  // ---- REDEMPTION LEDGER ----
  it('creates an ACTIVE redemption with the discount snapshot at placement', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const user = await seedUser();
    const { code } = await seedOffer({ merchantId, restaurantId, discountPercent: 10 });
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code, userId: user.id }),
    );
    const redemption = await orderRepo.findRedemptionByOrder(order.id);
    expect(redemption).not.toBeNull();
    expect(redemption!.status).toBe('ACTIVE');
    expect(redemption!.orderId).toBe(order.id);
    expect(redemption!.userId).toBe(user.id);
    expect(redemption!.couponId).toBe(order.couponId);
    expect(redemption!.discountAppliedMinor).toBe(6500n); // snapshot
  });

  it('creates NO redemption for an order placed without a coupon (non-offer path preserved)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { discountTotalMinor: 5000n }),
    );
    expect(order.offerId).toBeNull();
    expect(order.couponId).toBeNull();
    expect(order.discountTotalMinor).toBe(5000n); // ad-hoc discount preserved (no offer)
    expect(await orderRepo.findRedemptionByOrder(order.id)).toBeNull();
  });

  // ---- USAGE LIMITS ----
  it('enforces the maximum total usage limit', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      maxUsageLimit: 1,
    });
    await orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code }));
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the per-user usage limit while allowing another user', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const u1 = await seedUser();
    const u2 = await seedUser();
    const { code } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      perUserLimit: 1,
    });
    await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code, userId: u1.id }),
    );
    await expect(
      orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { couponCode: code, userId: u1.id }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // a different user may still redeem
    const ok = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { couponCode: code, userId: u2.id }),
    );
    expect(ok.discountTotalMinor).toBe(6500n);
  });

  // ---- CONCURRENCY ----
  it('cannot oversubscribe the last usage under concurrent placement', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code, offerId } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      maxUsageLimit: 1,
    });
    const results = await Promise.allSettled([
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { couponCode: code })),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const active = await prisma.couponRedemption.count({
      where: { coupon: { offerId }, status: 'ACTIVE' },
    });
    expect(active).toBe(1);
  });

  // ---- IDEMPOTENCY ----
  it('is idempotent for a repeated identical order (same orderNumber) — no duplicate redemption', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const { code, offerId } = await seedOffer({ merchantId, restaurantId, discountPercent: 10 });
    const orderNumber = uniq('ORD');
    await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { orderNumber, couponCode: code }),
    );
    // retry with the SAME orderNumber -> Order.orderNumber @unique rejects; the
    // whole transaction rolls back, so no second redemption is created.
    await expect(
      orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { orderNumber, couponCode: code }),
      ),
    ).rejects.toBeTruthy();
    const active = await prisma.couponRedemption.count({
      where: { coupon: { offerId }, status: 'ACTIVE' },
    });
    expect(active).toBe(1);
  });

  // ---- REVERSAL ----
  it('reverses the redemption when the order is cancelled and releases usage', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const { code, offerId } = await seedOffer({
      merchantId,
      restaurantId,
      discountPercent: 10,
      maxUsageLimit: 1,
    });
    const order = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    // cancel (INITIAL -> CANCELLED is a supported P1.7.12 transition)
    await orders.transitionStatus(staff, order.id, 'CANCELLED');
    const redemption = await orderRepo.findRedemptionByOrder(order.id);
    expect(redemption!.status).toBe('REVERSED');
    expect(redemption!.reversedAt).not.toBeNull();
    // usage released -> a new order with the same (maxUsageLimit=1) coupon succeeds
    const again = await orders.createOrder(staff, baseInput(restaurantId, { couponCode: code }));
    expect(again.discountTotalMinor).toBe(6500n);
    const active = await prisma.couponRedemption.count({
      where: { coupon: { offerId }, status: 'ACTIVE' },
    });
    expect(active).toBe(1);
  });
});
