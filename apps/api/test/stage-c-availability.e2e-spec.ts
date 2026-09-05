import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { PlatformCatalogService } from '../src/modules/platform-catalog/platform-catalog.service';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { MenuItemRepository } from '../src/modules/catalog/infrastructure/menu-item.repository';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

describe('Stage C availability foundation', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;
  let catalog: CatalogWriteService;
  let platform: PlatformCatalogService;
  let provisioning: MerchantProvisioningService;
  let items: MenuItemRepository;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const http = () => request(app.getHttpServer());
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
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    catalog = app.get(CatalogWriteService);
    platform = app.get(PlatformCatalogService);
    provisioning = app.get(MerchantProvisioningService);
    items = app.get(MenuItemRepository);
  });
  afterAll(async () => {
    await app.close();
  });

  async function seedRestaurant() {
    const merchant = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const restaurant = await provisioning.createRestaurant(staffOf(merchant.id), {
      merchantId: merchant.id,
      name: uniq('Cafe'),
      city: 'Pune',
    });
    return { merchantId: merchant.id, restaurantId: restaurant.id };
  }

  async function seedPizza(overrides?: {
    availability?: 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';
    isPublished?: boolean;
    largeAvailable?: boolean;
    pepperoniAvailable?: boolean;
    mushroomsAvailable?: boolean;
    crustRequired?: boolean;
    channelEnabled?: boolean;
  }) {
    const { merchantId, restaurantId } = await seedRestaurant();
    const item = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Pizza',
      isPublished: overrides?.isPublished ?? true,
      availability: overrides?.availability ?? 'AVAILABLE',
      variants: [
        { size: 'Small', sku: 'PIZ-S', priceMinor: 10000n, isDefault: true, available: true },
        {
          size: 'Large',
          sku: 'PIZ-L',
          priceMinor: 16000n,
          available: overrides?.largeAvailable ?? true,
        },
      ],
      channelConfigs:
        overrides?.channelEnabled === undefined
          ? undefined
          : [{ channel: 'HOME_DELIVERY', enabled: overrides.channelEnabled }],
      addOnGroups: [
        {
          name: 'Crust',
          minSelect: overrides?.crustRequired === false ? 0 : 1,
          maxSelect: 1,
          addOns: [{ name: 'Thin Crust', priceMinor: 0n, isDefault: true }],
        },
        {
          name: 'Toppings',
          minSelect: 0,
          maxSelect: 2,
          addOns: [
            {
              name: 'Pepperoni',
              priceMinor: 100n,
              available: overrides?.pepperoniAvailable ?? true,
            },
            {
              name: 'Mushrooms',
              priceMinor: 150n,
              available: overrides?.mushroomsAvailable ?? true,
            },
          ],
        },
      ],
    });
    const small = item.variants.find((v) => v.size === 'Small')!;
    const large = item.variants.find((v) => v.size === 'Large')!;
    const crust = item.addOnGroups.find((g) => g.name === 'Crust')!;
    const toppings = item.addOnGroups.find((g) => g.name === 'Toppings')!;
    const pepperoni = toppings.addOns.find((a) => a.name === 'Pepperoni')!;
    const mushrooms = toppings.addOns.find((a) => a.name === 'Mushrooms')!;
    return {
      merchantId,
      restaurantId,
      item,
      small,
      large,
      crust,
      toppings,
      pepperoni,
      mushrooms,
    };
  }

  function errorCode(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const rec = body as Record<string, unknown>;
    if (typeof rec.code === 'string') return rec.code;
    if (rec.message && typeof rec.message === 'object') {
      const inner = rec.message as Record<string, unknown>;
      if (typeof inner.code === 'string') return inner.code;
    }
    return undefined;
  }

  async function consumerToken() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const created = await http()
      .post('/api/v1/auth/consumer/register')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    expect(created.status).toBe(201);
    const login = await http()
      .post('/api/v1/auth/consumer/login')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    return login.body.accessToken as string;
  }

  it('1. published + available item is orderable on Standard and Custom', async () => {
    const seeded = await seedPizza();
    const custom = await catalog.createMenu(staffOf(seeded.merchantId), {
      restaurantId: seeded.restaurantId,
      name: 'Dinner',
      type: 'CUSTOM',
    });
    const section = await catalog.createSection(staffOf(seeded.merchantId), {
      menuId: custom.id,
      name: 'Mains',
    });
    await catalog.updateItem(staffOf(seeded.merchantId), seeded.item.id, {
      menuSectionId: section.id,
    });

    const standard = await http().get(`/api/v1/discover/restaurants/${seeded.restaurantId}/menu`);
    expect(standard.status).toBe(200);
    const standardPizza = standard.body.items.find((row: { name: string }) => row.name === 'Pizza');
    expect(standardPizza.orderable).toBe(true);
    expect(standardPizza.soldOut).toBe(false);
    expect(standardPizza.visible).toBe(true);

    const customMenu = await http().get(`/api/v1/discover/menus/${custom.id}`);
    expect(customMenu.body.items[0].orderable).toBe(true);
    expect(customMenu.body.items[0].soldOut).toBe(false);

    const quote = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
    });
    expect(quote.status).toBe(201);
    expect(quote.body.unitMerchandiseMinor).toBe('10000');
  });

  it('2. unpublished item is not visible or orderable', async () => {
    const seeded = await seedPizza({ isPublished: false });
    const menu = await http().get(`/api/v1/discover/restaurants/${seeded.restaurantId}/menu`);
    expect(menu.body.items.map((row: { id: string }) => row.id)).not.toContain(seeded.item.id);
    expect((await http().get(`/api/v1/discover/items/${seeded.item.id}`)).status).toBe(404);
    const quote = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
    });
    expect(quote.status).toBe(400);
    expect(errorCode(quote.body)).toBe('ITEM_NOT_ORDERABLE');
  });

  it('3. published + sold-out item stays visible and is not orderable', async () => {
    const seeded = await seedPizza({ availability: 'SOLDOUT' });
    const menu = await http().get(`/api/v1/discover/restaurants/${seeded.restaurantId}/menu`);
    const row = menu.body.items.find((item: { id: string }) => item.id === seeded.item.id);
    expect(row).toBeDefined();
    expect(row.orderable).toBe(false);
    expect(row.soldOut).toBe(true);
    expect(row.availability).toBe('SOLDOUT');
    expect((await http().get(`/api/v1/discover/items/${seeded.item.id}`)).body.orderable).toBe(
      false,
    );
    expect(
      (await http().post('/api/v1/discover/quote').send({ variantId: seeded.small.id, quantity: 1 }))
        .status,
    ).toBe(400);
  });

  it('4. deleted item is not orderable', async () => {
    const seeded = await seedPizza();
    await prisma.menuItem.update({
      where: { id: seeded.item.id },
      data: { deletedAt: new Date() },
    });
    expect((await http().get(`/api/v1/discover/items/${seeded.item.id}`)).status).toBe(404);
    expect(
      (await http().post('/api/v1/discover/quote').send({ variantId: seeded.small.id, quantity: 1 }))
        .status,
    ).toBe(400);
  });

  it('5-8. variant availability is server-authoritative and does not hide the item', async () => {
    const seeded = await seedPizza({ largeAvailable: false });
    const detail = await http().get(`/api/v1/discover/items/${seeded.item.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.orderable).toBe(true);
    const large = detail.body.variants.find((row: { size: string }) => row.size === 'Large');
    const small = detail.body.variants.find((row: { size: string }) => row.size === 'Small');
    expect(large.available).toBe(false);
    expect(small.available).toBe(true);

    expect(
      (await http().post('/api/v1/discover/quote').send({ variantId: seeded.small.id, quantity: 1 }))
        .status,
    ).toBe(201);
    const rejected = await http()
      .post('/api/v1/discover/quote')
      .send({ variantId: seeded.large.id, quantity: 1 });
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('VARIANT_UNAVAILABLE');

    await catalog.updateVariant(staffOf(seeded.merchantId), seeded.small.id, { available: false });
    const none = await http().get(`/api/v1/discover/items/${seeded.item.id}`);
    expect(none.body.orderable).toBe(false);
    expect(none.body.visible).toBe(true);
    expect(
      (await http().post('/api/v1/discover/quote').send({ variantId: seeded.small.id, quantity: 1 }))
        .status,
    ).toBe(400);
  });

  it('9-14. modifier availability, required groups, optional omit, and min/max stay enforced', async () => {
    const seeded = await seedPizza({ mushroomsAvailable: false });
    const detail = await http().get(`/api/v1/discover/items/${seeded.item.id}`);
    const toppings = detail.body.modifierGroups.find((g: { name: string }) => g.name === 'Toppings');
    expect(toppings.modifiers.find((m: { name: string }) => m.name === 'Mushrooms').available).toBe(
      false,
    );

    const ok = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.small.id,
        quantity: 1,
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect(ok.status).toBe(201);

    const unavailable = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.small.id,
        quantity: 1,
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.mushrooms.id }] },
        ],
      });
    expect(unavailable.status).toBe(400);
    expect(errorCode(unavailable.body)).toBe('MODIFIER_UNAVAILABLE');

    const omitted = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
      modifierGroups: [],
    });
    expect(omitted.status).toBe(201);

    await catalog.updateAddOn(staffOf(seeded.merchantId), seeded.crust.addOns[0].id, {
      available: false,
    });
    const requiredEmpty = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
    });
    expect(requiredEmpty.status).toBe(400);
    expect(errorCode(requiredEmpty.body)).toBe('ITEM_NOT_ORDERABLE');

    const after = await http().get(`/api/v1/discover/items/${seeded.item.id}`);
    expect(after.body.orderable).toBe(false);
    const crust = after.body.modifierGroups.find((g: { name: string }) => g.name === 'Crust');
    expect(crust.available).toBe(true);
    expect(crust.modifiers[0].available).toBe(false);

    const restored = await seedPizza();
    const max = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: restored.small.id,
        quantity: 1,
        modifierGroups: [
          {
            groupId: restored.toppings.id,
            selections: [
              { modifierId: restored.pepperoni.id },
              { modifierId: restored.mushrooms.id },
              { modifierId: restored.pepperoni.id },
            ],
          },
        ],
      });
    expect(max.status).toBe(400);
  });

  it('13. unavailable default is not auto-applied or trusted from the client', async () => {
    const seeded = await seedPizza();
    await catalog.updateAddOn(staffOf(seeded.merchantId), seeded.crust.addOns[0].id, {
      available: false,
    });
    const thick = await catalog.createAddOn(staffOf(seeded.merchantId), seeded.crust.id, {
      name: 'Thick Crust',
      priceMinor: 50n,
    });
    const implicit = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
    });
    expect(implicit.status).toBe(400);
    const staleDefault = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.small.id,
        quantity: 1,
        modifierGroups: [
          { groupId: seeded.crust.id, selections: [{ modifierId: seeded.crust.addOns[0].id }] },
        ],
      });
    expect(staleDefault.status).toBe(400);
    expect(errorCode(staleDefault.body)).toBe('MODIFIER_UNAVAILABLE');
    const explicit = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.small.id,
        quantity: 1,
        modifierGroups: [{ groupId: seeded.crust.id, selections: [{ modifierId: thick.id }] }],
      });
    expect(explicit.status).toBe(201);
    expect(explicit.body.selections.map((s: { modifierId: string }) => s.modifierId)).toEqual([
      thick.id,
    ]);
  });

  it('15-19. channel rules are identical on Standard, Custom, item, quote, and cart', async () => {
    const seeded = await seedPizza({ channelEnabled: false });
    const custom = await catalog.createMenu(staffOf(seeded.merchantId), {
      restaurantId: seeded.restaurantId,
      name: 'Dinner',
      type: 'CUSTOM',
    });
    const section = await catalog.createSection(staffOf(seeded.merchantId), {
      menuId: custom.id,
      name: 'Mains',
    });
    await catalog.updateItem(staffOf(seeded.merchantId), seeded.item.id, {
      menuSectionId: section.id,
    });
    const token = await consumerToken();

    expect(
      (
        await http()
          .get(`/api/v1/discover/restaurants/${seeded.restaurantId}/menu`)
          .query({ type: 'HOME_DELIVERY' })
      ).body.items.map((row: { id: string }) => row.id),
    ).not.toContain(seeded.item.id);
    expect(
      (
        await http()
          .get(`/api/v1/discover/menus/${custom.id}`)
          .query({ type: 'HOME_DELIVERY' })
      ).body.items.map((row: { id: string }) => row.id),
    ).not.toContain(seeded.item.id);
    expect(
      (
        await http()
          .get(`/api/v1/discover/items/${seeded.item.id}`)
          .query({ type: 'HOME_DELIVERY' })
      ).status,
    ).toBe(404);

    const quote = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
      type: 'HOME_DELIVERY',
    });
    expect(quote.status).toBe(400);
    expect(errorCode(quote.body)).toBe('CHANNEL_DISABLED');

    const cart = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: seeded.small.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'HOME_DELIVERY',
      });
    expect(cart.status).toBe(400);
  });

  it('20-22. stale configurations fail after availability changes with no substitution', async () => {
    const seeded = await seedPizza();
    const token = await consumerToken();
    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: seeded.small.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'DINE_IN',
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect([200, 201]).toContain(added.status);
    const lineId = added.body.items[0].id as string;

    await catalog.updateAddOn(staffOf(seeded.merchantId), seeded.pepperoni.id, {
      available: false,
    });

    const staleQuote = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.small.id,
        quantity: 1,
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect(staleQuote.status).toBe(400);
    expect(errorCode(staleQuote.body)).toBe('MODIFIER_UNAVAILABLE');

    const staleCart = await http()
      .patch(`/api/v1/cart/items/${lineId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 2 });
    expect(staleCart.status).toBe(400);

    const checkout = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        restaurantId: seeded.restaurantId,
        type: 'DINE_IN',
        settlement: 'COD',
      });
    expect(checkout.status).toBe(400);

    const clientFlag = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: seeded.small.id,
        quantity: 1,
        available: true,
        availability: 'AVAILABLE',
        modifierGroups: [
          { groupId: seeded.toppings.id, selections: [{ modifierId: seeded.pepperoni.id }] },
        ],
      });
    expect(clientFlag.status).toBe(400);
  });

  it('rejects quote and cart when the restaurant is not ACTIVE', async () => {
    const seeded = await seedPizza();
    await prisma.restaurant.update({
      where: { id: seeded.restaurantId },
      data: { status: 'CLOSED' },
    });
    const quote = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.small.id,
      quantity: 1,
    });
    expect(quote.status).toBe(400);
    expect(String(quote.body.message)).toMatch(/not accepting orders/i);
  });

  it('23-24. merchant A cannot change merchant B availability; consumers cannot write catalog', async () => {
    const a = await seedPizza();
    const b = await seedRestaurant();
    const token = await consumerToken();

    await expect(
      catalog.updateItem(staffOf(b.merchantId), a.item.id, { availability: 'SOLDOUT' }),
    ).rejects.toThrow(/Cross-merchant|Forbidden|denied|not found/i);
    await expect(
      catalog.updateAddOn(staffOf(b.merchantId), a.pepperoni.id, { available: false }),
    ).rejects.toThrow(/Cross-merchant|Forbidden|denied|not found/i);

    expect((await http().patch(`/api/v1/catalog/items/${a.item.id}`).send({ availability: 'SOLDOUT' })).status).toBe(
      401,
    );
    expect(
      (
        await http()
          .patch(`/api/v1/catalog/items/${a.item.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ availability: 'SOLDOUT' })
      ).status,
    ).toBe(401);
  });

  it('copies unavailable variant/modifier flags during Global → Merchant materialization', async () => {
    const { merchantId, restaurantId } = await seedRestaurant();
    const global = await platform.createGlobalCatalog(superAdmin, { name: uniq('Global') });
    const source = await platform.createGlobalItem(superAdmin, {
      catalogId: global.id,
      name: 'Global Pizza',
      sourcePayload: {
        product: {
          variants: [
            { size: 'Small', sku: 'GP-S', priceMinor: '10000', isDefault: true, available: true },
            { size: 'Large', sku: 'GP-L', priceMinor: '16000', available: false },
          ],
          addOnGroups: [
            {
              name: 'Toppings',
              minSelect: 0,
              available: true,
              addOns: [{ name: 'Mushrooms', priceMinor: 150, available: false }],
            },
          ],
          channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: false }],
        },
      },
    });
    const result = await platform.materializeGlobalItem(staffOf(merchantId), {
      sourceItemId: source.id,
      restaurantId,
    });
    const detail = await items.findDetailById(result.menuItemId);
    expect(detail?.isPublished).toBe(false);
    expect(detail?.availability).toBe('AVAILABLE');
    expect(detail?.variants.find((row) => row.size === 'Large')?.available).toBe(false);
    expect(detail?.addOnGroups[0].addOns[0].available).toBe(false);
    expect(detail?.channelConfigs[0]).toMatchObject({
      channel: 'HOME_DELIVERY',
      enabled: false,
    });
    expect((await http().get(`/api/v1/discover/items/${result.menuItemId}`)).status).toBe(404);
  });

  it('does not import the promotion evaluation kernel on availability paths', () => {
    const files = [
      '../src/modules/discovery/application/discovery.service.ts',
      '../src/modules/catalog/application/catalog-write.service.ts',
      '../src/modules/catalog/application/merchandise-quote.service.ts',
      '../src/modules/ordering/application/cart.service.ts',
      '../src/modules/ordering/application/checkout.service.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src).not.toMatch(/PromotionEvaluationService/);
    }
  });
});
