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
import { ComboService } from '../src/modules/catalog/application/combo.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import { createApp } from '../src/main';

describe('Stage F combo / bundle', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let catalog: CatalogWriteService;
  let combos: ComboService;
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
    combos = app.get(ComboService);
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
    const pizza = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Pizza',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Large', sku: uniq('PIZ'), priceMinor: 20000n, isDefault: true }],
    });
    const coke = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Coke',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Can', sku: uniq('COK'), priceMinor: 5000n, isDefault: true }],
    });
    const fries = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Fries',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Reg', sku: uniq('FRI'), priceMinor: 8000n, isDefault: true }],
    });
    return {
      merchantId: m.id,
      restaurantId: r.id,
      pizza,
      coke,
      fries,
      staff: staffOf(m.id),
    };
  }

  async function seedCombo(
    seeded: Awaited<ReturnType<typeof seedRestaurant>>,
    over: { substitutable?: boolean; sectionIds?: string[]; isPublished?: boolean } = {},
  ) {
    return combos.create(seeded.staff, {
      restaurantId: seeded.restaurantId,
      name: 'Meal Combo',
      isPublished: over.isPublished ?? true,
      substitutable: over.substitutable ?? false,
      comboPriceMinor: 29900n,
      sectionIds: over.sectionIds,
      slots: [
        {
          name: 'Main',
          options: [
            { menuItemId: seeded.pizza.id, isDefault: true },
            { menuItemId: seeded.fries.id, isDefault: false },
          ],
        },
        { name: 'Drink', options: [{ menuItemId: seeded.coke.id, isDefault: true }] },
      ],
    });
  }

  async function seedOffer(merchantId: string, restaurantId: string, discountPercent = 10) {
    const code = uniq('SAVE').toUpperCase();
    const offer = await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: true,
        merchantId,
        restaurantId,
        discountPercent,
        coupons: { create: [{ code }] },
      },
      include: { coupons: true },
    });
    return { offer, code: offer.coupons[0]!.code };
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

  it('keeps combo as a distinct merchant-owned bundle with valid components', async () => {
    const seeded = await seedRestaurant();
    const combo = await seedCombo(seeded);
    expect(combo.restaurantId).toBe(seeded.restaurantId);
    expect(combo.merchantId).toBe(seeded.merchantId);
    expect(combo.slots).toHaveLength(2);
    expect(combo.comboPriceMinor).toBe(29900n);
    const listed = await combos.listForRestaurant(seeded.staff, seeded.restaurantId);
    expect(listed.map((row) => row.id)).toContain(combo.id);
  });

  it('quotes the fixed combo price and ignores component catalog prices and client money', async () => {
    const seeded = await seedRestaurant();
    const combo = await seedCombo(seeded);
    const { http } = await registerConsumer();
    const quoted = await http().post('/api/v1/discover/quote').send({
      comboId: combo.id,
      quantity: 2,
      type: 'TAKE_AWAY',
    });
    expect(quoted.status).toBe(201);
    expect(quoted.body.comboPriceMinor).toBe('29900');
    expect(quoted.body.lineMerchandiseMinor).toBe('59800');
    expect(quoted.body.merchandiseSubtotalMinor).toBe('59800');
    expect(quoted.body.taxTotalMinor).toBe('0');
    expect(quoted.body.feeTotalMinor).toBe('0');
    expect(quoted.body.grandTotalMinor).toBe('59800');
    expect(quoted.body.components.map((row: { menuItemId: string }) => row.menuItemId)).toEqual([
      seeded.pizza.id,
      seeded.coke.id,
    ]);

    await expect(
      combos.quote({ comboId: combo.id, quantity: 1, comboPriceMinor: 1n }),
    ).rejects.toMatchObject({ response: { code: 'CLIENT_MONEY_NOT_AUTHORITATIVE' } });
  });

  it('enforces selection and does not silently substitute an unavailable required component', async () => {
    const seeded = await seedRestaurant();
    const combo = await seedCombo(seeded, { substitutable: true });
    const { http } = await registerConsumer();

    const badPick = await http().post('/api/v1/discover/quote').send({
      comboId: combo.id,
      quantity: 1,
      type: 'TAKE_AWAY',
      selections: [
        { slotId: combo.slots[0].id, menuItemId: seeded.coke.id },
        { slotId: combo.slots[1].id, menuItemId: seeded.coke.id },
      ],
    });
    expect(badPick.status).toBe(400);
    expect(badPick.body.code).toBe('INVALID_SELECTION');

    const fixed = await seedCombo(seeded);
    const swap = await http().post('/api/v1/discover/quote').send({
      comboId: fixed.id,
      quantity: 1,
      type: 'TAKE_AWAY',
      selections: [
        { slotId: fixed.slots[0].id, menuItemId: seeded.fries.id },
        { slotId: fixed.slots[1].id, menuItemId: seeded.coke.id },
      ],
    });
    expect(swap.status).toBe(400);
    expect(swap.body.code).toBe('INVALID_SELECTION');

    await catalog.updateItem(seeded.staff, seeded.coke.id, { availability: 'SOLDOUT' });
    const blocked = await http().post('/api/v1/discover/quote').send({
      comboId: combo.id,
      quantity: 1,
      type: 'TAKE_AWAY',
      selections: [
        { slotId: combo.slots[0].id, menuItemId: seeded.pizza.id },
        { slotId: combo.slots[1].id, menuItemId: seeded.coke.id },
      ],
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('REQUIRED_COMPONENT_UNAVAILABLE');
    expect(blocked.body.components).toBeUndefined();
  });

  it('lists published combos on standard and custom menus by reference', async () => {
    const seeded = await seedRestaurant();
    const menu = await catalog.createMenu(seeded.staff, {
      restaurantId: seeded.restaurantId,
      name: uniq('Custom'),
      type: 'CUSTOM',
      visibility: true,
    });
    const section = await catalog.createSection(seeded.staff, {
      menuId: menu.id,
      name: 'Deals',
    });
    const combo = await seedCombo(seeded, { sectionIds: [section.id] });
    const { http } = await registerConsumer();
    const standard = await http().get(`/api/v1/discover/restaurants/${seeded.restaurantId}/menu`);
    expect(standard.status).toBe(200);
    expect(standard.body.combos.map((row: { id: string }) => row.id)).toContain(combo.id);
    const custom = await http().get(`/api/v1/discover/menus/${menu.id}`);
    expect(custom.body.combos.map((row: { id: string }) => row.id)).toContain(combo.id);
    expect(custom.body.sections[0].combos[0].id).toBe(combo.id);
  });

  it('adds a combo to cart, checks out through Stage D/E, and snapshots configuration', async () => {
    const seeded = await seedRestaurant();
    const combo = await seedCombo(seeded);
    const { code } = await seedOffer(seeded.merchantId, seeded.restaurantId, 10);
    const { token, http } = await registerConsumer();
    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .query({ couponCode: code })
      .send({
        comboId: combo.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'TAKE_AWAY',
      });
    expect(added.status).toBe(201);
    expect(added.body.items[0].comboId).toBe(combo.id);
    expect(added.body.items[0].addOns.schema).toBe('combo.v1');
    expect(added.body.merchandiseSubtotalMinor).toBe('29900');
    expect(added.body.discountMinor).toBe('2990');
    expect(added.body.grandTotalMinor).toBe('26910');

    const placed = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', uniq('combo'))
      .send({
        restaurantId: seeded.restaurantId,
        type: 'TAKE_AWAY',
        settlement: 'COD',
        couponCode: code,
      });
    expect(placed.status).toBe(201);
    expect(placed.body.order.grandTotalMinor).toBe('26910');
    expect(placed.body.order.commercialSnapshot.schema).toBe('commercial.v1');
    expect(placed.body.order.commercialSnapshot.discountMinor).toBe('2990');
    expect(placed.body.order.commercialSnapshot.lines[0].comboId).toBe(combo.id);
    expect(placed.body.order.items[0].nameSnapshot).toBe('Meal Combo');
    expect(placed.body.order.items[0].addOns.schema).toBe('combo.v1');
    expect(placed.body.order.items[0].addOns.components).toHaveLength(2);
    expect(placed.body.payment).toBeNull();

    await combos.update(seeded.staff, combo.id, { comboPriceMinor: 1n });
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: placed.body.order.id },
      include: { items: true },
    });
    expect(persisted.grandTotalMinor).toBe(26910n);
    expect(persisted.items[0].unitPriceMinor).toBe(29900n);
    const snap = persisted.commercialSnapshot as { grandTotalMinor: string };
    expect(snap.grandTotalMinor).toBe('26910');
  });

  it('rejects a foreign merchant combo and a consumer catalog write', async () => {
    const a = await seedRestaurant();
    const b = await seedRestaurant();
    const comboB = await seedCombo(b);
    await expect(combos.getForStaff(a.staff, comboB.id)).rejects.toBeTruthy();
    await expect(
      combos.create(a.staff, {
        restaurantId: a.restaurantId,
        name: 'Stolen',
        isPublished: true,
        comboPriceMinor: 100n,
        slots: [{ options: [{ menuItemId: b.pizza.id, isDefault: true }] }],
      }),
    ).rejects.toBeTruthy();

    const { http } = await registerConsumer();
    const write = await http().post('/api/v1/catalog/combos').send({
      restaurantId: a.restaurantId,
      name: 'Nope',
      comboPriceMinor: 100,
      slots: [{ options: [{ menuItemId: a.pizza.id }] }],
    });
    expect(write.status).toBe(401);
  });

  it('does not add a second totals or promotion calculator', () => {
    const files = [
      '../src/modules/catalog/domain/combo.ts',
      '../src/modules/catalog/application/combo.service.ts',
      '../src/modules/catalog/domain/commercial-quote.ts',
      '../src/modules/catalog/application/commercial-quote.service.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src).not.toMatch(/PromotionEvaluationService/);
    }
    const commercial = readFileSync(
      join(__dirname, '../src/modules/catalog/application/commercial-quote.service.ts'),
      'utf8',
    );
    expect(commercial).not.toMatch(/PromotionApplicationService/);
  });
});
