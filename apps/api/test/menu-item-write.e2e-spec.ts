import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { MerchantOwnerService } from '../src/modules/onboarding/application/merchant-owner.service';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import { StaffAuthService } from '../src/modules/identity/staff-authentication/staff-auth.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.18 Merchant menu & item write foundation — integration (TEST DB).
 * Merchant-scoped create/update over the EXISTING catalog hierarchy; publication
 * (isPublished) distinct from availability; item+children atomic. No combos, no
 * tax engine, no scheduling, no POS sync.
 */
describe('Menu & Item write foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let owners: MerchantOwnerService;
  let catalog: CatalogWriteService;
  let staffAuth: StaffAuthService;

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

  const seed = async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Pune',
    });
    return { merchantId: m.id, restaurantId: r.id };
  };
  const seedMenu = async (merchantId: string, restaurantId: string) =>
    catalog.createMenu(staffOf(merchantId), { restaurantId, name: uniq('Menu') });

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
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    owners = app.get(MerchantOwnerService);
    catalog = app.get(CatalogWriteService);
    staffAuth = app.get(StaffAuthService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- MENU ----
  it('creates and updates a menu owned by the merchant restaurant', async () => {
    const { merchantId, restaurantId } = await seed();
    const menu = await catalog.createMenu(staffOf(merchantId), {
      restaurantId,
      name: 'Lunch',
      description: 'Midday',
      legacyId: uniq('menu'),
    });
    expect(menu.merchantId).toBe(merchantId);
    expect(menu.restaurantId).toBe(restaurantId);
    expect(menu.type).toBe('CUSTOM'); // default
    expect(menu.visibility).toBe(true);
    const updated = await catalog.updateMenu(staffOf(merchantId), menu.id, {
      name: 'Lunch v2',
      visibility: false,
    });
    expect(updated.name).toBe('Lunch v2');
    expect(updated.visibility).toBe(false);
  });

  // ---- SECTION + ordering ----
  it('creates, updates, and reorders menu sections', async () => {
    const { merchantId, restaurantId } = await seed();
    const menu = await seedMenu(merchantId, restaurantId);
    const s1 = await catalog.createSection(staffOf(merchantId), {
      menuId: menu.id,
      name: 'Starters',
      sortOrder: 1,
    });
    const s2 = await catalog.createSection(staffOf(merchantId), {
      menuId: menu.id,
      name: 'Mains',
      sortOrder: 2,
    });
    expect(s1.menuId).toBe(menu.id);
    const upd = await catalog.updateSection(staffOf(merchantId), s1.id, { name: 'Appetizers' });
    expect(upd.name).toBe('Appetizers');
    await catalog.reorderSections(staffOf(merchantId), menu.id, [
      { sectionId: s1.id, sortOrder: 2 },
      { sectionId: s2.id, sortOrder: 1 },
    ]);
    const persisted = await prisma.menuSection.findUniqueOrThrow({ where: { id: s2.id } });
    expect(persisted.sortOrder).toBe(1);
    // reorder rejects a section from another menu
    const menu2 = await seedMenu(merchantId, restaurantId);
    const other = await catalog.createSection(staffOf(merchantId), { menuId: menu2.id, name: 'X' });
    await expect(
      catalog.reorderSections(staffOf(merchantId), menu.id, [
        { sectionId: other.id, sortOrder: 1 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- ITEM (+ children, atomic) + publication vs availability ----
  it('creates a full item hierarchy atomically with publication distinct from availability', async () => {
    const { merchantId, restaurantId } = await seed();
    const menu = await seedMenu(merchantId, restaurantId);
    const section = await catalog.createSection(staffOf(merchantId), {
      menuId: menu.id,
      name: 'Mains',
    });
    const item = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      menuSectionId: section.id,
      name: 'Paneer Tikka',
      description: 'Grilled',
      // isPublished defaults false; availability defaults AVAILABLE — independent
      variants: [
        { size: 'Half', priceMinor: 20000n, isDefault: true },
        { size: 'Full', priceMinor: 35000n, available: false },
      ],
      channelConfigs: [
        { channel: 'DINE_IN', enabled: true },
        {
          channel: 'TAKE_AWAY',
          enabled: true,
          priceOverrideMinor: 36000n,
          surcharges: [{ name: 'GST', value: '5', flag: 'PERCENTAGE' }],
        },
      ],
      addOnGroups: [
        {
          name: 'Extras',
          minSelect: 0,
          maxSelect: 2,
          addOns: [
            { name: 'Cheese', priceMinor: 3000n },
            { name: 'Butter', priceMinor: 2000n },
          ],
        },
      ],
    });
    expect(item.merchantId).toBe(merchantId);
    expect(item.isPublished).toBe(false); // publication gate default
    expect(item.availability).toBe('AVAILABLE'); // stock default — NOT collapsed
    expect(item.variants).toHaveLength(2);
    expect(item.variants.find((v) => v.size === 'Half')!.isDefault).toBe(true);
    expect(item.variants.find((v) => v.size === 'Full')!.available).toBe(false);
    expect(item.channelConfigs).toHaveLength(2);
    expect(item.addOnGroups[0].addOns).toHaveLength(2);

    // publish + set availability independently
    const published = await catalog.updateItem(staffOf(merchantId), item.id, {
      isPublished: true,
      availability: 'SOLDOUT',
    });
    expect(published.isPublished).toBe(true);
    expect(published.availability).toBe('SOLDOUT');
    const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.isPublished).toBe(true);
    expect(row.availability).toBe('SOLDOUT');
  });

  it('rolls back item creation when a child is invalid (transaction integrity)', async () => {
    const { merchantId, restaurantId } = await seed();
    const name = uniq('Atomic');
    await expect(
      catalog.createItem(staffOf(merchantId), {
        restaurantId,
        name,
        variants: [{ size: 'S', priceMinor: -5n }], // invalid -> whole create rejected
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const found = await prisma.menuItem.findMany({ where: { restaurantId, name } });
    expect(found).toHaveLength(0); // no partial item persisted
  });

  // ---- VARIANT / CHANNEL / ADD-ON write ----
  it('creates and updates variants, channel configs (upsert), and add-ons', async () => {
    const { merchantId, restaurantId } = await seed();
    const item = await catalog.createItem(staffOf(merchantId), { restaurantId, name: 'Dosa' });
    const v = await catalog.createVariant(staffOf(merchantId), item.id, {
      size: 'Reg',
      priceMinor: 12000n,
    });
    const v2 = await catalog.updateVariant(staffOf(merchantId), v.id, {
      priceMinor: 13000n,
      available: false,
    });
    expect(v2.priceMinor).toBe(13000n);
    expect(v2.available).toBe(false);
    // channel upsert: create then update same channel (unique per [item, channel])
    const c1 = await catalog.setChannelConfig(staffOf(merchantId), item.id, {
      channel: 'DINE_IN',
      enabled: true,
    });
    const c2 = await catalog.setChannelConfig(staffOf(merchantId), item.id, {
      channel: 'DINE_IN',
      enabled: false,
      priceOverrideMinor: 14000n,
    });
    expect(c1.id).toBe(c2.id); // upsert, not duplicate
    expect(c2.enabled).toBe(false);
    const configs = await prisma.itemChannelConfig.findMany({ where: { menuItemId: item.id } });
    expect(configs).toHaveLength(1);
    // add-ons
    const group = await catalog.createAddOnGroup(staffOf(merchantId), item.id, {
      name: 'Sides',
      minSelect: 1,
      maxSelect: 3,
    });
    const addOn = await catalog.createAddOn(staffOf(merchantId), group.id, {
      name: 'Chutney',
      priceMinor: 1000n,
    });
    const updatedAddOn = await catalog.updateAddOn(staffOf(merchantId), addOn.id, {
      priceMinor: 1500n,
    });
    expect(updatedAddOn.priceMinor).toBe(1500n);
    // invalid selection constraints rejected
    await expect(
      catalog.createAddOnGroup(staffOf(merchantId), item.id, {
        name: 'Bad',
        minSelect: 3,
        maxSelect: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- TENANCY ----
  it('rejects cross-merchant and cross-restaurant writes; honors SUPER_ADMIN explicit target', async () => {
    const a = await seed();
    const b = await seed();
    // cross-merchant menu create
    await expect(
      catalog.createMenu(staffOf(b.merchantId), { restaurantId: a.restaurantId, name: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // SUPER_ADMIN explicit target OK
    const menu = await catalog.createMenu(superAdmin, {
      restaurantId: a.restaurantId,
      name: 'Admin Menu',
    });
    expect(menu.restaurantId).toBe(a.restaurantId);
    // cross-restaurant: item in restaurant A cannot use a section from restaurant B
    const bMenu = await seedMenu(b.merchantId, b.restaurantId);
    const bSection = await catalog.createSection(staffOf(b.merchantId), {
      menuId: bMenu.id,
      name: 'B',
    });
    await expect(
      catalog.createItem(staffOf(a.merchantId), {
        restaurantId: a.restaurantId,
        menuSectionId: bSection.id,
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // cross-merchant staff cannot touch A's menu
    await expect(
      catalog.updateMenu(staffOf(b.merchantId), menu.id, { name: 'hacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // unknown restaurant -> NotFound
    await expect(
      catalog.createMenu(superAdmin, {
        restaurantId: '00000000-0000-0000-0000-000000000000',
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects writes against a soft-deleted restaurant', async () => {
    const { merchantId, restaurantId } = await seed();
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { deletedAt: new Date() },
    });
    await expect(
      catalog.createMenu(staffOf(merchantId), { restaurantId, name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activation gate: a BLOCKED merchant owner cannot obtain a session to write catalog', async () => {
    const { merchantId } = await seed();
    const email = `${uniq('owner')}@ex.test`;
    const password = 'S3cretPass!';
    await owners.provisionOwner(superAdmin, { merchantId, name: 'Owner', email, password });
    await expect(staffAuth.login({ email, password })).rejects.toBeInstanceOf(ForbiddenException);
    await owners.activateMerchant(superAdmin, merchantId);
    const session = await staffAuth.login({ email, password });
    expect(session.staff.merchantId).toBe(merchantId);
  });

  // ---- UNIQUENESS / legacyId ----
  it('enforces variant-free item creation and preserves legacyId + section uniqueness', async () => {
    const { merchantId, restaurantId } = await seed();
    const legacyId = uniq('item');
    const item = await catalog.createItem(staffOf(merchantId), {
      restaurantId,
      name: 'Idli',
      legacyId,
    });
    expect(item.legacyId).toBe(legacyId);
    // duplicate legacyId (global unique) rejected
    await expect(
      catalog.createItem(staffOf(merchantId), { restaurantId, name: 'Idli2', legacyId }),
    ).rejects.toThrow(/unique|constraint/i);
  });
});
