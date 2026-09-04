import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SettlementAdjustmentRepository } from '../src/modules/settlement/infrastructure/settlement-adjustment.repository';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/** P1.7.44 — append-only settlement adjustment foundation. */
describe('Settlement adjustment foundation (P1.7.44)', () => {
  const prisma = new PrismaClient();
  let repo: SettlementAdjustmentRepository;

  const uniq = (p: string) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

  beforeAll(() => {
    repo = new SettlementAdjustmentRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates an ORDER_REFUND debit and derives the adjusted merchant position', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 10000n,
        grandTotalMinor: 10000n,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor: 10000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER',
        status: 'COMPLETED',
        grossAmountMinor: 10000n,
        commissionBasisMinor: 10000n,
        commissionMinor: 0n,
        amountMinor: 10000n,
      },
    });
    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        method: 'WALLET',
        amountMinor: 2500n,
        status: 'PROCESSED',
      },
    });

    const adjustment = await repo.createAdjustment({
      settlementId: settlement.id,
      merchantId: merchant.id,
      type: 'ORDER_REFUND',
      direction: 'DEBIT',
      amountMinor: 2500n,
      currencyCode: 'INR',
      idempotencyKey: uniq('adj'),
      orderId: order.id,
      paymentIntentId: paymentIntent.id,
      refundId: refund.id,
    });

    expect(adjustment.created).toBe(true);
    expect(adjustment.amountMinor).toBe(2500n);

    const position = await repo.getPosition(settlement.id);
    expect(position.settlementAmountMinor).toBe(10000n);
    expect(position.debitAmountMinor).toBe(2500n);
    expect(position.creditAmountMinor).toBe(0n);
    expect(position.adjustedAmountMinor).toBe(7500n);
    expect(position.payableAmountMinor).toBe(7500n);
    expect(position.recoverableAmountMinor).toBe(0n);
  });

  it('is idempotent and rejects reuse of a key for different economics', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 10000n,
        grandTotalMinor: 10000n,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor: 10000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER',
        amountMinor: 10000n,
        grossAmountMinor: 10000n,
      },
    });
    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        method: 'WALLET',
        amountMinor: 1000n,
        status: 'PROCESSED',
      },
    });
    const key = uniq('idem');
    const input = {
      settlementId: settlement.id,
      merchantId: merchant.id,
      type: 'ORDER_REFUND' as const,
      direction: 'DEBIT' as const,
      amountMinor: 1000n,
      currencyCode: 'INR',
      idempotencyKey: key,
      orderId: order.id,
      paymentIntentId: paymentIntent.id,
      refundId: refund.id,
    };

    const first = await repo.createAdjustment(input);
    const second = await repo.createAdjustment(input);
    expect(second.created).toBe(false);
    expect(second.adjustmentId).toBe(first.adjustmentId);

    await expect(
      repo.createAdjustment({ ...input, amountMinor: 2000n }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      repo.createAdjustment({ ...input, idempotencyKey: uniq('other') }),
    ).rejects.toThrow();
  });

  it('creates a TIP_REFUND debit without touching order settlement economics', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 10000n,
        grandTotalMinor: 10000n,
        tipMinor: 2000n,
      },
    });
    const tip = await prisma.tipPayment.create({
      data: {
        orderId: order.id,
        merchantId: merchant.id,
        basisMinor: 10000n,
        percentBps: 2000,
        amountMinor: 2000n,
        status: 'CAPTURED',
        beneficiaryPolicy: 'MERCHANT',
      },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER_TIP',
        status: 'COMPLETED',
        grossAmountMinor: 2000n,
        amountMinor: 2000n,
      },
    });

    const adjustment = await repo.createAdjustment({
      settlementId: settlement.id,
      merchantId: merchant.id,
      type: 'TIP_REFUND',
      direction: 'DEBIT',
      amountMinor: 2000n,
      currencyCode: 'INR',
      idempotencyKey: uniq('tipadj'),
      tipPaymentId: tip.id,
    });

    expect(adjustment.created).toBe(true);
    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfter.grandTotalMinor).toBe(10000n);
    expect(orderAfter.tipMinor).toBe(2000n);

    const position = await repo.getPosition(settlement.id);
    expect(position.adjustedAmountMinor).toBe(0n);
    expect(position.recoverableAmountMinor).toBe(0n);
  });

  it('enforces one adjustment per refund/tip source at the database boundary', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 1000n,
        grandTotalMinor: 1000n,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor: 1000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER',
        amountMinor: 1000n,
        grossAmountMinor: 1000n,
      },
    });
    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        method: 'WALLET',
        amountMinor: 100n,
        status: 'PROCESSED',
      },
    });

    await repo.createAdjustment({
      settlementId: settlement.id,
      merchantId: merchant.id,
      type: 'ORDER_REFUND',
      direction: 'DEBIT',
      amountMinor: 100n,
      currencyCode: 'INR',
      idempotencyKey: uniq('source'),
      orderId: order.id,
      paymentIntentId: paymentIntent.id,
      refundId: refund.id,
    });

    await expect(
      repo.createAdjustment({
        settlementId: settlement.id,
        merchantId: merchant.id,
        type: 'ORDER_REFUND',
        direction: 'DEBIT',
        amountMinor: 100n,
        currencyCode: 'INR',
        idempotencyKey: uniq('source2'),
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        refundId: refund.id,
      }),
    ).rejects.toThrow();
  });

  it('keeps the adjustment ledger append-only at the database boundary', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 1000n,
        grandTotalMinor: 1000n,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor: 1000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: { merchantId: merchant.id, restaurantId: restaurant.id, payoutType: 'ORDER', amountMinor: 1000n },
    });
    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        method: 'WALLET',
        amountMinor: 100n,
        status: 'PROCESSED',
      },
    });
    const adjustment = await repo.createAdjustment({
      settlementId: settlement.id,
      merchantId: merchant.id,
      type: 'ORDER_REFUND',
      direction: 'DEBIT',
      amountMinor: 100n,
      currencyCode: 'INR',
      idempotencyKey: uniq('append'),
      orderId: order.id,
      paymentIntentId: paymentIntent.id,
      refundId: refund.id,
    });

    await expect(
      prisma.$executeRaw`
        UPDATE "SettlementAdjustment"
        SET "reason" = 'mutate'
        WHERE "id" = ${adjustment.adjustmentId}::uuid
      `,
    ).rejects.toThrow(/append-only/i);

    await expect(
      prisma.$executeRaw`
        DELETE FROM "SettlementAdjustment"
        WHERE "id" = ${adjustment.adjustmentId}::uuid
      `,
    ).rejects.toThrow(/append-only/i);
  });
});
