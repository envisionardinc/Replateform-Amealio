import { ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { MerchantOnboardingService } from '../src/modules/onboarding/application/merchant-onboarding.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.10 Merchant/Restaurant/Subscription creation (write) foundation —
 * integration against the TEST DB. Canonical creation over existing models
 * (no schema change); merchant creation is platform (SUPER_ADMIN); restaurant/
 * subscription creation is merchant-tenant-scoped (P1.7.1F/P1.7.2). Onboarding
 * submission is a separate state transition (P1.7.8).
 */
describe('Merchant creation write foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let onboarding: MerchantOnboardingService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const superAdmin: StaffPrincipal = {
    staffMemberId: 'admin',
    actorType: 'STAFF',
    staffRole: 'SUPER_ADMIN',
    merchantId: null,
  };
  const staffOf = (merchantId: string): StaffPrincipal => ({
    staffMemberId: 's',
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
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    onboarding = app.get(MerchantOnboardingService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- Merchant ----
  it('SUPER_ADMIN creates a merchant with default onboarding state', async () => {
    const m = await provisioning.createMerchant(superAdmin, {
      legalName: uniq('Biz'),
      email: `${uniq('m')}@ex.test`,
    });
    expect(m.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(m.onboardingSubmitted).toBe(false); // creation does not submit
  });

  it('rejects merchant creation without legalName and by non-SUPER_ADMIN', async () => {
    await expect(
      provisioning.createMerchant(superAdmin, { legalName: '  ' }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      provisioning.createMerchant(staffOf('00000000-0000-0000-0000-000000000000'), {
        legalName: uniq('X'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces merchant email uniqueness (duplicate identity)', async () => {
    const email = `${uniq('dup')}@ex.test`;
    await provisioning.createMerchant(superAdmin, { legalName: uniq('A'), email });
    await expect(
      provisioning.createMerchant(superAdmin, { legalName: uniq('B'), email }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  // ---- Restaurant ----
  it('creates a restaurant under the caller merchant with onboarding defaults', async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Bengaluru',
    });
    expect(r.merchantId).toBe(m.id);
    expect(r.status).toBe('ACTIVE');
    expect(r.onboardingStep).toBe(0);
    expect(r.softOnboarding).toBe(false);
  });

  it('rejects restaurant creation for another merchant (cross-merchant) and unknown merchant', async () => {
    const m1 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M1') });
    const m2 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M2') });
    // staff of m1 cannot create a restaurant for m2
    await expect(
      provisioning.createRestaurant(staffOf(m1.id), { merchantId: m2.id, name: uniq('R') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // SUPER_ADMIN with unknown merchant -> NotFound
    await expect(
      provisioning.createRestaurant(superAdmin, {
        merchantId: '00000000-0000-0000-0000-000000000000',
        name: uniq('R'),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forces server-resolved merchant scope (request merchantId cannot override)', async () => {
    const m1 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M1') });
    const m2 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M2') });
    // staff of m1 passing m1 is fine; the created restaurant is under m1 regardless
    const r = await provisioning.createRestaurant(staffOf(m1.id), {
      merchantId: m1.id,
      name: uniq('R'),
    });
    expect(r.merchantId).toBe(m1.id);
    // and cannot create under m2
    await expect(
      provisioning.createRestaurant(staffOf(m1.id), { merchantId: m2.id, name: uniq('R') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---- Subscription ----
  it('creates a subscription owned by the merchant with default status/config', async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const s = await provisioning.createSubscription(staffOf(m.id), {
      merchantId: m.id,
      productType: 'SEATING',
    });
    expect(s.merchantId).toBe(m.id);
    expect(s.status).toBe('ACTIVE'); // default
    expect(s.restaurantId).toBeNull();
  });

  it('rejects invalid productType and cross-merchant subscription', async () => {
    const m1 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M1') });
    const m2 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M2') });
    await expect(
      provisioning.createSubscription(staffOf(m1.id), { merchantId: m1.id, productType: 'NOPE' }),
    ).rejects.toThrow(/productType/);
    await expect(
      provisioning.createSubscription(staffOf(m1.id), {
        merchantId: m2.id,
        productType: 'ORDERING',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a subscription tied to a restaurant requires the restaurant to be in scope', async () => {
    const m1 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M1') });
    const m2 = await provisioning.createMerchant(superAdmin, { legalName: uniq('M2') });
    const r2 = await provisioning.createRestaurant(staffOf(m2.id), {
      merchantId: m2.id,
      name: uniq('R2'),
    });
    // staff of m1 cannot attach m2's restaurant to a subscription
    await expect(
      provisioning.createSubscription(staffOf(m1.id), {
        merchantId: m1.id,
        restaurantId: r2.id,
        productType: 'ORDERING',
      }),
    ).rejects.toThrow(/cross-merchant/i);
    // own restaurant is fine, with config JSON preserved
    const r1 = await provisioning.createRestaurant(staffOf(m1.id), {
      merchantId: m1.id,
      name: uniq('R1'),
    });
    const s = await provisioning.createSubscription(staffOf(m1.id), {
      merchantId: m1.id,
      restaurantId: r1.id,
      productType: 'ORDERING',
      status: 'INACTIVE',
      config: { casual_dining: true },
    });
    expect(s.restaurantId).toBe(r1.id);
    expect(s.status).toBe('INACTIVE');
    const persisted = await prisma.subscription.findUniqueOrThrow({ where: { id: s.id } });
    expect((persisted.config as Record<string, unknown>).casual_dining).toBe(true);
  });

  // ---- Combined creation integrity + onboarding submission ----
  it('Merchant → Restaurant → Subscription relationship integrity (non-atomic, partial-valid)', async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    // partial creation is valid: a merchant may exist with no restaurant yet
    const stateBefore = await onboarding.getState(staffOf(m.id));
    expect(stateBefore?.restaurants).toHaveLength(0);
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
    });
    await provisioning.createSubscription(staffOf(m.id), {
      merchantId: m.id,
      restaurantId: r.id,
      productType: 'SEATING',
    });
    const rest = await prisma.restaurant.findUniqueOrThrow({
      where: { id: r.id },
      include: { merchant: true, subscriptions: true },
    });
    expect(rest.merchant.id).toBe(m.id);
    expect(rest.subscriptions).toHaveLength(1);
  });

  it('creation does not submit; final submission is a separate state transition', async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    expect((await onboarding.getState(staffOf(m.id)))?.onboardingSubmitted).toBe(false);
    await onboarding.setMerchantSubmitted(staffOf(m.id), true); // explicit final submission (P1.7.8)
    expect((await onboarding.getState(staffOf(m.id)))?.onboardingSubmitted).toBe(true);
  });
});
