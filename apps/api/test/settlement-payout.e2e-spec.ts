import { BadRequestException, ForbiddenException, INestApplication } from '@nestjs/common';
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
import { computePaymentSignature } from '../src/modules/payment/domain/razorpay-signature';
import type {
  ProviderPayoutRequest,
  ProviderPayoutResponse,
} from '../src/modules/settlement/domain/settlement.types';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * P1.7.31 — Settlement & payout foundation.
 *
 * Settlement is DERIVED from captured payments net of PROCESSED refunds, minus
 * commission (exact BigInt). A payment settles at most once; settlement (accrual)
 * is distinct from payout (disbursement); payout is idempotent. SUPER_ADMIN-scoped;
 * merchant-isolated. No coupon logic, no historical migration.
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

describe('Settlement & payout (P1.7.31)', () => {
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

  const seedMR = async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Bengaluru',
    });
    return { merchantId: m.id, restaurantId: r.id };
  };

  const paySign = (o: string, p: string) =>
    computePaymentSignature({ razorpayOrderId: o, razorpayPaymentId: p, keySecret });

  // Capture a payment for a merchant/restaurant; returns intent id + amount.
  const capture = async (
    merchantId: string,
    restaurantId: string,
    opts: { unitPriceMinor?: bigint; userId?: string | null; capture?: boolean } = {},
  ) => {
    const order = await orders.createOrder(staffOf(merchantId), {
      orderNumber: uniq('ORD'),
      restaurantId,
      type: 'HOME_DELIVERY',
      userId: opts.userId ?? null,
      items: [{ nameSnapshot: 'Item', unitPriceMinor: opts.unitPriceMinor ?? 10000n, quantity: 1 }],
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

  // ---- ELIGIBILITY ----
  it('settles a captured payment and excludes an uncaptured one', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId, { unitPriceMinor: 10000n }); // captured
    await capture(merchantId, restaurantId, { unitPriceMinor: 5000n, capture: false }); // CREATED
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    expect(s.itemCount).toBe(1);
    expect(s.grossAmountMinor).toBe(10000n);
    expect(s.netAmountMinor).toBe(10000n); // no commission
    expect(s.status).toBe('PENDING');
  });

  it('rejects settlement when there are no eligible captured payments', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId, { capture: false });
    await expect(settlements.settleMerchant(superAdmin, { merchantId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ---- REFUND ADJUSTMENT ----
  it('deducts a partial refund from the settleable amount', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const user = await seedUser();
    const p = await capture(merchantId, restaurantId, { unitPriceMinor: 10000n, userId: user.id });
    await refunds.refund({
      paymentIntentId: p.intentId,
      amountMinor: 3000n,
      idempotencyKey: uniq('r'),
    });
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    expect(s.grossAmountMinor).toBe(7000n); // 10000 - 3000
    expect(s.itemCount).toBe(1);
  });

  it('excludes a fully-refunded payment (net 0) from settlement', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const user = await seedUser();
    const p = await capture(merchantId, restaurantId, { unitPriceMinor: 10000n, userId: user.id });
    await refunds.refund({ paymentIntentId: p.intentId, idempotencyKey: uniq('r') }); // full
    await expect(settlements.settleMerchant(superAdmin, { merchantId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deducts multiple refunds and only counts PROCESSED ones', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const user = await seedUser();
    const p = await capture(merchantId, restaurantId, { unitPriceMinor: 10000n, userId: user.id });
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
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    expect(s.grossAmountMinor).toBe(5000n); // 10000 - 2000 - 3000
  });

  // ---- COMMISSION ----
  it('applies commission with exact integer (basis-point) arithmetic', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
    const s = await settlements.settleMerchant(superAdmin, { merchantId, commissionBps: 250 }); // 2.5%
    expect(s.grossAmountMinor).toBe(10000n);
    expect(s.commissionBps).toBe(250);
    expect(s.commissionMinor).toBe(250n); // 10000 * 250 / 10000
    expect(s.netAmountMinor).toBe(9750n);
    // items reconcile to gross
    const items = await prisma.settlementItem.findMany({ where: { settlementId: s.settlementId } });
    expect(items.reduce((a, i) => a + i.amountMinor, 0n)).toBe(10000n);
  });

  it('rejects an invalid commission rate', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId);
    await expect(
      settlements.settleMerchant(superAdmin, { merchantId, commissionBps: 20000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- IDEMPOTENCY ----
  it('settles a payment at most once (a second run has nothing to settle)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const p = await capture(merchantId, restaurantId);
    await settlements.settleMerchant(superAdmin, { merchantId });
    await expect(settlements.settleMerchant(superAdmin, { merchantId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await prisma.settlementItem.count({ where: { paymentIntentId: p.intentId } })).toBe(1);
  });

  // ---- OWNERSHIP ----
  it("isolates merchants — one merchant's payment never appears in another's settlement", async () => {
    const a = await seedMR();
    const b = await seedMR();
    await capture(a.merchantId, a.restaurantId, { unitPriceMinor: 10000n });
    await capture(b.merchantId, b.restaurantId, { unitPriceMinor: 7000n });
    const sb = await settlements.settleMerchant(superAdmin, { merchantId: b.merchantId });
    expect(sb.grossAmountMinor).toBe(7000n);
    expect(sb.itemCount).toBe(1);
  });

  // ---- AUTHORIZATION ----
  it('rejects settlement and payout by non-SUPER_ADMIN', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId);
    await expect(
      settlements.settleMerchant(staffOf(merchantId), { merchantId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    await expect(
      settlements.requestPayout(staffOf(merchantId), {
        settlementId: s.settlementId,
        idempotencyKey: uniq('k'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---- PAYOUT ----
  it('creates a payout (PENDING), completes it via provider callback, and marks the settlement COMPLETED', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    const idk = uniq('k');
    const payout = await settlements.requestPayout(superAdmin, {
      settlementId: s.settlementId,
      idempotencyKey: idk,
    });
    expect(payout.status).toBe('PENDING'); // accrual != disbursement
    expect(payout.amountMinor).toBe(10000n);
    expect(payout.providerPayoutId).toBe(`pout_${idk}`);
    // provider callback completes it
    await settlements.markPayoutProcessed(`pout_${idk}`);
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.payoutId } })).status).toBe(
      'COMPLETED',
    );
    expect(
      (await prisma.settlement.findUniqueOrThrow({ where: { id: s.settlementId } })).status,
    ).toBe('COMPLETED');
  });

  it('marks a payout FAILED on provider failure and does not complete the settlement', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId);
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
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

  it('is idempotent for a repeated payout request (same key): one provider payout', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId);
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
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
    expect(await prisma.payout.count({ where: { settlementId: s.settlementId } })).toBe(1);
  });

  it('deduplicates a repeated provider payout callback (no double completion)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId);
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    const idk = uniq('k');
    await settlements.requestPayout(superAdmin, {
      settlementId: s.settlementId,
      idempotencyKey: idk,
    });
    await settlements.markPayoutProcessed(`pout_${idk}`);
    await settlements.markPayoutProcessed(`pout_${idk}`); // duplicate → no-op
    expect(
      await prisma.payout.count({ where: { settlementId: s.settlementId, status: 'COMPLETED' } }),
    ).toBe(1);
  });

  it('rejects a payout for a zero-amount settlement', async () => {
    // Force a zero net via 100% commission on a small capture.
    const { merchantId, restaurantId } = await seedMR();
    await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
    const s = await settlements.settleMerchant(superAdmin, { merchantId, commissionBps: 10000 }); // net 0
    expect(s.netAmountMinor).toBe(0n);
    await expect(
      settlements.requestPayout(superAdmin, {
        settlementId: s.settlementId,
        idempotencyKey: uniq('k'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- POST-SETTLEMENT REFUND ----
  it('does not retroactively change a settlement when a refund happens after settlement (documented)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const user = await seedUser();
    const p = await capture(merchantId, restaurantId, { unitPriceMinor: 10000n, userId: user.id });
    const s = await settlements.settleMerchant(superAdmin, { merchantId });
    expect(s.grossAmountMinor).toBe(10000n);
    // later refund still processes at the payment layer...
    await refunds.refund({
      paymentIntentId: p.intentId,
      amountMinor: 4000n,
      idempotencyKey: uniq('r'),
    });
    // ...but the already-created settlement is unchanged (negative adjustment deferred)
    const after = await prisma.settlement.findUniqueOrThrow({ where: { id: s.settlementId } });
    expect(after.grossAmountMinor).toBe(10000n);
    expect(after.amountMinor).toBe(10000n);
    // the payment is not re-settled
    await expect(settlements.settleMerchant(superAdmin, { merchantId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ---- CONCURRENCY ----
  it('concurrent settlement runs do not create duplicate settlement contributions', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const p = await capture(merchantId, restaurantId, { unitPriceMinor: 10000n });
    const results = await Promise.allSettled([
      settlements.settleMerchant(superAdmin, { merchantId }),
      settlements.settleMerchant(superAdmin, { merchantId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(await prisma.settlementItem.count({ where: { paymentIntentId: p.intentId } })).toBe(1);
  });
});
