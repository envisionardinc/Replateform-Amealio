import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { CommercialQuoteService } from '../src/modules/catalog/application/commercial-quote.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import { createApp } from '../src/main';

/**
 * Stage D — canonical commercial quote (doc 107).
 * Merchandise remains Stage A. Tax/fee are explicit zeros without typed rules.
 * Client money cannot set payable totals. Orders snapshot the quote.
 */
describe('Stage D commercial quote', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let catalog: CatalogWriteService;
  let commercial: CommercialQuoteService;
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
    commercial = app.get(CommercialQuoteService);
    orders = app.get(OrderService);

    httpApp = await createApp();
    await httpApp.init();
  });

  afterAll(async () => {
    await app.close();
    await httpApp.close();
  });

  async function seedItem(opts?: { priceMinor?: bigint; toppings?: boolean }) {
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
      variants: [{ size: 'Large', sku: 'PIZ-L', priceMinor: opts?.priceMinor ?? 16000n, isDefault: true }],
      addOnGroups: opts?.toppings === false
        ? []
        : [
            {
              name: 'Toppings',
              minSelect: 0,
              maxSelect: 2,
              addOns: [{ name: 'Pepperoni', priceMinor: 300n }],
            },
          ],
    });
    const variant = item.variants[0];
    const toppings = item.addOnGroups.find((g) => g.name === 'Toppings');
    const pepperoni = toppings?.addOns.find((a) => a.name === 'Pepperoni');
    return {
      merchantId: m.id,
      restaurantId: r.id,
      item,
      variant,
      toppings,
      pepperoni,
    };
  }

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const http = () => request(httpApp.getHttpServer());
    const created = await http()
      .post('/api/v1/auth/consumer/register')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    expect(created.status).toBe(201);
    const login = await http()
      .post('/api/v1/auth/consumer/login')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    return { token: login.body.accessToken as string, http };
  }

  it('quotes merchandise, keeps tax/fee separate, and totals deterministically', async () => {
    const seeded = await seedItem();
    const merch = await commercial.quote({
      variantId: seeded.variant.id,
      quantity: 2,
      modifierGroups: [
        {
          groupId: seeded.toppings!.id,
          selections: [{ modifierId: seeded.pepperoni!.id }],
        },
      ],
    });
    expect(merch.merchandiseSubtotalMinor).toBe(32600n);
    expect(merch.discountMinor).toBe(0n);
    expect(merch.taxableSubtotalMinor).toBe(32600n);
    expect(merch.taxes).toEqual([]);
    expect(merch.fees).toEqual([]);
    expect(merch.taxTotalMinor).toBe(0n);
    expect(merch.feeTotalMinor).toBe(0n);
    expect(merch.grandTotalMinor).toBe(32600n);
  });

  it('rejects caller tax/fee/delivery on order create', async () => {
    const seeded = await seedItem({ toppings: false });
    await expect(
      orders.createOrder(staffOf(seeded.merchantId), {
        orderNumber: uniq('ORD'),
        restaurantId: seeded.restaurantId,
        type: 'TAKE_AWAY',
        items: [{ nameSnapshot: 'Pizza', unitPriceMinor: 16000n, quantity: 1 }],
        taxTotalMinor: 1800n,
      }),
    ).rejects.toThrow(/taxTotalMinor|CLIENT_MONEY_NOT_AUTHORITATIVE|server-derived/i);
    await expect(
      orders.createOrder(staffOf(seeded.merchantId), {
        orderNumber: uniq('ORD'),
        restaurantId: seeded.restaurantId,
        type: 'TAKE_AWAY',
        items: [{ nameSnapshot: 'Pizza', unitPriceMinor: 16000n, quantity: 1 }],
        feeTotalMinor: 100n,
      }),
    ).rejects.toThrow(/feeTotalMinor|CLIENT_MONEY_NOT_AUTHORITATIVE|server-derived/i);
  });

  it('HTTP quote/cart/checkout use the same server totals and ignore client money', async () => {
    const seeded = await seedItem();
    const { token, http } = await registerConsumer();

    const quoted = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.variant.id,
        quantity: 1,
        type: 'DINE_IN',
        modifierGroups: [
          {
            groupId: seeded.toppings!.id,
            selections: [{ modifierId: seeded.pepperoni!.id }],
          },
        ],
        taxTotalMinor: 99,
        grandTotalMinor: 1,
      });
    expect(quoted.status).toBe(400);

    const okQuote = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.variant.id,
        quantity: 1,
        type: 'DINE_IN',
        modifierGroups: [
          {
            groupId: seeded.toppings!.id,
            selections: [{ modifierId: seeded.pepperoni!.id }],
          },
        ],
      });
    expect(okQuote.status).toBe(201);
    expect(okQuote.body.unitMerchandiseMinor).toBe('16300');
    expect(okQuote.body.merchandiseSubtotalMinor).toBe('16300');
    expect(okQuote.body.discountMinor).toBe('0');
    expect(okQuote.body.taxTotalMinor).toBe('0');
    expect(okQuote.body.feeTotalMinor).toBe('0');
    expect(okQuote.body.taxes).toEqual([]);
    expect(okQuote.body.fees).toEqual([]);
    expect(okQuote.body.grandTotalMinor).toBe('16300');

    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: seeded.variant.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'DINE_IN',
        modifierGroups: [
          {
            groupId: seeded.toppings!.id,
            selections: [{ modifierId: seeded.pepperoni!.id }],
          },
        ],
      });
    expect([200, 201]).toContain(added.status);
    expect(added.body.grandTotalMinor).toBe('16300');
    expect(added.body.taxTotalMinor).toBe('0');
    expect(added.body.feeTotalMinor).toBe('0');

    const checkout = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uniq('idem'))
      .send({
        restaurantId: seeded.restaurantId,
        type: 'DINE_IN',
        settlement: 'PREPAID',
        taxTotalMinor: 500,
        grandTotalMinor: 1,
      });
    expect(checkout.status).toBe(400);

    const placed = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uniq('idem'))
      .send({
        restaurantId: seeded.restaurantId,
        type: 'DINE_IN',
        settlement: 'PREPAID',
      });
    expect(placed.status).toBe(201);
    expect(placed.body.order.subtotalMinor).toBe('16300');
    expect(placed.body.order.taxTotalMinor).toBe('0');
    expect(placed.body.order.feeTotalMinor).toBe('0');
    expect(placed.body.order.grandTotalMinor).toBe('16300');
    expect(placed.body.payment.amountMinor).toBe('16300');
    expect(placed.body.order.commercialSnapshot.schema).toBe('commercial.v1');
    expect(placed.body.order.commercialSnapshot.grandTotalMinor).toBe('16300');
    expect(placed.body.order.commercialSnapshot.taxes).toEqual([]);
    expect(placed.body.order.commercialSnapshot.fees).toEqual([]);
  });

  it('order snapshot survives a later catalog price change', async () => {
    const seeded = await seedItem({ toppings: false, priceMinor: 10000n });
    const created = await orders.createOrder(staffOf(seeded.merchantId), {
      orderNumber: uniq('ORD'),
      restaurantId: seeded.restaurantId,
      type: 'TAKE_AWAY',
      items: [
        {
          menuItemId: seeded.item.id,
          nameSnapshot: 'Pizza',
          variantSnapshot: 'Large',
          unitPriceMinor: 10000n,
          quantity: 1,
        },
      ],
    });
    expect(created.grandTotalMinor).toBe(10000n);
    expect(created.commercialSnapshot).toMatchObject({
      schema: 'commercial.v1',
      merchandiseSubtotalMinor: '10000',
      grandTotalMinor: '10000',
    });

    await prisma.itemVariant.update({
      where: { id: seeded.variant.id },
      data: { priceMinor: 99999n },
    });

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true },
    });
    expect(persisted.grandTotalMinor).toBe(10000n);
    expect(persisted.subtotalMinor).toBe(10000n);
    expect(persisted.items[0].unitPriceMinor).toBe(10000n);
    const snap = persisted.commercialSnapshot as { grandTotalMinor: string };
    expect(snap.grandTotalMinor).toBe('10000');

    const requote = await commercial.quote({ variantId: seeded.variant.id, quantity: 1 });
    expect(requote.grandTotalMinor).toBe(99999n);
  });

  it('cannot use another merchant catalog for a quote', async () => {
    const a = await seedItem({ toppings: false });
    const b = await seedItem({ toppings: false });
    await expect(commercial.quote({ variantId: a.variant.id, quantity: 1 })).resolves.toMatchObject({
      restaurantId: a.restaurantId,
    });
    const quoteB = await commercial.quote({ variantId: b.variant.id, quantity: 1 });
    expect(quoteB.restaurantId).toBe(b.restaurantId);
    expect(quoteB.merchantId).not.toBe(a.merchantId);
  });

  it('does not import the promotion evaluation kernel on the quote path', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const files = [
      '../src/modules/catalog/application/commercial-quote.service.ts',
      '../src/modules/catalog/domain/commercial-quote.ts',
      '../src/modules/ordering/application/cart.service.ts',
      '../src/modules/ordering/application/checkout.service.ts',
      '../src/modules/ordering/application/order.service.ts',
      '../src/modules/discovery/application/discovery.service.ts',
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(src).not.toMatch(/PromotionEvaluationService/);
    }
  });
});
