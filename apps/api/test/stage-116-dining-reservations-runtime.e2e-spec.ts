import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Stage 116 Slice 1 — Dining / Reservations runtime over existing SeatingRequest.
 * No schema change. Consumer JWT /diner + merchant staff /merchant/diner.
 */
describe('Stage 116 dining / reservations runtime (HTTP e2e)', () => {
  jest.setTimeout(120000);
  let app: INestApplication;
  let prisma: PrismaService;

  const STAFF_PASSWORD = 'MerchantSecret123!';
  const CONSUMER_PASSWORD = 'Secret123!';
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
        secretHash: await bcrypt.hash(STAFF_PASSWORD, 10),
      },
    });
    return { staff, email };
  }

  async function loginStaff(email: string): Promise<string> {
    const res = await http().post('/api/v1/auth/staff/login').send({
      email,
      password: STAFF_PASSWORD,
    });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function registerConsumer(): Promise<{ token: string; userId: string }> {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const created = await http().post('/api/v1/auth/consumer/register').send({
      phoneCountryCode: '+91',
      phone,
      password: CONSUMER_PASSWORD,
    });
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send({
      phoneCountryCode: '+91',
      phone,
      password: CONSUMER_PASSWORD,
    });
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, userId: created.body.id as string };
  }

  async function enableSeating(merchantId: string, restaurantId: string, extra: Record<string, unknown> = {}) {
    await prisma.subscription.create({
      data: {
        merchantId,
        restaurantId,
        productType: 'SEATING',
        status: 'ACTIVE',
        config: {
          casual_dining: true,
          casual_dining_status: {
            seating: {
              value: true,
              reservation: { value: true },
              walkin_waitlist: { value: true },
              ...extra,
            },
          },
        },
      },
    });
  }

  async function seedWorld() {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('Kitchen'), city: 'Pune', status: 'ACTIVE' },
    });
    const other = await prisma.merchant.create({ data: { legalName: uniq('Other') } });
    const otherRestaurant = await prisma.restaurant.create({
      data: { merchantId: other.id, name: uniq('OtherKitchen'), status: 'ACTIVE' },
    });
    const area = await prisma.seatingArea.create({
      data: { restaurantId: restaurant.id, name: 'Main' },
    });
    const table = await prisma.restaurantTable.create({
      data: { seatingAreaId: area.id, code: 'T1', capacity: 4, status: 'AVAILABLE' },
    });
    const table2 = await prisma.restaurantTable.create({
      data: { seatingAreaId: area.id, code: 'T2', capacity: 4, status: 'AVAILABLE' },
    });
    const otherArea = await prisma.seatingArea.create({
      data: { restaurantId: otherRestaurant.id, name: 'Main' },
    });
    const otherTable = await prisma.restaurantTable.create({
      data: { seatingAreaId: otherArea.id, code: 'T1', capacity: 4, status: 'AVAILABLE' },
    });
    const { email: ownerEmail } = await makeStaff({
      merchantId: merchant.id,
      staffRole: 'MERCHANT_OWNER',
    });
    const { email: otherEmail } = await makeStaff({
      merchantId: other.id,
      staffRole: 'MERCHANT_OWNER',
    });
    await enableSeating(merchant.id, restaurant.id);
    return {
      merchant,
      restaurant,
      other,
      otherRestaurant,
      table,
      table2,
      otherTable,
      ownerEmail,
      otherEmail,
    };
  }

  it('lets an authenticated consumer create, view, and cancel their own diner request', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.tableId).toBeNull();
    expect(created.body.type).toBe('WAITLIST');
    expect(created.body.userId).toBeUndefined();
    expect(created.body.merchantId).toBeUndefined();
    expect(created.body.canCancel).toBe(true);

    const mine = await http().get('/api/v1/diner').set('Authorization', `Bearer ${consumer.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].id).toBe(created.body.id);

    const got = await http()
      .get(`/api/v1/diner/${created.body.id}`)
      .set('Authorization', `Bearer ${consumer.token}`);
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(created.body.id);

    const cancelled = await http()
      .patch(`/api/v1/diner/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.canCancel).toBe(false);
  });

  it('rejects unauthenticated consumer create and blocks cross-user view/cancel', async () => {
    const world = await seedWorld();
    const owner = await registerConsumer();
    const other = await registerConsumer();

    await http()
      .post('/api/v1/diner')
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 })
      .expect(401);

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 3 });
    expect(created.status).toBe(201);

    const peek = await http()
      .get(`/api/v1/diner/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(peek.status).toBe(404);

    const steal = await http()
      .patch(`/api/v1/diner/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({});
    expect(steal.status).toBe(404);

    const still = await prisma.seatingRequest.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(still.status).toBe('PENDING');
    expect(still.userId).toBe(owner.userId);
  });

  it('does not let the client choose occupancy, ownership, or WALK_IN vs WAITLIST', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();

    const rejected = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        restaurantId: world.restaurant.id,
        intent: 'SEATING',
        partySize: 2,
        type: 'WALK_IN',
        status: 'SEATED',
        merchantId: world.other.id,
        userId: '00000000-0000-0000-0000-000000000099',
        tableId: world.table.id,
      });
    expect(rejected.status).toBe(400);
  });

  it('runs merchant pending → accepted → seated → completed and rejects invalid transitions', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();
    const token = await loginStaff(world.ownerEmail);

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(created.status).toBe(201);

    const pending = await http()
      .get(`/api/v1/merchant/diner?restaurantId=${world.restaurant.id}&status=PENDING`)
      .set('Authorization', `Bearer ${token}`);
    expect(pending.status).toBe(200);
    expect(pending.body.data.map((r: { id: string }) => r.id)).toContain(created.body.id);

    await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId: world.table.id })
      .expect(400);

    await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const accepted = await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('NOT_SEATED');

    await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const seated = await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId: world.table.id });
    expect(seated.status).toBe(200);
    expect(seated.body.status).toBe('SEATED');
    expect(seated.body.tableId).toBe(world.table.id);
    expect(seated.body.tableCode).toBe('T1');

    const table = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: world.table.id } });
    expect(table.status).toBe('OCCUPIED');

    const completed = await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('COMPLETED');

    const dirty = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: world.table.id } });
    expect(dirty.status).toBe('DIRTY');

    await http()
      .patch(`/api/v1/diner/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({})
      .expect(400);

    await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('keeps diner queues merchant-scoped and rejects unauthorized staff', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();
    const ownerToken = await loginStaff(world.ownerEmail);
    const otherToken = await loginStaff(world.otherEmail);

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(created.status).toBe(201);

    const leak = await http()
      .get(`/api/v1/merchant/diner?restaurantId=${world.restaurant.id}&status=PENDING`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(leak.status).toBe(403);

    await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await http()
      .get(`/api/v1/merchant/diner?restaurantId=${world.restaurant.id}`)
      .expect(401);

    await http()
      .patch(`/api/v1/merchant/diner/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(401);

    const bodyMerchant = await http()
      .get(`/api/v1/merchant/diner?restaurantId=${world.otherRestaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(bodyMerchant.status).toBe(403);
  });

  it('assigns only an available in-scope table and prevents double assignment', async () => {
    const world = await seedWorld();
    const first = await registerConsumer();
    const second = await registerConsumer();
    const token = await loginStaff(world.ownerEmail);

    const a = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    const b = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${second.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    await http()
      .patch(`/api/v1/merchant/diner/${a.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await http()
      .patch(`/api/v1/merchant/diner/${b.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await http()
      .patch(`/api/v1/merchant/diner/${a.body.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId: world.otherTable.id })
      .expect(400);

    await prisma.restaurantTable.update({
      where: { id: world.table2.id },
      data: { status: 'OCCUPIED' },
    });
    await http()
      .patch(`/api/v1/merchant/diner/${a.body.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId: world.table2.id })
      .expect(409);

    const seated = await http()
      .patch(`/api/v1/merchant/diner/${a.body.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId: world.table.id });
    expect(seated.status).toBe(200);

    const conflict = await http()
      .patch(`/api/v1/merchant/diner/${b.body.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId: world.table.id });
    expect(conflict.status).toBe(409);

    const [left, right] = await Promise.all([
      prisma.seatingRequest.findUniqueOrThrow({ where: { id: a.body.id } }),
      prisma.seatingRequest.findUniqueOrThrow({ where: { id: b.body.id } }),
    ]);
    expect(left.status).toBe('SEATED');
    expect(left.tableId).toBe(world.table.id);
    expect(right.status).toBe('NOT_SEATED');
    expect(right.tableId).toBeNull();
  });

  it('cannot let two concurrent seats claim the same available table', async () => {
    const world = await seedWorld();
    const first = await registerConsumer();
    const second = await registerConsumer();
    const token = await loginStaff(world.ownerEmail);

    const a = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    const b = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${second.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    await http()
      .patch(`/api/v1/merchant/diner/${a.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await http()
      .patch(`/api/v1/merchant/diner/${b.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [one, two] = await Promise.all([
      http()
        .patch(`/api/v1/merchant/diner/${a.body.id}/seat`)
        .set('Authorization', `Bearer ${token}`)
        .send({ tableId: world.table.id }),
      http()
        .patch(`/api/v1/merchant/diner/${b.body.id}/seat`)
        .set('Authorization', `Bearer ${token}`)
        .send({ tableId: world.table.id }),
    ]);

    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([200, 409]);
    const occupied = [one, two].filter((r) => r.status === 200);
    expect(occupied).toHaveLength(1);
    expect(occupied[0].body.tableId).toBe(world.table.id);

    const rows = await prisma.seatingRequest.findMany({
      where: { id: { in: [a.body.id, b.body.id] }, status: 'SEATED' },
    });
    expect(rows).toHaveLength(1);
    const table = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: world.table.id } });
    expect(table.status).toBe('OCCUPIED');
  });

  it('creates a RESERVATION only when reservationAt is present and does not store walk-in/waitlist', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();
    const reservationAt = '2026-09-06T19:30:00.000Z';

    const missing = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'RESERVATION', partySize: 2 });
    expect(missing.status).toBe(400);
    expect(
      await prisma.seatingRequest.count({
        where: { userId: consumer.userId, restaurantId: world.restaurant.id },
      }),
    ).toBe(0);

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        restaurantId: world.restaurant.id,
        intent: 'RESERVATION',
        partySize: 4,
        reservationAt,
      });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('RESERVATION');
    expect(created.body.status).toBe('PENDING');
    expect(created.body.reservationAt).toBe(reservationAt);
    expect(created.body.type).not.toBe('WALK_IN');
    expect(created.body.type).not.toBe('WAITLIST');

    const row = await prisma.seatingRequest.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.type).toBe('RESERVATION');
    expect(row.reservationAt?.toISOString()).toBe(reservationAt);
    expect(row.userId).toBe(consumer.userId);
  });

  it('persists SEATING as WALK_IN when walkin_waitlist is not true', async () => {
    const world = await seedWorld();
    await prisma.subscription.deleteMany({
      where: { merchantId: world.merchant.id, productType: 'SEATING' },
    });
    await enableSeating(world.merchant.id, world.restaurant.id, {
      walkin_waitlist: { value: false },
    });
    const consumer = await registerConsumer();

    const forced = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        restaurantId: world.restaurant.id,
        intent: 'SEATING',
        partySize: 2,
        type: 'WAITLIST',
      });
    expect(forced.status).toBe(400);

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('WALK_IN');

    const row = await prisma.seatingRequest.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.type).toBe('WALK_IN');
  });

  it('derives WAITLIST on the server when walkin_waitlist.value is true', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();

    const forced = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        restaurantId: world.restaurant.id,
        intent: 'SEATING',
        partySize: 2,
        type: 'WALK_IN',
      });
    expect(forced.status).toBe(400);

    const created = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 3 });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('WAITLIST');

    const row = await prisma.seatingRequest.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.type).toBe('WAITLIST');
  });

  it('rejects diner create with 403 when seating is disabled and writes no request', async () => {
    const world = await seedWorld();
    await prisma.subscription.deleteMany({
      where: { merchantId: world.merchant.id, productType: 'SEATING' },
    });
    await prisma.subscription.create({
      data: {
        merchantId: world.merchant.id,
        restaurantId: world.restaurant.id,
        productType: 'SEATING',
        status: 'ACTIVE',
        config: {
          casual_dining: true,
          casual_dining_status: {
            seating: {
              value: false,
              reservation: { value: true },
              walkin_waitlist: { value: true },
            },
          },
        },
      },
    });
    const consumer = await registerConsumer();

    const denied = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(denied.status).toBe(403);
    expect(
      await prisma.seatingRequest.count({
        where: { userId: consumer.userId, restaurantId: world.restaurant.id },
      }),
    ).toBe(0);
  });

  it('rejects a second same-day WALK_IN/WAITLIST for the same user and restaurant', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();

    const first = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 2 });
    expect(first.status).toBe(201);
    expect(first.body.type).toBe('WAITLIST');

    const reservation = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        restaurantId: world.restaurant.id,
        intent: 'RESERVATION',
        partySize: 2,
        reservationAt: '2026-09-06T20:00:00.000Z',
      });
    expect(reservation.status).toBe(201);
    expect(reservation.body.type).toBe('RESERVATION');

    const duplicate = await http()
      .post('/api/v1/diner')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ restaurantId: world.restaurant.id, intent: 'SEATING', partySize: 4 });
    expect(duplicate.status).toBe(409);

    const active = await prisma.seatingRequest.findMany({
      where: {
        userId: consumer.userId,
        restaurantId: world.restaurant.id,
        type: { in: ['WALK_IN', 'WAITLIST'] },
        status: { in: ['PENDING', 'NOT_SEATED', 'SEATED'] },
        deletedAt: null,
      },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(first.body.id);
  });

  it('cannot let two concurrent same-day seating creates both succeed', async () => {
    const world = await seedWorld();
    const consumer = await registerConsumer();
    const body = { restaurantId: world.restaurant.id, intent: 'SEATING' as const, partySize: 2 };

    const [one, two] = await Promise.all([
      http().post('/api/v1/diner').set('Authorization', `Bearer ${consumer.token}`).send(body),
      http().post('/api/v1/diner').set('Authorization', `Bearer ${consumer.token}`).send(body),
    ]);

    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([201, 409]);
    const created = [one, two].filter((r) => r.status === 201);
    expect(created).toHaveLength(1);

    const active = await prisma.seatingRequest.findMany({
      where: {
        userId: consumer.userId,
        restaurantId: world.restaurant.id,
        type: { in: ['WALK_IN', 'WAITLIST'] },
        status: { in: ['PENDING', 'NOT_SEATED', 'SEATED'] },
        deletedAt: null,
      },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(created[0].body.id);
  });
});
