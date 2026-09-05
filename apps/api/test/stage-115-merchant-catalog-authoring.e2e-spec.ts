import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Stage 115 slice — merchant scratch create + structural authoring over existing
 * /catalog write APIs. No schema change. No DELETE. No combo/cross-sell UI.
 * Global materialize remains copy-not-inheritance. Consumer visibility stays Stage C.
 */
describe('Stage 115 merchant catalog authoring (HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const PASSWORD = 'MerchantSecret123!';
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeStaff(opts: {
    merchantId: string | null;
    staffRole: 'SUPER_ADMIN' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF';
  }) {
    const email = `${uniq('staff')}@example.test`;
    const staff = await prisma.staffMember.create({
      data: {
        merchantId: opts.merchantId ?? undefined,
        name: opts.staffRole,
        email,
        staffRole: opts.staffRole,
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
    return { staff, email };
  }

  async function login(email: string): Promise<string> {
    const res = await http().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function seedMerchant() {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('Kitchen'), city: 'Pune', status: 'ACTIVE' },
    });
    const other = await prisma.merchant.create({ data: { legalName: uniq('Other') } });
    const otherRestaurant = await prisma.restaurant.create({
      data: { merchantId: other.id, name: uniq('OtherKitchen'), status: 'ACTIVE' },
    });
    const { email: ownerEmail } = await makeStaff({
      merchantId: merchant.id,
      staffRole: 'MERCHANT_OWNER',
    });
    const { email: otherEmail } = await makeStaff({
      merchantId: other.id,
      staffRole: 'MERCHANT_OWNER',
    });
    const { email: adminEmail } = await makeStaff({
      merchantId: null,
      staffRole: 'SUPER_ADMIN',
    });
    return { merchant, restaurant, other, otherRestaurant, ownerEmail, otherEmail, adminEmail };
  }

  it('lets a merchant create, configure, and publish a scratch item without Global Catalog', async () => {
    const { restaurant, ownerEmail } = await seedMerchant();
    const token = await login(ownerEmail);

    const menu = await http()
      .post('/api/v1/catalog/menus')
      .set('Authorization', `Bearer ${token}`)
      .send({ restaurantId: restaurant.id, name: uniq('Dinner'), type: 'CUSTOM', visibility: true });
    expect(menu.status).toBe(201);
    expect(menu.body.type).toBe('CUSTOM');

    const section = await http()
      .post('/api/v1/catalog/sections')
      .set('Authorization', `Bearer ${token}`)
      .send({ menuId: menu.body.id, name: 'Mains', sortOrder: 0 });
    expect(section.status).toBe(201);

    const created = await http()
      .post('/api/v1/catalog/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        restaurantId: restaurant.id,
        name: uniq('Scratch Thali'),
        description: 'Merchant owned',
        menuSectionId: section.body.id,
        isPublished: false,
        availability: 'AVAILABLE',
      });
    expect(created.status).toBe(201);
    expect(created.body.isPublished).toBe(false);
    expect(created.body.globalSource ?? null).toBeNull();
    expect(created.body.merchantId).toBe(restaurant.merchantId);

    const hidden = await http().get(`/api/v1/discover/items/${created.body.id}`);
    expect(hidden.status).toBe(404);

    const edited = await http()
      .patch(`/api/v1/catalog/items/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Scratch Thali v2', description: 'Edited copy' });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('Scratch Thali v2');

    const variant = await http()
      .post(`/api/v1/catalog/items/${created.body.id}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        size: 'Regular',
        sku: 'THALI-REG',
        priceMinor: '29900',
        isDefault: true,
        available: true,
      });
    expect(variant.status).toBe(201);
    expect(variant.body.priceMinor).toBe('29900');

    const group = await http()
      .post(`/api/v1/catalog/items/${created.body.id}/add-on-groups`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Raita', minSelect: 0, maxSelect: 1, allowQuantity: false, available: true });
    expect(group.status).toBe(201);

    const addon = await http()
      .post(`/api/v1/catalog/add-on-groups/${group.body.id}/add-ons`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Boondi', priceMinor: '2000', available: true, isDefault: true });
    expect(addon.status).toBe(201);

    const variantPrice = await http()
      .post(`/api/v1/catalog/add-ons/${addon.body.id}/variant-prices`)
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: variant.body.id, priceMinor: '2500' });
    expect(variantPrice.status).toBe(201);

    const channel = await http()
      .patch(`/api/v1/catalog/items/${created.body.id}/channel-config`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'HOME_DELIVERY', enabled: true });
    expect(channel.status).toBe(200);
    expect(channel.body.enabled).toBe(true);

    const soldOut = await http()
      .patch(`/api/v1/catalog/items/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ availability: 'SOLDOUT' });
    expect(soldOut.status).toBe(200);
    expect(soldOut.body.availability).toBe('SOLDOUT');

    const publishedSoldOut = await http()
      .patch(`/api/v1/catalog/items/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });
    expect(publishedSoldOut.status).toBe(200);

    const visibleSoldOut = await http().get(`/api/v1/discover/items/${created.body.id}?type=HOME_DELIVERY`);
    expect(visibleSoldOut.status).toBe(200);
    expect(visibleSoldOut.body.orderable).toBe(false);

    const available = await http()
      .patch(`/api/v1/catalog/items/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ availability: 'AVAILABLE' });
    expect(available.status).toBe(200);

    const visible = await http().get(`/api/v1/discover/items/${created.body.id}?type=HOME_DELIVERY`);
    expect(visible.status).toBe(200);
    expect(visible.body.orderable).toBe(true);
    expect(visible.body.name).toBe('Scratch Thali v2');

    const menu = await http().get(`/api/v1/discover/restaurants/${restaurant.id}/menu?type=HOME_DELIVERY`);
    expect(menu.status).toBe(200);
    expect((menu.body.items ?? []).some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    const quote = await http()
      .post('/api/v1/discover/quote')
      .send({
        variantId: variant.body.id,
        quantity: 1,
        type: 'HOME_DELIVERY',
        modifierGroups: [{ groupId: group.body.id, selections: [{ modifierId: addon.body.id, quantity: 1 }] }],
      });
    expect(quote.status).toBe(201);
    expect(quote.body.unitMerchandiseMinor).toBe('32400');
  });

  it('keeps Global Catalog copy independent after merchant edits', async () => {
    const { restaurant, ownerEmail, adminEmail } = await seedMerchant();
    const adminToken = await login(adminEmail);
    const merchantToken = await login(ownerEmail);

    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: uniq('Global North'), status: 'ACTIVE' });
    expect(catalog.status).toBe(201);

    const source = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'DEV Global Thali',
        description: 'Source copy',
        sourcePayload: {
          product: {
            variants: [
              { size: 'Regular', sku: 'G-REG', priceMinor: '24900', isDefault: true, available: true },
            ],
          },
        },
      });
    expect(source.status).toBe(201);

    const copied = await http()
      .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ restaurantId: restaurant.id, catalogId: catalog.body.id });
    expect(copied.status).toBe(201);

    const before = await http()
      .get(`/api/v1/platform-catalog/global-items/${source.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    expect(before.body.name).toBe('DEV Global Thali');

    const merchantItem = await http()
      .patch(`/api/v1/catalog/items/${copied.body.menuItemId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ name: 'Local Thali', isPublished: true });
    expect(merchantItem.status).toBe(200);
    expect(merchantItem.body.name).toBe('Local Thali');
    expect(merchantItem.body.globalSource.sourceItemId).toBe(source.body.id);

    const after = await http()
      .get(`/api/v1/platform-catalog/global-items/${source.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.name).toBe('DEV Global Thali');
    expect(after.body.description).toBe('Source copy');
  });

  it('rejects cross-merchant catalog writes and SUPER_ADMIN /catalog actors', async () => {
    const { restaurant, otherRestaurant, ownerEmail, otherEmail, adminEmail } = await seedMerchant();
    const token = await login(ownerEmail);
    const otherToken = await login(otherEmail);
    const adminToken = await login(adminEmail);

    const created = await http()
      .post('/api/v1/catalog/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ restaurantId: restaurant.id, name: uniq('Owned'), isPublished: false });
    expect(created.status).toBe(201);

    const otherWrite = await http()
      .patch(`/api/v1/catalog/items/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hijacked' });
    expect(otherWrite.status).toBeGreaterThanOrEqual(400);

    const otherRestaurantWrite = await http()
      .post('/api/v1/catalog/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ restaurantId: otherRestaurant.id, name: uniq('Cross'), isPublished: false });
    expect(otherRestaurantWrite.status).toBeGreaterThanOrEqual(400);

    const adminCatalog = await http()
      .post('/api/v1/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ restaurantId: restaurant.id, name: uniq('Admin'), isPublished: false });
    expect(adminCatalog.status).toBe(403);
  });
});
