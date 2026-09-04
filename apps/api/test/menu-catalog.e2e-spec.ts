import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { MenuRepository } from '../src/modules/catalog/infrastructure/menu.repository';
import { MenuItemRepository } from '../src/modules/catalog/infrastructure/menu-item.repository';
import { CatalogService } from '../src/modules/catalog/application/catalog.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.5 Menu & Catalog read foundation — integration against the TEST database.
 * Exercises the REAL catalog tables/relationships (Menu → MenuSection →
 * MenuItem → ItemVariant/ItemChannelConfig/AddOns), exact BigInt money, optional
 * Category link, availability/soft-delete, and merchant tenancy. No schema change.
 */
describe('Menu & Catalog read foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let menus: MenuRepository;
  let items: MenuItemRepository;
  let catalog: CatalogService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const staff = (merchantId: string): StaffPrincipal => ({
    staffMemberId: 's',
    actorType: 'STAFF',
    staffRole: 'MERCHANT_STAFF',
    merchantId,
  });
  const superAdmin: StaffPrincipal = {
    staffMemberId: 'a',
    actorType: 'STAFF',
    staffRole: 'SUPER_ADMIN',
    merchantId: null,
  };

  let m1 = '';
  let m2 = '';
  let r1 = ''; // restaurant of m1
  let r2 = ''; // restaurant of m2
  let menuId = '';
  let menuLegacy = '';
  let sectionId = '';
  let categoryId = '';
  let itemId = '';
  let itemLegacy = '';
  let soldOutItemId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env', '../../.env'],
        }),
        PrismaModule,
        CatalogModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    menus = app.get(MenuRepository);
    items = app.get(MenuItemRepository);
    catalog = app.get(CatalogService);

    m1 = (await prisma.merchant.create({ data: { legalName: uniq('M1') } })).id;
    m2 = (await prisma.merchant.create({ data: { legalName: uniq('M2') } })).id;
    r1 = (await prisma.restaurant.create({ data: { merchantId: m1, name: uniq('R1') } })).id;
    r2 = (await prisma.restaurant.create({ data: { merchantId: m2, name: uniq('R2') } })).id;

    const category = await prisma.category.create({
      data: { name: uniq('Starters'), type: 'MENU_SECTION' },
    });
    categoryId = category.id;

    menuLegacy = uniq('legacy-menu');
    const menu = await prisma.menu.create({
      data: {
        merchantId: m1,
        restaurantId: r1,
        name: uniq('Dinner'),
        type: 'CUSTOM',
        legacyId: menuLegacy,
      },
    });
    menuId = menu.id;
    const section = await prisma.menuSection.create({
      data: { menuId, categoryId, name: uniq('Starters'), sortOrder: 1 },
    });
    sectionId = section.id;

    itemLegacy = uniq('legacy-item');
    const item = await prisma.menuItem.create({
      data: {
        merchantId: m1,
        restaurantId: r1,
        menuSectionId: sectionId,
        name: uniq('Paneer Tikka'),
        description: 'Grilled',
        availability: 'AVAILABLE',
        legacyId: itemLegacy,
        posItemId: 'POS-1',
        variants: {
          create: [
            { size: 'Half', priceMinor: 19900n, currencyCode: 'INR', pax: 1 },
            { size: 'Full', priceMinor: 34900n, currencyCode: 'INR', pax: 2 },
          ],
        },
        channelConfigs: {
          create: [
            { channel: 'DINE_IN', enabled: true, priceOverrideMinor: null },
            { channel: 'HOME_DELIVERY', enabled: true, priceOverrideMinor: 37900n },
          ],
        },
        addOnGroups: {
          create: [
            {
              name: 'Extras',
              minSelect: 0,
              maxSelect: 2,
              addOns: { create: [{ name: 'Cheese', priceMinor: 5000n, currencyCode: 'INR' }] },
            },
          ],
        },
      },
    });
    itemId = item.id;

    soldOutItemId = (
      await prisma.menuItem.create({
        data: { merchantId: m1, restaurantId: r1, name: uniq('SoldOut'), availability: 'SOLDOUT' },
      })
    ).id;
    // a soft-deleted item that must be excluded
    await prisma.menuItem.create({
      data: { merchantId: m1, restaurantId: r1, name: uniq('Retired'), deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves menu identity + legacyId; ownership fields', async () => {
    const byId = await menus.findById(menuId);
    expect(byId?.merchantId).toBe(m1);
    expect(byId?.restaurantId).toBe(r1);
    expect(byId?.type).toBe('CUSTOM');
    expect((await menus.findByLegacyId(menuLegacy))?.id).toBe(menuId);
  });

  it('lists menus by restaurant/merchant', async () => {
    expect((await menus.listByRestaurant(r1)).map((m) => m.id)).toContain(menuId);
    expect((await menus.listByMerchant(m1)).map((m) => m.id)).toContain(menuId);
    expect(await menus.listByRestaurant(r2)).toHaveLength(0);
  });

  it('Menu → MenuSection with optional Category link', async () => {
    const sections = await menus.listSections(menuId);
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe(sectionId);
    expect(sections[0].categoryId).toBe(categoryId); // optional platform Category
  });

  it('MenuSection → MenuItem and item detail (variants/channels/addons)', async () => {
    const inSection = await items.listBySection(sectionId);
    expect(inSection.map((i) => i.id)).toEqual([itemId]);
    const detail = await items.findDetailById(itemId);
    expect(detail?.variants).toHaveLength(2);
    expect(detail?.channelConfigs).toHaveLength(2);
    expect(detail?.addOnGroups).toHaveLength(1);
    expect(detail?.addOnGroups[0].addOns[0].name).toBe('Cheese');
    expect(detail?.addOnGroups[0].minSelect).toBe(0);
    expect(detail?.addOnGroups[0].maxSelect).toBe(2);
    expect(detail?.posItemId).toBe('POS-1');
  });

  it('preserves exact BigInt money on variants + add-ons + channel override', async () => {
    const detail = await items.findDetailById(itemId);
    const prices = detail!.variants.map((v) => v.priceMinor).sort((a, b) => (a < b ? -1 : 1));
    expect(prices).toEqual([19900n, 34900n]);
    prices.forEach((p) => expect(typeof p).toBe('bigint'));
    expect(detail!.addOnGroups[0].addOns[0].priceMinor).toBe(5000n);
    const delivery = detail!.channelConfigs.find((c) => c.channel === 'HOME_DELIVERY');
    expect(delivery?.priceOverrideMinor).toBe(37900n);
  });

  it('enforces ItemChannelConfig uniqueness per (item, channel)', async () => {
    await expect(
      prisma.itemChannelConfig.create({
        data: { menuItemId: itemId, channel: 'DINE_IN', enabled: true },
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('applies availability filtering and excludes soft-deleted items', async () => {
    const all = await items.listByRestaurant(r1);
    const allIds = all.map((i) => i.id);
    expect(allIds).toContain(itemId);
    expect(allIds).toContain(soldOutItemId);
    expect(all.some((i) => i.deletedAt !== null)).toBe(false); // soft-deleted excluded
    const availableOnly = await items.listByRestaurant(r1, true);
    expect(availableOnly.map((i) => i.id)).toContain(itemId);
    expect(availableOnly.map((i) => i.id)).not.toContain(soldOutItemId); // SOLDOUT excluded
  });

  it('handles missing / malformed references safely', async () => {
    expect(await menus.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await items.findById('not-a-uuid')).toBeNull();
    expect(await menus.findByLegacyId('nope')).toBeNull();
    expect(await items.findDetailById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('scopes catalog reads to the staff merchant; rejects cross-merchant', async () => {
    const own = await catalog.getMenusForRestaurant(staff(m1), r1);
    expect(own.map((m) => m.id)).toContain(menuId);
    await expect(catalog.getMenusForRestaurant(staff(m1), r2)).rejects.toThrow(/cross-merchant/i);
    await expect(catalog.getItemDetail(staff(m2), itemId)).rejects.toThrow(/cross-merchant/i); // item is m1's
    const sectionsCross = await catalog.getMenuSections(staff(m1), menuId);
    expect(sectionsCross).toHaveLength(1);
  });

  it('allows SUPER_ADMIN platform-scoped catalog access', async () => {
    const adminMenus = await catalog.getMenusForRestaurant(superAdmin, r2);
    expect(Array.isArray(adminMenus)).toBe(true); // not confined to a merchant
    const adminItem = await catalog.getItemDetail(superAdmin, itemId);
    expect(adminItem?.id).toBe(itemId);
  });
});
