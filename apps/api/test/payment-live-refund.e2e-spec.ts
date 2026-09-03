import { BadGatewayException, ForbiddenException, INestApplication } from '@nestjs/common';
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
import { RefundService } from '../src/modules/payment/application/refund.service';
import { RazorpayWebhookService } from '../src/modules/payment/application/razorpay-webhook.service';
import { RazorpayRefundGateway } from '../src/modules/payment/infrastructure/razorpay-refund.gateway';
import {
  computePaymentSignature,
  computeWebhookSignature,
} from '../src/modules/payment/domain/razorpay-signature';
import type {
  ProviderRefundRequest,
  ProviderRefundResponse,
} from '../src/modules/payment/domain/refund.types';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import type { CreateOrderInput } from '../src/modules/ordering/domain/ordering.types';

/**
 * P1.7.30 — Live Razorpay refund integration & authorization.
 *
 * Authorized (merchant-scoped) refund. RAZORPAY refunds are asynchronous: reserve
 * → provider request → INITIATED, with the wallet credit + transaction + full-
 * refund coupon reversal applied EXACTLY ONCE only on the authoritative PROCESSED
 * completion (refund.processed webhook or synchronous provider `processed`). A
 * refund request is never a completed refund; duplicates/concurrency cannot
 * duplicate financial effects or exceed the captured amount.
 */

/** Controllable fake provider gateway (deterministic providerRefundId per key). */
class FakeGateway {
  mode: 'pending' | 'processed' | 'failed' | 'throw' = 'pending';
  calls = 0;
  lastReq?: ProviderRefundRequest;
  async requestRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    this.calls++;
    this.lastReq = req;
    if (this.mode === 'throw') throw new Error('provider timeout');
    return { providerRefundId: `rfnd_${req.idempotencyKey}`, status: this.mode };
  }
}

describe('Live Razorpay refund integration (P1.7.30)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let orders: OrderService;
  let payments: PaymentService;
  let refunds: RefundService;
  let webhook: RazorpayWebhookService;
  let gateway: FakeGateway;
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

  let userSeq = 0;
  const seedUser = async () =>
    prisma.user.create({ data: { phoneCountryCode: '+91', phone: `${Date.now()}${userSeq++}` } });

  const seedMR = async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Bengaluru',
    });
    return { merchantId: m.id, restaurantId: r.id };
  };

  const seedGlobalOffer = async () => {
    const code = uniq('SAVE').toUpperCase();
    await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: true,
        isGlobal: true,
        discountPercent: 10,
        coupons: { create: [{ code }] },
      },
    });
    return { code };
  };

  const paySign = (o: string, p: string) =>
    computePaymentSignature({ razorpayOrderId: o, razorpayPaymentId: p, keySecret });

  // Order + captured PaymentIntent. Returns intent + merchant/restaurant + order.
  const capturedIntent = async (
    opts: { unitPriceMinor?: bigint; userId?: string | null; couponCode?: string } = {},
  ) => {
    const mr = await seedMR();
    const input: CreateOrderInput = {
      orderNumber: uniq('ORD'),
      restaurantId: mr.restaurantId,
      type: 'HOME_DELIVERY',
      userId: opts.userId ?? null,
      items: [{ nameSnapshot: 'Item', unitPriceMinor: opts.unitPriceMinor ?? 20000n, quantity: 1 }],
      couponCode: opts.couponCode,
    };
    const order = await orders.createOrder(staffOf(mr.merchantId), input);
    const razorpayOrderId = uniq('order');
    const intent = await payments.createIntent({ orderId: order.id, razorpayOrderId });
    const paymentId = uniq('pay');
    await payments.verifyAndCapture({
      razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: paySign(razorpayOrderId, paymentId),
    });
    return { order, intent, paymentId, ...mr };
  };

  const refundWebhook = (
    providerRefundId: string,
    paymentId: string,
    amount: number,
    event = 'refund.processed',
  ) => {
    const body = JSON.stringify({
      id: uniq('evt'),
      event,
      payload: {
        refund: {
          entity: {
            id: providerRefundId,
            payment_id: paymentId,
            amount,
            status: event === 'refund.processed' ? 'processed' : 'failed',
          },
        },
      },
    });
    return { body, sig: computeWebhookSignature({ rawBody: body, webhookSecret }) };
  };

  const counts = async (paymentIntentId: string) => ({
    refunds: await prisma.refund.count({ where: { paymentIntentId } }),
    processedRefunds: await prisma.refund.count({
      where: { paymentIntentId, status: 'PROCESSED' },
    }),
    transactions: await prisma.transaction.count({ where: { paymentIntentId, type: 'REFUND' } }),
    walletEntries: await prisma.walletEntry.count({
      where: { transactions: { some: { paymentIntentId, type: 'REFUND' } } },
    }),
  });

  beforeAll(async () => {
    gateway = new FakeGateway();
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
    })
      .overrideProvider(RazorpayRefundGateway)
      .useValue(gateway)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    orders = app.get(OrderService);
    payments = app.get(PaymentService);
    refunds = app.get(RefundService);
    webhook = app.get(RazorpayWebhookService);
    const config = app.get(ConfigService);
    keySecret = config.get<string>('RAZORPAY_KEY_SECRET')!;
    webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET')!;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    gateway.mode = 'pending';
    gateway.calls = 0;
    gateway.lastReq = undefined;
  });

  // ---- AUTHORIZATION ----
  it('authorizes a refund by merchant-scoped staff and rejects another merchant', async () => {
    const user = await seedUser();
    const { intent, merchantId, paymentId } = await capturedIntent({ userId: user.id });
    const other = await seedMR();
    // wrong merchant -> Forbidden, no refund
    await expect(
      refunds.requestRefund(staffOf(other.merchantId), {
        paymentIntentId: intent.id,
        method: 'RAZORPAY',
        idempotencyKey: uniq('idk'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(0);
    // correct merchant -> INITIATED (pending)
    const res = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: uniq('idk'),
    });
    expect(res.status).toBe('INITIATED');
    expect(res.providerRefundId).toBeTruthy();
    expect(gateway.lastReq?.providerPaymentId).toBe(paymentId);
    expect(gateway.lastReq?.amountMinor).toBe(20000n);
    // no financial effects until PROCESSED
    expect((await counts(intent.id)).transactions).toBe(0);
  });

  // ---- PROVIDER LIFECYCLE ----
  it('initiated → refund.processed webhook applies effects exactly once (full refund, coupon reversed)', async () => {
    const user = await seedUser();
    const { code } = await seedGlobalOffer();
    const { intent, order, merchantId, paymentId } = await capturedIntent({
      userId: user.id,
      couponCode: code,
    });
    const idk = uniq('idk');
    const init = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    expect(init.status).toBe('INITIATED');
    const providerRefundId = `rfnd_${idk}`;
    // delayed webhook completes it
    const { body, sig } = refundWebhook(providerRefundId, paymentId, Number(intent.amountMinor));
    const w1 = await webhook.ingest(body, sig);
    expect(w1.processingStatus).toBe('PROCESSED');
    // duplicate webhook is a no-op
    const dup = refundWebhook(providerRefundId, paymentId, Number(intent.amountMinor));
    await webhook.ingest(dup.body, dup.sig);
    const c = await counts(intent.id);
    expect(c).toEqual({ refunds: 1, processedRefunds: 1, transactions: 1, walletEntries: 1 });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(intent.amountMinor);
    expect(
      (await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status,
    ).toBe('REFUNDED');
    expect(
      (await prisma.couponRedemption.findFirstOrThrow({ where: { orderId: order.id } })).status,
    ).toBe('REVERSED');
  });

  it('synchronous processed provider response completes immediately; later duplicate webhook is a no-op', async () => {
    const user = await seedUser();
    const { intent, merchantId, paymentId } = await capturedIntent({ userId: user.id });
    gateway.mode = 'processed';
    const idk = uniq('idk');
    const res = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    expect(res.status).toBe('PROCESSED');
    expect(res.fullyRefunded).toBe(true);
    const { body, sig } = refundWebhook(`rfnd_${idk}`, paymentId, Number(intent.amountMinor));
    await webhook.ingest(body, sig); // duplicate completion
    expect((await counts(intent.id)).transactions).toBe(1);
  });

  it('refund.failed webhook releases the reservation (no effects); the amount can be refunded again', async () => {
    const user = await seedUser();
    const { intent, merchantId, paymentId } = await capturedIntent({ userId: user.id });
    const idk = uniq('idk');
    await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    const failed = refundWebhook(
      `rfnd_${idk}`,
      paymentId,
      Number(intent.amountMinor),
      'refund.failed',
    );
    await webhook.ingest(failed.body, failed.sig);
    expect((await counts(intent.id)).transactions).toBe(0);
    expect((await prisma.refund.findUniqueOrThrow({ where: { idempotencyKey: idk } })).status).toBe(
      'FAILURE',
    );
    // reservation released -> a fresh full refund succeeds
    gateway.mode = 'processed';
    const retry = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: uniq('idk'),
    });
    expect(retry.status).toBe('PROCESSED');
  });

  // ---- PARTIAL ----
  it('partial provider refund credits wallet on completion and does not reverse the coupon', async () => {
    const user = await seedUser();
    const { code } = await seedGlobalOffer();
    const { intent, order, merchantId, paymentId } = await capturedIntent({
      userId: user.id,
      couponCode: code,
    });
    const idk = uniq('idk');
    await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      amountMinor: 1000n,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    const { body, sig } = refundWebhook(`rfnd_${idk}`, paymentId, 1000);
    await webhook.ingest(body, sig);
    expect(
      (await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status,
    ).toBe('PARTIALLY_REFUNDED');
    expect(
      (await prisma.couponRedemption.findFirstOrThrow({ where: { orderId: order.id } })).status,
    ).toBe('ACTIVE');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(1000n);
  });

  // ---- AMOUNT RECONCILIATION ----
  it('reserves multiple provider refunds up to captured and rejects the excess; completes to full', async () => {
    const user = await seedUser();
    const { intent, merchantId, paymentId } = await capturedIntent({
      userId: user.id,
      unitPriceMinor: 100n,
    });
    const idks = [uniq('a'), uniq('b'), uniq('c')];
    for (const [amt, idk] of [
      [30n, idks[0]],
      [40n, idks[1]],
      [30n, idks[2]],
    ] as const) {
      await refunds.requestRefund(staffOf(merchantId), {
        paymentIntentId: intent.id,
        amountMinor: amt,
        method: 'RAZORPAY',
        idempotencyKey: idk,
      });
    }
    // remaining reserved to 0 -> 4th rejected
    await expect(
      refunds.requestRefund(staffOf(merchantId), {
        paymentIntentId: intent.id,
        amountMinor: 1n,
        method: 'RAZORPAY',
        idempotencyKey: uniq('d'),
      }),
    ).rejects.toThrow();
    // complete all three via webhook
    for (const [amt, idk] of [
      [30, idks[0]],
      [40, idks[1]],
      [30, idks[2]],
    ] as const) {
      const { body, sig } = refundWebhook(`rfnd_${idk}`, paymentId, amt);
      await webhook.ingest(body, sig);
    }
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(100n);
    expect(
      (await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status,
    ).toBe('REFUNDED');
  });

  // ---- IDEMPOTENCY / DUPLICATE ----
  it('is idempotent for a repeated refund request (same key): one refund, one provider call', async () => {
    const user = await seedUser();
    const { intent, merchantId } = await capturedIntent({ userId: user.id });
    const idk = uniq('idk');
    const first = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    const second = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    expect(second.refundId).toBe(first.refundId);
    expect(gateway.calls).toBe(1);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(1);
  });

  // ---- CONCURRENCY ----
  it('two concurrent full provider refunds cannot exceed the captured amount', async () => {
    const user = await seedUser();
    const { intent, merchantId } = await capturedIntent({ userId: user.id });
    const results = await Promise.allSettled([
      refunds.requestRefund(staffOf(merchantId), {
        paymentIntentId: intent.id,
        method: 'RAZORPAY',
        idempotencyKey: uniq('a'),
      }),
      refunds.requestRefund(staffOf(merchantId), {
        paymentIntentId: intent.id,
        method: 'RAZORPAY',
        idempotencyKey: uniq('b'),
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.refund.count({
        where: { paymentIntentId: intent.id, status: { not: 'FAILURE' } },
      }),
    ).toBe(1);
  });

  // ---- RECOVERY ----
  it('provider timeout leaves the refund INITIATED and does not issue a duplicate on retry', async () => {
    const user = await seedUser();
    const { intent, merchantId } = await capturedIntent({ userId: user.id });
    gateway.mode = 'throw';
    const idk = uniq('idk');
    await expect(
      refunds.requestRefund(staffOf(merchantId), {
        paymentIntentId: intent.id,
        method: 'RAZORPAY',
        idempotencyKey: idk,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    // the reserved refund persists as INITIATED
    const refund = await prisma.refund.findUniqueOrThrow({ where: { idempotencyKey: idk } });
    expect(refund.status).toBe('INITIATED');
    // retry with the same key does NOT call the provider again (no duplicate refund)
    const retry = await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    expect(retry.refundId).toBe(refund.id);
    expect(gateway.calls).toBe(1);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(1);
  });

  // ---- WEBHOOK SECURITY ----
  it('rejects a refund webhook with an invalid signature', async () => {
    const user = await seedUser();
    const { intent, merchantId, paymentId } = await capturedIntent({ userId: user.id });
    const idk = uniq('idk');
    await refunds.requestRefund(staffOf(merchantId), {
      paymentIntentId: intent.id,
      method: 'RAZORPAY',
      idempotencyKey: idk,
    });
    const { body } = refundWebhook(`rfnd_${idk}`, paymentId, Number(intent.amountMinor));
    await expect(webhook.ingest(body, 'bad-signature')).rejects.toThrow();
    expect((await counts(intent.id)).transactions).toBe(0);
  });
});
