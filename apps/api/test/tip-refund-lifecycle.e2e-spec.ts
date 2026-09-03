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
import { SettlementModule } from '../src/modules/settlement/settlement.module';
import { SettlementService } from '../src/modules/settlement/application/settlement.service';
import { RazorpayxPayoutGateway } from '../src/modules/settlement/infrastructure/razorpayx-payout.gateway';
import { TipModule } from '../src/modules/tip/tip.module';
import { TipService } from '../src/modules/tip/application/tip.service';
import { computePaymentSignature } from '../src/modules/payment/domain/razorpay-signature';
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

/**
 * P1.7.40 — Tip refund lifecycle & ORDER_TIP settlement reconciliation.
 * Verifies the settlement-aware refund guard: pre-settlement refunds proceed (and
 * then block routing); post-settlement refunds are deterministically rejected
 * (post-settlement clawback is OWNER DECISION REQUIRED — no clawback invented).
 * Order economics stay fully isolated.
 */
describe('Tip refund lifecycle (P1.7.40)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let orders: OrderService;
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

  const makeOrder = (merchantId: string, restaurantId: string) =>
    orders.createOrder(staffOf(merchantId), {
      orderNumber: uniq('ORD'),
      restaurantId,
      type: 'HOME_DELIVERY',
      items: [{ nameSnapshot: 'Item', unitPriceMinor: 10000n, quantity: 1 }],
    });

  const collectTip = async (orderId: string, amount: bigint) => {
    const rzp = uniq('torder');
    await tips.createTip({ orderId, razorpayOrderId: rzp, customAmountMinor: amount });
    const payId = uniq('tpay');
    const cap = await tips.verifyAndCaptureTip({
      razorpayOrderId: rzp,
      razorpayPaymentId: payId,
      razorpaySignature: paySign(rzp, payId),
    });
    return cap.tip.id;
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
    settlements = app.get(SettlementService);
    tips = app.get(TipService);
    keySecret = app.get(ConfigService).get<string>('RAZORPAY_KEY_SECRET')!;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- CASE A: refund BEFORE ORDER_TIP settlement ----
  it('allows a pre-settlement tip refund, then blocks routing of the refunded tip', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 3000n);

    const refunded = await tips.recordTipRefundState({
      tipId,
      amountMinor: 3000n,
      providerRefundId: uniq('rfnd'),
      refundStatus: 'PROCESSED',
    });
    expect(refunded.status).toBe('REFUNDED');

    // a refunded tip is no longer routable
    await expect(settlements.routeTip(superAdmin, { tipPaymentId: tipId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const items = await prisma.settlementItem.findMany({ where: { tipPaymentId: tipId } });
    expect(items).toHaveLength(0);
  });

  // ---- CASE B/C: refund AFTER ORDER_TIP settlement is BLOCKED (owner decision) ----
  it('BLOCKS a post-settlement tip refund (clawback not supported — owner decision)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 4000n);

    const routed = await settlements.routeTip(superAdmin, { tipPaymentId: tipId });
    expect(routed.created).toBe(true);

    // refunding a routed/settled tip is rejected (no clawback mechanism)
    await expect(
      tips.recordTipRefundState({
        tipId,
        amountMinor: 4000n,
        providerRefundId: uniq('rfnd'),
        refundStatus: 'PROCESSED',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // the tip stays CAPTURED and the settlement is untouched (no impossible state)
    const tip = await prisma.tipPayment.findUniqueOrThrow({ where: { id: tipId } });
    expect(tip.status).toBe('CAPTURED');
    expect(tip.refundedAmountMinor).toBe(0n);
    const s = await prisma.settlement.findUniqueOrThrow({
      where: { id: routed.settlement.settlementId },
    });
    expect(s.amountMinor).toBe(4000n); // settlement not reduced
  });

  // ---- race: refund vs route serialize via the tip row lock ----
  it('serializes concurrent refund + route so a refunded tip is never settled', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 5000n);

    const results = await Promise.allSettled([
      tips.recordTipRefundState({
        tipId,
        amountMinor: 5000n,
        providerRefundId: uniq('rfnd'),
        refundStatus: 'PROCESSED',
      }),
      settlements.routeTip(superAdmin, { tipPaymentId: tipId }),
    ]);
    const tip = await prisma.tipPayment.findUniqueOrThrow({ where: { id: tipId } });
    const items = await prisma.settlementItem.findMany({ where: { tipPaymentId: tipId } });
    // Exactly one outcome wins: either refunded (no settlement) OR routed (no refund).
    if (tip.status === 'REFUNDED') {
      expect(items).toHaveLength(0);
    } else {
      expect(tip.status).toBe('CAPTURED');
      expect(items).toHaveLength(1);
      expect(tip.refundedAmountMinor).toBe(0n);
    }
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
  });

  // ---- idempotency / validation (regression of the P1.7.38 foundation) ----
  it('is idempotent for a duplicate refund reference and rejects over-refund', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 6000n);
    const key = uniq('rfnd');

    const r1 = await tips.recordTipRefundState({
      tipId,
      amountMinor: 2000n,
      providerRefundId: key,
      refundStatus: 'PROCESSED',
    });
    const r2 = await tips.recordTipRefundState({
      tipId,
      amountMinor: 2000n,
      providerRefundId: key,
      refundStatus: 'PROCESSED',
    });
    expect(r2.refundedAmountMinor).toBe(r1.refundedAmountMinor); // no double-apply
    expect(r1.status).toBe('PARTIALLY_REFUNDED');

    await expect(
      tips.recordTipRefundState({
        tipId,
        amountMinor: 9999n, // exceeds remaining
        providerRefundId: uniq('rfnd'),
        refundStatus: 'PROCESSED',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- financial isolation: tip refund never touches order economics ----
  it('a tip refund does not change order economics', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 8000n);
    await tips.recordTipRefundState({
      tipId,
      amountMinor: 8000n,
      providerRefundId: uniq('rfnd'),
      refundStatus: 'PROCESSED',
    });
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.grandTotalMinor).toBe(10000n);
    // no order-payment refund / wallet entry was created by the tip refund
    const orderRefunds = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(orderRefunds).toHaveLength(0);
  });
});
