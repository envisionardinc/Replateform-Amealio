import { ForbiddenException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { UserProfileModule } from '../src/modules/user-profile/user-profile.module';
import { MerchantOnboardingService } from '../src/modules/onboarding/application/merchant-onboarding.service';
import { UserProfileService } from '../src/modules/user-profile/application/user-profile.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.8 Onboarding / User-Profile foundation — integration against the TEST DB.
 * Merchant onboarding-state (Merchant/Restaurant) + user profile-state
 * (UserProfile) over the existing models. Additive fields only; tenancy via
 * P1.7.1F/P1.7.2; user profile is user-owned.
 */
describe('Onboarding & User-Profile foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantOnboarding: MerchantOnboardingService;
  let profiles: UserProfileService;

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
  let userA = '';
  let userB = '';

  const uniqPhone = () => `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;

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
        UserProfileModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    merchantOnboarding = app.get(MerchantOnboardingService);
    profiles = app.get(UserProfileService);

    m1 = (await prisma.merchant.create({ data: { legalName: uniq('M1') } })).id;
    m2 = (await prisma.merchant.create({ data: { legalName: uniq('M2') } })).id;
    r1 = (await prisma.restaurant.create({ data: { merchantId: m1, name: uniq('R1') } })).id;
    r2 = (await prisma.restaurant.create({ data: { merchantId: m2, name: uniq('R2') } })).id;
    userA = (await prisma.user.create({ data: { phoneCountryCode: '+91', phone: uniqPhone() } }))
      .id;
    userB = (await prisma.user.create({ data: { phoneCountryCode: '+91', phone: uniqPhone() } }))
      .id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- Merchant onboarding state ----

  it('defaults merchant/restaurant onboarding state and reads it (scoped)', async () => {
    const state = await merchantOnboarding.getState(staff(m1));
    expect(state?.onboardingSubmitted).toBe(false);
    expect(state?.restaurants.find((r) => r.restaurantId === r1)?.onboardingStep).toBe(0);
    expect(state?.restaurants.find((r) => r.restaurantId === r1)?.softOnboarding).toBe(false);
  });

  it('updates merchant submitted state', async () => {
    const updated = await merchantOnboarding.setMerchantSubmitted(staff(m1), true);
    expect(updated?.onboardingSubmitted).toBe(true);
    expect((await merchantOnboarding.getState(staff(m1)))?.onboardingSubmitted).toBe(true);
  });

  it('updates restaurant onboarding progress (step + soft), preserving semantics', async () => {
    await merchantOnboarding.setRestaurantProgress(staff(m1), r1, {
      onboardingStep: 3,
      softOnboarding: true,
    });
    const state = await merchantOnboarding.getState(staff(m1));
    const r = state?.restaurants.find((x) => x.restaurantId === r1);
    expect(r?.onboardingStep).toBe(3);
    expect(r?.softOnboarding).toBe(true);
    // partial update preserves the other field
    await merchantOnboarding.setRestaurantProgress(staff(m1), r1, { onboardingStep: 5 });
    const after = (await merchantOnboarding.getState(staff(m1)))?.restaurants.find(
      (x) => x.restaurantId === r1,
    );
    expect(after?.onboardingStep).toBe(5);
    expect(after?.softOnboarding).toBe(true); // preserved
  });

  it('enforces merchant tenancy: cross-merchant access is rejected', async () => {
    await expect(
      merchantOnboarding.setMerchantSubmitted(staff(m1), true, m2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      merchantOnboarding.setRestaurantProgress(staff(m1), r2, { onboardingStep: 1 }),
    ).rejects.toThrow(/cross-merchant/i);
  });

  it('SUPER_ADMIN is platform-scoped (explicit merchant target) and consistent with P1.7.1F', async () => {
    // no target -> platform must specify a merchant
    await expect(merchantOnboarding.getState(superAdmin)).rejects.toThrow(
      /merchantId is required/i,
    );
    const state = await merchantOnboarding.getState(superAdmin, m2);
    expect(state?.merchantId).toBe(m2);
    await merchantOnboarding.setRestaurantProgress(superAdmin, r2, { onboardingStep: 2 }); // not confined
    expect(
      (await merchantOnboarding.getState(superAdmin, m2))?.restaurants.find(
        (x) => x.restaurantId === r2,
      )?.onboardingStep,
    ).toBe(2);
  });

  it('missing merchant/restaurant behaves safely', async () => {
    expect(
      await merchantOnboarding.getState(superAdmin, '00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
    await expect(
      merchantOnboarding.setRestaurantProgress(staff(m1), '00000000-0000-0000-0000-000000000000', {
        onboardingStep: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException); // unknown restaurant not in scope
  });

  // ---- User profile state ----

  it('creates/updates user profile completion state', async () => {
    expect(await profiles.getProfile(userA)).toBeNull(); // none yet
    const created = await profiles.updateState(userA, {
      detailsSubmitted: true,
      completionPercentage: 40,
    });
    expect(created.detailsSubmitted).toBe(true);
    expect(created.completionPercentage).toBe(40);
    const bumped = await profiles.updateState(userA, { completionPercentage: 80 });
    expect(bumped.completionPercentage).toBe(80);
    expect(bumped.detailsSubmitted).toBe(true); // preserved
  });

  it('rejects out-of-range completion percentage (target invariant)', async () => {
    await expect(profiles.updateState(userA, { completionPercentage: 150 })).rejects.toThrow(
      /0 and 100/,
    );
    await expect(profiles.updateState(userA, { completionPercentage: -1 })).rejects.toThrow(
      /0 and 100/,
    );
  });

  it('persists preferences and preserves unrelated keys on merge', async () => {
    await profiles.mergePreferences(userA, {
      dietary_preferences: ['veg'],
      selected_cuisine: ['italian', 'indian'],
      language: 'en',
    });
    const merged = await profiles.mergePreferences(userA, {
      selected_cuisine: ['thai'],
      celebration_subcategory: ['birthday'],
    });
    const prefs = merged.preferences as Record<string, unknown>;
    expect(prefs.selected_cuisine).toEqual(['thai']); // updated key replaced
    expect(prefs.dietary_preferences).toEqual(['veg']); // unrelated key preserved
    expect(prefs.language).toBe('en'); // unrelated key preserved
    expect(prefs.celebration_subcategory).toEqual(['birthday']); // new key added
  });

  it('enforces user ownership: userB profile is independent of userA', async () => {
    await profiles.updateState(userB, { completionPercentage: 10 });
    await profiles.mergePreferences(userB, { language: 'hi' });
    const a = await profiles.getProfile(userA);
    const b = await profiles.getProfile(userB);
    expect(b?.completionPercentage).toBe(10);
    expect((b?.preferences as Record<string, unknown>).language).toBe('hi');
    // userA's data unaffected by userB writes
    expect((a?.preferences as Record<string, unknown>).language).toBe('en');
    expect(a?.completionPercentage).toBe(80);
  });

  it('missing user profile read is safe', async () => {
    expect(await profiles.getProfile('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await profiles.getProfile('not-a-uuid')).toBeNull();
  });
});
