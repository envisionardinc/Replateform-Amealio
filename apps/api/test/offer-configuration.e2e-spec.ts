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
import { OfferModule } from '../src/modules/offer/offer.module';
import { OfferService } from '../src/modules/offer/application/offer.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import { StaffAuthService } from '../src/modules/identity/staff-authentication/staff-auth.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.22 Merchant offer & coupon configuration foundation — integration (TEST DB).
 * Configuration only: create/update/activate/soft-delete Offer + coupon code.
 * NO redemption, NO discount calculation, NO CouponRedemption.
 */
describe('Offer & Coupon configuration foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let owners: MerchantOwnerService;
  let offers: OfferService;
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
        OfferModule,
        StaffAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    owners = app.get(MerchantOwnerService);
    offers = app.get(OfferService);
    staffAuth = app.get(StaffAuthService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a percentage offer with cap, order gates, service types, validity, usage config, coupon code', async () => {
    const { merchantId, restaurantId } = await seed();
    const code = uniq('SAVE');
    const offer = await offers.createOffer(staffOf(merchantId), {
      restaurantId,
      title: '20% off',
      description: 'Festive',
      termsAndConditions: 'T&C apply',
      couponCode: code,
      discountPercent: 20,
      maxDiscountMinor: 15000n,
      minOrderMinor: 50000n,
      maxOrderMinor: 500000n,
      serviceTypes: ['Delivery', 'Takeaway'],
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 7 * 864e5).toISOString(),
      maxUsageLimit: 1000,
      perUserLimit: 2,
      useLimit: 1,
      useFrequency: 'DAILY',
      settlementType: 'ADMIN',
      legacyId: uniq('offer'),
    });
    expect(offer.merchantId).toBe(merchantId);
    expect(offer.restaurantId).toBe(restaurantId);
    expect(offer.isGlobal).toBe(false);
    expect(offer.discountPercent).toBe(20);
    expect(offer.discountMinor).toBeNull();
    expect(offer.maxDiscountMinor).toBe(15000n);
    expect(offer.active).toBe(false); // default: not active until activated
    expect(offer.settlementType).toBe('ADMIN');
    expect(offer.serviceTypes).toEqual(['Delivery', 'Takeaway']);
    expect(offer.coupons).toHaveLength(1);
    expect(offer.coupons[0].code).toBe(code);
    // persisted; NO redemption rows exist
    const redemptions = await prisma.couponRedemption.count({
      where: { couponId: offer.coupons[0].id },
    });
    expect(redemptions).toBe(0);
  });

  it('creates a fixed-amount offer without a coupon code', async () => {
    const { merchantId } = await seed();
    const offer = await offers.createOffer(staffOf(merchantId), {
      title: 'Flat 100 off',
      discountMinor: 10000n,
    });
    expect(offer.discountMinor).toBe(10000n);
    expect(offer.discountPercent).toBeNull();
    expect(offer.coupons).toHaveLength(0);
    expect(offer.merchantId).toBe(merchantId);
  });

  it('rejects invalid discount, order-range, date-range, service types, usage, frequency, settlement', async () => {
    const { merchantId } = await seed();
    const s = staffOf(merchantId);
    await expect(offers.createOffer(s, { title: 'X' })).rejects.toBeInstanceOf(BadRequestException); // no discount
    await expect(
      offers.createOffer(s, { title: 'X', discountPercent: 10, discountMinor: 100n }),
    ).rejects.toBeInstanceOf(BadRequestException); // both
    await expect(offers.createOffer(s, { title: 'X', discountPercent: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      offers.createOffer(s, { title: 'X', discountPercent: 150 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(offers.createOffer(s, { title: 'X', discountMinor: 0n })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      offers.createOffer(s, {
        title: 'X',
        discountMinor: 100n,
        minOrderMinor: 500n,
        maxOrderMinor: 100n,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const now = new Date();
    await expect(
      offers.createOffer(s, { title: 'X', discountMinor: 100n, validFrom: now, validTo: now }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      offers.createOffer(s, { title: 'X', discountMinor: 100n, serviceTypes: ['', 'ok'] as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      offers.createOffer(s, { title: 'X', discountMinor: 100n, maxUsageLimit: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      offers.createOffer(s, { title: 'X', discountMinor: 100n, useFrequency: 'HOURLY' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      offers.createOffer(s, { title: 'X', discountMinor: 100n, settlementType: 'NOPE' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces coupon code uniqueness', async () => {
    const a = await seed();
    const b = await seed();
    const code = uniq('DUP');
    await offers.createOffer(staffOf(a.merchantId), {
      title: 'A',
      discountMinor: 100n,
      couponCode: code,
    });
    await expect(
      offers.createOffer(staffOf(b.merchantId), {
        title: 'B',
        discountMinor: 100n,
        couponCode: code,
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('gets, lists, updates, activates/deactivates, and soft-deletes offers', async () => {
    const { merchantId } = await seed();
    const s = staffOf(merchantId);
    const offer = await offers.createOffer(s, { title: 'Combo deal', discountPercent: 10 });
    expect((await offers.getOffer(s, offer.id))!.id).toBe(offer.id);
    const list = await offers.listMerchantOffers(s);
    expect(list.map((o) => o.id)).toContain(offer.id);

    const upd = await offers.updateOffer(s, offer.id, {
      title: 'Combo deal v2',
      discountPercent: 15,
      couponCode: uniq('C'),
    });
    expect(upd.title).toBe('Combo deal v2');
    expect(upd.discountPercent).toBe(15);
    expect(upd.coupons).toHaveLength(1);

    const activated = await offers.setActive(s, offer.id, true);
    expect(activated.active).toBe(true);
    const deactivated = await offers.setActive(s, offer.id, false);
    expect(deactivated.active).toBe(false);

    await offers.deleteOffer(s, offer.id);
    expect(await offers.getOffer(s, offer.id)).toBeNull();
    expect((await offers.listMerchantOffers(s)).map((o) => o.id)).not.toContain(offer.id);
    await expect(offers.updateOffer(s, offer.id, { title: 'Y' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('enforces tenancy: cross-merchant rejected, SUPER_ADMIN explicit target, deleted restaurant', async () => {
    const a = await seed();
    const b = await seed();
    const offerA = await offers.createOffer(staffOf(a.merchantId), {
      title: 'A',
      discountMinor: 100n,
    });
    // staff of B cannot read/update A's offer
    await expect(offers.getOffer(staffOf(b.merchantId), offerA.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      offers.updateOffer(staffOf(b.merchantId), offerA.id, { title: 'hacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // SUPER_ADMIN needs explicit merchant target for a non-global create
    await expect(
      offers.createOffer(superAdmin, { title: 'X', discountMinor: 100n }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const adminOffer = await offers.createOffer(superAdmin, {
      merchantId: a.merchantId,
      title: 'Admin-for-A',
      discountMinor: 100n,
    });
    expect(adminOffer.merchantId).toBe(a.merchantId);
    // restaurant of another merchant rejected
    await expect(
      offers.createOffer(staffOf(a.merchantId), {
        title: 'X',
        discountMinor: 100n,
        restaurantId: b.restaurantId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // deleted restaurant rejected
    await prisma.restaurant.update({
      where: { id: a.restaurantId },
      data: { deletedAt: new Date() },
    });
    await expect(
      offers.createOffer(staffOf(a.merchantId), {
        title: 'X',
        discountMinor: 100n,
        restaurantId: a.restaurantId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('global-scope authorization: SUPER_ADMIN only; merchant staff rejected; global cannot target a restaurant', async () => {
    const { merchantId, restaurantId } = await seed();
    await expect(
      offers.createOffer(staffOf(merchantId), {
        title: 'Global',
        discountPercent: 10,
        isGlobal: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const globalOffer = await offers.createOffer(superAdmin, {
      title: 'Platform 10%',
      discountPercent: 10,
      isGlobal: true,
    });
    expect(globalOffer.isGlobal).toBe(true);
    expect(globalOffer.merchantId).toBeNull();
    // a merchant staff cannot access a global offer
    await expect(offers.getOffer(staffOf(merchantId), globalOffer.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // SUPER_ADMIN can list global offers
    expect((await offers.listGlobalOffers(superAdmin)).map((o) => o.id)).toContain(globalOffer.id);
    await expect(offers.listGlobalOffers(staffOf(merchantId))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // global cannot target a restaurant
    await expect(
      offers.createOffer(superAdmin, {
        title: 'X',
        discountPercent: 10,
        isGlobal: true,
        restaurantId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activation gate: a BLOCKED merchant owner cannot obtain a session to configure offers', async () => {
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
