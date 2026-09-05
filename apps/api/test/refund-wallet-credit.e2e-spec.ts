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
import { RefundService } from '../src/modules/payment/application/refund.service';
import { computePaymentSignature } from '../src/modules/payment/domain/razorpay-signature';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import type { CreateOrderInput } from '../src/modules/ordering/domain/ordering.types';

/**
 * P1.7.29 — Refund + wallet-credit foundation.
 *
 * A refund is a WALLET credit against a CAPTURED PaymentIntent: atomic Refund +
 * WalletEntry(CREDIT) + Transaction(REFUND/CREDIT). A FULL refund reverses the
 * order's ACTIVE CouponRedemption (OD-REF-1); a partial refund does not. Total
 * successful refunds never exceed the captured amount; processing is idempotent
 * and concurrency-safe. No settlement, no commit-point move, no historical migration.
 */
describe('Refund + wallet credit (P1.7.29)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let orders: OrderService;
  let payments: PaymentService;
  let refunds: RefundService;
  let keySecret: string;

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

  const sign = (o: string, p: string) =>
    computePaymentSignature({ razorpayOrderId: o, razorpayPaymentId: p, keySecret });

  // Create an order, a PaymentIntent, and capture it. Returns the captured intent
  // (intent.amountMinor === order.grandTotalMinor).
  const capturedIntent = async (
    opts: {
      unitPriceMinor?: bigint;
      quantity?: number;
      userId?: string | null;
      couponCode?: string;
      merchantId?: string;
      restaurantId?: string;
    } = {},
  ) => {
    const mr =
      opts.merchantId && opts.restaurantId
        ? { merchantId: opts.merchantId, restaurantId: opts.restaurantId }
        : await seedMR();
    const input: CreateOrderInput = {
      orderNumber: uniq('ORD'),
      restaurantId: mr.restaurantId,
      type: 'HOME_DELIVERY',
      userId: opts.userId ?? null,
      items: [
        {
          nameSnapshot: 'Item',
          unitPriceMinor: opts.unitPriceMinor ?? 20000n,
          quantity: opts.quantity ?? 1,
        },
      ],
      couponCode: opts.couponCode,
    };
    const order = await orders.createOrder(staffOf(mr.merchantId), input);
    const razorpayOrderId = uniq('order');
    const intent = await payments.createIntent({ orderId: order.id, razorpayOrderId });
    const paymentId = uniq('pay');
    await payments.verifyAndCapture({
      razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: sign(razorpayOrderId, paymentId),
    });
    return { order, intent, ...mr };
  };

  const seedGlobalOffer = async () => {
    const code = uniq('SAVE').toUpperCase();
    const offer = await prisma.offer.create({
      data: {
        title: uniq('Offer'),
        active: true,
        isGlobal: true,
        discountPercent: 10,
        coupons: { create: [{ code }] },
      },
      include: { coupons: true },
    });
    return { code, offerId: offer.id };
  };

  const counts = async (paymentIntentId: string, refundId?: string) => ({
    refunds: await prisma.refund.count({ where: { paymentIntentId } }),
    transactions: await prisma.transaction.count({ where: { paymentIntentId, type: 'REFUND' } }),
    walletEntries: refundId ? await prisma.walletEntry.count({ where: { refId: refundId } }) : 0,
  });

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
    refunds = app.get(RefundService);
    keySecret = app.get(ConfigService).get<string>('RAZORPAY_KEY_SECRET')!;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- FULL REFUND ----
  it('processes a full refund: one Refund + one WalletEntry + one Transaction; wallet credited', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id }); // captured 20000
    const res = await refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') });
    expect(res.created).toBe(true);
    expect(res.status).toBe('PROCESSED');
    expect(res.amountMinor).toBe(20000n);
    expect(res.fullyRefunded).toBe(true);
    expect(res.intentStatus).toBe('REFUNDED');
    expect(res.walletBalanceMinor).toBe(20000n);
    const c = await counts(intent.id, res.refundId);
    expect(c).toEqual({ refunds: 1, transactions: 1, walletEntries: 1 });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(20000n);
  });

  it('reverses an ACTIVE coupon redemption on a FULL refund', async () => {
    const user = await seedUser();
    const { code } = await seedGlobalOffer();
    const { order, intent } = await capturedIntent({ userId: user.id, couponCode: code });
    // coupon redemption is ACTIVE after order placement
    expect(
      (await prisma.couponRedemption.findFirstOrThrow({ where: { orderId: order.id } })).status,
    ).toBe('ACTIVE');
    const res = await refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') });
    expect(res.couponReversed).toBe(true);
    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(redemption.status).toBe('REVERSED');
    expect(redemption.reversedAt).not.toBeNull();
  });

  it('full refund on an order without a coupon does not report a reversal', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id });
    const res = await refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') });
    expect(res.fullyRefunded).toBe(true);
    expect(res.couponReversed).toBe(false);
  });

  // ---- PARTIAL REFUND ----
  it('processes a partial refund, credits the wallet, and leaves the intent PARTIALLY_REFUNDED', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id }); // 20000
    const res = await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 5000n,
      idempotencyKey: uniq('idk'),
    });
    expect(res.amountMinor).toBe(5000n);
    expect(res.fullyRefunded).toBe(false);
    expect(res.intentStatus).toBe('PARTIALLY_REFUNDED');
    expect(res.walletBalanceMinor).toBe(5000n);
  });

  it('does NOT reverse the coupon on a partial refund', async () => {
    const user = await seedUser();
    const { code } = await seedGlobalOffer();
    const { order, intent } = await capturedIntent({ userId: user.id, couponCode: code });
    const res = await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 1000n,
      idempotencyKey: uniq('idk'),
    });
    expect(res.couponReversed).toBe(false);
    expect(
      (await prisma.couponRedemption.findFirstOrThrow({ where: { orderId: order.id } })).status,
    ).toBe('ACTIVE');
  });

  // ---- MULTIPLE REFUNDS / REMAINING AMOUNT ----
  it('allows sequential partial refunds up to the captured amount and rejects the excess', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id, unitPriceMinor: 100n, quantity: 1 }); // captured 100
    await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 30n,
      idempotencyKey: uniq('idk'),
    });
    await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 40n,
      idempotencyKey: uniq('idk'),
    });
    const third = await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 30n,
      idempotencyKey: uniq('idk'),
    });
    expect(third.fullyRefunded).toBe(true);
    expect(third.intentStatus).toBe('REFUNDED');
    await expect(
      refunds.refund({ paymentIntentId: intent.id, amountMinor: 1n, idempotencyKey: uniq('idk') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(100n);
    expect(
      await prisma.refund.count({ where: { paymentIntentId: intent.id, status: 'PROCESSED' } }),
    ).toBe(3);
  });

  // ---- IDEMPOTENCY ----
  it('is idempotent for a repeated refund request (same key): no duplicate effects', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id });
    const key = uniq('idk');
    const first = await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 5000n,
      idempotencyKey: key,
    });
    const second = await refunds.refund({
      paymentIntentId: intent.id,
      amountMinor: 5000n,
      idempotencyKey: key,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.refundId).toBe(first.refundId);
    const c = await counts(intent.id, first.refundId);
    expect(c).toEqual({ refunds: 1, transactions: 1, walletEntries: 1 });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(5000n); // credited once
  });

  // ---- CONCURRENCY ----
  it('two concurrent full refunds cannot exceed the captured amount', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id }); // 20000
    const results = await Promise.allSettled([
      refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') }),
      refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceMinor).toBe(20000n);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(1);
  });

  // ---- FAILURE / VALIDATION ----
  it('rejects a refund against an uncaptured payment (no financial effects)', async () => {
    const user = await seedUser();
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(staffOf(merchantId), {
      orderNumber: uniq('ORD'),
      restaurantId,
      type: 'HOME_DELIVERY',
      userId: user.id,
      items: [{ nameSnapshot: 'Item', unitPriceMinor: 20000n, quantity: 1 }],
    });
    const intent = await payments.createIntent({
      orderId: order.id,
      razorpayOrderId: uniq('order'),
    }); // CREATED, not captured
    await expect(
      refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(0);
    expect(
      await prisma.transaction.count({ where: { paymentIntentId: intent.id, type: 'REFUND' } }),
    ).toBe(0);
  });

  it('rejects a refund that exceeds the remaining amount and an invalid (<=0) amount', async () => {
    const user = await seedUser();
    const { intent } = await capturedIntent({ userId: user.id }); // 20000
    await expect(
      refunds.refund({
        paymentIntentId: intent.id,
        amountMinor: 20001n,
        idempotencyKey: uniq('idk'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      refunds.refund({ paymentIntentId: intent.id, amountMinor: 0n, idempotencyKey: uniq('idk') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(0);
  });

  it('rejects a refund when the order has no customer wallet owner', async () => {
    const { intent } = await capturedIntent({ userId: null }); // guest order
    await expect(
      refunds.refund({ paymentIntentId: intent.id, idempotencyKey: uniq('idk') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.refund.count({ where: { paymentIntentId: intent.id } })).toBe(0);
  });
});
