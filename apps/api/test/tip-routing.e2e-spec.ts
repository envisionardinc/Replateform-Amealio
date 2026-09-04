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

describe('Config-driven tip beneficiary routing (P1.7.39)', () => {
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

  let userSeq = 0;
  const seedUser = async () =>
    prisma.user.create({ data: { phoneCountryCode: '+91', phone: `${Date.now()}${userSeq++}` } });

  const makeOrder = async (merchantId: string, restaurantId: string, unitPriceMinor = 10000n) => {
    const user = await seedUser();
    return orders.createOrder(staffOf(merchantId), {
      orderNumber: uniq('ORD'),
      restaurantId,
      userId: user.id,
      type: 'HOME_DELIVERY',
      items: [{ nameSnapshot: 'Item', unitPriceMinor, quantity: 1 }],
    });
  };

  // Collect + capture a tip; returns the captured TipPayment id.
  const collectTip = async (orderId: string, customAmountMinor: bigint) => {
    const rzp = uniq('torder');
    await tips.createTip({ orderId, razorpayOrderId: rzp, customAmountMinor });
    const payId = uniq('tpay');
    const cap = await tips.verifyAndCaptureTip({
      razorpayOrderId: rzp,
      razorpayPaymentId: payId,
      razorpaySignature: paySign(rzp, payId),
    });
    return cap.tip.id;
  };

  // Fully settle-eligible ORDER payment (captured + backdated + completed).
  const captureAndCompleteOrder = async (merchantId: string, orderId: string) => {
    const rzpOrder = uniq('order');
    const intent = await payments.createIntent({ orderId, razorpayOrderId: rzpOrder });
    const payId = uniq('pay');
    await payments.verifyAndCapture({
      razorpayOrderId: rzpOrder,
      razorpayPaymentId: payId,
      razorpaySignature: paySign(rzpOrder, payId),
    });
    await prisma.paymentAttempt.updateMany({
      where: { paymentIntentId: intent.id, status: 'CAPTURED' },
      data: { createdAt: new Date(Date.now() - 6 * 24 * 3600_000) },
    });
    for (const s of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] as const) {
      await orders.transitionStatus(staffOf(merchantId), orderId, s);
    }
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

  // ---- MERCHANT routing ----
  it('routes a captured MERCHANT tip into a dedicated ORDER_TIP settlement (0% commission, full tip)', async () => {
    const { merchantId, restaurantId } = await seedMR(1000);
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 3000n);

    const res = await settlements.routeTip(superAdmin, { tipPaymentId: tipId });
    expect(res.created).toBe(true);
    expect(res.beneficiaryPolicy).toBe('MERCHANT');
    expect(res.settlement.merchantId).toBe(merchantId); // correct destination
    expect(res.settlement.grossAmountMinor).toBe(3000n);
    expect(res.settlement.commissionMinor).toBe(0n); // 0% commission on tips
    expect(res.settlement.commissionBasisMinor).toBe(0n);
    expect(res.settlement.netAmountMinor).toBe(3000n); // merchant receives the full tip
    expect(res.settlement.itemCount).toBe(1);

    // the settlement is ORDER_TIP and the item is linked to the tip (identifiable)
    const s = await prisma.settlement.findUniqueOrThrow({
      where: { id: res.settlement.settlementId },
      include: { items: true },
    });
    expect(s.payoutType).toBe('ORDER_TIP');
    expect(s.items[0].tipPaymentId).toBe(tipId);
    expect(s.items[0].paymentIntentId).toBeNull(); // not an order-payment item
  });

  it('can be paid out through the existing payout path', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 5000n);
    const res = await settlements.routeTip(superAdmin, { tipPaymentId: tipId });
    const payout = await settlements.requestPayout(superAdmin, {
      settlementId: res.settlement.settlementId,
      idempotencyKey: uniq('key'),
    });
    expect(payout.amountMinor).toBe(5000n);
    expect(payout.created).toBe(true);
  });

  // ---- idempotency ----
  it('routes a tip at most once (idempotent replay + concurrency)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 2500n);

    const first = await settlements.routeTip(superAdmin, { tipPaymentId: tipId });
    const replay = await settlements.routeTip(superAdmin, { tipPaymentId: tipId });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.settlement.settlementId).toBe(first.settlement.settlementId);

    const items = await prisma.settlementItem.findMany({ where: { tipPaymentId: tipId } });
    expect(items).toHaveLength(1); // never two merchant settlement amounts

    // concurrency
    const order2 = await makeOrder(merchantId, restaurantId);
    const tip2 = await collectTip(order2.id, 2500n);
    const results = await Promise.allSettled([
      settlements.routeTip(superAdmin, { tipPaymentId: tip2 }),
      settlements.routeTip(superAdmin, { tipPaymentId: tip2 }),
    ]);
    const created = results.filter((r) => r.status === 'fulfilled' && r.value.created);
    expect(created.length).toBeLessThanOrEqual(1);
    const items2 = await prisma.settlementItem.findMany({ where: { tipPaymentId: tip2 } });
    expect(items2).toHaveLength(1);
  });

  // ---- policy snapshot integrity ----
  it('routes per the tip SNAPSHOT, not the merchant current config', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 4000n); // snapshot = MERCHANT

    // Simulate the merchant later reconfiguring the beneficiary policy: the tip's
    // SNAPSHOT must still govern. A MERCHANT-snapshot tip routes to merchant even if
    // a hypothetical current config differs.
    const res = await settlements.routeTip(superAdmin, { tipPaymentId: tipId });
    expect(res.beneficiaryPolicy).toBe('MERCHANT');
    expect(res.settlement.merchantId).toBe(merchantId);

    // And a tip whose SNAPSHOT is DELIVERY_PERSON is blocked regardless of merchant
    // config (snapshot is authoritative).
    const order2 = await makeOrder(merchantId, restaurantId);
    const tip2 = await collectTip(order2.id, 4000n);
    await prisma.tipPayment.update({
      where: { id: tip2 },
      data: { beneficiaryPolicy: 'DELIVERY_PERSON' },
    });
    await expect(settlements.routeTip(superAdmin, { tipPaymentId: tip2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ---- blocked branches (never silently route to merchant) ----
  it('BLOCKS DELIVERY_PERSON and SHARED_POOLED tips without creating any settlement', async () => {
    const { merchantId, restaurantId } = await seedMR();
    for (const policy of ['DELIVERY_PERSON', 'SHARED_POOLED'] as const) {
      const order = await makeOrder(merchantId, restaurantId);
      const tipId = await collectTip(order.id, 3300n);
      await prisma.tipPayment.update({ where: { id: tipId }, data: { beneficiaryPolicy: policy } });
      await expect(
        settlements.routeTip(superAdmin, { tipPaymentId: tipId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // NO settlement item was created for the blocked tip
      const items = await prisma.settlementItem.findMany({ where: { tipPaymentId: tipId } });
      expect(items).toHaveLength(0);
    }
  });

  // ---- state integrity ----
  it('rejects routing an uncaptured, failed, or refunded tip', async () => {
    const { merchantId, restaurantId } = await seedMR();

    // uncaptured (intent only)
    const o1 = await makeOrder(merchantId, restaurantId);
    const rzp = uniq('torder');
    const uncaptured = await tips.createTip({
      orderId: o1.id,
      razorpayOrderId: rzp,
      customAmountMinor: 1000n,
    });
    await expect(
      settlements.routeTip(superAdmin, { tipPaymentId: uncaptured.id }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // refunded (fully) — not routable
    const o2 = await makeOrder(merchantId, restaurantId);
    const tip2 = await collectTip(o2.id, 1000n);
    await tips.recordTipRefundState({
      tipId: tip2,
      amountMinor: 1000n,
      providerRefundId: uniq('rfnd'),
      refundStatus: 'PROCESSED',
    });
    await expect(settlements.routeTip(superAdmin, { tipPaymentId: tip2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ---- authorization ----
  it('rejects tip routing by a non-SUPER_ADMIN', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await makeOrder(merchantId, restaurantId);
    const tipId = await collectTip(order.id, 1000n);
    await expect(
      settlements.routeTip(staffOf(merchantId), { tipPaymentId: tipId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---- financial isolation (again, at routing time) ----
  it('tip routing does NOT affect the order settlement economics', async () => {
    const { merchantId, restaurantId } = await seedMR(1000); // 10% order commission
    const order = await makeOrder(merchantId, restaurantId, 10000n);
    await captureAndCompleteOrder(merchantId, order.id);
    const tipId = await collectTip(order.id, 50000n);
    await settlements.routeTip(superAdmin, { tipPaymentId: tipId });

    // the ORDER settlement is computed from the order payment ONLY (tip excluded)
    const orderSettlement = await settlements.settleMerchant(superAdmin, {
      merchantId,
      restaurantId,
    });
    expect(orderSettlement.grossAmountMinor).toBe(10000n); // not 10000 + 50000
    expect(orderSettlement.commissionBasisMinor).toBe(10000n);
    expect(orderSettlement.commissionMinor).toBe(1000n);
    expect(orderSettlement.netAmountMinor).toBe(9000n);

    // grand total unchanged
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.grandTotalMinor).toBe(10000n);
  });
});
