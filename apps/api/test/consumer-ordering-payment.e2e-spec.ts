import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  computePaymentSignature,
  computeWebhookSignature,
} from '../src/modules/payment/domain/razorpay-signature';

/**
 * Doc 90 — Consumer ordering + payment vertical.
 * Asserts persisted OrderStatus, PaymentIntent, Transaction, CouponRedemption,
 * Refund, cart, and merchant visibility — not just HTTP codes.
 */
describe('Consumer ordering + payment (doc 90 HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let keySecret: string;
  let webhookSecret: string;

  const PASSWORD = 'MerchantSecret123!';
  const CONSUMER_PASSWORD = 'Secret123!';
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(ConfigService);
    keySecret = config.get<string>('RAZORPAY_KEY_SECRET')!;
    webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET')!;
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
    return { merchant, restaurant, email, variantId: item.variants[0].id, itemId: item.id };
  }

  async function loginStaff(email: string): Promise<string> {
    const res = await http().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function registerConsumer() {
    const phone = `9${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
    const body = { phoneCountryCode: '+91', phone, password: CONSUMER_PASSWORD };
    const created = await http().post('/api/v1/auth/consumer/register').send(body);
    expect(created.status).toBe(201);
    const login = await http().post('/api/v1/auth/consumer/login').send(body);
    expect(login.status).toBe(200);
    return { token: login.body.accessToken as string, userId: created.body.id as string, phone };
  }

  async function addToCart(token: string, variantId: string, restaurantId: string, quantity = 2) {
    const res = await http()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, restaurantId, quantity, type: 'HOME_DELIVERY' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.subtotalMinor).toBe(String(10000 * quantity));
    return res.body;
  }

  async function checkout(token: string, body: Record<string, unknown>, idempotencyKey?: string) {
    const payload = { ...body };
    const type = typeof payload.type === 'string' ? payload.type : 'HOME_DELIVERY';
    if (
      (type === 'HOME_DELIVERY' || type === 'CATERING') &&
      typeof payload.addressId !== 'string'
    ) {
      const created = await http()
        .post('/api/v1/me/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'Home', line1: '12 Test Street', city: 'Pune' });
      expect(created.status).toBe(201);
      payload.addressId = created.body.id;
    }
    const req = http().post('/api/v1/checkout').set('Authorization', `Bearer ${token}`);
    if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
    return req.send(payload);
  }

  function sign(razorpayOrderId: string, razorpayPaymentId: string) {
    return computePaymentSignature({ razorpayOrderId, razorpayPaymentId, keySecret });
  }

  async function verify(razorpayOrderId: string, razorpayPaymentId: string) {
    return http()
      .post('/api/v1/payments/verify')
      .send({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: sign(razorpayOrderId, razorpayPaymentId),
      });
  }

  function capturedBody(
    eventId: string,
    razorpayOrderId: string,
    paymentId: string,
    amount: number,
  ) {
    return JSON.stringify({
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: paymentId, order_id: razorpayOrderId, amount, status: 'captured' },
        },
      },
    });
  }

  async function postWebhook(raw: string) {
    return http()
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', computeWebhookSignature({ rawBody: raw, webhookSecret }))
      .send(raw);
  }

  it('rejects unauthenticated cart/checkout and consumer kitchen status writes', async () => {
    const anonCart = await http().get('/api/v1/cart');
    expect(anonCart.status).toBe(401);
    const anonCheckout = await http().post('/api/v1/checkout').send({ settlement: 'PREPAID' });
    expect(anonCheckout.status).toBe(401);

    const consumer = await registerConsumer();
    const merch = await seedMerchant();
    await addToCart(consumer.token, merch.variantId, merch.restaurant.id, 1);
    const placed = await checkout(
      consumer.token,
      { settlement: 'COD', type: 'HOME_DELIVERY' },
      uniq('idem'),
    );
    expect(placed.status).toBe(201);

    const kitchen = await http()
      .patch(`/api/v1/orders/${placed.body.order.id}/status`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ toStatus: 'CONFIRMED' });
    expect(kitchen.status).toBe(401);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.order.id } });
    expect(row.status).toBe('PENDING');
  });

  it('payment initiated: prepaid checkout is INITIAL + CREATED intent at server grandTotal', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    await addToCart(consumer.token, merch.variantId, merch.restaurant.id, 2);
    const key = uniq('idem');
    const res = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        tipMinor: 100,
        donationMinor: 50,
        items: [{ variantId: merch.variantId, quantity: 2 }],
      },
      key,
    );
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('INITIAL');
    expect(res.body.order.grandTotalMinor).toBe('20000');
    expect(res.body.order.tipMinor).toBe('100');
    expect(res.body.order.donationMinor).toBe('50');
    expect(res.body.payment.status).toBe('CREATED');
    expect(res.body.payment.amountMinor).toBe('20000');
    expect(res.body.payment.razorpayOrderId).toMatch(/^order_/);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: res.body.order.id },
      include: { paymentIntents: true, couponRedemptions: true },
    });
    expect(order.status).toBe('INITIAL');
    expect(order.checkoutIdempotencyKey).toBe(key);
    expect(order.grandTotalMinor).toBe(20000n);
    expect(order.paymentIntents).toHaveLength(1);
    expect(order.paymentIntents[0].status).toBe('CREATED');
    expect(order.couponRedemptions).toHaveLength(0);

    const cart = await prisma.cart.findFirst({ where: { userId: consumer.userId } });
    expect(cart).toBeTruthy();

    const staffToken = await loginStaff(merch.email);
    const list = await http()
      .get('/api/v1/orders')
      .query({ restaurantId: merch.restaurant.id, status: 'PENDING' })
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((o: { id: string }) => o.id)).not.toContain(order.id);
  });

  it('rejects client totals and uses catalog price, not a forged line total', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const forbidden = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        grandTotalMinor: 1,
        items: [{ variantId: merch.variantId, quantity: 1, unitPriceMinor: 1 }],
      },
      uniq('idem'),
    );
    expect(forbidden.status).toBe(400);

    const ok = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.order.grandTotalMinor).toBe('10000');
    expect(ok.body.payment.amountMinor).toBe('10000');
  });

  it('payment succeeds via verify: INITIAL→PENDING, one capture, cart cleared, merchant sees it', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id as string;
    const razorpayOrderId = placed.body.payment.razorpayOrderId as string;
    const paymentId = uniq('pay');

    const captured = await verify(razorpayOrderId, paymentId);
    expect(captured.status).toBe(200);
    expect(captured.body.created).toBe(true);
    expect(captured.body.intent.status).toBe('CAPTURED');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { paymentIntents: true, statusEvents: true, transactions: true },
    });
    expect(order.status).toBe('PENDING');
    expect(order.paymentIntents[0].status).toBe('CAPTURED');
    expect(order.transactions.filter((t) => t.type === 'PAYMENT')).toHaveLength(1);
    expect(
      order.statusEvents.some((e) => e.toStatus === 'PENDING' && e.reason === 'PAYMENT_CAPTURED'),
    ).toBe(true);
    expect(await prisma.cart.count({ where: { userId: consumer.userId } })).toBe(0);

    const staffToken = await loginStaff(merch.email);
    const list = await http()
      .get('/api/v1/orders')
      .query({ restaurantId: merch.restaurant.id, status: 'PENDING' })
      .set('Authorization', `Bearer ${staffToken}`);
    expect(list.body.data.map((o: { id: string }) => o.id)).toContain(orderId);

    const mine = await http()
      .get(`/api/v1/me/orders/${orderId}`)
      .set('Authorization', `Bearer ${consumer.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.status).toBe('PENDING');
    expect(mine.body.paymentIntents[0].status).toBe('CAPTURED');
  });

  it('payment fails: order stays INITIAL, intent FAILED, no transaction', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    const orderId = placed.body.order.id as string;
    const razorpayOrderId = placed.body.payment.razorpayOrderId as string;
    const raw = JSON.stringify({
      id: uniq('evt'),
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: uniq('pay'), order_id: razorpayOrderId, amount: 10000, status: 'failed' },
        },
      },
    });
    const wh = await postWebhook(raw);
    expect(wh.status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { paymentIntents: true, transactions: true },
    });
    expect(order.status).toBe('INITIAL');
    expect(order.paymentIntents[0].status).toBe('FAILED');
    expect(order.transactions).toHaveLength(0);
  });

  it('duplicate checkout / retried order creation returns the same order and intent', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const key = uniq('idem');
    const body = {
      settlement: 'PREPAID' as const,
      type: 'HOME_DELIVERY',
      items: [{ variantId: merch.variantId, quantity: 1 }],
    };
    const first = await checkout(consumer.token, body, key);
    const second = await checkout(consumer.token, body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.payment.id).toBe(first.body.payment.id);
    expect(await prisma.order.count({ where: { checkoutIdempotencyKey: key } })).toBe(1);
    expect(await prisma.paymentIntent.count({ where: { orderId: first.body.order.id } })).toBe(1);
  });

  it('verify retry + delayed/duplicate webhook: one capture, one PENDING, no duplicate money', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    const orderId = placed.body.order.id as string;
    const razorpayOrderId = placed.body.payment.razorpayOrderId as string;
    const paymentId = uniq('pay');

    const v1 = await verify(razorpayOrderId, paymentId);
    const v2 = await verify(razorpayOrderId, paymentId);
    expect(v1.body.created).toBe(true);
    expect(v2.body.created).toBe(false);

    const raw = capturedBody(uniq('evt'), razorpayOrderId, paymentId, 10000);
    const delayed = await postWebhook(raw);
    expect(delayed.status).toBe(200);
    const dup = await postWebhook(raw);
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { paymentIntents: true, transactions: true, statusEvents: true },
    });
    expect(order.status).toBe('PENDING');
    expect(order.paymentIntents[0].status).toBe('CAPTURED');
    expect(order.transactions.filter((t) => t.type === 'PAYMENT')).toHaveLength(1);
    expect(order.statusEvents.filter((e) => e.toStatus === 'PENDING')).toHaveLength(1);
  });

  it('webhook-first capture promotes the order; later verify is idempotent', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    const orderId = placed.body.order.id as string;
    const razorpayOrderId = placed.body.payment.razorpayOrderId as string;
    const paymentId = uniq('pay');
    const raw = capturedBody(uniq('evt'), razorpayOrderId, paymentId, 10000);
    const wh = await postWebhook(raw);
    expect(wh.status).toBe(200);
    expect(wh.body.duplicate).toBe(false);

    const afterWh = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(afterWh.status).toBe('PENDING');

    const v = await verify(razorpayOrderId, paymentId);
    expect(v.body.created).toBe(false);
    expect(await prisma.transaction.count({ where: { orderId, type: 'PAYMENT' } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'PENDING',
    );
  });

  it('prepaid coupon redeems once at paid commit, not at checkout', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const code = uniq('SAVE').toUpperCase();
    await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: true,
        merchantId: merch.merchant.id,
        restaurantId: merch.restaurant.id,
        discountPercent: 10,
        coupons: { create: [{ code }] },
      },
    });
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        couponCode: code,
        items: [{ variantId: merch.variantId, quantity: 2 }],
      },
      uniq('idem'),
    );
    expect(placed.status).toBe(201);
    expect(placed.body.order.status).toBe('INITIAL');
    expect(placed.body.order.grandTotalMinor).toBe('18000');
    expect(placed.body.payment.amountMinor).toBe('18000');
    expect(await prisma.couponRedemption.count({ where: { orderId: placed.body.order.id } })).toBe(
      0,
    );

    const razorpayOrderId = placed.body.payment.razorpayOrderId as string;
    const paymentId = uniq('pay');
    await verify(razorpayOrderId, paymentId);
    await verify(razorpayOrderId, paymentId);
    const redemptions = await prisma.couponRedemption.findMany({
      where: { orderId: placed.body.order.id },
    });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].status).toBe('ACTIVE');
    expect(redemptions[0].discountAppliedMinor).toBe(2000n);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.order.id } });
    expect(order.status).toBe('PENDING');
  });

  it('paid consumer cancel invokes RefundService; unpaid/COD reject does not', async () => {
    const merch = await seedMerchant();
    const staffToken = await loginStaff(merch.email);

    const paidConsumer = await registerConsumer();
    const paid = await checkout(
      paidConsumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    await verify(paid.body.payment.razorpayOrderId, uniq('pay'));
    const cancel = await http()
      .patch(`/api/v1/me/orders/${paid.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${paidConsumer.token}`)
      .send({ expectedStatus: 'PENDING' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');
    const paidRow = await prisma.order.findUniqueOrThrow({
      where: { id: paid.body.order.id },
      include: { refunds: true, couponRedemptions: true },
    });
    expect(paidRow.status).toBe('CANCELLED');
    expect(paidRow.refunds.length).toBeGreaterThanOrEqual(1);

    const other = await registerConsumer();
    const otherGet = await http()
      .get(`/api/v1/me/orders/${paid.body.order.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(otherGet.status).toBe(404);

    const codConsumer = await registerConsumer();
    const cod = await checkout(
      codConsumer.token,
      {
        settlement: 'COD',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    expect(cod.status).toBe(201);
    expect(cod.body.order.status).toBe('PENDING');
    expect(cod.body.payment).toBeNull();
    expect(await prisma.paymentIntent.count({ where: { orderId: cod.body.order.id } })).toBe(0);
    expect(await prisma.cart.count({ where: { userId: codConsumer.userId } })).toBe(0);

    const reject = await http()
      .patch(`/api/v1/orders/${cod.body.order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ toStatus: 'CANCELLED', reasonCode: 'MERCHANT_REJECT' });
    expect(reject.status).toBe(200);
    const codRow = await prisma.order.findUniqueOrThrow({
      where: { id: cod.body.order.id },
      include: { refunds: true },
    });
    expect(codRow.status).toBe('CANCELLED');
    expect(codRow.refunds).toHaveLength(0);
  });

  it('merchant reject of a paid prepaid order refunds via PaymentIntent rail', async () => {
    const merch = await seedMerchant();
    const staffToken = await loginStaff(merch.email);
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'PREPAID',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    await verify(placed.body.payment.razorpayOrderId, uniq('pay'));
    const reject = await http()
      .patch(`/api/v1/orders/${placed.body.order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ toStatus: 'CANCELLED', reasonCode: 'MERCHANT_REJECT' });
    expect(reject.status).toBe(200);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: placed.body.order.id },
      include: { refunds: true },
    });
    expect(row.status).toBe('CANCELLED');
    expect(row.refunds.length).toBeGreaterThanOrEqual(1);
  });

  it('consumer cannot cancel after merchant accept; same-status cancel is idempotent', async () => {
    const merch = await seedMerchant();
    const staffToken = await loginStaff(merch.email);
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'COD',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    const accepted = await http()
      .patch(`/api/v1/orders/${placed.body.order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ toStatus: 'CONFIRMED' });
    expect(accepted.status).toBe(200);

    const denied = await http()
      .patch(`/api/v1/me/orders/${placed.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({});
    expect(denied.status).toBe(400);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: placed.body.order.id } })).status,
    ).toBe('CONFIRMED');

    const cancelable = await checkout(
      consumer.token,
      {
        settlement: 'PAY_LATER',
        type: 'TAKE_AWAY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    const c1 = await http()
      .patch(`/api/v1/me/orders/${cancelable.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ expectedStatus: 'PENDING' });
    const events = await prisma.orderStatusEvent.count({
      where: { orderId: cancelable.body.order.id },
    });
    const c2 = await http()
      .patch(`/api/v1/me/orders/${cancelable.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({});
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    expect(c2.body.status).toBe('CANCELLED');
    expect(
      await prisma.orderStatusEvent.count({ where: { orderId: cancelable.body.order.id } }),
    ).toBe(events);
  });

  it('consumer tracking list lanes and statusEvents stay user-scoped', async () => {
    const merch = await seedMerchant();
    const consumer = await registerConsumer();
    const placed = await checkout(
      consumer.token,
      {
        settlement: 'COD',
        type: 'HOME_DELIVERY',
        items: [{ variantId: merch.variantId, quantity: 1 }],
      },
      uniq('idem'),
    );
    const id = placed.body.order.id as string;
    const detail = await http()
      .get(`/api/v1/me/orders/${id}`)
      .set('Authorization', `Bearer ${consumer.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.statusEvents.length).toBeGreaterThan(0);
    expect(
      detail.body.statusEvents.some((e: { toStatus: string }) => e.toStatus === 'PENDING'),
    ).toBe(true);

    const active = await http()
      .get('/api/v1/me/orders')
      .query({ lane: 'active' })
      .set('Authorization', `Bearer ${consumer.token}`);
    expect(active.status).toBe(200);
    expect(active.body.data.map((o: { id: string }) => o.id)).toContain(id);

    await http()
      .patch(`/api/v1/me/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ expectedStatus: 'PENDING' });

    const history = await http()
      .get('/api/v1/me/orders')
      .query({ lane: 'history' })
      .set('Authorization', `Bearer ${consumer.token}`);
    const after = await http()
      .get('/api/v1/me/orders')
      .query({ lane: 'active' })
      .set('Authorization', `Bearer ${consumer.token}`);
    expect(history.body.data.map((o: { id: string }) => o.id)).toContain(id);
    expect(after.body.data.map((o: { id: string }) => o.id)).not.toContain(id);
  });
});
