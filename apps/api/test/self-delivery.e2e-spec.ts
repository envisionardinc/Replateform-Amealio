import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Doc 91 — Self-delivery assignment and rider handoff.
 * Asserts persisted OrderStatus + deliveryPersonId. DeliveryTask is unused.
 */
describe('Self delivery order handoff (doc 91 HTTP e2e)', () => {
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

  async function seedMerchant() {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R'), city: 'Pune', status: 'ACTIVE' },
    });
    const email = `${uniq('owner')}@example.test`;
    const staff = await prisma.staffMember.create({
      data: {
        merchantId: merchant.id,
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
    return { merchant, restaurant, email };
  }

  async function loginStaff(email: string): Promise<string> {
    const res = await http().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function seedRider(merchantId: string, over: { isOnline?: boolean; name?: string } = {}) {
    return prisma.deliveryPerson.create({
      data: {
        merchantId,
        name: over.name ?? uniq('Rider'),
        phone: '9000000000',
        isOnline: over.isOnline ?? true,
      },
    });
  }

  async function seedOrder(
    restaurantId: string,
    merchantId: string,
    type: 'HOME_DELIVERY' | 'TAKE_AWAY' = 'HOME_DELIVERY',
  ) {
    return prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId,
        restaurantId,
        type,
        status: 'PENDING',
        subtotalMinor: 10000n,
        grandTotalMinor: 10000n,
        currencyCode: 'INR',
        placedAt: new Date(),
        items: {
          create: [
            {
              nameSnapshot: 'Idli',
              unitPriceMinor: 10000n,
              quantity: 1,
              lineTotalMinor: 10000n,
              currencyCode: 'INR',
            },
          ],
        },
        statusEvents: { create: [{ fromStatus: null, toStatus: 'PENDING', actorType: 'STAFF' }] },
      },
    });
  }

  async function walkToReady(token: string, orderId: string) {
    for (const toStatus of ['CONFIRMED', 'PREPARING', 'PACKING', 'READY']) {
      const res = await http()
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toStatus });
      expect(res.status).toBe(200);
    }
  }

  async function riderToken(staffToken: string, deliveryPersonId: string): Promise<string> {
    const res = await http()
      .post('/api/v1/delivery/sessions')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ deliveryPersonId });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  it('assigns an online rider at READY and completes rider → merchant handoff', async () => {
    const a = await seedMerchant();
    const token = await loginStaff(a.email);
    const rider = await seedRider(a.merchant.id);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);
    await walkToReady(token, order.id);

    const assigned = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: rider.id, expectedStatus: 'READY' });
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe('READY');
    expect(assigned.body.deliveryPersonId).toBe(rider.id);
    expect(assigned.body.deliveryPerson.name).toBe(rider.name);
    expect(await prisma.deliveryTask.count({ where: { orderId: order.id } })).toBe(0);

    const same = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: rider.id });
    expect(same.status).toBe(200);
    expect(same.body.deliveryPersonId).toBe(rider.id);

    const rToken = await riderToken(token, rider.id);
    const ofd = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'ON_THE_WAY', expectedStatus: 'READY' });
    expect(ofd.status).toBe(200);
    expect(ofd.body.status).toBe('ON_THE_WAY');

    const delivered = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'DELIVERED' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('DELIVERED');

    const dup = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'DELIVERED' });
    expect(dup.status).toBe(200);
    const events = await prisma.orderStatusEvent.count({
      where: { orderId: order.id, toStatus: 'DELIVERED' },
    });
    expect(events).toBe(1);

    const complete = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'COMPLETED' });
    expect(complete.status).toBe(200);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('COMPLETED');
    expect(row.deliveryPersonId).toBe(rider.id);
  });

  it('rejects unauthorized, cross-merchant, occupied, and offline assignment', async () => {
    const a = await seedMerchant();
    const b = await seedMerchant();
    const tokenA = await loginStaff(a.email);
    const tokenB = await loginStaff(b.email);
    const riderA = await seedRider(a.merchant.id);
    const riderB = await seedRider(b.merchant.id);
    const offline = await seedRider(a.merchant.id, { isOnline: false, name: 'Offline' });
    const order = await seedOrder(a.restaurant.id, a.merchant.id);
    const other = await seedOrder(a.restaurant.id, a.merchant.id);
    await walkToReady(tokenA, order.id);
    await walkToReady(tokenA, other.id);

    expect(
      (
        await http()
          .patch(`/api/v1/orders/${order.id}/assign`)
          .send({ deliveryPersonId: riderA.id })
      ).status,
    ).toBe(401);

    const crossStaff = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ deliveryPersonId: riderB.id });
    expect(crossStaff.status).toBe(403);

    const crossRider = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ deliveryPersonId: riderB.id });
    expect(crossRider.status).toBe(403);

    const off = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ deliveryPersonId: offline.id });
    expect(off.status).toBe(400);

    await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ deliveryPersonId: riderA.id })
      .expect(200);

    const occupied = await http()
      .patch(`/api/v1/orders/${other.id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ deliveryPersonId: riderA.id });
    expect(occupied.status).toBe(409);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: other.id } });
    expect(persisted.deliveryPersonId).toBeNull();
    expect(persisted.status).toBe('READY');
  });

  it('enforces rider auth, valid hops, invalid hops, and merchant post-handoff lock', async () => {
    const a = await seedMerchant();
    const token = await loginStaff(a.email);
    const rider = await seedRider(a.merchant.id);
    const otherRider = await seedRider(a.merchant.id, { name: 'Other' });
    const order = await seedOrder(a.restaurant.id, a.merchant.id);
    await walkToReady(token, order.id);
    await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: rider.id })
      .expect(200);

    const anon = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .send({ toStatus: 'ON_THE_WAY' });
    expect(anon.status).toBe(401);

    const otherTok = await riderToken(token, otherRider.id);
    const stolen = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${otherTok}`)
      .send({ toStatus: 'ON_THE_WAY' });
    expect(stolen.status).toBe(403);

    const rToken = await riderToken(token, rider.id);
    const invalid = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'COMPLETED' });
    expect(invalid.status).toBe(403);

    const merchantOfd = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'ON_THE_WAY' });
    expect(merchantOfd.status).toBe(403);

    const ofd = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'ON_THE_WAY' });
    expect(ofd.status).toBe(200);

    const merchantDeliver = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'DELIVERED' });
    expect(merchantDeliver.status).toBe(403);

    const riderComplete = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'COMPLETED' });
    expect(riderComplete.status).toBe(403);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'ON_THE_WAY',
    );
  });

  it('rejects stale expectedStatus and lost concurrent rider hops', async () => {
    const a = await seedMerchant();
    const token = await loginStaff(a.email);
    const rider = await seedRider(a.merchant.id);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);
    await walkToReady(token, order.id);
    await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: rider.id })
      .expect(200);
    const rToken = await riderToken(token, rider.id);

    const stale = await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'ON_THE_WAY', expectedStatus: 'PACKING' });
    expect(stale.status).toBe(409);

    const [first, second] = await Promise.all([
      http()
        .patch(`/api/v1/delivery/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${rToken}`)
        .send({ toStatus: 'ON_THE_WAY', expectedStatus: 'READY' }),
      http()
        .patch(`/api/v1/delivery/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${rToken}`)
        .send({ toStatus: 'ON_THE_WAY', expectedStatus: 'READY' }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'ON_THE_WAY',
    );
    expect(
      await prisma.orderStatusEvent.count({ where: { orderId: order.id, toStatus: 'ON_THE_WAY' } }),
    ).toBe(1);
  });

  it('allows READY reassignment and rejects assignment after ON_THE_WAY', async () => {
    const a = await seedMerchant();
    const token = await loginStaff(a.email);
    const r1 = await seedRider(a.merchant.id, { name: 'One' });
    const r2 = await seedRider(a.merchant.id, { name: 'Two' });
    const order = await seedOrder(a.restaurant.id, a.merchant.id);
    await walkToReady(token, order.id);

    await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: r1.id })
      .expect(200);
    const reassigned = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: r2.id });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.deliveryPersonId).toBe(r2.id);

    const rToken = await riderToken(token, r2.id);
    await http()
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ toStatus: 'ON_THE_WAY' })
      .expect(200);

    const late = await http()
      .patch(`/api/v1/orders/${order.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryPersonId: r1.id });
    expect(late.status).toBe(400);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).deliveryPersonId,
    ).toBe(r2.id);
  });
});
