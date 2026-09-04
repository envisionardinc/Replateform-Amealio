import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from '../src/modules/payment/application/payment.service';
import { computePaymentSignature } from '../src/modules/payment/domain/razorpay-signature';

/**
 * Doc 88 — Merchant order management HTTP contract.
 * Asserts persisted OrderStatus, OrderStatusEvent, PaymentIntent join, and refund rows.
 */
describe('Merchant order management (doc 88 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentService;
  let keySecret: string;

  const PASSWORD = 'MerchantSecret123!';
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentService);
    keySecret = app.get(ConfigService).get<string>('RAZORPAY_KEY_SECRET')!;
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedMerchant() {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R'), city: 'Pune' },
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
    return { merchant, restaurant, email, staff };
  }

  async function login(email: string): Promise<string> {
    const res = await http().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function seedUser() {
    return prisma.user.create({
      data: { phoneCountryCode: '+91', phone: uniq('9').replace(/\D/g, '').slice(0, 12) },
    });
  }

  async function seedOrder(
    restaurantId: string,
    merchantId: string,
    over: { type?: 'HOME_DELIVERY' | 'TAKE_AWAY'; userId?: string } = {},
  ) {
    return prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId,
        restaurantId,
        userId: over.userId ?? null,
        type: over.type ?? 'HOME_DELIVERY',
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
        statusEvents: {
          create: [{ fromStatus: null, toStatus: 'PENDING', actorType: 'STAFF' }],
        },
      },
    });
  }

  async function walkTo(token: string, orderId: string, hops: string[]) {
    for (const toStatus of hops) {
      const res = await http()
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toStatus });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(toStatus);
    }
  }

  it('lists own restaurant orders and returns detail with payment join', async () => {
    const a = await seedMerchant();
    const token = await login(a.email);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);

    const list = await http()
      .get('/api/v1/orders')
      .query({ restaurantId: a.restaurant.id, status: 'PENDING' })
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((o: { id: string }) => o.id)).toContain(order.id);

    const detail = await http()
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('PENDING');
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.statusEvents.length).toBeGreaterThan(0);
    expect(Array.isArray(detail.body.paymentIntents)).toBe(true);
    expect(detail.body.grandTotalMinor).toBe('10000');
  });

  it('rejects unauthenticated and unauthorized staff, and cross-merchant get', async () => {
    const a = await seedMerchant();
    const b = await seedMerchant();
    const tokenA = await login(a.email);
    const tokenB = await login(b.email);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);

    const anon = await http().get('/api/v1/orders');
    expect(anon.status).toBe(401);

    const cross = await http()
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(cross.status).toBe(403);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.merchantId).toBe(a.merchant.id);
    expect(persisted.status).toBe('PENDING');

    const otherList = await http()
      .get('/api/v1/orders')
      .query({ restaurantId: a.restaurant.id })
      .set('Authorization', `Bearer ${tokenB}`);
    expect(otherList.status).toBe(403);

    const own = await http()
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(own.status).toBe(200);
  });

  it('performs a valid hop, rejects an invalid hop, and is same-status idempotent', async () => {
    const a = await seedMerchant();
    const token = await login(a.email);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);

    const ok = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CONFIRMED', expectedStatus: 'PENDING' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CONFIRMED');

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { statusEvents: true },
    });
    expect(row.status).toBe('CONFIRMED');
    const before = row.statusEvents.length;

    const dup = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CONFIRMED' });
    expect(dup.status).toBe(200);
    expect(dup.body.status).toBe('CONFIRMED');
    const after = await prisma.orderStatusEvent.count({ where: { orderId: order.id } });
    expect(after).toBe(before);

    const bad = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'DELIVERED' });
    expect(bad.status).toBe(400);
    const still = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(still.status).toBe('CONFIRMED');
  });

  it('returns 409 on stale expectedStatus and on concurrent competing hops', async () => {
    const a = await seedMerchant();
    const token = await login(a.email);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);

    const stale = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CONFIRMED', expectedStatus: 'INITIAL' });
    expect(stale.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING',
    );

    const [one, two] = await Promise.all([
      http()
        .patch(`/api/v1/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toStatus: 'CONFIRMED', expectedStatus: 'PENDING' }),
      http()
        .patch(`/api/v1/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toStatus: 'CANCELLED', expectedStatus: 'PENDING', reasonCode: 'MERCHANT_REJECT' }),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(['CONFIRMED', 'CANCELLED']).toContain(winner.status);
  });

  it('rejects unpaid/COD pending order without creating a refund', async () => {
    const a = await seedMerchant();
    const token = await login(a.email);
    const order = await seedOrder(a.restaurant.id, a.merchant.id);

    const res = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CANCELLED', reasonCode: 'MERCHANT_REJECT', reason: 'sold out' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelReason).toContain('MERCHANT_REJECT');

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { statusEvents: true, refunds: true, paymentIntents: true },
    });
    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.paymentIntents).toHaveLength(0);
    expect(persisted.refunds).toHaveLength(0);
    const cancelEvent = persisted.statusEvents.find((e) => e.toStatus === 'CANCELLED');
    expect(cancelEvent?.reason).toContain('MERCHANT_REJECT');
  });

  it('paid reject invokes RefundService using the PaymentIntent method rail', async () => {
    const a = await seedMerchant();
    const token = await login(a.email);
    const user = await seedUser();
    const order = await seedOrder(a.restaurant.id, a.merchant.id, { userId: user.id });

    const rzpOrder = `order_${uniq('rzp')}`;
    const intent = await payments.createIntent({
      orderId: order.id,
      razorpayOrderId: rzpOrder,
      method: 'RAZORPAY',
    });
    const payId = `pay_${uniq('p')}`;
    const sig = computePaymentSignature({
      razorpayOrderId: rzpOrder,
      razorpayPaymentId: payId,
      keySecret,
    });
    const captured = await payments.verifyAndCapture({
      razorpayOrderId: rzpOrder,
      razorpayPaymentId: payId,
      razorpaySignature: sig,
    });
    expect(captured.intent.status).toBe('CAPTURED');
    expect(captured.created).toBe(true);

    const txnBefore = await prisma.transaction.count({
      where: { paymentIntentId: intent.id, type: 'PAYMENT' },
    });
    expect(txnBefore).toBe(1);

    const res = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CANCELLED', reasonCode: 'MERCHANT_REJECT' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.paymentIntents[0].status).toBe('CAPTURED');

    const refunds = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].method).toBe('RAZORPAY');
    expect(refunds[0].status).toBe('INITIATED');
    expect(refunds[0].idempotencyKey).toBe(`order-cancel:${order.id}:${intent.id}`);

    const again = await http()
      .patch(`/api/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CANCELLED', reasonCode: 'MERCHANT_REJECT' });
    expect(again.status).toBe(200);
    const refundsAfter = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(refundsAfter).toHaveLength(1);
  });

  it('blocks cancel from ON_THE_WAY and type-aware illegal READY hops', async () => {
    const a = await seedMerchant();
    const token = await login(a.email);
    const delivery = await seedOrder(a.restaurant.id, a.merchant.id, { type: 'HOME_DELIVERY' });
    await walkTo(token, delivery.id, ['CONFIRMED', 'PREPARING', 'PACKING', 'READY', 'ON_THE_WAY']);

    const cancelOfd = await http()
      .patch(`/api/v1/orders/${delivery.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'CANCELLED' });
    expect(cancelOfd.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe(
      'ON_THE_WAY',
    );

    const pickup = await seedOrder(a.restaurant.id, a.merchant.id, { type: 'TAKE_AWAY' });
    await walkTo(token, pickup.id, ['CONFIRMED', 'PREPARING', 'READY']);
    const ofdPickup = await http()
      .patch(`/api/v1/orders/${pickup.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'ON_THE_WAY' });
    expect(ofdPickup.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pickup.id } })).status).toBe('READY');

    const hdReady = await seedOrder(a.restaurant.id, a.merchant.id, { type: 'HOME_DELIVERY' });
    await walkTo(token, hdReady.id, ['CONFIRMED', 'PREPARING', 'READY']);
    const skip = await http()
      .patch(`/api/v1/orders/${hdReady.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'COMPLETED' });
    expect(skip.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: hdReady.id } })).status).toBe(
      'READY',
    );

    const completePickup = await http()
      .patch(`/api/v1/orders/${pickup.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStatus: 'COMPLETED' });
    expect(completePickup.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pickup.id } })).status).toBe(
      'COMPLETED',
    );
  });
});
