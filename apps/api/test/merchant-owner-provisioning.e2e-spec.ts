import {
  ConflictException,
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
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import { StaffAuthService } from '../src/modules/identity/staff-authentication/staff-auth.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.14 Merchant owner provisioning & activation — integration (TEST DB).
 * Owner = StaffMember(MERCHANT_OWNER) + PASSWORD StaffCredential over the
 * EXISTING identity models (no schema change); activation = owner status
 * BLOCKED→ACTIVE enforced by the existing staff auth. Restaurant-profile +
 * subscription-config update are merchant-scoped, non-destructive.
 */
describe('Merchant owner provisioning & activation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let owners: MerchantOwnerService;
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

  const seedMerchant = () => provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
  const seedRestaurant = (merchantId: string) =>
    provisioning.createRestaurant(staffOf(merchantId), {
      merchantId,
      name: uniq('R'),
      city: 'Pune',
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
        StaffAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    owners = app.get(MerchantOwnerService);
    staffAuth = app.get(StaffAuthService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- OWNER PROVISIONING ----
  it('provisions a single MERCHANT_OWNER (+ credential) associated with the merchant, pending activation', async () => {
    const m = await seedMerchant();
    const email = `${uniq('owner')}@ex.test`;
    const owner = await owners.provisionOwner(superAdmin, {
      merchantId: m.id,
      name: 'Owner One',
      email,
      password: 'S3cretPass!',
    });
    expect(owner.staffRole).toBe('MERCHANT_OWNER');
    expect(owner.merchantId).toBe(m.id);
    expect(owner.status).toBe('BLOCKED'); // pending activation (has_admin_approved=false)

    // A PASSWORD credential exists and is a bcrypt hash (never plaintext).
    const cred = await prisma.staffCredential.findFirst({ where: { staffMemberId: owner.id } });
    expect(cred?.type).toBe('PASSWORD');
    expect(cred?.secretHash).toMatch(/^\$2[aby]\$/);
    expect(cred?.secretHash).not.toContain('S3cretPass!');
  });

  it('rejects a second owner (cardinality: one MERCHANT_OWNER per merchant)', async () => {
    const m = await seedMerchant();
    await owners.provisionOwner(superAdmin, {
      merchantId: m.id,
      name: 'Owner',
      email: `${uniq('o')}@ex.test`,
      password: 'S3cretPass!',
    });
    await expect(
      owners.provisionOwner(superAdmin, {
        merchantId: m.id,
        name: 'Owner2',
        email: `${uniq('o2')}@ex.test`,
        password: 'S3cretPass!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects provisioning by non-SUPER_ADMIN, unknown merchant, and weak/no-identifier input', async () => {
    const m = await seedMerchant();
    await expect(
      owners.provisionOwner(staffOf(m.id), {
        merchantId: m.id,
        name: 'X',
        email: `${uniq('o')}@ex.test`,
        password: 'S3cretPass!',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      owners.provisionOwner(superAdmin, {
        merchantId: '00000000-0000-0000-0000-000000000000',
        name: 'X',
        email: `${uniq('o')}@ex.test`,
        password: 'S3cretPass!',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      owners.provisionOwner(superAdmin, { merchantId: m.id, name: 'X', password: 'short' }),
    ).rejects.toThrow(/password/);
    await expect(
      owners.provisionOwner(superAdmin, { merchantId: m.id, name: 'X', password: 'S3cretPass!' }),
    ).rejects.toThrow(/identifier/);
  });

  it('rejects provisioning for a soft-deleted merchant', async () => {
    const m = await seedMerchant();
    await prisma.merchant.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
    await expect(
      owners.provisionOwner(superAdmin, {
        merchantId: m.id,
        name: 'X',
        email: `${uniq('o')}@ex.test`,
        password: 'S3cretPass!',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---- ACTIVATION GATE (via existing staff auth) ----
  it('activation gate: BLOCKED owner cannot log in; ACTIVE owner can; deactivate revokes', async () => {
    const m = await seedMerchant();
    const email = `${uniq('login')}@ex.test`;
    const password = 'S3cretPass!';
    await owners.provisionOwner(superAdmin, { merchantId: m.id, name: 'Owner', email, password });

    // pending (BLOCKED) -> existing staff auth rejects (Account is not active)
    await expect(staffAuth.login({ email, password })).rejects.toBeInstanceOf(ForbiddenException);

    // activate -> can authenticate via the EXISTING staff login; merchant scope is server-derived
    const activated = await owners.activateMerchant(superAdmin, m.id);
    expect(activated.status).toBe('ACTIVE');
    const session = await staffAuth.login({ email, password });
    expect(session.accessToken).toBeTruthy();
    expect(session.staff.merchantId).toBe(m.id);
    expect(session.staff.staffRole).toBe('MERCHANT_OWNER');

    // deactivate -> login blocked again
    await owners.deactivateMerchant(superAdmin, m.id);
    await expect(staffAuth.login({ email, password })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('activation is SUPER_ADMIN-only and requires an existing owner', async () => {
    const m = await seedMerchant();
    await expect(owners.activateMerchant(staffOf(m.id), m.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // merchant with no owner yet
    await expect(owners.activateMerchant(superAdmin, m.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ---- RESTAURANT PROFILE UPDATE ----
  it('updates restaurant profile fields within merchant scope and rejects cross-merchant', async () => {
    const m1 = await seedMerchant();
    const m2 = await seedMerchant();
    const r1 = await seedRestaurant(m1.id);
    const updated = await owners.updateRestaurantProfile(staffOf(m1.id), r1.id, {
      name: 'Renamed Bistro',
      city: 'Mumbai',
      timezone: 'Asia/Kolkata',
      lat: 19.07,
      lon: 72.87,
    });
    expect(updated.name).toBe('Renamed Bistro');
    expect(updated.city).toBe('Mumbai');
    expect(updated.lat).toBeCloseTo(19.07);
    // cross-merchant staff cannot update m1's restaurant
    await expect(
      owners.updateRestaurantProfile(staffOf(m2.id), r1.id, { city: 'Hacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // unknown + soft-deleted restaurant -> NotFound
    await expect(
      owners.updateRestaurantProfile(superAdmin, '00000000-0000-0000-0000-000000000000', {
        city: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await prisma.restaurant.update({ where: { id: r1.id }, data: { deletedAt: new Date() } });
    await expect(
      owners.updateRestaurantProfile(superAdmin, r1.id, { city: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---- SUBSCRIPTION CONFIG UPDATE (non-destructive) ----
  it('updates subscription config non-destructively, preserving unrelated keys, and updates status', async () => {
    const m = await seedMerchant();
    const sub = await provisioning.createSubscription(staffOf(m.id), {
      merchantId: m.id,
      productType: 'SEATING',
      config: {
        casual_dining: true,
        casual_dining_status: { seating: { value: true }, ordering: { value: false } },
      },
    });
    const res = await owners.updateSubscriptionConfig(staffOf(m.id), sub.id, {
      status: 'INACTIVE',
      config: {
        casual_dining_status: { ordering: { value: true } },
        offer_management: { value: true },
      },
    });
    expect(res.status).toBe('INACTIVE');
    const cfg = res.config as Record<string, any>;
    // unrelated keys preserved
    expect(cfg.casual_dining).toBe(true);
    expect(cfg.casual_dining_status.seating.value).toBe(true); // preserved
    // requested paths merged
    expect(cfg.casual_dining_status.ordering.value).toBe(true); // overridden
    expect(cfg.offer_management.value).toBe(true); // added
    // persisted
    const persisted = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect((persisted.config as Record<string, any>).casual_dining).toBe(true);
    expect(persisted.status).toBe('INACTIVE');
  });

  it('rejects cross-merchant subscription config update and unknown subscription', async () => {
    const m1 = await seedMerchant();
    const m2 = await seedMerchant();
    const sub2 = await provisioning.createSubscription(staffOf(m2.id), {
      merchantId: m2.id,
      productType: 'ORDERING',
    });
    await expect(
      owners.updateSubscriptionConfig(staffOf(m1.id), sub2.id, { config: { x: 1 } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      owners.updateSubscriptionConfig(superAdmin, '00000000-0000-0000-0000-000000000000', {
        config: { x: 1 },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---- SUPER_ADMIN behavior ----
  it('SUPER_ADMIN provisions/activates with explicit merchant target and can update any merchant config', async () => {
    const m = await seedMerchant();
    const email = `${uniq('sa')}@ex.test`;
    await owners.provisionOwner(superAdmin, {
      merchantId: m.id,
      name: 'O',
      email,
      password: 'S3cretPass!',
    });
    await owners.activateMerchant(superAdmin, m.id);
    const sub = await provisioning.createSubscription(superAdmin, {
      merchantId: m.id,
      productType: 'SEATING',
    });
    const res = await owners.updateSubscriptionConfig(superAdmin, sub.id, {
      config: { menu_setup: { value: true } },
    });
    expect((res.config as Record<string, any>).menu_setup.value).toBe(true);
  });
});
