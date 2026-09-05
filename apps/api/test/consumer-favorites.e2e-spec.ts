import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 97 — consumer favorites HTTP (restaurant + menu-item only).
 */
describe('Consumer favorites (doc 97 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = 'Secret123!';
  const http = () => request(app.getHttpServer());
  const missingId = '00000000-0000-4000-8000-000000000099';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const body = { phoneCountryCode: '+91', phone, password: PASSWORD };
    const created = await http().post('/api/v1/auth/consumer/register').send(body);
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send(body);
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, userId: created.body.id as string };
  }

  async function seedTargets() {
    const merchant = await prisma.merchant.create({
      data: { legalName: `FavBiz-${Date.now()}` },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        merchantId: merchant.id,
        name: `FavKitchen-${Date.now()}`,
        city: 'Pune',
        status: 'ACTIVE',
      },
    });
    const item = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: `FavPaneer-${Date.now()}`,
        availability: 'AVAILABLE',
        isPublished: true,
      },
    });
    return { restaurantId: restaurant.id, itemId: item.id };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('rejects unauthenticated GET, PUT, and DELETE', async () => {
    expect((await http().get('/api/v1/me/favorites')).status).toBe(401);
    expect(
      (
        await http()
          .put('/api/v1/me/favorites')
          .send({ targetType: 'RESTAURANT', targetId: missingId })
      ).status,
    ).toBe(401);
    expect((await http().delete(`/api/v1/me/favorites/RESTAURANT/${missingId}`)).status).toBe(401);
  });

  it('adds restaurant and menu item, stays idempotent, and persists after reload', async () => {
    const a = await registerConsumer();
    const { restaurantId, itemId } = await seedTargets();

    const addRest = await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'RESTAURANT', targetId: restaurantId });
    expect(addRest.status).toBe(200);
    expect(addRest.body).toMatchObject({
      targetType: 'RESTAURANT',
      targetId: restaurantId,
      restaurant: { id: restaurantId },
      item: null,
    });

    const againRest = await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'RESTAURANT', targetId: restaurantId });
    expect(againRest.status).toBe(200);
    expect(againRest.body.id).toBe(addRest.body.id);

    const addItem = await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'MENU_ITEM', targetId: itemId });
    expect(addItem.status).toBe(200);
    expect(addItem.body).toMatchObject({
      targetType: 'MENU_ITEM',
      targetId: itemId,
      item: { id: itemId, restaurantId },
      restaurant: null,
    });

    const againItem = await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'MENU_ITEM', targetId: itemId });
    expect(againItem.status).toBe(200);
    expect(againItem.body.id).toBe(addItem.body.id);

    const listed = await http().get('/api/v1/me/favorites').set(auth(a.token));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(2);
    expect(listed.body.data.map((row: { targetId: string }) => row.targetId).sort()).toEqual(
      [restaurantId, itemId].sort(),
    );

    const restOnly = await http()
      .get('/api/v1/me/favorites')
      .query({ targetType: 'RESTAURANT' })
      .set(auth(a.token));
    expect(restOnly.body.data).toHaveLength(1);
    expect(restOnly.body.data[0].targetId).toBe(restaurantId);

    const itemOnly = await http()
      .get('/api/v1/me/favorites')
      .query({ targetType: 'MENU_ITEM' })
      .set(auth(a.token));
    expect(itemOnly.body.data).toHaveLength(1);
    expect(itemOnly.body.data[0].targetId).toBe(itemId);

    const stored = await prisma.favourite.findMany({ where: { userId: a.userId } });
    expect(stored).toHaveLength(2);
  });

  it('removes restaurant and item and treats a second delete as a no-op', async () => {
    const a = await registerConsumer();
    const { restaurantId, itemId } = await seedTargets();
    await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'RESTAURANT', targetId: restaurantId });
    await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'MENU_ITEM', targetId: itemId });

    const delRest = await http()
      .delete(`/api/v1/me/favorites/RESTAURANT/${restaurantId}`)
      .set(auth(a.token));
    expect(delRest.status).toBe(200);
    expect(delRest.body).toEqual({ targetType: 'RESTAURANT', targetId: restaurantId });

    const again = await http()
      .delete(`/api/v1/me/favorites/RESTAURANT/${restaurantId}`)
      .set(auth(a.token));
    expect(again.status).toBe(200);

    const delItem = await http()
      .delete(`/api/v1/me/favorites/MENU_ITEM/${itemId}`)
      .set(auth(a.token));
    expect(delItem.status).toBe(200);

    const listed = await http().get('/api/v1/me/favorites').set(auth(a.token));
    expect(listed.body.data).toEqual([]);
  });

  it('rejects invalid types, unknown fields, client userId, and missing targets', async () => {
    const a = await registerConsumer();
    const { restaurantId } = await seedTargets();

    expect(
      (
        await http()
          .put('/api/v1/me/favorites')
          .set(auth(a.token))
          .send({ targetType: 'OFFER', targetId: restaurantId })
      ).status,
    ).toBe(400);
    expect(
      (await http().get('/api/v1/me/favorites').query({ targetType: 'OFFER' }).set(auth(a.token)))
        .status,
    ).toBe(400);
    expect(
      (await http().delete(`/api/v1/me/favorites/OFFER/${restaurantId}`).set(auth(a.token))).status,
    ).toBe(400);
    expect(
      (
        await http()
          .put('/api/v1/me/favorites')
          .set(auth(a.token))
          .send({ targetType: 'RESTAURANT', targetId: restaurantId, userId: a.userId })
      ).status,
    ).toBe(400);
    expect(
      (
        await http()
          .put('/api/v1/me/favorites')
          .set(auth(a.token))
          .send({ targetType: 'RESTAURANT', targetId: restaurantId, extra: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await http()
          .put('/api/v1/me/favorites')
          .set(auth(a.token))
          .send({ targetType: 'RESTAURANT', targetId: missingId })
      ).status,
    ).toBe(404);
    expect(
      (
        await http()
          .put('/api/v1/me/favorites')
          .set(auth(a.token))
          .send({ targetType: 'MENU_ITEM', targetId: missingId })
      ).status,
    ).toBe(404);
    expect(
      (await http().delete(`/api/v1/me/favorites/RESTAURANT/${missingId}`).set(auth(a.token)))
        .status,
    ).toBe(404);
    expect(
      (await http().delete(`/api/v1/me/favorites/MENU_ITEM/${missingId}`).set(auth(a.token)))
        .status,
    ).toBe(404);
  });

  it('isolates consumers: A cannot see or mutate B', async () => {
    const a = await registerConsumer();
    const b = await registerConsumer();
    const { restaurantId, itemId } = await seedTargets();

    await http()
      .put('/api/v1/me/favorites')
      .set(auth(b.token))
      .send({ targetType: 'RESTAURANT', targetId: restaurantId });
    await http()
      .put('/api/v1/me/favorites')
      .set(auth(b.token))
      .send({ targetType: 'MENU_ITEM', targetId: itemId });

    const aList = await http().get('/api/v1/me/favorites').set(auth(a.token));
    expect(aList.body.data).toEqual([]);

    await http()
      .put('/api/v1/me/favorites')
      .set(auth(a.token))
      .send({ targetType: 'RESTAURANT', targetId: restaurantId, userId: b.userId })
      .expect(400);

    const aDelete = await http()
      .delete(`/api/v1/me/favorites/RESTAURANT/${restaurantId}`)
      .set(auth(a.token));
    expect(aDelete.status).toBe(200);

    const bList = await http().get('/api/v1/me/favorites').set(auth(b.token));
    expect(bList.body.data).toHaveLength(2);
    expect(bList.body.data.every((row: { userId?: string }) => row.userId === undefined)).toBe(
      true,
    );
    const stored = await prisma.favourite.findMany({ where: { userId: b.userId } });
    expect(stored).toHaveLength(2);
  });
});
