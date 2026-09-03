import { BadRequestException, INestApplication, NotFoundException } from '@nestjs/common';
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
import { SettlementModule } from '../src/modules/settlement/settlement.module';
import { SettlementService } from '../src/modules/settlement/application/settlement.service';
import { RazorpayxPayoutGateway } from '../src/modules/settlement/infrastructure/razorpayx-payout.gateway';
import { TipModule } from '../src/modules/tip/tip.module';
import { TipService } from '../src/modules/tip/application/tip.service';
import { computePaymentSignature } from '../src/modules/payment/domain/razorpay-signature';
import {
  calculatePercentageTip,
  resolveTip,
  TipValidationError,
} from '../src/modules/tip/domain/tip-calculation';
import type {
  ProviderPayoutRequest,
  ProviderPayoutResponse,
} from '../src/modules/settlement/domain/settlement.types';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

class FakePayoutGateway {
  async createPayout(req: ProviderPayoutRequest): Promise<ProviderPayoutResponse> {
    return { providerPayoutId: `pout_${req.idempotencyKey}`, status: 'pending' };
  }
}

describe('Tip collection/capture foundation (P1.7.38)', () => {
  // ---- pure calculation/validation (no DB) ----
  describe('tip calculation + validation', () => {
    it('computes 10/15/20% via exact integer floor', () => {
      expect(calculatePercentageTip(10000n, 1000)).toBe(1000n); // 10% of 100.00 = 10.00
      expect(calculatePercentageTip(10000n, 1500)).toBe(1500n);
      expect(calculatePercentageTip(10000n, 2000)).toBe(2000n);
      // rounding: 15% of 123.45 (12345) = 1851.75 -> floor 1851
      expect(calculatePercentageTip(12345n, 1500)).toBe(1851n);
    });
    it('resolves an approved percentage and a custom amount', () => {
      expect(resolveTip({ basisMinor: 10000n, percentBps: 2000 })).toEqual({
        amountMinor: 2000n,
        percentBps: 2000,
        isCustom: false,
      });
      expect(resolveTip({ basisMinor: 10000n, customAmountMinor: 4200n })).toEqual({
        amountMinor: 4200n,
        percentBps: null,
        isCustom: true,
      });
    });
    it('rejects invalid percentage, missing/both selection, and non-positive custom', () => {
      expect(() => resolveTip({ basisMinor: 10000n, percentBps: 1200 })).toThrow(
        TipValidationError,
      );
      expect(() => resolveTip({ basisMinor: 10000n })).toThrow(TipValidationError);
      expect(() =>
        resolveTip({ basisMinor: 10000n, percentBps: 1000, customAmountMinor: 1n }),
      ).toThrow(TipValidationError);
      expect(() => resolveTip({ basisMinor: 10000n, customAmountMinor: 0n })).toThrow(
        TipValidationError,
      );
      expect(() => resolveTip({ basisMinor: 0n, percentBps: 1000 })).toThrow(TipValidationError);
    });
  });

  // ---- integration ----
  describe('integration', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let provisioning: MerchantProvisioningService;
    let orders: OrderService;
    let payments: PaymentService;
    let settlements: SettlementService;
    let tips: TipService;
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

    const seedMR = async (commissionBps?: number) => {
      const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
      const r = await provisioning.createRestaurant(staffOf(m.id), {
        merchantId: m.id,
        name: uniq('R'),
        city: 'Bengaluru',
      });
      if (commissionBps !== undefined) {
        await prisma.restaurant.update({ where: { id: r.id }, data: { commissionBps } });
      }
      return { merchantId: m.id, restaurantId: r.id };
    };

    const paySign = (o: string, p: string) =>
      computePaymentSignature({ razorpayOrderId: o, razorpayPaymentId: p, keySecret });

    // Create an order with a known grand total (subtotal only unless overridden).
    const makeOrder = async (
      merchantId: string,
      restaurantId: string,
      over: { unitPriceMinor?: bigint; taxTotalMinor?: bigint; deliveryChargeMinor?: bigint } = {},
    ) => {
      return orders.createOrder(staffOf(merchantId), {
        orderNumber: uniq('ORD'),
        restaurantId,
        type: 'HOME_DELIVERY',
        items: [
          { nameSnapshot: 'Item', unitPriceMinor: over.unitPriceMinor ?? 10000n, quantity: 1 },
        ],
        taxTotalMinor: over.taxTotalMinor,
        deliveryChargeMinor: over.deliveryChargeMinor,
      });
    };

    // Collect a tip end-to-end: create tip intent + verified capture.
    const collectTip = async (
      orderId: string,
      sel: { percentBps?: number; customAmountMinor?: bigint },
    ) => {
      const rzp = uniq('torder');
      const intent = await tips.createTip({
        orderId,
        razorpayOrderId: rzp,
        percentBps: sel.percentBps ?? null,
        customAmountMinor: sel.customAmountMinor ?? null,
      });
      const payId = uniq('tpay');
      const captured = await tips.verifyAndCaptureTip({
        razorpayOrderId: rzp,
        razorpayPaymentId: payId,
        razorpaySignature: paySign(rzp, payId),
      });
      return { rzp, payId, intent, captured };
    };

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
          TipModule,
          SettlementModule,
        ],
      })
        .overrideProvider(RazorpayxPayoutGateway)
        .useValue(new FakePayoutGateway())
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
      provisioning = app.get(MerchantProvisioningService);
      orders = app.get(OrderService);
      payments = app.get(PaymentService);
      settlements = app.get(SettlementService);
      tips = app.get(TipService);
      keySecret = app.get(ConfigService).get<string>('RAZORPAY_KEY_SECRET')!;
    });

    afterAll(async () => {
      await app.close();
    });

    // ---- collection lifecycle ----
    it('creates a tip intent (uncollected) and only marks COLLECTED after verified capture', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId); // grand = 10000
      const rzp = uniq('torder');
      const intent = await tips.createTip({
        orderId: order.id,
        razorpayOrderId: rzp,
        percentBps: 1500,
      });
      expect(intent.status).toBe('CREATED'); // intent is NOT collected money
      expect(intent.amountMinor).toBe(1500n); // 15% of 10000, server-calculated
      expect(intent.basisMinor).toBe(10000n);
      expect(intent.beneficiaryPolicy).toBe('MERCHANT');

      const payId = uniq('tpay');
      const cap = await tips.verifyAndCaptureTip({
        razorpayOrderId: rzp,
        razorpayPaymentId: payId,
        razorpaySignature: paySign(rzp, payId),
      });
      expect(cap.created).toBe(true);
      expect(cap.tip.status).toBe('CAPTURED');
      expect(cap.tip.capturedAt).not.toBeNull();
      expect(cap.tip.razorpayPaymentId).toBe(payId);
    });

    it('collects a custom tip amount', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      const { captured } = await collectTip(order.id, { customAmountMinor: 7777n });
      expect(captured.tip.isCustom).toBe(true);
      expect(captured.tip.percentBps).toBeNull();
      expect(captured.tip.amountMinor).toBe(7777n);
      expect(captured.tip.status).toBe('CAPTURED');
    });

    it('rejects a non-approved percentage and a cancelled-order tip', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      await expect(
        tips.createTip({ orderId: order.id, razorpayOrderId: uniq('t'), percentBps: 1200 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await orders.transitionStatus(staffOf(merchantId), order.id, 'CANCELLED');
      await expect(
        tips.createTip({ orderId: order.id, razorpayOrderId: uniq('t'), percentBps: 1500 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a tip for an unknown order', async () => {
      await expect(
        tips.createTip({
          orderId: '00000000-0000-0000-0000-0000000000ff',
          razorpayOrderId: uniq('t'),
          percentBps: 1000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // ---- verification / server authority ----
    it('rejects an invalid signature and an amount/currency mismatch', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      const rzp = uniq('torder');
      await tips.createTip({ orderId: order.id, razorpayOrderId: rzp, percentBps: 2000 });
      const payId = uniq('tpay');
      await expect(
        tips.verifyAndCaptureTip({
          razorpayOrderId: rzp,
          razorpayPaymentId: payId,
          razorpaySignature: 'deadbeef',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        tips.verifyAndCaptureTip({
          razorpayOrderId: rzp,
          razorpayPaymentId: payId,
          razorpaySignature: paySign(rzp, payId),
          amountMinor: 9999n, // != 2000
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        tips.verifyAndCaptureTip({
          razorpayOrderId: rzp,
          razorpayPaymentId: payId,
          razorpaySignature: paySign(rzp, payId),
          currencyCode: 'USD',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ---- idempotency / one-captured-per-order ----
    it('is idempotent for a repeated capture and per provider order id', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      const rzp = uniq('torder');
      const first = await tips.createTip({
        orderId: order.id,
        razorpayOrderId: rzp,
        percentBps: 1000,
      });
      // duplicate intent create for same provider order -> same record
      const dup = await tips.createTip({
        orderId: order.id,
        razorpayOrderId: rzp,
        percentBps: 1000,
      });
      expect(dup.id).toBe(first.id);

      const payId = uniq('tpay');
      const cap1 = await tips.verifyAndCaptureTip({
        razorpayOrderId: rzp,
        razorpayPaymentId: payId,
        razorpaySignature: paySign(rzp, payId),
      });
      const cap2 = await tips.verifyAndCaptureTip({
        razorpayOrderId: rzp,
        razorpayPaymentId: payId,
        razorpaySignature: paySign(rzp, payId),
      });
      expect(cap1.created).toBe(true);
      expect(cap2.created).toBe(false); // idempotent no-op
      expect(cap2.tip.id).toBe(cap1.tip.id);

      const all = await prisma.tipPayment.findMany({ where: { orderId: order.id } });
      const captured = all.filter((t) => t.status === 'CAPTURED');
      expect(captured).toHaveLength(1); // exactly one collected tip
    });

    it('enforces at most one CAPTURED tip per order (partial unique index)', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      await collectTip(order.id, { percentBps: 1000 });
      // a second, distinct tip intent for the same order cannot also be captured
      const rzp2 = uniq('torder');
      await tips.createTip({ orderId: order.id, razorpayOrderId: rzp2, percentBps: 1500 });
      const pay2 = uniq('tpay');
      const res = await tips.verifyAndCaptureTip({
        razorpayOrderId: rzp2,
        razorpayPaymentId: pay2,
        razorpaySignature: paySign(rzp2, pay2),
      });
      expect(res.created).toBe(false); // partial-unique rollback -> no duplicate collection
      const captured = (await prisma.tipPayment.findMany({ where: { orderId: order.id } })).filter(
        (t) => t.status === 'CAPTURED',
      );
      expect(captured).toHaveLength(1);
    });

    it('concurrent captures of the same tip create exactly one collected tip', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      const rzp = uniq('torder');
      await tips.createTip({ orderId: order.id, razorpayOrderId: rzp, percentBps: 2000 });
      const payId = uniq('tpay');
      const results = await Promise.allSettled([
        tips.verifyAndCaptureTip({
          razorpayOrderId: rzp,
          razorpayPaymentId: payId,
          razorpaySignature: paySign(rzp, payId),
        }),
        tips.verifyAndCaptureTip({
          razorpayOrderId: rzp,
          razorpayPaymentId: payId,
          razorpaySignature: paySign(rzp, payId),
        }),
      ]);
      const created = results.filter((r) => r.status === 'fulfilled' && r.value.created);
      expect(created.length).toBeLessThanOrEqual(1);
      const captured = (await prisma.tipPayment.findMany({ where: { orderId: order.id } })).filter(
        (t) => t.status === 'CAPTURED',
      );
      expect(captured).toHaveLength(1);
    });

    // ---- FINANCIAL ISOLATION (hard requirement) ----
    it('collecting a tip does NOT change grandTotalMinor, the order payment, commission, or settlement', async () => {
      const { merchantId, restaurantId } = await seedMR(1000); // 10% commission
      const order = await makeOrder(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const grandBefore = order.grandTotalMinor;

      // capture the ORDER payment
      const rzpOrder = uniq('order');
      const orderIntent = await payments.createIntent({
        orderId: order.id,
        razorpayOrderId: rzpOrder,
      });
      const orderPayId = uniq('pay');
      await payments.verifyAndCapture({
        razorpayOrderId: rzpOrder,
        razorpayPaymentId: orderPayId,
        razorpaySignature: paySign(rzpOrder, orderPayId),
      });
      // backdate + complete for settlement eligibility
      await prisma.paymentAttempt.updateMany({
        where: { paymentIntentId: orderIntent.id, status: 'CAPTURED' },
        data: { createdAt: new Date(Date.now() - 6 * 24 * 3600_000) },
      });
      for (const s of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] as const) {
        await orders.transitionStatus(staffOf(merchantId), order.id, s);
      }

      // collect a large tip
      await collectTip(order.id, { customAmountMinor: 50000n });

      // order economics unchanged
      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(persisted.grandTotalMinor).toBe(grandBefore); // 10000
      const orderIntentRow = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: orderIntent.id },
      });
      expect(orderIntentRow.amountMinor).toBe(10000n); // order payment excludes the tip

      // settlement gross + commission exclude the tip entirely
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(10000n);
      expect(s.commissionBasisMinor).toBe(10000n);
      expect(s.commissionMinor).toBe(1000n); // 10% of 10000, not of 10000+tip
      expect(s.netAmountMinor).toBe(9000n);

      // no settlement item references the tip payment
      const tipRows = await prisma.tipPayment.findMany({ where: { orderId: order.id } });
      const tip = tipRows.find((t) => t.status === 'CAPTURED')!;
      expect(tip.amountMinor).toBe(50000n);
      const settlementItems = await prisma.settlementItem.findMany({
        where: { orderId: order.id },
      });
      // exactly one item (the order payment intent); none carries the tip amount
      expect(settlementItems.every((it) => it.amountMinor === 10000n)).toBe(true);
    });

    // ---- refund foundation ----
    it('records tip refund state (partial then full) idempotently, capped at the collected amount', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const order = await makeOrder(merchantId, restaurantId);
      const { captured } = await collectTip(order.id, { customAmountMinor: 10000n });
      const tipId = captured.tip.id;

      const partial = await tips.recordTipRefundState({
        tipId,
        amountMinor: 4000n,
        providerRefundId: uniq('rfnd'),
        refundStatus: 'PROCESSED',
      });
      expect(partial.status).toBe('PARTIALLY_REFUNDED');
      expect(partial.refundedAmountMinor).toBe(4000n);

      const full = await tips.recordTipRefundState({
        tipId,
        amountMinor: 6000n,
        providerRefundId: uniq('rfnd'),
        refundStatus: 'PROCESSED',
      });
      expect(full.status).toBe('REFUNDED');
      expect(full.refundedAmountMinor).toBe(10000n);

      // over-refund rejected
      await expect(
        tips.recordTipRefundState({
          tipId,
          amountMinor: 1n,
          providerRefundId: uniq('rfnd'),
          refundStatus: 'PROCESSED',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // duplicate providerRefundId is idempotent (no double-refund)
      const dupKey = uniq('rfnd');
      const t2 = await makeOrder(merchantId, restaurantId);
      const c2 = await collectTip(t2.id, { customAmountMinor: 5000n });
      const r1 = await tips.recordTipRefundState({
        tipId: c2.captured.tip.id,
        amountMinor: 2000n,
        providerRefundId: dupKey,
        refundStatus: 'PROCESSED',
      });
      const r2 = await tips.recordTipRefundState({
        tipId: c2.captured.tip.id,
        amountMinor: 2000n,
        providerRefundId: dupKey,
        refundStatus: 'PROCESSED',
      });
      expect(r2.refundedAmountMinor).toBe(r1.refundedAmountMinor); // no double-apply
    });
  });
});
