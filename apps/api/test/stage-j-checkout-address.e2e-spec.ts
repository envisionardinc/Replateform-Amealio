import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 114 first slice — checkout addressId + immutable deliveryAddressSnapshot.
 * HOME_DELIVERY / CATERING require an owned address. DINE_IN / TAKE_AWAY do not.
 */
describe('Stage J checkout address snapshot (doc 114 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = 'Secret123!';
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

  async function seedRestaurant() {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('Kitchen'), city: 'Pune', status: 'ACTIVE' },
    });
    const item = await prisma.menuItem.create({
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
    return { restaurant, variantId: item.variants[0].id };
  }

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const body = { phoneCountryCode: '+91', phone, password: PASSWORD };
    const created = await http().post('/api/v1/auth/consumer/register').send(body);
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send(body);
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, userId: created.body.id as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function addCart(token: string, variantId: string, restaurantId: string, type: string) {
    const added = await http()
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ variantId, restaurantId, quantity: 1, type });
    expect([200, 201]).toContain(added.status);
  }

  async function createAddress(token: string, line1 = '12 MG Road') {
    const created = await http().post('/api/v1/me/addresses').set(auth(token)).send({
      label: 'Home',
      line1,
      city: 'Pune',
      pinCode: '411001',
    });
    expect(created.status).toBe(201);
    return created.body as { id: string; line1: string };
  }

  it('rejects HOME_DELIVERY and CATERING without addressId', async () => {
    const live = await seedRestaurant();
    const consumer = await registerConsumer();
    await addCart(consumer.token, live.variantId, live.restaurant.id, 'HOME_DELIVERY');

    const missing = await http().post('/api/v1/checkout').set(auth(consumer.token)).send({
      restaurantId: live.restaurant.id,
      type: 'HOME_DELIVERY',
      settlement: 'COD',
    });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toMatch(/addressId/i);

    const catering = await http().post('/api/v1/checkout').set(auth(consumer.token)).send({
      restaurantId: live.restaurant.id,
      type: 'CATERING',
      settlement: 'COD',
    });
    expect(catering.status).toBe(400);
  });

  it('rejects foreign and deleted addresses', async () => {
    const live = await seedRestaurant();
    const owner = await registerConsumer();
    const other = await registerConsumer();
    const owned = await createAddress(owner.token);
    await addCart(other.token, live.variantId, live.restaurant.id, 'HOME_DELIVERY');

    const foreign = await http().post('/api/v1/checkout').set(auth(other.token)).send({
      restaurantId: live.restaurant.id,
      type: 'HOME_DELIVERY',
      settlement: 'COD',
      addressId: owned.id,
    });
    expect(foreign.status).toBe(404);

    const missing = await http().post('/api/v1/checkout').set(auth(other.token)).send({
      restaurantId: live.restaurant.id,
      type: 'HOME_DELIVERY',
      settlement: 'COD',
      addressId: missingId,
    });
    expect(missing.status).toBe(404);

    const doomed = await createAddress(other.token, '9 Delete Lane');
    expect((await http().delete(`/api/v1/me/addresses/${doomed.id}`).set(auth(other.token))).status).toBe(
      200,
    );
    const deleted = await http().post('/api/v1/checkout').set(auth(other.token)).send({
      restaurantId: live.restaurant.id,
      type: 'HOME_DELIVERY',
      settlement: 'COD',
      addressId: doomed.id,
    });
    expect(deleted.status).toBe(404);
  });

  it('snapshots HOME_DELIVERY address and ignores later book edits', async () => {
    const live = await seedRestaurant();
    const consumer = await registerConsumer();
    const address = await createAddress(consumer.token, '12 MG Road');
    await addCart(consumer.token, live.variantId, live.restaurant.id, 'HOME_DELIVERY');

    const key = uniq('idem');
    const body = {
      restaurantId: live.restaurant.id,
      type: 'HOME_DELIVERY',
      settlement: 'COD',
      addressId: address.id,
    };
    const first = await http()
      .post('/api/v1/checkout')
      .set(auth(consumer.token))
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.order.deliveryAddressId).toBe(address.id);
    expect(first.body.order.deliveryAddressSnapshot).toMatchObject({
      schema: 'deliveryAddress.v1',
      sourceAddressId: address.id,
      line1: '12 MG Road',
      city: 'Pune',
      pinCode: '411001',
    });
    expect(first.body.order.deliveryAddressSnapshot.snapshottedAt).toBeTruthy();

    const replay = await http()
      .post('/api/v1/checkout')
      .set(auth(consumer.token))
      .set('Idempotency-Key', key)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect(replay.body.order.deliveryAddressSnapshot.line1).toBe('12 MG Road');

    const patched = await http()
      .patch(`/api/v1/me/addresses/${address.id}`)
      .set(auth(consumer.token))
      .send({ line1: '99 Changed Road' });
    expect(patched.status).toBe(200);
    expect(patched.body.line1).toBe('99 Changed Road');

    const got = await http()
      .get(`/api/v1/me/orders/${first.body.order.id}`)
      .set(auth(consumer.token));
    expect(got.status).toBe(200);
    expect(got.body.deliveryAddressSnapshot.line1).toBe('12 MG Road');
    expect(got.body.deliveryAddressSnapshot.line1).not.toBe(patched.body.line1);

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: first.body.order.id },
    });
    const snap = persisted.deliveryAddressSnapshot as { line1?: string };
    expect(snap.line1).toBe('12 MG Road');
  });

  it('lets DINE_IN and TAKE_AWAY checkout without addressId', async () => {
    const live = await seedRestaurant();
    const consumer = await registerConsumer();
    await addCart(consumer.token, live.variantId, live.restaurant.id, 'TAKE_AWAY');

    const takeAway = await http().post('/api/v1/checkout').set(auth(consumer.token)).send({
      restaurantId: live.restaurant.id,
      type: 'TAKE_AWAY',
      settlement: 'COD',
    });
    expect(takeAway.status).toBe(201);
    expect(takeAway.body.order.deliveryAddressSnapshot).toBeNull();
    expect(takeAway.body.order.deliveryAddressId).toBeNull();

    await addCart(consumer.token, live.variantId, live.restaurant.id, 'DINE_IN');
    const dineIn = await http().post('/api/v1/checkout').set(auth(consumer.token)).send({
      restaurantId: live.restaurant.id,
      type: 'DINE_IN',
      settlement: 'COD',
    });
    expect(dineIn.status).toBe(201);
    expect(dineIn.body.order.deliveryAddressSnapshot).toBeNull();
  });
});
