import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { PlatformCatalogService } from '../src/modules/platform-catalog/platform-catalog.service';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { MenuItemRepository } from '../src/modules/catalog/infrastructure/menu-item.repository';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

describe('Stage B menu + merchant catalog consistency', () => {
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

  it('assembles a virtual Standard menu without a Menu row and hides unpublished items', async () => {
    const { merchantId, restaurantId } = await seedRestaurant();
    const published = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Idli',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Reg', sku: 'IDL-R', priceMinor: 10000n, isDefault: true }],
    });
    await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Secret',
      isPublished: false,
      variants: [{ size: 'Reg', priceMinor: 5000n }],
    });
    const sold = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Sold Dosa',
      isPublished: true,
      availability: 'SOLDOUT',
      variants: [{ size: 'Reg', priceMinor: 12000n, available: false }],
    });

    expect(await prisma.menu.count({ where: { restaurantId, type: 'STANDARD' } })).toBe(0);

    const menu = await http().get(`/api/v1/discover/restaurants/${restaurantId}/menu`);
    expect(menu.status).toBe(200);
    expect(menu.body.kind).toBe('STANDARD');
    const names = menu.body.items.map((row: { name: string }) => row.name);
    expect(names).toContain('Idli');
    expect(names).toContain('Sold Dosa');
    expect(names).not.toContain('Secret');
    expect(menu.body.items.find((row: { name: string }) => row.name === 'Idli').orderable).toBe(true);
    expect(menu.body.items.find((row: { name: string }) => row.name === 'Sold Dosa').orderable).toBe(
      false,
    );
    expect(menu.body.items.find((row: { name: string }) => row.name === 'Idli').variants[0].sku).toBe(
      'IDL-R',
    );

    expect((await http().get(`/api/v1/discover/items/${published.id}`)).status).toBe(200);
    expect((await http().get(`/api/v1/discover/items/${sold.id}`)).body.orderable).toBe(false);
  });

  it('applies the same channel filter on Standard, Custom, and direct item paths', async () => {
    const { merchantId, restaurantId } = await seedRestaurant();
    const item = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Paneer',
      isPublished: true,
      variants: [{ size: 'Reg', priceMinor: 15000n }],
      channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: false }],
      addOnGroups: [
        {
          name: 'Spice',
          minSelect: 1,
          maxSelect: 1,
          addOns: [{ name: 'Mild', priceMinor: 0n, isDefault: true }],
        },
      ],
    });
    const custom = await catalog.createMenu(staffOf(merchantId), {
      restaurantId,
      name: 'Dinner',
      type: 'CUSTOM',
    });
    const section = await catalog.createSection(staffOf(merchantId), {
      menuId: custom.id,
      name: 'Mains',
    });
    await catalog.updateItem(staffOf(merchantId), item.id, { menuSectionId: section.id });

    const standardHd = await http().get(`/api/v1/discover/restaurants/${restaurantId}/menu`).query({
      type: 'HOME_DELIVERY',
    });
    expect(standardHd.body.items.map((row: { id: string }) => row.id)).not.toContain(item.id);

    const customHd = await http().get(`/api/v1/discover/menus/${custom.id}`).query({
      type: 'HOME_DELIVERY',
    });
    expect(customHd.status).toBe(200);
    expect(customHd.body.kind).toBe('CUSTOM');
    expect(customHd.body.items.map((row: { id: string }) => row.id)).not.toContain(item.id);

    expect(
      (await http().get(`/api/v1/discover/items/${item.id}`).query({ type: 'HOME_DELIVERY' })).status,
    ).toBe(404);

    const dineIn = await http().get(`/api/v1/discover/restaurants/${restaurantId}/menu`).query({
      type: 'DINE_IN',
    });
    expect(dineIn.body.items.map((row: { id: string }) => row.id)).toContain(item.id);

    const quote = await http().post('/api/v1/discover/quote').send({
      variantId: item.variants[0].id,
      quantity: 1,
      type: 'HOME_DELIVERY',
    });
    expect(quote.status).toBe(400);
  });

  it('enforces Custom Menu ownership, visibility, and catalog item references', async () => {
    const a = await seedRestaurant();
    const b = await seedRestaurant();
    const hidden = await catalog.createMenu(staffOf(a.merchantId), {
      restaurantId: a.restaurantId,
      name: 'Hidden',
      visibility: false,
    });
    const visible = await catalog.createMenu(staffOf(a.merchantId), {
      restaurantId: a.restaurantId,
      name: 'Tasting',
    });
    const section = await catalog.createSection(staffOf(a.merchantId), {
      menuId: visible.id,
      name: 'Flights',
    });
    const item = await catalog.createItem(staffOf(a.merchantId), {
      restaurantId: a.restaurantId,
      menuSectionId: section.id,
      name: 'Tasting Plate',
      isPublished: true,
      variants: [{ size: 'Reg', priceMinor: 20000n }],
    });

    const listed = await http().get(`/api/v1/discover/restaurants/${a.restaurantId}/menus`);
    expect(listed.status).toBe(200);
    expect(listed.body.menus.map((row: { id: string }) => row.id)).toContain(visible.id);
    expect(listed.body.menus.map((row: { id: string }) => row.id)).not.toContain(hidden.id);

    expect((await http().get(`/api/v1/discover/menus/${hidden.id}`)).status).toBe(404);
    expect((await http().get(`/api/v1/discover/menus/${visible.id}`)).body.items[0].id).toBe(item.id);

    await expect(
      catalog.updateMenu(staffOf(b.merchantId), visible.id, { name: 'Stolen' }),
    ).rejects.toThrow(/Cross-merchant|Forbidden|denied|not found/i);

    expect((await http().get(`/api/v1/catalog/restaurants/${a.restaurantId}/items`)).status).toBe(
      401,
    );
  });

  it('rejects placeholder Standard menu ids and keeps required modifiers server-authoritative', async () => {
    const { merchantId, restaurantId } = await seedRestaurant();
    await expect(
      catalog.createMenu(staffOf(merchantId), {
        restaurantId,
        name: 'Fake Standard',
        legacyId: '123456',
      }),
    ).rejects.toThrow(/placeholder/i);

    const item = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Pizza',
      isPublished: true,
      variants: [{ size: 'Small', priceMinor: 10000n }],
      addOnGroups: [
        {
          name: 'Crust',
          minSelect: 1,
          maxSelect: 1,
          addOns: [{ name: 'Thin', priceMinor: 0n }],
        },
      ],
    });
    const quote = await http().post('/api/v1/discover/quote').send({
      variantId: item.variants[0].id,
      quantity: 1,
      modifierGroups: [{ groupId: item.addOnGroups[0].id, selections: [] }],
    });
    expect(quote.status).toBe(400);
  });

  it('copies Stage A product fields when materializing Global → Merchant', async () => {
    const { merchantId, restaurantId } = await seedRestaurant();
    const global = await platform.createGlobalCatalog(superAdmin, { name: uniq('Global') });
    const source = await platform.createGlobalItem(superAdmin, {
      catalogId: global.id,
      name: 'Global Pizza',
      sourcePayload: {
        product: {
          variants: [
            { size: 'Small', sku: 'GP-S', priceMinor: '10000', isDefault: true },
            { size: 'Large', sku: 'GP-L', priceMinor: '16000' },
          ],
          addOnGroups: [
            {
              name: 'Toppings',
              minSelect: 0,
              maxSelect: 2,
              addOns: [
                {
                  name: 'Pepperoni',
                  priceMinor: 100,
                  isDefault: false,
                  available: true,
                  variantPrices: [{ size: 'Small', priceMinor: 200 }],
                },
              ],
            },
          ],
          channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: true }],
        },
      },
    });
    const result = await platform.materializeGlobalItem(staffOf(merchantId), {
      sourceItemId: source.id,
      restaurantId,
    });
    const detail = await items.findDetailById(result.menuItemId);
    expect(detail?.isPublished).toBe(false);
    expect(detail?.variants.map((row) => row.sku).sort()).toEqual(['GP-L', 'GP-S']);
    expect(detail?.addOnGroups[0].minSelect).toBe(0);
    expect(detail?.addOnGroups[0].maxSelect).toBe(2);
    expect(detail?.addOnGroups[0].addOns[0].isDefault).toBe(false);
    expect(detail?.addOnGroups[0].addOns[0].available).toBe(true);
    const small = detail!.variants.find((row) => row.size === 'Small')!;
    expect(detail?.addOnGroups[0].addOns[0].variantPrices[0]).toMatchObject({
      variantId: small.id,
      priceMinor: 200n,
    });
    expect(detail?.channelConfigs[0]).toMatchObject({ channel: 'HOME_DELIVERY', enabled: true });
    expect((await http().get(`/api/v1/discover/items/${result.menuItemId}`)).status).toBe(404);
  });

  it('does not import the promotion evaluation kernel from discovery or catalog writes', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const files = [
      '../src/modules/discovery/application/discovery.service.ts',
      '../src/modules/catalog/application/catalog-write.service.ts',
      '../src/modules/ordering/application/cart.service.ts',
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(src).not.toMatch(/PromotionEvaluationService/);
    }
  });
});
