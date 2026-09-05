import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { CatalogWriteService } from '../src/modules/catalog/application/catalog-write.service';
import { ComboService } from '../src/modules/catalog/application/combo.service';
import { MerchandisingRelationService } from '../src/modules/catalog/application/merchandising-relation.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { createApp } from '../src/main';

describe('Stage G upsell / cross-sell', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let catalog: CatalogWriteService;
  let combos: ComboService;
  let merchandising: MerchandisingRelationService;
  let httpApp: INestApplication;

  const PASSWORD = 'MerchantSecret123!';
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
        OrderingModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    catalog = app.get(CatalogWriteService);
    combos = app.get(ComboService);
    merchandising = app.get(MerchandisingRelationService);
    httpApp = await createApp();
    await httpApp.init();
  });

  afterAll(async () => {
    await app.close();
    await httpApp.close();
  });

  async function seedRestaurant() {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Pune',
    });
    const pizza = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Pizza',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Large', sku: uniq('PIZ'), priceMinor: 20000n, isDefault: true }],
    });
    const coke = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Coke',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Can', sku: uniq('COK'), priceMinor: 5000n, isDefault: true }],
    });
    const fries = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Fries',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Reg', sku: uniq('FRI'), priceMinor: 8000n, isDefault: true }],
    });
    const unpublished = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Hidden Dip',
      isPublished: false,
      availability: 'AVAILABLE',
      variants: [{ size: 'Reg', sku: uniq('DIP'), priceMinor: 2000n, isDefault: true }],
    });
    const soldOut = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Sold Cake',
      isPublished: true,
      availability: 'SOLDOUT',
      variants: [{ size: 'Reg', sku: uniq('CAK'), priceMinor: 9000n, isDefault: true, available: false }],
    });
    const takeawayOnly = await catalog.createItem(staffOf(m.id), {
      restaurantId: r.id,
      name: 'Takeaway Brownie',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Reg', sku: uniq('BRN'), priceMinor: 6000n, isDefault: true }],
      channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: false }],
    });
    return {
      merchantId: m.id,
      restaurantId: r.id,
      pizza,
      coke,
      fries,
      unpublished,
      soldOut,
      takeawayOnly,
      staff: staffOf(m.id),
    };
  }

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const http = () => request(httpApp.getHttpServer());
    await http()
      .post('/api/v1/auth/consumer/register')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    const login = await http()
      .post('/api/v1/auth/consumer/login')
      .send({ phoneCountryCode: '+91', phone, password: 'Secret123!' });
    return { token: login.body.accessToken as string, userId: login.body.user.id as string, http };
  }

  async function loginStaff(merchantId: string, restaurantId: string) {
    const email = `${uniq('staff')}@example.test`;
    const staff = await prisma.staffMember.create({
      data: {
        merchantId,
        name: 'Owner',
        email,
        staffRole: 'MERCHANT_OWNER',
        status: 'ACTIVE',
      },
    });
    await prisma.staffCredential.create({
      data: {
        staffMemberId: staff.id,
        type: 'PASSWORD',
        secretHash: await bcrypt.hash(PASSWORD, 10),
      },
    });
    const http = () => request(httpApp.getHttpServer());
    const login = await http().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, restaurantId, http };
  }

  async function seedOffer(merchantId: string, restaurantId: string, discountPercent = 10) {
    const offer = await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: true,
        merchantId,
        restaurantId,
        discountPercent,
        coupons: { create: [{ code: uniq('SAVE').toUpperCase() }] },
      },
      include: { coupons: true },
    });
    return { offer, code: offer.coupons[0]!.code };
  }

  it('creates an authorized tenant-isolated CROSS_SELL pair and rejects invalid pairs', async () => {
    const a = await seedRestaurant();
    const b = await seedRestaurant();
    const created = await merchandising.create(a.staff, {
      sourceItemId: a.pizza.id,
      targetItemId: a.coke.id,
      sortOrder: 2,
    });
    expect(created.merchantId).toBe(a.merchantId);
    expect(created.restaurantId).toBe(a.restaurantId);
    expect(created.type).toBe('CROSS_SELL');
    expect(created.sourceItemId).toBe(a.pizza.id);
    expect(created.targetItemId).toBe(a.coke.id);

    const again = await merchandising.create(a.staff, {
      sourceItemId: a.pizza.id,
      targetItemId: a.coke.id,
      sortOrder: 5,
    });
    expect(again.id).toBe(created.id);
    expect(again.sortOrder).toBe(5);

    await expect(
      merchandising.create(a.staff, { sourceItemId: a.pizza.id, targetItemId: a.pizza.id }),
    ).rejects.toMatchObject({ response: { code: 'SELF_RELATION' } });
    await expect(
      merchandising.create(a.staff, { sourceItemId: a.pizza.id, targetItemId: b.coke.id }),
    ).rejects.toMatchObject({ response: { code: 'TENANT_MISMATCH' } });
    await expect(
      merchandising.create(a.staff, { sourceItemId: a.pizza.id, targetItemId: a.coke.id, type: 'UPSELL' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TYPE' } });
    await expect(
      merchandising.create(a.staff, {
        sourceItemId: a.pizza.id,
        targetItemId: a.coke.id,
        merchantId: a.merchantId,
      }),
    ).rejects.toBeTruthy();
    await expect(merchandising.listForSource(b.staff, a.pizza.id)).rejects.toBeTruthy();
  });

  it('lets merchant HTTP create/list/patch and blocks consumer writes', async () => {
    const seeded = await seedRestaurant();
    const staff = await loginStaff(seeded.merchantId, seeded.restaurantId);
    const created = await staff.http()
      .post('/api/v1/catalog/merchandising-relations')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ sourceItemId: seeded.pizza.id, targetItemId: seeded.fries.id, sortOrder: 1 });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('CROSS_SELL');

    const listed = await staff.http()
      .get(`/api/v1/catalog/items/${seeded.pizza.id}/merchandising-relations`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.map((row: { targetItemId: string }) => row.targetItemId)).toContain(
      seeded.fries.id,
    );

    const patched = await staff.http()
      .patch(`/api/v1/catalog/merchandising-relations/${created.body.id}`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ status: 'INACTIVE', sortOrder: 9 });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('INACTIVE');
    expect(patched.body.sortOrder).toBe(9);

    const rejectedScope = await staff.http()
      .post('/api/v1/catalog/merchandising-relations')
      .set('Authorization', `Bearer ${staff.token}`)
      .send({
        sourceItemId: seeded.pizza.id,
        targetItemId: seeded.coke.id,
        merchantId: seeded.merchantId,
      });
    expect(rejectedScope.status).toBe(403);

    const { http } = await registerConsumer();
    const write = await http()
      .post('/api/v1/catalog/merchandising-relations')
      .send({ sourceItemId: seeded.pizza.id, targetItemId: seeded.coke.id });
    expect(write.status).toBe(401);
  });

  it('filters deleted, unpublished, unavailable, and channel-disabled targets from consumer retrieval', async () => {
    const seeded = await seedRestaurant();
    const deleted = await catalog.createItem(seeded.staff, {
      restaurantId: seeded.restaurantId,
      name: 'Deleted Side',
      isPublished: true,
      availability: 'AVAILABLE',
      variants: [{ size: 'Reg', sku: uniq('DEL'), priceMinor: 1000n, isDefault: true }],
    });
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: seeded.coke.id,
      sortOrder: 1,
    });
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: seeded.fries.id,
      sortOrder: 0,
    });
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: seeded.unpublished.id,
      sortOrder: 3,
    });
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: seeded.soldOut.id,
      sortOrder: 4,
    });
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: seeded.takeawayOnly.id,
      sortOrder: 5,
    });
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: deleted.id,
      sortOrder: 6,
    });
    await prisma.menuItem.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const { http } = await registerConsumer();
    const item = await http().get(`/api/v1/discover/items/${seeded.pizza.id}?type=HOME_DELIVERY`);
    expect(item.status).toBe(200);
    const ids = item.body.pairsWellWith.map((row: { id: string }) => row.id);
    expect(ids).toEqual([seeded.fries.id, seeded.coke.id]);
    expect(item.body.pairsWellWith[0].relation.type).toBe('CROSS_SELL');
    expect(item.body.pairsWellWith[0].orderable).toBe(true);

    const takeaway = await http().get(`/api/v1/discover/items/${seeded.pizza.id}?type=TAKE_AWAY`);
    expect(takeaway.body.pairsWellWith.map((row: { id: string }) => row.id)).toEqual([
      seeded.fries.id,
      seeded.coke.id,
      seeded.takeawayOnly.id,
    ]);

    const missing = await http().get('/api/v1/discover/items/00000000-0000-4000-8000-000000000099');
    expect(missing.status).toBe(404);
  });

  it('adds a recommended item through Stage D/E and does not treat a combo as a target', async () => {
    const seeded = await seedRestaurant();
    await merchandising.create(seeded.staff, {
      sourceItemId: seeded.pizza.id,
      targetItemId: seeded.coke.id,
      sortOrder: 1,
    });
    const combo = await combos.create(seeded.staff, {
      restaurantId: seeded.restaurantId,
      name: 'Meal Combo',
      isPublished: true,
      comboPriceMinor: 29900n,
      slots: [
        { name: 'Main', options: [{ menuItemId: seeded.pizza.id, isDefault: true }] },
        { name: 'Drink', options: [{ menuItemId: seeded.coke.id, isDefault: true }] },
      ],
    });
    await expect(
      merchandising.create(seeded.staff, {
        sourceItemId: seeded.pizza.id,
        targetItemId: combo.id,
      }),
    ).rejects.toBeTruthy();

    const { code } = await seedOffer(seeded.merchantId, seeded.restaurantId, 10);
    const { token, http } = await registerConsumer();
    const quoted = await http().post('/api/v1/discover/quote').send({
      variantId: seeded.coke.variants[0].id,
      quantity: 1,
      type: 'HOME_DELIVERY',
    });
    expect(quoted.status).toBe(201);
    expect(quoted.body.lineMerchandiseMinor).toBe('5000');
    expect(quoted.body.grandTotalMinor).toBe('5000');

    await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        comboId: combo.id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'HOME_DELIVERY',
      });
    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .query({ couponCode: code })
      .send({
        variantId: seeded.coke.variants[0].id,
        restaurantId: seeded.restaurantId,
        quantity: 1,
        type: 'HOME_DELIVERY',
      });
    expect(added.status).toBe(201);
    expect(added.body.merchandiseSubtotalMinor).toBe('34900');
    expect(added.body.discountMinor).toBe('3490');
    expect(added.body.grandTotalMinor).toBe('31410');
  });

  it('does not add a recommendation, pricing, or promotion engine', () => {
    const files = [
      '../src/modules/catalog/domain/merchandising-relation.ts',
      '../src/modules/catalog/application/merchandising-relation.service.ts',
      '../src/modules/catalog/domain/commercial-quote.ts',
      '../src/modules/catalog/application/commercial-quote.service.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src).not.toMatch(/PromotionEvaluationService/);
      expect(src).not.toMatch(/collaborative|embedding|frequently bought/i);
    }
    const commercial = readFileSync(
      join(__dirname, '../src/modules/catalog/application/commercial-quote.service.ts'),
      'utf8',
    );
    expect(commercial).not.toMatch(/PromotionApplicationService/);
    expect(commercial).not.toMatch(/MerchandisingRelation/);
  });
});
