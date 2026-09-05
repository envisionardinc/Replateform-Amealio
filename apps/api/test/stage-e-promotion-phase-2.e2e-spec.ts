import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import { createApp } from '../src/main';

/**
 * Stage E — Promotion Phase 2 (doc 108).
 * Kernel quotes the discount; Stage D composes totals; ledger writes only at
 * COD commit or prepaid capture.
 */
describe('Stage E promotion phase 2', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let catalog: CatalogWriteService;
  let orders: OrderService;
  let httpApp: INestApplication;

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
        CatalogModule,
        StaffAuthModule,
        OrderingModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    catalog = app.get(CatalogWriteService);
    orders = app.get(OrderService);
    httpApp = await createApp();
    await httpApp.init();
  });

  afterAll(async () => {
    await app.close();
    await httpApp.close();
  });

  async function seedRestaurant() {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Pune',
    });
    const item = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Pizza',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Large', sku: uniq('PIZ'), priceMinor: 20000n, isDefault: true }],
    });
    return {
      merchantId: m.id,
      restaurantId: r.id,
      item,
      variant: item.variants[0],
    };
  }

  async function seedOffer(
    opts: {
      merchantId?: string | null;
      restaurantId?: string | null;
      isGlobal?: boolean;
      active?: boolean;
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
    } = {},
  ) {
    const code = uniq('SAVE').toUpperCase();
    const offer = await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: opts.active ?? true,
        isGlobal: opts.isGlobal ?? false,
        merchantId: opts.merchantId ?? null,
        restaurantId: opts.restaurantId ?? null,
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
        ...(opts.withCoupon === false ? {} : { coupons: { create: [{ code }] } }),
      },
      include: { coupons: true },
    });
    return { offer, code: offer.coupons[0]?.code ?? null };
  }

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const http = () => request(httpApp.getHttpServer());
    await http()
      .post('/api/v1/auth/consumer/register')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    const login = await http()
      .post('/api/v1/auth/consumer/login')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    return { token: login.body.accessToken as string, userId: login.body.user.id as string, http };
  }

  it('quotes a valid coupon into the Stage D discount slot without redeeming', async () => {
    const seeded = await seedRestaurant();
    const { code } = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
    });
    const { http } = await registerConsumer();
    const quoted = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.variant.id,
        quantity: 1,
        type: 'TAKE_AWAY',
        couponCode: `  ${code?.toLowerCase()}  `,
      });
    expect(quoted.status).toBe(201);
    expect(quoted.body.merchandiseSubtotalMinor).toBe('20000');
    expect(quoted.body.discountMinor).toBe('2000');
    expect(quoted.body.taxableSubtotalMinor).toBe('18000');
    expect(quoted.body.taxTotalMinor).toBe('0');
    expect(quoted.body.feeTotalMinor).toBe('0');
    expect(quoted.body.grandTotalMinor).toBe('18000');
    expect(quoted.body.promotion.couponCode).toBe(code);
    expect(quoted.body.promotion.source).toBe('CODE');
    expect(await prisma.couponRedemption.count({ where: { coupon: { code: code! } } })).toBe(0);
  });

  it('rejects an invalid/expired/minimum coupon deterministically and does not apply automatic', async () => {
    const seeded = await seedRestaurant();
    await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 50,
      withCoupon: false,
    });
    const expired = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
      validTo: new Date(Date.now() - 86_400_000),
    });
    const min = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
      minOrderMinor: 100000n,
    });
    const { http } = await registerConsumer();

    const invalid = await http()
      .post('/api/v1/discover/quote')
      .send({ variantId: seeded.variant.id, quantity: 1, type: 'TAKE_AWAY', couponCode: 'NOPE' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_CODE');

    const exp = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.variant.id,
      quantity: 1,
      type: 'TAKE_AWAY',
      couponCode: expired.code,
    });
    expect(exp.status).toBe(400);
    expect(exp.body.code).toBe('EXPIRED');

    const tooSmall = await http()
      .post('/api/v1/discover/quote')
      .send({ variantId: seeded.variant.id, quantity: 1, type: 'TAKE_AWAY', couponCode: min.code });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.code).toBe('MINIMUM_NOT_MET');

    const auto = await http()
      .post('/api/v1/discover/quote')
      .send({ variantId: seeded.variant.id, quantity: 1, type: 'TAKE_AWAY' });
    expect(auto.status).toBe(201);
    expect(auto.body.discountMinor).toBe('10000');
    expect(auto.body.promotion.source).toBe('AUTOMATIC');
  });

  it('lets an explicit code win over a better automatic promotion', async () => {
    const seeded = await seedRestaurant();
    await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 50,
      withCoupon: false,
    });
    const coded = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
    });
    const { http } = await registerConsumer();
    const quoted = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.variant.id,
      quantity: 1,
      type: 'TAKE_AWAY',
      couponCode: coded.code,
    });
    expect(quoted.status).toBe(201);
    expect(quoted.body.discountMinor).toBe('2000');
    expect(quoted.body.promotion.source).toBe('CODE');
    expect(quoted.body.grandTotalMinor).toBe('18000');
  });

  it('COD checkout redeems exactly once and is idempotent', async () => {
    const seeded = await seedRestaurant();
    const { code } = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
    });
    const { token, http } = await registerConsumer();
    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .query({ couponCode: code })
      .send({
        variantId: seeded.variant.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'TAKE_AWAY',
      });
    expect(added.status).toBe(201);
    expect(added.body.discountMinor).toBe('2000');
    expect(added.body.grandTotalMinor).toBe('18000');
    expect(await prisma.couponRedemption.count({ where: { coupon: { code: code! } } })).toBe(0);

    const key = uniq('idem');
    const first = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        restaurantId: seeded.restaurantId,
        type: 'TAKE_AWAY',
        settlement: 'COD',
        couponCode: code,
      });
    expect(first.status).toBe(201);
    expect(first.body.order.discountTotalMinor).toBe('2000');
    expect(first.body.order.grandTotalMinor).toBe('18000');
    expect(first.body.order.commercialSnapshot.promotion.couponCode).toBe(code);
    expect(first.body.payment).toBeNull();

    const replay = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        restaurantId: seeded.restaurantId,
        type: 'TAKE_AWAY',
        settlement: 'COD',
        couponCode: code,
      });
    expect(replay.status).toBe(201);
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect(await prisma.couponRedemption.count({ where: { orderId: first.body.order.id } })).toBe(
      1,
    );
  });

  it('prepaid does not redeem until capture; retries stay idempotent', async () => {
    const seeded = await seedRestaurant();
    const { code } = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
    });
    const { token, http } = await registerConsumer();
    await http().post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({
      variantId: seeded.variant.id,
      restaurantId: seeded.restaurantId,
      quantity: 1,
      type: 'TAKE_AWAY',
    });
    const placed = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uniq('pre'))
      .send({
        restaurantId: seeded.restaurantId,
        type: 'TAKE_AWAY',
        settlement: 'PREPAID',
        couponCode: code,
      });
    expect(placed.status).toBe(201);
    expect(placed.body.order.grandTotalMinor).toBe('18000');
    expect(placed.body.payment.amountMinor).toBe('18000');
    expect(placed.body.order.status).toBe('INITIAL');
    expect(await prisma.couponRedemption.count({ where: { orderId: placed.body.order.id } })).toBe(
      0,
    );

    await orders.promoteOnPaymentCapture(placed.body.order.id);
    await orders.promoteOnPaymentCapture(placed.body.order.id);
    expect(await prisma.couponRedemption.count({ where: { orderId: placed.body.order.id } })).toBe(
      1,
    );
  });

  it('historical snapshot keeps the discount after catalog and offer changes', async () => {
    const seeded = await seedRestaurant();
    const { code, offer } = await seedOffer({
      merchantId: seeded.merchantId,
      restaurantId: seeded.restaurantId,
      discountPercent: 10,
    });
    const created = await orders.createOrder(staffOf(seeded.merchantId), {
      orderNumber: uniq('ORD'),
      restaurantId: seeded.restaurantId,
      type: 'TAKE_AWAY',
      couponCode: code,
      items: [
        {
          menuItemId: seeded.item.id,
          nameSnapshot: 'Pizza',
          variantSnapshot: 'Large',
          unitPriceMinor: 20000n,
          quantity: 1,
        },
      ],
    });
    expect(created.discountTotalMinor).toBe(2000n);
    expect(created.grandTotalMinor).toBe(18000n);

    await prisma.itemVariant.update({
      where: { id: seeded.variant.id },
      data: { priceMinor: 99999n },
    });
    await prisma.offer.update({
      where: { id: offer.id },
      data: { discountPercent: 90, title: 'Changed later' },
    });

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(persisted.discountTotalMinor).toBe(2000n);
    expect(persisted.grandTotalMinor).toBe(18000n);
    const snap = persisted.commercialSnapshot as {
      discountMinor: string;
      promotion: { title: string };
    };
    expect(snap.discountMinor).toBe('2000');
    expect(snap.promotion.title).not.toBe('Changed later');
  });

  it('enforces restaurant scope and concurrent usage limits', async () => {
    const a = await seedRestaurant();
    const b = await seedRestaurant();
    const foreign = await seedOffer({
      merchantId: b.merchantId,
      restaurantId: b.restaurantId,
      discountPercent: 10,
    });
    const limited = await seedOffer({
      merchantId: a.merchantId,
      restaurantId: a.restaurantId,
      discountPercent: 10,
      maxUsageLimit: 1,
    });

    const { http } = await registerConsumer();
    const scoped = await http().post('/api/v1/discover/quote').send({
      variantId: a.variant.id,
      quantity: 1,
      type: 'TAKE_AWAY',
      couponCode: foreign.code,
    });
    expect(scoped.status).toBe(400);
    expect(scoped.body.code).toBe('RESTAURANT_NOT_ALLOWED');

    const u1 = await registerConsumer();
    const u2 = await registerConsumer();
    await u1.http().post('/api/v1/cart/items').set('Authorization', `Bearer ${u1.token}`).send({
      variantId: a.variant.id,
      restaurantId: a.restaurantId,
      quantity: 1,
      type: 'TAKE_AWAY',
    });
    await u2.http().post('/api/v1/cart/items').set('Authorization', `Bearer ${u2.token}`).send({
      variantId: a.variant.id,
      restaurantId: a.restaurantId,
      quantity: 1,
      type: 'TAKE_AWAY',
    });

    const [c1, c2] = await Promise.all([
      u1
        .http()
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${u1.token}`)
        .set('Idempotency-Key', uniq('c1'))
        .send({
          restaurantId: a.restaurantId,
          type: 'TAKE_AWAY',
          settlement: 'COD',
          couponCode: limited.code,
        }),
      u2
        .http()
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${u2.token}`)
        .set('Idempotency-Key', uniq('c2'))
        .send({
          restaurantId: a.restaurantId,
          type: 'TAKE_AWAY',
          settlement: 'COD',
          couponCode: limited.code,
        }),
    ]);
    const ok = [c1, c2].filter((r) => r.status === 201);
    const fail = [c1, c2].filter((r) => r.status === 400 || r.status === 409);
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(
      await prisma.couponRedemption.count({ where: { coupon: { code: limited.code! } } }),
    ).toBe(1);
  });

  it('does not import the Phase 1 kernel from the Stage D calculator', () => {
    for (const file of [
      '../src/modules/catalog/domain/commercial-quote.ts',
      '../src/modules/catalog/application/commercial-quote.service.ts',
    ]) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src).not.toMatch(/PromotionEvaluationService/);
      expect(src).not.toMatch(/PromotionApplicationService/);
    }
  });
});
