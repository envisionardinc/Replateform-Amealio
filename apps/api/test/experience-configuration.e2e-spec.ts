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
import { ExperienceModule } from '../src/modules/experience/experience.module';
import { ExperienceService } from '../src/modules/experience/application/experience.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import { StaffAuthService } from '../src/modules/identity/staff-authentication/staff-auth.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.20 Merchant experience configuration foundation — integration (TEST DB).
 * Merchant-scoped create/update/publish/soft-delete of Experience + custom-menu
 * references. No booking/payment/Diner/Order/media/events.
 */
describe('Experience configuration foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let owners: MerchantOwnerService;
  let catalog: CatalogWriteService;
  let experiences: ExperienceService;
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
  const customMenu = (merchantId: string, restaurantId: string) =>
    catalog.createMenu(staffOf(merchantId), { restaurantId, name: uniq('CM'), type: 'CUSTOM' });

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
        ExperienceModule,
        StaffAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    owners = app.get(MerchantOwnerService);
    catalog = app.get(CatalogWriteService);
    experiences = app.get(ExperienceService);
    staffAuth = app.get(StaffAuthService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an experience with source-backed config (type/expType/capacity/pricing/food) as a draft', async () => {
    const { merchantId, restaurantId } = await seed();
    const exp = await experiences.createExperience(staffOf(merchantId), {
      restaurantId,
      name: 'Rooftop Dinner',
      description: 'Sunset dining',
      type: 'FOOD',
      expType: 'CURATED',
      foodMode: 'INCLUDED',
      menuMode: 'STANDARD',
      totalSeats: 40,
      minSeats: 2,
      maxSeats: 8,
      listingPriceMinor: 250000n,
      adultPriceMinor: 250000n,
      kidsPriceMinor: 100000n,
      legacyId: uniq('exp'),
    });
    expect(exp.merchantId).toBe(merchantId);
    expect(exp.restaurantId).toBe(restaurantId);
    expect(exp.type).toBe('FOOD');
    expect(exp.expType).toBe('CURATED');
    expect(exp.foodMode).toBe('INCLUDED');
    expect(exp.totalSeats).toBe(40);
    expect(exp.listingPriceMinor).toBe(250000n);
    expect(exp.active).toBe(false); // draft by default
    expect(exp.isDraft).toBe(true);
    expect(exp.currencyCode).toBe('INR');
    // persisted
    const row = await prisma.experience.findUniqueOrThrow({ where: { id: exp.id } });
    expect(row.adultPriceMinor).toBe(250000n);
  });

  it('retrieves by id and legacyId, and lists by restaurant', async () => {
    const { merchantId, restaurantId } = await seed();
    const legacyId = uniq('exp');
    const created = await experiences.createExperience(staffOf(merchantId), {
      restaurantId,
      name: 'Brunch',
      legacyId,
    });
    expect((await experiences.getExperience(staffOf(merchantId), created.id))!.id).toBe(created.id);
    expect((await experiences.getByLegacyId(staffOf(merchantId), legacyId))!.id).toBe(created.id);
    const list = await experiences.listExperiences(staffOf(merchantId), restaurantId);
    expect(list.map((e) => e.id)).toContain(created.id);
  });

  it('updates fields and toggles publication (publish → active/not-draft, unpublish → inactive/draft)', async () => {
    const { merchantId, restaurantId } = await seed();
    const exp = await experiences.createExperience(staffOf(merchantId), {
      restaurantId,
      name: 'Gig',
    });
    const upd = await experiences.updateExperience(staffOf(merchantId), exp.id, {
      name: 'Live Gig',
      expType: 'SPECIAL',
      totalSeats: 100,
    });
    expect(upd.name).toBe('Live Gig');
    expect(upd.expType).toBe('SPECIAL');
    const pub = await experiences.publishExperience(staffOf(merchantId), exp.id);
    expect(pub.active).toBe(true);
    expect(pub.isDraft).toBe(false);
    const unpub = await experiences.unpublishExperience(staffOf(merchantId), exp.id);
    expect(unpub.active).toBe(false);
    expect(unpub.isDraft).toBe(true);
  });

  it('links custom menus (same restaurant, ≤1 default) and rejects foreign/non-custom menus', async () => {
    const { merchantId, restaurantId } = await seed();
    const cm1 = await customMenu(merchantId, restaurantId);
    const cm2 = await customMenu(merchantId, restaurantId);
    const exp = await experiences.createExperience(staffOf(merchantId), {
      restaurantId,
      name: 'Tasting',
      menuMode: 'CUSTOM',
      customMenus: [{ menuId: cm1.id, isDefault: true }, { menuId: cm2.id }],
    });
    expect(exp.menus).toHaveLength(2);
    expect(exp.menus.filter((m) => m.isDefault)).toHaveLength(1);

    // replace links
    const replaced = await experiences.setCustomMenus(staffOf(merchantId), exp.id, [
      { menuId: cm2.id, isDefault: true },
    ]);
    expect(replaced.menus).toHaveLength(1);
    expect(replaced.menus[0].menuId).toBe(cm2.id);

    // a custom menu from another restaurant is rejected
    const other = await seed();
    const foreign = await customMenu(other.merchantId, other.restaurantId);
    await expect(
      experiences.setCustomMenus(staffOf(merchantId), exp.id, [{ menuId: foreign.id }]),
    ).rejects.toBeInstanceOf(BadRequestException);

    // a STANDARD menu is rejected as a custom-menu link
    const std = await catalog.createMenu(staffOf(merchantId), {
      restaurantId,
      name: uniq('STD'),
      type: 'STANDARD',
    });
    await expect(
      experiences.setCustomMenus(staffOf(merchantId), exp.id, [{ menuId: std.id }]),
    ).rejects.toBeInstanceOf(BadRequestException);

    // two defaults rejected
    await expect(
      experiences.setCustomMenus(staffOf(merchantId), exp.id, [
        { menuId: cm1.id, isDefault: true },
        { menuId: cm2.id, isDefault: true },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links a Category/Sub Category and rejects an unknown category', async () => {
    const { merchantId, restaurantId } = await seed();
    const cat = await prisma.category.create({ data: { name: uniq('Occasion') } });
    const sub = await prisma.category.create({
      data: { name: uniq('Birthday'), parentId: cat.id },
    });
    const exp = await experiences.createExperience(staffOf(merchantId), {
      restaurantId,
      name: 'Birthday Special',
      categoryId: cat.id,
      subCategoryId: sub.id,
    });
    expect(exp.categoryId).toBe(cat.id);
    expect(exp.subCategoryId).toBe(sub.id);
    await expect(
      experiences.createExperience(staffOf(merchantId), {
        restaurantId,
        name: 'X',
        categoryId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates enums, capacity, and pricing', async () => {
    const { merchantId, restaurantId } = await seed();
    const staff = staffOf(merchantId);
    await expect(
      experiences.createExperience(staff, { restaurantId, name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      experiences.createExperience(staff, { restaurantId, name: 'X', type: 'NOPE' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      experiences.createExperience(staff, { restaurantId, name: 'X', expType: 'PARTY' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      experiences.createExperience(staff, { restaurantId, name: 'X', minSeats: 5, maxSeats: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      experiences.createExperience(staff, { restaurantId, name: 'X', totalSeats: 4, maxSeats: 8 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      experiences.createExperience(staff, { restaurantId, name: 'X', adultPriceMinor: -1n }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces tenancy: cross-merchant rejected, SUPER_ADMIN explicit target, unknown/deleted restaurant', async () => {
    const a = await seed();
    const b = await seed();
    await expect(
      experiences.createExperience(staffOf(b.merchantId), {
        restaurantId: a.restaurantId,
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const exp = await experiences.createExperience(superAdmin, {
      restaurantId: a.restaurantId,
      name: 'Admin Exp',
    });
    expect(exp.restaurantId).toBe(a.restaurantId);
    await expect(
      experiences.updateExperience(staffOf(b.merchantId), exp.id, { name: 'hacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      experiences.createExperience(superAdmin, {
        restaurantId: '00000000-0000-0000-0000-000000000000',
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await prisma.restaurant.update({
      where: { id: a.restaurantId },
      data: { deletedAt: new Date() },
    });
    await expect(
      experiences.createExperience(superAdmin, { restaurantId: a.restaurantId, name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft-deletes an experience (hidden from get/list afterwards)', async () => {
    const { merchantId, restaurantId } = await seed();
    const exp = await experiences.createExperience(staffOf(merchantId), {
      restaurantId,
      name: 'Temp',
    });
    await experiences.deleteExperience(staffOf(merchantId), exp.id);
    expect(await experiences.getExperience(staffOf(merchantId), exp.id)).toBeNull();
    const list = await experiences.listExperiences(staffOf(merchantId), restaurantId);
    expect(list.map((e) => e.id)).not.toContain(exp.id);
    await expect(
      experiences.updateExperience(staffOf(merchantId), exp.id, { name: 'Y' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activation gate: a BLOCKED merchant owner cannot obtain a session to configure experiences', async () => {
    const { merchantId } = await seed();
    const email = `${uniq('owner')}@ex.test`;
    const password = 'S3cretPass!';
    await owners.provisionOwner(superAdmin, { merchantId, name: 'Owner', email, password });
    await expect(staffAuth.login({ email, password })).rejects.toBeInstanceOf(ForbiddenException);
    await owners.activateMerchant(superAdmin, merchantId);
    const session = await staffAuth.login({ email, password });
    expect(session.staff.merchantId).toBe(merchantId);
  });
});
