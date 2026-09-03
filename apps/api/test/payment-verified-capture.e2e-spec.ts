import { BadRequestException, INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import { PaymentModule } from '../src/modules/payment/payment.module';
import { PaymentService } from '../src/modules/payment/application/payment.service';
import { RazorpayWebhookService } from '../src/modules/payment/application/razorpay-webhook.service';
import {
  computePaymentSignature,
  computeWebhookSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../src/modules/payment/domain/razorpay-signature';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import type { CreateOrderInput } from '../src/modules/ordering/domain/ordering.types';

/**
 * P1.7.28 — Payment Intent & Verified-Capture foundation.
 *
 * Server-verified Razorpay capture over the EXISTING PaymentIntent/PaymentAttempt/
 * Transaction/WebhookEvent schema. The server never trusts a client success flag;
 * a Transaction is created only after signature + intent + amount verification, and
 * exactly one Transaction exists per provider payment (idempotent under repeats,
 * webhooks, and concurrency). No refund/wallet/settlement; coupon-redemption commit
 * point (order placement) is untouched.
 */
describe('Payment verified capture (P1.7.28)', () => {
  // ---- pure signature verification (no DB) ----
  describe('razorpay signature verification', () => {
    it('accepts a valid handoff signature and rejects a tampered one', () => {
      const sig = computePaymentSignature({
        razorpayOrderId: 'order_ABC',
        razorpayPaymentId: 'pay_XYZ',
        keySecret: 'secret',
      });
      expect(
        verifyPaymentSignature({
          razorpayOrderId: 'order_ABC',
          razorpayPaymentId: 'pay_XYZ',
          signature: sig,
          keySecret: 'secret',
        }),
      ).toBe(true);
      expect(
        verifyPaymentSignature({
          razorpayOrderId: 'order_ABC',
          razorpayPaymentId: 'pay_OTHER',
          signature: sig,
          keySecret: 'secret',
        }),
      ).toBe(false);
      expect(
        verifyPaymentSignature({
          razorpayOrderId: 'order_ABC',
          razorpayPaymentId: 'pay_XYZ',
          signature: sig,
          keySecret: 'wrong',
        }),
      ).toBe(false);
    });

    it('accepts a valid webhook body signature and rejects a modified body', () => {
      const body = '{"event":"payment.captured"}';
      const sig = computeWebhookSignature({ rawBody: body, webhookSecret: 'whsec' });
      expect(
        verifyWebhookSignature({ rawBody: body, signature: sig, webhookSecret: 'whsec' }),
      ).toBe(true);
      expect(
        verifyWebhookSignature({ rawBody: body + ' ', signature: sig, webhookSecret: 'whsec' }),
      ).toBe(false);
    });
  });

  // ---- integration (TEST DB) ----
  describe('capture + webhook (integration)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let provisioning: MerchantProvisioningService;
    let orders: OrderService;
    let payments: PaymentService;
    let webhook: RazorpayWebhookService;
    let keySecret: string;
    let webhookSecret: string;

    const uniq = (p: string) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
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

    const baseOrder = (restaurantId: string): CreateOrderInput => ({
      orderNumber: uniq('ORD'),
      restaurantId,
      type: 'HOME_DELIVERY',
      items: [{ nameSnapshot: 'Item', unitPriceMinor: 20000n, quantity: 1 }],
    });

    // Seed an order and a payment intent; return the intent + provider ids.
    const seedIntent = async () => {
      const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
      const r = await provisioning.createRestaurant(staffOf(m.id), {
        merchantId: m.id,
        name: uniq('R'),
        city: 'Bengaluru',
      });
      const order = await orders.createOrder(staffOf(m.id), baseOrder(r.id));
      const razorpayOrderId = uniq('order');
      const intent = await payments.createIntent({ orderId: order.id, razorpayOrderId });
      return { order, intent, razorpayOrderId };
    };

    const validSignature = (razorpayOrderId: string, razorpayPaymentId: string) =>
      computePaymentSignature({ razorpayOrderId, razorpayPaymentId, keySecret });

    const txCount = (paymentIntentId: string) =>
      prisma.transaction.count({ where: { paymentIntentId, type: 'PAYMENT' } });

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
          OrderingModule,
          PaymentModule,
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
      provisioning = app.get(MerchantProvisioningService);
      orders = app.get(OrderService);
      payments = app.get(PaymentService);
      webhook = app.get(RazorpayWebhookService);
      const config = app.get(ConfigService);
      keySecret = config.get<string>('RAZORPAY_KEY_SECRET')!;
      webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET')!;
    });

    afterAll(async () => {
      await app.close();
    });

    it('creates an intent (CREATED) with server-derived amount from the order', async () => {
      const { order, intent } = await seedIntent();
      expect(intent.status).toBe('CREATED');
      expect(intent.method).toBe('RAZORPAY');
      expect(intent.amountMinor).toBe(order.grandTotalMinor); // 20000 subtotal, no charges
      expect(intent.orderId).toBe(order.id);
    });

    it('createIntent is idempotent per razorpayOrderId (no duplicate intent)', async () => {
      const { order, razorpayOrderId, intent } = await seedIntent();
      const again = await payments.createIntent({ orderId: order.id, razorpayOrderId });
      expect(again.id).toBe(intent.id);
      const count = await prisma.paymentIntent.count({ where: { razorpayOrderId } });
      expect(count).toBe(1);
    });

    it('captures on a valid signature: intent CAPTURED + one PaymentAttempt + one Transaction', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      const res = await payments.verifyAndCapture({
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature(razorpayOrderId, paymentId),
        amountMinor: intent.amountMinor,
        currencyCode: 'INR',
      });
      expect(res.created).toBe(true);
      expect(res.intent.status).toBe('CAPTURED');
      expect(res.attempt.status).toBe('CAPTURED');
      expect(res.attempt.razorpayPaymentId).toBe(paymentId);
      expect(res.transactionId).toBeTruthy();
      expect(await txCount(intent.id)).toBe(1);
      const attempts = await prisma.paymentAttempt.count({ where: { paymentIntentId: intent.id } });
      expect(attempts).toBe(1);
    });

    it('rejects an invalid signature and creates NO attempt/transaction', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      await expect(
        payments.verifyAndCapture({
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: 'deadbeef',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await txCount(intent.id)).toBe(0);
      expect(await prisma.paymentAttempt.count({ where: { paymentIntentId: intent.id } })).toBe(0);
    });

    it('rejects an amount mismatch and creates NO transaction', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      await expect(
        payments.verifyAndCapture({
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature(razorpayOrderId, paymentId),
          amountMinor: intent.amountMinor + 1n,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await txCount(intent.id)).toBe(0);
    });

    it('rejects a currency mismatch', async () => {
      const { razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      await expect(
        payments.verifyAndCapture({
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature(razorpayOrderId, paymentId),
          currencyCode: 'USD',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown intent (wrong/absent razorpayOrderId)', async () => {
      const razorpayOrderId = uniq('order'); // never created an intent for it
      const paymentId = uniq('pay');
      await expect(
        payments.verifyAndCapture({
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature(razorpayOrderId, paymentId),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is idempotent on repeated capture of the same provider payment (no duplicate transaction)', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      const sig = validSignature(razorpayOrderId, paymentId);
      const first = await payments.verifyAndCapture({
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sig,
      });
      const second = await payments.verifyAndCapture({
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sig,
      });
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.intent.status).toBe('CAPTURED');
      expect(await txCount(intent.id)).toBe(1);
    });

    it('cannot create two transactions under concurrent capture of the same payment', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      const sig = validSignature(razorpayOrderId, paymentId);
      const results = await Promise.allSettled([
        payments.verifyAndCapture({
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: sig,
        }),
        payments.verifyAndCapture({
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: sig,
        }),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await txCount(intent.id)).toBe(1);
      expect(await prisma.paymentAttempt.count({ where: { paymentIntentId: intent.id } })).toBe(1);
    });

    // ---- webhook ----
    const paymentCapturedBody = (
      eventId: string,
      razorpayOrderId: string,
      paymentId: string,
      amount: number,
    ) =>
      JSON.stringify({
        id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: paymentId, order_id: razorpayOrderId, amount, status: 'captured' },
          },
        },
      });

    it('processes a valid payment.captured webhook (verified capture, one transaction)', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      const body = paymentCapturedBody(
        uniq('evt'),
        razorpayOrderId,
        paymentId,
        Number(intent.amountMinor),
      );
      const res = await webhook.ingest(
        body,
        computeWebhookSignature({ rawBody: body, webhookSecret }),
      );
      expect(res.duplicate).toBe(false);
      expect(res.processingStatus).toBe('PROCESSED');
      expect(await txCount(intent.id)).toBe(1);
      const captured = await prisma.paymentIntent.findUnique({ where: { razorpayOrderId } });
      expect(captured!.status).toBe('CAPTURED');
    });

    it('rejects a webhook with an invalid body signature', async () => {
      const { razorpayOrderId } = await seedIntent();
      const body = paymentCapturedBody(uniq('evt'), razorpayOrderId, uniq('pay'), 20000);
      await expect(webhook.ingest(body, 'badsignature')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('deduplicates a redelivered webhook event (no second transaction)', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      const eventId = uniq('evt');
      const body = paymentCapturedBody(
        eventId,
        razorpayOrderId,
        paymentId,
        Number(intent.amountMinor),
      );
      const sig = computeWebhookSignature({ rawBody: body, webhookSecret });
      const first = await webhook.ingest(body, sig);
      const second = await webhook.ingest(body, sig);
      expect(first.duplicate).toBe(false);
      expect(second.duplicate).toBe(true);
      expect(await txCount(intent.id)).toBe(1);
      expect(await prisma.webhookEvent.count({ where: { providerEventId: eventId } })).toBe(1);
    });

    it('ingests an unknown event type as PROCESSED without creating a transaction', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const body = JSON.stringify({
        id: uniq('evt'),
        event: 'payment.authorized',
        payload: {
          payment: {
            entity: {
              id: uniq('pay'),
              order_id: razorpayOrderId,
              amount: Number(intent.amountMinor),
            },
          },
        },
      });
      const res = await webhook.ingest(
        body,
        computeWebhookSignature({ rawBody: body, webhookSecret }),
      );
      expect(res.processingStatus).toBe('PROCESSED');
      expect(await txCount(intent.id)).toBe(0);
    });

    it('records a webhook whose processing fails (amount mismatch) as FAILED and creates no transaction', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const eventId = uniq('evt');
      const body = paymentCapturedBody(
        eventId,
        razorpayOrderId,
        uniq('pay'),
        Number(intent.amountMinor) + 1,
      );
      const res = await webhook.ingest(
        body,
        computeWebhookSignature({ rawBody: body, webhookSecret }),
      );
      expect(res.processingStatus).toBe('FAILED');
      expect(await txCount(intent.id)).toBe(0);
      // a redelivery of the same failed event is an idempotent no-op
      const again = await webhook.ingest(
        body,
        computeWebhookSignature({ rawBody: body, webhookSecret }),
      );
      expect(again.duplicate).toBe(true);
      expect(await txCount(intent.id)).toBe(0);
    });

    it('client handoff and webhook for the same payment yield exactly one transaction', async () => {
      const { intent, razorpayOrderId } = await seedIntent();
      const paymentId = uniq('pay');
      await payments.verifyAndCapture({
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature(razorpayOrderId, paymentId),
      });
      const body = paymentCapturedBody(
        uniq('evt'),
        razorpayOrderId,
        paymentId,
        Number(intent.amountMinor),
      );
      const res = await webhook.ingest(
        body,
        computeWebhookSignature({ rawBody: body, webhookSecret }),
      );
      expect(res.processingStatus).toBe('PROCESSED');
      expect(await txCount(intent.id)).toBe(1); // webhook capture deduped by razorpayPaymentId
    });
  });
});
