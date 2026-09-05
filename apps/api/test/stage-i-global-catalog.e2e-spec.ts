import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Stage I slice — Super Admin Global Item Catalog + merchant Add from Global.
 * HTTP against the TEST database. Copy/materialization, not inheritance.
 * OD-I-DUP remains unchanged: the same Global Item may be copied more than once.
 * OD-I-TEMP is not implemented: there is no temp-local / commit path.
 */
describe('Stage I Global Catalog + Add from Global (HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const PASSWORD = 'MerchantSecret123!';
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const http = () => request(app.getHttpServer());

  const product = {
    variants: [
      {
        size: 'Regular',
        sku: 'GI-REG',
        priceMinor: '24900',
        currencyCode: 'INR',
        isDefault: true,
        available: true,
      },
      {
        size: 'Large',
        sku: 'GI-LRG',
        priceMinor: '34900',
        available: false,
      },
    ],
    addOnGroups: [
      {
        name: 'Spice',
        minSelect: 1,
        maxSelect: 1,
        allowQuantity: false,
        available: true,
        addOns: [
          {
            name: 'Mild',
            priceMinor: '0',
            isDefault: true,
            available: true,
            variantPrices: [{ sku: 'GI-LRG', priceMinor: '500' }],
          },
        ],
      },
    ],
    channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: true, priceOverrideMinor: '25900' }],
  };

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
    const menu = await prisma.menu.create({
      data: { merchantId: merchant.id, restaurantId: restaurant.id, name: uniq('Menu') },
    });
    const section = await prisma.menuSection.create({
      data: { menuId: menu.id, name: 'Mains', sortOrder: 1 },
    });
    const { email: ownerEmail } = await makeStaff({
      merchantId: merchant.id,
      staffRole: 'MERCHANT_OWNER',
    });
    const { email: staffEmail } = await makeStaff({
      merchantId: merchant.id,
      staffRole: 'MERCHANT_STAFF',
    });
    const { email: otherEmail } = await makeStaff({
      merchantId: other.id,
      staffRole: 'MERCHANT_OWNER',
    });
    return {
      merchant,
      restaurant,
      other,
      otherRestaurant,
      menu,
      section,
      ownerEmail,
      staffEmail,
      otherEmail,
    };
  }

  async function seedAdmin() {
    const { email } = await makeStaff({ merchantId: null, staffRole: 'SUPER_ADMIN' });
    return login(email);
  }

  it('lets SUPER_ADMIN create, list, and read a platform-scoped Global Catalog', async () => {
    const token = await seedAdmin();
    const created = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: uniq('Global North Indian'),
        description: 'Reusable source',
        cuisineType: 'North Indian',
        status: 'ACTIVE',
        isGlobal: true,
        taxRate: 5,
      });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
    expect(created.body.name).toContain('Global North Indian');
    expect(created.body).not.toHaveProperty('isGlobal');
    expect(created.body).not.toHaveProperty('taxRate');

    const listed = await http()
      .get('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.map((row: { id: string }) => row.id)).toContain(created.body.id);

    const detail = await http()
      .get(`/api/v1/platform-catalog/global/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.catalog.id).toBe(created.body.id);
    expect(detail.body.categories).toEqual([]);
    expect(detail.body.items).toEqual([]);
  });

  it('lets SUPER_ADMIN create a category and item that belong to the requested catalog', async () => {
    const token = await seedAdmin();
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: uniq('Catalog') });
    const other = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: uniq('Other') });
    expect(catalog.status).toBe(201);

    const category = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mains', description: 'Main plates' });
    expect(category.status).toBe(201);
    expect(category.body.catalogId).toBe(catalog.body.id);

    const wrongCategory = await http()
      .post(`/api/v1/platform-catalog/global/${other.body.id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Wrong', categoryId: category.body.id });
    expect(wrongCategory.status).toBe(400);

    const item = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Global Paneer',
        description: 'Source paneer',
        categoryId: category.body.id,
        sourcePayload: { product },
      });
    expect(item.status).toBe(201);
    expect(item.body.catalogId).toBe(catalog.body.id);
    expect(item.body.categoryId).toBe(category.body.id);

    const items = await http()
      .get(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${token}`);
    expect(items.body.map((row: { id: string }) => row.id)).toContain(item.body.id);
  });

  it('rejects Global Catalog mutation by merchant roles and without a token', async () => {
    const seeded = await seedMerchant();
    const owner = await login(seeded.ownerEmail);
    const staff = await login(seeded.staffEmail);
    const admin = await seedAdmin();
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: uniq('Locked') });

    for (const token of [owner, staff]) {
      expect(
        (
          await http()
            .post('/api/v1/platform-catalog/global')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Nope' })
        ).status,
      ).toBe(403);
      expect(
        (
          await http()
            .patch(`/api/v1/platform-catalog/global/${catalog.body.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Hijack' })
        ).status,
      ).toBe(403);
      expect(
        (
          await http()
            .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Nope' })
        ).status,
      ).toBe(403);
    }
    expect((await http().post('/api/v1/platform-catalog/global').send({ name: 'Anon' })).status).toBe(
      401,
    );

    const discovered = await http()
      .get('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${owner}`);
    expect(discovered.status).toBe(200);
  });

  it('lets SUPER_ADMIN edit catalog metadata without a Global Item PATCH', async () => {
    const token = await seedAdmin();
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: uniq('Draft'), status: 'DRAFT' });
    const patched = await http()
      .patch(`/api/v1/platform-catalog/global/${catalog.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Published Source', status: 'ACTIVE', description: 'Updated' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Published Source');
    expect(patched.body.status).toBe('ACTIVE');
  });

  it('materializes a permitted Global Item into the authenticated merchant restaurant', async () => {
    const seeded = await seedMerchant();
    const admin = await seedAdmin();
    const owner = await login(seeded.ownerEmail);
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: uniq('Source') });
    const source = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        name: 'Global Thali',
        description: 'Reusable thali',
        sourcePayload: { product },
      });

    const copied = await http()
      .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
      .set('Authorization', `Bearer ${owner}`)
      .send({
        restaurantId: seeded.restaurant.id,
        catalogId: catalog.body.id,
        menuSectionId: seeded.section.id,
        merchantId: seeded.other.id,
      });
    expect(copied.status).toBe(201);
    expect(copied.body.menuItemId).toBeTruthy();
    expect(copied.body.materializationId).toBeTruthy();

    const detail = await http()
      .get(`/api/v1/catalog/items/${copied.body.menuItemId}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(detail.status).toBe(200);
    expect(detail.body.merchantId).toBe(seeded.merchant.id);
    expect(detail.body.restaurantId).toBe(seeded.restaurant.id);
    expect(detail.body.menuSectionId).toBe(seeded.section.id);
    expect(detail.body.isPublished).toBe(false);
    expect(detail.body.availability).toBe('AVAILABLE');
    expect(detail.body.name).toBe('Global Thali');
    expect(detail.body.globalSource).toEqual({
      sourceItemId: source.body.id,
      sourceItemName: 'Global Thali',
      catalogId: catalog.body.id,
      catalogName: catalog.body.name,
    });

    const variants = detail.body.variants as Array<{
      size: string;
      sku: string;
      priceMinor: string | number;
      available: boolean;
    }>;
    expect(variants).toHaveLength(2);
    expect(variants.find((row) => row.sku === 'GI-REG')).toMatchObject({
      size: 'Regular',
      available: true,
    });
    expect(String(variants.find((row) => row.sku === 'GI-REG')?.priceMinor)).toBe('24900');
    expect(variants.find((row) => row.sku === 'GI-LRG')?.available).toBe(false);

    const group = detail.body.addOnGroups[0];
    expect(group.name).toBe('Spice');
    expect(group.minSelect).toBe(1);
    expect(group.maxSelect).toBe(1);
    expect(group.addOns[0].name).toBe('Mild');
    expect(group.addOns[0].variantPrices).toHaveLength(1);
    expect(String(group.addOns[0].variantPrices[0].priceMinor)).toBe('500');

    expect(detail.body.channelConfigs[0]).toMatchObject({
      channel: 'HOME_DELIVERY',
      enabled: true,
    });
    expect(String(detail.body.channelConfigs[0].priceOverrideMinor)).toBe('25900');

    const links = await prisma.$queryRaw<Array<{ source_item_id: string; menu_item_id: string }>>`
      SELECT "source_item_id", "menu_item_id"
      FROM "platform_catalog_item_materializations"
      WHERE "id" = ${copied.body.materializationId}::uuid
    `;
    expect(links[0]).toEqual({
      source_item_id: source.body.id,
      menu_item_id: copied.body.menuItemId,
    });

    expect((await http().get(`/api/v1/discover/items/${copied.body.menuItemId}`)).status).toBe(404);
  });

  it('does not trust client restaurantId or allow materialization into another restaurant', async () => {
    const seeded = await seedMerchant();
    const admin = await seedAdmin();
    const owner = await login(seeded.ownerEmail);
    const other = await login(seeded.otherEmail);
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: uniq('Source') });
    const source = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Global Dal', sourcePayload: { product } });

    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
          .set('Authorization', `Bearer ${owner}`)
          .send({ restaurantId: seeded.otherRestaurant.id, merchantId: seeded.other.id })
      ).status,
    ).toBe(403);

    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
          .set('Authorization', `Bearer ${other}`)
          .send({ restaurantId: seeded.restaurant.id })
      ).status,
    ).toBe(403);

    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
          .set('Authorization', `Bearer ${await seedAdmin()}`)
          .send({ restaurantId: seeded.restaurant.id })
      ).status,
    ).toBe(403);
  });

  it('rejects source/catalog/section mismatches and missing records', async () => {
    const seeded = await seedMerchant();
    const admin = await seedAdmin();
    const owner = await login(seeded.ownerEmail);
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: uniq('A') });
    const otherCatalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: uniq('B') });
    const source = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Only in A' });

    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
          .set('Authorization', `Bearer ${owner}`)
          .send({ restaurantId: seeded.restaurant.id, catalogId: otherCatalog.body.id })
      ).status,
    ).toBe(400);

    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/11111111-1111-4111-8111-111111111111/materialize`)
          .set('Authorization', `Bearer ${owner}`)
          .send({ restaurantId: seeded.restaurant.id })
      ).status,
    ).toBe(404);

    expect(
      (
        await http()
          .get('/api/v1/platform-catalog/global/11111111-1111-4111-8111-111111111111')
          .set('Authorization', `Bearer ${owner}`)
      ).status,
    ).toBe(404);

    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
          .set('Authorization', `Bearer ${owner}`)
          .send({
            restaurantId: '11111111-1111-4111-8111-111111111111',
          })
      ).status,
    ).toBe(404);

    const otherMenu = await prisma.menu.create({
      data: {
        merchantId: seeded.other.id,
        restaurantId: seeded.otherRestaurant.id,
        name: uniq('OtherMenu'),
      },
    });
    const foreignSection = await prisma.menuSection.create({
      data: { menuId: otherMenu.id, name: 'Foreign', sortOrder: 1 },
    });
    expect(
      (
        await http()
          .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
          .set('Authorization', `Bearer ${owner}`)
          .send({
            restaurantId: seeded.restaurant.id,
            menuSectionId: foreignSection.id,
          })
      ).status,
    ).toBe(400);
  });

  it('keeps the merchant copy independent and allows a second copy of the same Global Item', async () => {
    const seeded = await seedMerchant();
    const admin = await seedAdmin();
    const owner = await login(seeded.ownerEmail);
    const catalog = await http()
      .post('/api/v1/platform-catalog/global')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: uniq('Source') });
    const source = await http()
      .post(`/api/v1/platform-catalog/global/${catalog.body.id}/items`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Shared Source', description: 'Original', sourcePayload: { product } });

    const first = await http()
      .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ restaurantId: seeded.restaurant.id, catalogId: catalog.body.id });
    const second = await http()
      .post(`/api/v1/platform-catalog/global-items/${source.body.id}/materialize`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ restaurantId: seeded.restaurant.id, catalogId: catalog.body.id });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.menuItemId).not.toBe(second.body.menuItemId);

    const edited = await http()
      .patch(`/api/v1/catalog/items/${first.body.menuItemId}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Merchant Thali', description: 'Local rewrite', isPublished: true });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('Merchant Thali');
    expect(edited.body.isPublished).toBe(true);

    const global = await http()
      .get(`/api/v1/platform-catalog/global-items/${source.body.id}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(global.body.name).toBe('Shared Source');
    expect(global.body.description).toBe('Original');

    const stillUnpublished = await http()
      .get(`/api/v1/catalog/items/${second.body.menuItemId}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(stillUnpublished.body.name).toBe('Shared Source');
    expect(stillUnpublished.body.isPublished).toBe(false);

    const published = await http().get(`/api/v1/discover/items/${first.body.menuItemId}`);
    expect(published.status).toBe(200);
    expect(published.body.name).toBe('Merchant Thali');
    expect(published.body).not.toHaveProperty('globalSource');
    expect(published.body).not.toHaveProperty('catalogId');
  });

  it('lists only restaurants in the authenticated merchant scope', async () => {
    const seeded = await seedMerchant();
    const owner = await login(seeded.ownerEmail);
    const other = await login(seeded.otherEmail);
    const admin = await seedAdmin();

    const mine = await http()
      .get('/api/v1/catalog/restaurants')
      .set('Authorization', `Bearer ${owner}`);
    expect(mine.status).toBe(200);
    expect(mine.body.map((row: { id: string }) => row.id)).toEqual([seeded.restaurant.id]);

    const theirs = await http()
      .get('/api/v1/catalog/restaurants')
      .set('Authorization', `Bearer ${other}`);
    expect(theirs.body.map((row: { id: string }) => row.id)).toEqual([seeded.otherRestaurant.id]);

    expect(
      (await http().get('/api/v1/catalog/restaurants').set('Authorization', `Bearer ${admin}`))
        .status,
    ).toBe(403);
  });
});
