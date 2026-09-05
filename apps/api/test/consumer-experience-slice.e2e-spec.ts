import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 92 first consumer slice — the HTTP path apps/web uses.
 * Asserts public browse, session, menu publication, cart pricing, checkout
 * idempotency, and order status. Prepaid Razorpay verify stays in doc 90.
 */
describe('Consumer experience slice (doc 92 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = 'Secret123!';
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

  async function seedRestaurant(over: { status?: string; city?: string } = {}) {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: {
        merchantId: merchant.id,
        name: uniq('Kitchen'),
        city: over.city ?? 'Pune',
        status: over.status ?? 'ACTIVE',
      },
    });
    const published = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: 'Idli',
        availability: 'AVAILABLE',
        isPublished: true,
        variants: {
          create: [{ size: 'Reg', priceMinor: 10000n, currencyCode: 'INR', available: true }],
        },
      },
      include: { variants: true },
    });
    const hidden = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: 'Secret',
        availability: 'AVAILABLE',
        isPublished: false,
        variants: {
          create: [{ size: 'Reg', priceMinor: 5000n, currencyCode: 'INR', available: true }],
        },
      },
      include: { variants: true },
    });
    const sold = await prisma.menuItem.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        name: 'Sold Dosa',
        availability: 'SOLDOUT',
        isPublished: true,
        variants: {
          create: [{ size: 'Reg', priceMinor: 12000n, currencyCode: 'INR', available: false }],
        },
      },
      include: { variants: true },
    });
    return { merchant, restaurant, published, hidden, sold };
  }

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const body = { phoneCountryCode: '+91', phone, password: PASSWORD };
    const created = await http().post('/api/v1/auth/consumer/register').send(body);
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send(body);
    expect(login.status).toBe(200);
    expect(login.body.tokenType).toBe('Bearer');
    const me = await http()
      .get('/api/v1/auth/consumer/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(created.body.id);
    return { token: login.body.accessToken as string, userId: created.body.id as string };
  }

  it('lets guests browse canonical home across merchants and hides unavailable restaurants', async () => {
    const a = await seedRestaurant({ city: 'Pune' });
    const b = await seedRestaurant({ city: 'Bengaluru' });
    const closed = await seedRestaurant({ status: 'CLOSED' });

    const home = await http().get('/api/v1/discover/home');
    expect(home.status).toBe(200);
    expect(home.body.source).toBe('CANONICAL');
    const ids = home.body.sections[0].restaurants.map((r: { id: string }) => r.id);
    expect(ids).toContain(a.restaurant.id);
    expect(ids).toContain(b.restaurant.id);
    expect(ids).not.toContain(closed.restaurant.id);

    expect((await http().get(`/api/v1/discover/restaurants/${closed.restaurant.id}`)).status).toBe(
      404,
    );
    expect(
      (await http().get('/api/v1/discover/restaurants').query({ q: 'no-such-place' })).body.data,
    ).toEqual([]);
  });

  it('returns published menu/item and 404s unpublished items', async () => {
    const live = await seedRestaurant();
    const menu = await http().get(`/api/v1/discover/restaurants/${live.restaurant.id}/menu`);
    expect(menu.status).toBe(200);
    expect(menu.body.items.map((i: { name: string }) => i.name)).toEqual(
      expect.arrayContaining(['Idli', 'Sold Dosa']),
    );
    expect(menu.body.items.map((i: { name: string }) => i.name)).not.toContain('Secret');

    expect((await http().get(`/api/v1/discover/items/${live.published.id}`)).status).toBe(200);
    expect((await http().get(`/api/v1/discover/items/${live.hidden.id}`)).status).toBe(404);
  });

  it('requires a consumer session for cart/checkout and prices on the server', async () => {
    const live = await seedRestaurant();
    const variantId = live.published.variants[0].id;

    expect((await http().get('/api/v1/cart')).status).toBe(401);
    expect((await http().post('/api/v1/checkout').send({ settlement: 'COD' })).status).toBe(401);

    const consumer = await registerConsumer();
    const added = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        variantId,
        restaurantId: live.restaurant.id,
        quantity: 2,
        type: 'HOME_DELIVERY',
      });
    expect([200, 201]).toContain(added.status);
    expect(added.body.subtotalMinor).toBe('20000');

    const soldOut = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ variantId: live.sold.variants[0].id, quantity: 1 });
    expect(soldOut.status).toBe(400);

    const unpublished = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ variantId: live.hidden.variants[0].id, quantity: 1 });
    expect(unpublished.status).toBe(400);
  });

  it('checks out COD idempotently and returns order status to the consumer', async () => {
    const live = await seedRestaurant();
    const consumer = await registerConsumer();
    await http().post('/api/v1/cart/items').set('Authorization', `Bearer ${consumer.token}`).send({
      variantId: live.published.variants[0].id,
      restaurantId: live.restaurant.id,
      quantity: 1,
      type: 'HOME_DELIVERY',
    });

    const key = `web-slice-${Date.now()}`;
    const body = {
      restaurantId: live.restaurant.id,
      type: 'HOME_DELIVERY',
      settlement: 'COD',
    };
    const first = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${consumer.token}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.order.id).toBeTruthy();
    expect(first.body.order.grandTotalMinor).toBe('10000');

    const retry = await http()
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${consumer.token}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.order.id).toBe(first.body.order.id);

    const got = await http()
      .get(`/api/v1/me/orders/${first.body.order.id}`)
      .set('Authorization', `Bearer ${consumer.token}`);
    expect(got.status).toBe(200);
    expect(got.body.status).toBeTruthy();
    expect(got.body.id).toBe(first.body.order.id);
  });
});
