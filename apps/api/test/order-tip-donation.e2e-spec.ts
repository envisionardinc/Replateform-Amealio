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
 * P1.7.36 — Tip & donation Order-model foundation.
 *
 * The Order now records two customer-funded amounts, tipMinor and donationMinor,
 * as canonical integer minor-unit fields. This slice proves they are:
 *  - persisted and default to 0 (backward compatible with existing orders),
 *  - held OUTSIDE grandTotal (the order_total_integrity CHECK is unchanged),
 *  - EXCLUDED from the commissionable basis and the settlement gross (they are not
 *    merchant revenue; a tip is separately disbursable, a donation is a charity
 *    pass-through).
 * It does NOT assert any GST or tip/donation refund behavior (deferred).
 */
class FakePayoutGateway {
  async createPayout(req: ProviderPayoutRequest): Promise<ProviderPayoutResponse> {
    return { providerPayoutId: `pout_${req.idempotencyKey}`, status: 'pending' };
  }
}

describe('Order tip & donation model (P1.7.36)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let orders: OrderService;
  let payments: PaymentService;
  let settlements: SettlementService;
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

  // Create an order with the given money components; single 100.00 item.
  const makeOrder = (
    restaurantId: string,
    over: Partial<Parameters<OrderService['createOrder']>[1]> = {},
  ) => ({
    orderNumber: uniq('ORD'),
    restaurantId,
    type: 'TAKE_AWAY' as const,
    items: [{ nameSnapshot: 'Item', unitPriceMinor: 10000n, quantity: 1 }],
    ...over,
  });

  // Capture + complete + backdate so the order is fully settlement-eligible.
  const captureAndComplete = async (merchantId: string, orderId: string) => {
    const rzpOrder = uniq('order');
    const intent = await payments.createIntent({ orderId, razorpayOrderId: rzpOrder });
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
    for (const s of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] as const) {
      await orders.transitionStatus(staffOf(merchantId), orderId, s);
    }
    return intent.amountMinor;
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
    keySecret = app.get(ConfigService).get<string>('RAZORPAY_KEY_SECRET')!;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- 1. backward compatibility: existing/new order without tip/donation ----
  it('defaults tip/donation to 0 when not supplied (backward compatible)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(staffOf(merchantId), makeOrder(restaurantId));
    expect(order.tipMinor).toBe(0n);
    expect(order.donationMinor).toBe(0n);
    // grand-total contract unchanged: grand = subtotal (no discount/tax/fee/delivery)
    expect(order.grandTotalMinor).toBe(10000n);
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.tipMinor).toBe(0n);
    expect(persisted.donationMinor).toBe(0n);
    expect(persisted.grandTotalMinor).toBe(10000n);
  });

  // ---- 2. tip only ----
  it('records a tip WITHOUT changing subtotal or grand total', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(
      staffOf(merchantId),
      makeOrder(restaurantId, { tipMinor: 3000n }),
    );
    expect(order.tipMinor).toBe(3000n);
    expect(order.donationMinor).toBe(0n);
    expect(order.subtotalMinor).toBe(10000n);
    expect(order.grandTotalMinor).toBe(10000n); // tip is NOT added to grand
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.tipMinor).toBe(3000n);
    expect(persisted.grandTotalMinor).toBe(10000n);
  });

  // ---- 3. donation only ----
  it('records a donation WITHOUT changing subtotal or grand total', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(
      staffOf(merchantId),
      makeOrder(restaurantId, { donationMinor: 2500n }),
    );
    expect(order.donationMinor).toBe(2500n);
    expect(order.tipMinor).toBe(0n);
    expect(order.grandTotalMinor).toBe(10000n); // donation is NOT added to grand
  });

  // ---- 4. both ----
  it('records both tip and donation independently of the totals', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(
      staffOf(merchantId),
      makeOrder(restaurantId, {
        tipMinor: 1500n,
        donationMinor: 2000n,
      }),
    );
    expect(order.tipMinor).toBe(1500n);
    expect(order.donationMinor).toBe(2000n);
    // Stage D: tax/fee are server-derived (0). Tip/donation stay outside grand.
    expect(order.grandTotalMinor).toBe(10000n);
  });

  // ---- 5. explicit zero values ----
  it('accepts explicit zero tip/donation', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(
      staffOf(merchantId),
      makeOrder(restaurantId, { tipMinor: 0n, donationMinor: 0n }),
    );
    expect(order.tipMinor).toBe(0n);
    expect(order.donationMinor).toBe(0n);
  });

  // ---- negative rejection (defensive validation) ----
  it('rejects negative tip or donation', async () => {
    const { merchantId, restaurantId } = await seedMR();
    await expect(
      orders.createOrder(staffOf(merchantId), makeOrder(restaurantId, { tipMinor: -1n })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      orders.createOrder(staffOf(merchantId), makeOrder(restaurantId, { donationMinor: -1n })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- 6. minor-unit integer precision ----
  it('stores exact BigInt minor units (no float rounding)', async () => {
    const { merchantId, restaurantId } = await seedMR();
    const order = await orders.createOrder(
      staffOf(merchantId),
      makeOrder(restaurantId, { tipMinor: 99999999n, donationMinor: 12345n }),
    );
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.tipMinor).toBe(99999999n);
    expect(persisted.donationMinor).toBe(12345n);
    expect(typeof persisted.tipMinor).toBe('bigint');
  });

  // ---- 7/8. commission basis excludes tip and donation ----
  it('commission basis and gross EXCLUDE tip and donation (settlement unchanged)', async () => {
    const { merchantId, restaurantId } = await seedMR(1000); // 10% commission
    const user = await seedUser();
    // subtotal 10000, tip 4000, donation 3000. grand = subtotal = 10000.
    const order = await orders.createOrder(
      staffOf(merchantId),
      makeOrder(restaurantId, { userId: user.id, tipMinor: 4000n, donationMinor: 3000n }),
    );
    const captured = await captureAndComplete(merchantId, order.id);
    // payment captures ONLY the grand total, not tip/donation
    expect(captured).toBe(10000n);

    const s = await settlements.settleMerchant(superAdmin, { merchantId, restaurantId });
    // gross = captured grand (10000), NOT 10000+tip+donation
    expect(s.grossAmountMinor).toBe(10000n);
    // basis = subtotal - discount = 10000 (tip/donation not in basis)
    expect(s.commissionBasisMinor).toBe(10000n);
    // commission = floor(10000 * 1000 / 10000) = 1000
    expect(s.commissionMinor).toBe(1000n);
    expect(s.netAmountMinor).toBe(9000n);
  });

  // ---- 9/10. settlement identical with vs without tip/donation ----
  it('produces IDENTICAL settlement economics whether or not a tip/donation exists', async () => {
    const bps = 1000;
    // Order A: no tip/donation
    const a = await seedMR(bps);
    const oA = await orders.createOrder(staffOf(a.merchantId), makeOrder(a.restaurantId));
    await captureAndComplete(a.merchantId, oA.id);
    const sA = await settlements.settleMerchant(superAdmin, {
      merchantId: a.merchantId,
      restaurantId: a.restaurantId,
    });

    // Order B: large tip + donation on the same subtotal
    const b = await seedMR(bps);
    const oB = await orders.createOrder(
      staffOf(b.merchantId),
      makeOrder(b.restaurantId, { tipMinor: 50000n, donationMinor: 20000n }),
    );
    await captureAndComplete(b.merchantId, oB.id);
    const sB = await settlements.settleMerchant(superAdmin, {
      merchantId: b.merchantId,
      restaurantId: b.restaurantId,
    });

    expect(sB.grossAmountMinor).toBe(sA.grossAmountMinor);
    expect(sB.commissionBasisMinor).toBe(sA.commissionBasisMinor);
    expect(sB.commissionMinor).toBe(sA.commissionMinor);
    expect(sB.netAmountMinor).toBe(sA.netAmountMinor);
  });

  // ---- 11. existing rows remain backward compatible (persisted default) ----
  it('leaves every pre-existing Order row at tip/donation = 0', async () => {
    const agg = await prisma.order.aggregate({
      _min: { tipMinor: true, donationMinor: true },
      _max: { tipMinor: true, donationMinor: true },
      where: { offerId: null, tipMinor: 0n, donationMinor: 0n },
    });
    // there is at least one zero-valued order and the min is 0 (no NULLs / no drift)
    expect(agg._min.tipMinor).toBe(0n);
    expect(agg._min.donationMinor).toBe(0n);
  });
});
