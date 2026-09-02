import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { MerchantModule } from '../src/modules/merchant/merchant.module';
import { MerchantRepository } from '../src/modules/merchant/infrastructure/merchant.repository';
import { RestaurantRepository } from '../src/modules/merchant/infrastructure/restaurant.repository';
import { MerchantScopeService } from '../src/modules/merchant/application/merchant-scope.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.2 Merchant & Location foundation — integration against the TEST database.
 * Exercises the REAL repositories + Prisma relationships (Merchant 1 → N
 * Restaurant) and the data-aware merchant tenancy service. Controlled synthetic
 * fixtures only; no schema change, no CRUD/onboarding.
 */
describe('Merchant & Location foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchants: MerchantRepository;
  let restaurants: RestaurantRepository;
  let scope: MerchantScopeService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const merchantStaff = (merchantId: string): StaffPrincipal => ({
    staffMemberId: 'staff',
    actorType: 'STAFF',
    staffRole: 'MERCHANT_STAFF',
    merchantId,
  });
  const superAdmin: StaffPrincipal = {
    staffMemberId: 'admin',
    actorType: 'STAFF',
    staffRole: 'SUPER_ADMIN',
    merchantId: null,
  };

  let m1 = '';
  let m2 = '';
  let m1r1 = '';
  let m1r2 = '';
  let m2r1 = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env', '../../.env'],
        }),
        PrismaModule,
        MerchantModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    merchants = app.get(MerchantRepository);
    restaurants = app.get(RestaurantRepository);
    scope = app.get(MerchantScopeService);

    const merchant1 = await prisma.merchant.create({
      data: { legalName: uniq('M1'), email: `${uniq('m1')}@ex.test`, legacyId: uniq('legacy-m1') },
    });
    const merchant2 = await prisma.merchant.create({ data: { legalName: uniq('M2') } });
    m1 = merchant1.id;
    m2 = merchant2.id;

    const r1 = await prisma.restaurant.create({ data: { merchantId: m1, name: uniq('R1') } });
    const r2 = await prisma.restaurant.create({ data: { merchantId: m1, name: uniq('R2') } });
    const r3 = await prisma.restaurant.create({ data: { merchantId: m2, name: uniq('R3') } });
    m1r1 = r1.id;
    m1r2 = r2.id;
    m2r1 = r3.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('represents a merchant identity and looks it up by id + legacyId', async () => {
    const byId = await merchants.findById(m1);
    expect(byId?.id).toBe(m1);
    expect(byId?.legalName).toBeDefined();
    expect(byId?.legacyId).toBeTruthy();
    const byLegacy = await merchants.findByLegacyId(byId!.legacyId!);
    expect(byLegacy?.id).toBe(m1);
    expect(await merchants.existsActive(m1)).toBe(true);
  });

  it('represents a location identity owned by a merchant', async () => {
    const r = await restaurants.findById(m1r1);
    expect(r?.id).toBe(m1r1);
    expect(r?.merchantId).toBe(m1);
    expect(r?.status).toBe('ACTIVE');
  });

  it('enforces Merchant 1 → N Restaurant (relationship + listing)', async () => {
    const list = await restaurants.listByMerchant(m1);
    const ids = list.map((r) => r.id).sort();
    expect(ids).toEqual([m1r1, m1r2].sort());
    expect(await restaurants.listByMerchant(m2)).toHaveLength(1);
    // FK is enforced at the database level
    await expect(
      prisma.restaurant.create({
        data: { merchantId: '00000000-0000-0000-0000-000000000000', name: uniq('bad') },
      }),
    ).rejects.toThrow(/foreign key|constraint/i);
  });

  it('enforces merchant uniqueness (email, legacyId)', async () => {
    const base = await merchants.findById(m1);
    await expect(
      prisma.merchant.create({ data: { legalName: uniq('dupEmail'), email: base!.email! } }),
    ).rejects.toThrow(/unique|constraint/i);
    await expect(
      prisma.merchant.create({ data: { legalName: uniq('dupLegacy'), legacyId: base!.legacyId! } }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('honors soft-delete on a location', async () => {
    const r = await prisma.restaurant.create({ data: { merchantId: m1, name: uniq('tmp') } });
    await prisma.restaurant.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
    expect(await restaurants.belongsToMerchant(r.id, m1)).toBe(false); // excluded when deleted
    const listed = (await restaurants.listByMerchant(m1)).map((x) => x.id);
    expect(listed).not.toContain(r.id);
  });

  it('keeps the StaffMember → Merchant tenancy relationship valid', async () => {
    const staff = await prisma.staffMember.create({
      data: { merchantId: m1, name: uniq('S'), staffRole: 'MERCHANT_STAFF' },
    });
    const withMerchant = await prisma.staffMember.findUniqueOrThrow({
      where: { id: staff.id },
      include: { merchant: true },
    });
    expect(withMerchant.merchantId).toBe(m1);
    expect(withMerchant.merchant?.id).toBe(m1);
    // SUPER_ADMIN tenancy: merchantId NULL is allowed (platform scope)
    const admin = await prisma.staffMember.create({
      data: { name: uniq('A'), staffRole: 'SUPER_ADMIN' },
    });
    expect(admin.merchantId).toBeNull();
  });

  it('confines merchant staff to their merchant and does not confine SUPER_ADMIN (data-aware scope)', async () => {
    // own restaurant -> allowed
    await expect(scope.assertRestaurantInScope(merchantStaff(m1), m1r1)).resolves.toBeUndefined();
    // another merchant's restaurant -> denied (cannot escape merchant boundary)
    await expect(scope.assertRestaurantInScope(merchantStaff(m1), m2r1)).rejects.toThrow(
      /cross-merchant/i,
    );
    // SUPER_ADMIN (platform) -> not confined
    await expect(scope.assertRestaurantInScope(superAdmin, m2r1)).resolves.toBeUndefined();
    expect(scope.resolveMerchantScope(merchantStaff(m1))).toBe(m1);
    expect(scope.resolveMerchantScope(superAdmin)).toBeNull();
  });
});
