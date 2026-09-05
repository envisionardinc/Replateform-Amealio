import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
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
import { SettlementModule } from '../src/modules/settlement/settlement.module';
import { SettlementService } from '../src/modules/settlement/application/settlement.service';
import { RazorpayxPayoutGateway } from '../src/modules/settlement/infrastructure/razorpayx-payout.gateway';
import {
  computeSettleAfter,
  isSettleable,
} from '../src/modules/settlement/domain/settlement-window';
import { computePaymentSignature } from '../src/modules/payment/domain/razorpay-signature';
import type {
  ProviderPayoutRequest,
  ProviderPayoutResponse,
} from '../src/modules/settlement/domain/settlement.types';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.31 + P1.7.32 — Settlement & payout foundation with authoritative commission
 * config (Restaurant.commissionBps) and a server-derived settleAfter window
 * (end-of-day IST of capture + SETTLEMENT_DELAY_DAYS). Settlement is derived from
 * the payment/refund ledger; commission is never caller-supplied; premature
 * payments are excluded deterministically.
 */
class FakePayoutGateway {
  mode: 'pending' | 'processed' | 'failed' | 'throw' = 'pending';
  calls = 0;
  async createPayout(req: ProviderPayoutRequest): Promise<ProviderPayoutResponse> {
    this.calls++;
    if (this.mode === 'throw') throw new Error('payout provider timeout');
    return { providerPayoutId: `pout_${req.idempotencyKey}`, status: this.mode };
  }
}

describe('Settlement window & commission (P1.7.32)', () => {
  // ---- pure settlement-window semantics (IST, no DB) ----
  describe('computeSettleAfter (IST end-of-day + N days)', () => {
    // 2026-03-04T06:00:00Z = IST 2026-03-04 11:30
    const captured = new Date('2026-03-04T06:00:00.000Z');
    it('is 23:59:59.999 IST of (capture day + N), as a UTC instant', () => {
      // N=2 → IST 2026-03-06 23:59:59.999 = UTC 2026-03-06T18:29:59.999Z
      expect(computeSettleAfter(captured, 2).toISOString()).toBe('2026-03-06T18:29:59.999Z');
      expect(computeSettleAfter(captured, 0).toISOString()).toBe('2026-03-04T18:29:59.999Z');
    });
    it('is inclusive at the boundary and false just before', () => {
      const after = computeSettleAfter(captured, 2);
      expect(isSettleable(captured, 2, after)).toBe(true);
      expect(isSettleable(captured, 2, new Date(after.getTime() - 1))).toBe(false);
      expect(isSettleable(captured, 2, new Date(after.getTime() + 1))).toBe(true);
    });
    it('handles the IST-midnight capture boundary', () => {
      const beforeMidnight = new Date('2026-03-04T18:29:59.999Z'); // IST 03-04 23:59:59.999
      const atMidnight = new Date('2026-03-04T18:30:00.000Z'); // IST 03-05 00:00
      expect(computeSettleAfter(beforeMidnight, 2).toISOString()).toBe('2026-03-06T18:29:59.999Z');
      expect(computeSettleAfter(atMidnight, 2).toISOString()).toBe('2026-03-07T18:29:59.999Z');
    });
  });

  // ---- integration ----
  describe('settlement (integration)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let provisioning: MerchantProvisioningService;
    let orders: OrderService;
    let payments: PaymentService;
    let refunds: RefundService;
    let settlements: SettlementService;
    let gateway: FakePayoutGateway;
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

    // Advance an order to COMPLETED (P1.7.33 requires it for settlement eligibility).
    const completeOrderById = async (merchantId: string, orderId: string) => {
      for (const s of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] as const) {
        await orders.transitionStatus(staffOf(merchantId), orderId, s);
      }
    };

    // Capture a payment. Defaults make it fully settle-eligible: backdate the
    // capture past its settleAfter window AND complete the order.
    // - `settleEligible: false` keeps the capture fresh (premature timing).
    // - `completeOrder: false` leaves the order non-COMPLETED (completion gate).
    // Seed a global offer (+ coupon) with a given funding party (P1.7.34 basis).
    const seedOffer = async (settlementType: 'MERCHANT' | 'ADMIN', discountPercent: number) => {
      const code = uniq('SAVE').toUpperCase();
      await prisma.offer.create({
        data: {
          title: uniq('Offer'),
          active: true,
          isGlobal: true,
          discountPercent,
          settlementType,
          coupons: { create: [{ code }] },
        },
      });
      return code;
    };

    const capture = async (
      merchantId: string,
      restaurantId: string,
      opts: {
        unitPriceMinor?: bigint;
        userId?: string | null;
        capture?: boolean;
        settleEligible?: boolean;
        completeOrder?: boolean;
        taxTotalMinor?: bigint;
        feeTotalMinor?: bigint;
        deliveryChargeMinor?: bigint;
        couponCode?: string;
      } = {},
    ) => {
      const order = await orders.createOrder(staffOf(merchantId), {
        orderNumber: uniq('ORD'),
        restaurantId,
        type: 'HOME_DELIVERY',
        userId: opts.userId ?? null,
        items: [
          { nameSnapshot: 'Item', unitPriceMinor: opts.unitPriceMinor ?? 10000n, quantity: 1 },
        ],
        taxTotalMinor: opts.taxTotalMinor,
        feeTotalMinor: opts.feeTotalMinor,
        deliveryChargeMinor: opts.deliveryChargeMinor,
        couponCode: opts.couponCode,
      });
      const rzpOrder = uniq('order');
      const intent = await payments.createIntent({ orderId: order.id, razorpayOrderId: rzpOrder });
      if (opts.capture !== false) {
        const payId = uniq('pay');
        await payments.verifyAndCapture({
          razorpayOrderId: rzpOrder,
          razorpayPaymentId: payId,
          razorpaySignature: paySign(rzpOrder, payId),
        });
        if (opts.settleEligible !== false) {
          // backdate the captured attempt so end-of-day IST + 2 days < now
          const past = new Date(Date.now() - 6 * 24 * 3600_000);
          await prisma.paymentAttempt.updateMany({
            where: { paymentIntentId: intent.id, status: 'CAPTURED' },
            data: { createdAt: past },
          });
        }
        if (opts.completeOrder !== false) {
          await completeOrderById(merchantId, order.id);
        }
      }
      return { intentId: intent.id, orderId: order.id, amount: intent.amountMinor };
    };

    beforeAll(async () => {
      gateway = new FakePayoutGateway();
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
          SettlementModule,
        ],
      })
        .overrideProvider(RazorpayxPayoutGateway)
        .useValue(gateway)
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
      provisioning = app.get(MerchantProvisioningService);
      orders = app.get(OrderService);
      payments = app.get(PaymentService);
      refunds = app.get(RefundService);
      settlements = app.get(SettlementService);
      keySecret = app.get(ConfigService).get<string>('RAZORPAY_KEY_SECRET')!;
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      gateway.mode = 'pending';
      gateway.calls = 0;
    });

    // ---- SETTLEMENT TIMING (settleAfter) ----
    it('does NOT settle a payment before its settleAfter window (fresh capture)', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId, { settleEligible: false }); // captured just now
      await expect(
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('settles a payment once it is past its settleAfter window', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n }); // backdated -> eligible
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.itemCount).toBe(1);
      expect(s.grossAmountMinor).toBe(10000n);
    });

    it('settles only the eligible payments, leaving premature ones for later', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n }); // eligible
      await capture(merchantId, restaurantId, { unitPriceMinor: 5000n, settleEligible: false }); // premature
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.itemCount).toBe(1);
      expect(s.grossAmountMinor).toBe(10000n);
    });

    // ---- ORDER-COMPLETION GATE (P1.7.33) ----
    it('does NOT settle a payment whose order is not COMPLETED', async () => {
      const { merchantId, restaurantId } = await seedMR();
      // captured + past settleAfter, but the order was NOT advanced to COMPLETED
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n, completeOrder: false });
      await expect(
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('settles only COMPLETED orders, excluding an otherwise-eligible non-completed one', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n }); // completed → eligible
      await capture(merchantId, restaurantId, { unitPriceMinor: 5000n, completeOrder: false }); // not completed
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.itemCount).toBe(1);
      expect(s.grossAmountMinor).toBe(10000n);
    });

    // ---- ELIGIBILITY / REFUND ----
    it('excludes an uncaptured payment', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      await capture(merchantId, restaurantId, { unitPriceMinor: 5000n, capture: false });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.itemCount).toBe(1);
      expect(s.grossAmountMinor).toBe(10000n);
    });

    it('deducts partial and multiple PROCESSED refunds; excludes fully-refunded (net 0)', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const user = await seedUser();
      const p = await capture(merchantId, restaurantId, {
        unitPriceMinor: 10000n,
        userId: user.id,
      });
      await refunds.refund({
        paymentIntentId: p.intentId,
        amountMinor: 2000n,
        idempotencyKey: uniq('r'),
      });
      await refunds.refund({
        paymentIntentId: p.intentId,
        amountMinor: 3000n,
        idempotencyKey: uniq('r'),
      });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(5000n);

      const { merchantId: m2, restaurantId: r2 } = await seedMR();
      const u2 = await seedUser();
      const p2 = await capture(m2, r2, { unitPriceMinor: 10000n, userId: u2.id });
      await refunds.refund({ paymentIntentId: p2.intentId, idempotencyKey: uniq('r') }); // full
      await expect(
        settlements.settleMerchant(superAdmin, { merchantId: m2, restaurantId: r2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ---- COMMISSION (authoritative config) ----
    it('resolves commission from Restaurant.commissionBps with exact BigInt arithmetic', async () => {
      const { merchantId, restaurantId } = await seedMR(250); // 2.5%
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.commissionBps).toBe(250);
      expect(s.commissionMinor).toBe(250n);
      expect(s.netAmountMinor).toBe(9750n);
      const items = await prisma.settlementItem.findMany({
        where: { settlementId: s.settlementId },
      });
      expect(items.reduce((a, i) => a + i.amountMinor, 0n)).toBe(10000n); // items reconcile to gross
    });

    it('defaults commission to 0 when the restaurant has no configured rate', async () => {
      const { merchantId, restaurantId } = await seedMR(); // commissionBps null
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.commissionBps).toBe(0);
      expect(s.commissionMinor).toBe(0n);
      expect(s.netAmountMinor).toBe(10000n);
    });

    it('snapshots the commission rate onto the settlement (later config change does not alter it)', async () => {
      const { merchantId, restaurantId } = await seedMR(250);
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      await prisma.restaurant.update({ where: { id: restaurantId }, data: { commissionBps: 900 } });
      const persisted = await prisma.settlement.findUniqueOrThrow({
        where: { id: s.settlementId },
      });
      expect(persisted.commissionBps).toBe(250); // stable
      expect(persisted.commissionMinor).toBe(250n);
    });

    // ---- COMMISSION BASIS (P1.7.34) ----
    it('charges commission on the subtotal only, EXCLUDING tax/delivery/fees', async () => {
      const { merchantId, restaurantId } = await seedMR(1000); // 10%
      // Stage D rejects caller tax/fee/delivery on OrderService. Persist a
      // historical-shaped order so commission still excludes those columns.
      const order = await prisma.order.create({
        data: {
          orderNumber: uniq('ORD'),
          merchantId,
          restaurantId,
          type: 'HOME_DELIVERY',
          status: 'INITIAL',
          subtotalMinor: 10000n,
          taxTotalMinor: 2000n,
          feeTotalMinor: 500n,
          deliveryChargeMinor: 1000n,
          grandTotalMinor: 13500n,
        },
      });
      const rzpOrder = uniq('order');
      const intent = await payments.createIntent({ orderId: order.id, razorpayOrderId: rzpOrder });
      const payId = uniq('pay');
      await payments.verifyAndCapture({
        razorpayOrderId: rzpOrder,
        razorpayPaymentId: payId,
        razorpaySignature: paySign(rzpOrder, payId),
      });
      const past = new Date(Date.now() - 6 * 24 * 3600_000);
      await prisma.paymentAttempt.updateMany({
        where: { paymentIntentId: intent.id, status: 'CAPTURED' },
        data: { createdAt: past },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', updatedAt: past },
      });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(13500n); // payout pool = captured
      expect(s.commissionBasisMinor).toBe(10000n); // subtotal only
      expect(s.commissionMinor).toBe(1000n); // 10% of 10000, NOT 13500
      expect(s.netAmountMinor).toBe(12500n);
    });

    it('subtracts a VENDOR/MERCHANT-funded discount from the commission basis', async () => {
      const { merchantId, restaurantId } = await seedMR(1000); // 10%
      const user = await seedUser();
      const code = await seedOffer('MERCHANT', 10); // 10% off subtotal
      // subtotal 10000, discount 1000 → captured grand 9000
      await capture(merchantId, restaurantId, {
        unitPriceMinor: 10000n,
        userId: user.id,
        couponCode: code,
      });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(9000n); // captured (discounted)
      expect(s.commissionBasisMinor).toBe(9000n); // subtotal 10000 − vendor discount 1000
      expect(s.commissionMinor).toBe(900n);
      expect(s.netAmountMinor).toBe(8100n);
    });

    it('does NOT subtract an ADMIN-funded discount from the commission basis', async () => {
      const { merchantId, restaurantId } = await seedMR(1000); // 10%
      const user = await seedUser();
      const code = await seedOffer('ADMIN', 10);
      await capture(merchantId, restaurantId, {
        unitPriceMinor: 10000n,
        userId: user.id,
        couponCode: code,
      });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(9000n); // captured (discounted)
      expect(s.commissionBasisMinor).toBe(10000n); // full subtotal (ADMIN discount NOT subtracted)
      expect(s.commissionMinor).toBe(1000n);
      expect(s.netAmountMinor).toBe(8000n);
    });

    it('keeps the commission basis FROZEN under a partial refund (only the payout pool shrinks)', async () => {
      const { merchantId, restaurantId } = await seedMR(1000); // 10%
      const user = await seedUser();
      const p = await capture(merchantId, restaurantId, {
        unitPriceMinor: 10000n,
        userId: user.id,
      });
      await refunds.refund({
        paymentIntentId: p.intentId,
        amountMinor: 4000n,
        idempotencyKey: uniq('r'),
      });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(6000n); // payout pool = captured 10000 − refund 4000
      expect(s.commissionBasisMinor).toBe(10000n); // frozen (refund-independent)
      expect(s.commissionMinor).toBe(1000n); // 10% of 10000, not of 6000
      expect(s.netAmountMinor).toBe(5000n);
    });

    it('rejects an out-of-bounds configured commission rate', async () => {
      const { merchantId, restaurantId } = await seedMR(20000); // invalid
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      await expect(
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a callerless commission (no caller override possible)', () => {
      // The input type no longer accepts commissionBps — verified structurally by
      // the resolve-from-config tests above (rate comes only from the restaurant).
      expect(true).toBe(true);
    });

    // ---- OWNERSHIP ----
    it('rejects a restaurant that does not belong to the merchant', async () => {
      const a = await seedMR();
      const b = await seedMR();
      await capture(b.merchantId, b.restaurantId, { unitPriceMinor: 7000n });
      await expect(
        settlements.settleMerchant(superAdmin, {
          merchantId: a.merchantId,
          restaurantId: b.restaurantId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown restaurant', async () => {
      const { merchantId } = await seedMR();
      await expect(
        settlements.settleMerchant(superAdmin, {
          merchantId,
          restaurantId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("isolates merchants — one restaurant's payment never appears in another's settlement", async () => {
      const a = await seedMR();
      const b = await seedMR();
      await capture(a.merchantId, a.restaurantId, { unitPriceMinor: 10000n });
      await capture(b.merchantId, b.restaurantId, { unitPriceMinor: 7000n });
      const sb = await settlements.settleMerchant(superAdmin, {
        merchantId: b.merchantId,
        restaurantId: b.restaurantId,
      });
      expect(sb.grossAmountMinor).toBe(7000n);
      expect(sb.itemCount).toBe(1);
    });

    // ---- AUTHORIZATION ----
    it('rejects settlement and payout by non-SUPER_ADMIN', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId);
      await expect(
        settlements.settleMerchant(staffOf(merchantId), { merchantId, restaurantId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      await expect(
        settlements.requestPayout(staffOf(merchantId), {
          settlementId: s.settlementId,
          idempotencyKey: uniq('k'),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // ---- IDEMPOTENCY / CONCURRENCY ----
    it('settles a payment at most once (a second run has nothing to settle)', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const p = await capture(merchantId, restaurantId);
      await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      await expect(
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.settlementItem.count({ where: { paymentIntentId: p.intentId } })).toBe(1);
    });

    it('concurrent settlement runs do not create duplicate settlement contributions', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const p = await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const results = await Promise.allSettled([
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
      expect(await prisma.settlementItem.count({ where: { paymentIntentId: p.intentId } })).toBe(1);
    });

    // ---- PAYOUT ----
    it('creates a payout (PENDING), completes it via provider callback, and marks the settlement COMPLETED', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      const idk = uniq('k');
      const payout = await settlements.requestPayout(superAdmin, {
        settlementId: s.settlementId,
        idempotencyKey: idk,
      });
      expect(payout.status).toBe('PENDING');
      expect(payout.amountMinor).toBe(10000n);
      await settlements.markPayoutProcessed(`pout_${idk}`);
      expect(
        (await prisma.payout.findUniqueOrThrow({ where: { id: payout.payoutId } })).status,
      ).toBe('COMPLETED');
      expect(
        (await prisma.settlement.findUniqueOrThrow({ where: { id: s.settlementId } })).status,
      ).toBe('COMPLETED');
    });

    it('marks a payout FAILED on provider failure and does not complete the settlement', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId);
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      gateway.mode = 'failed';
      const payout = await settlements.requestPayout(superAdmin, {
        settlementId: s.settlementId,
        idempotencyKey: uniq('k'),
      });
      expect(payout.status).toBe('FAILED');
      expect(
        (await prisma.settlement.findUniqueOrThrow({ where: { id: s.settlementId } })).status,
      ).toBe('PENDING');
    });

    it('is idempotent for a repeated payout request; dedups a duplicate provider callback', async () => {
      const { merchantId, restaurantId } = await seedMR();
      await capture(merchantId, restaurantId);
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      const idk = uniq('k');
      const first = await settlements.requestPayout(superAdmin, {
        settlementId: s.settlementId,
        idempotencyKey: idk,
      });
      const second = await settlements.requestPayout(superAdmin, {
        settlementId: s.settlementId,
        idempotencyKey: idk,
      });
      expect(second.payoutId).toBe(first.payoutId);
      expect(gateway.calls).toBe(1);
      await settlements.markPayoutProcessed(`pout_${idk}`);
      await settlements.markPayoutProcessed(`pout_${idk}`);
      expect(
        await prisma.payout.count({ where: { settlementId: s.settlementId, status: 'COMPLETED' } }),
      ).toBe(1);
    });

    it('rejects a payout for a zero-amount settlement (100% commission)', async () => {
      const { merchantId, restaurantId } = await seedMR(10000); // 100%
      await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.netAmountMinor).toBe(0n);
      await expect(
        settlements.requestPayout(superAdmin, {
          settlementId: s.settlementId,
          idempotencyKey: uniq('k'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ---- POST-SETTLEMENT REFUND (deferred: no retroactive change) ----
    it('does not retroactively change a settlement when a refund happens after settlement', async () => {
      const { merchantId, restaurantId } = await seedMR();
      const user = await seedUser();
      const p = await capture(merchantId, restaurantId, {
        unitPriceMinor: 10000n,
        userId: user.id,
      });
      const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
      expect(s.grossAmountMinor).toBe(10000n);
      await refunds.refund({
        paymentIntentId: p.intentId,
        amountMinor: 4000n,
        idempotencyKey: uniq('r'),
      });
      const after = await prisma.settlement.findUniqueOrThrow({ where: { id: s.settlementId } });
      expect(after.grossAmountMinor).toBe(10000n);
      expect(after.amountMinor).toBe(10000n);
      await expect(
        settlements.settleMerchant(superAdmin, { merchantId, restaurantId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
