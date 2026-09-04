import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { SettlementAdjustmentRepository } from '../src/modules/settlement/infrastructure/settlement-adjustment.repository';

describe('Settlement adjustment foundation (P1.7.44)', () => {
  const prisma = new PrismaClient();
  let repo: SettlementAdjustmentRepository;
  const uniq = (p: string) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

  beforeAll(() => {
    repo = new SettlementAdjustmentRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma.$disconnect());

  async function createOrderFixture(amountMinor = 10000n) {
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
        subtotalMinor: amountMinor,
        grandTotalMinor: amountMinor,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER',
        status: 'COMPLETED',
        grossAmountMinor: amountMinor,
        commissionBasisMinor: amountMinor,
        commissionMinor: 0n,
        amountMinor,
        currencyCode: 'INR',
      },
    });
    await prisma.settlementItem.create({
      data: { settlementId: settlement.id, orderId: order.id, paymentIntentId: paymentIntent.id, amountMinor },
    });
    return { merchant, restaurant, order, paymentIntent, settlement };
  }

  it('creates an ORDER_REFUND debit and derives the adjusted merchant position', async () => {
    const f = await createOrderFixture();
    const refund = await prisma.refund.create({
      data: {
        orderId: f.order.id,
        paymentIntentId: f.paymentIntent.id,
        method: 'WALLET',
        amountMinor: 2500n,
        status: 'PROCESSED',
      },
    });

    const adjustment = await repo.createAdjustment({
      settlementId: f.settlement.id,
      merchantId: f.merchant.id,
      type: 'ORDER_REFUND',
      direction: 'DEBIT',
      amountMinor: 2500n,
      currencyCode: 'INR',
      idempotencyKey: uniq('adj'),
      orderId: f.order.id,
      paymentIntentId: f.paymentIntent.id,
      refundId: refund.id,
    });

    expect(adjustment.created).toBe(true);
    expect(adjustment.amountMinor).toBe(2500n);
    const position = await repo.getPosition(f.settlement.id);
    expect(position.adjustedAmountMinor).toBe(7500n);
    expect(position.payableAmountMinor).toBe(7500n);
    expect(position.recoverableAmountMinor).toBe(0n);
  });

  it('is idempotent and rejects reuse of a key for different economics', async () => {
    const f = await createOrderFixture();
    const refund = await prisma.refund.create({
      data: {
        orderId: f.order.id,
        paymentIntentId: f.paymentIntent.id,
        method: 'WALLET',
        amountMinor: 1000n,
        status: 'PROCESSED',
      },
    });
    const input = {
      settlementId: f.settlement.id,
      merchantId: f.merchant.id,
      type: 'ORDER_REFUND' as const,
      direction: 'DEBIT' as const,
      amountMinor: 1000n,
      currencyCode: 'INR',
      idempotencyKey: uniq('idem'),
      orderId: f.order.id,
      paymentIntentId: f.paymentIntent.id,
      refundId: refund.id,
    };

    const first = await repo.createAdjustment(input);
    const second = await repo.createAdjustment(input);
    expect(second.created).toBe(false);
    expect(second.adjustmentId).toBe(first.adjustmentId);
    await expect(repo.createAdjustment({ ...input, amountMinor: 2000n })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      repo.createAdjustment({ ...input, idempotencyKey: uniq('other') }),
    ).rejects.toThrow();
  });

  it('supports multiple partial TIP_REFUND adjustments without exceeding the processed refund total', async () => {
    const f = await createOrderFixture();
    await prisma.order.update({ where: { id: f.order.id }, data: { tipMinor: 2000n } });
    const tip = await prisma.tipPayment.create({
      data: {
        orderId: f.order.id,
        merchantId: f.merchant.id,
        basisMinor: 10000n,
        percentBps: 2000,
        amountMinor: 2000n,
        refundedAmountMinor: 2000n,
        status: 'CAPTURED',
        beneficiaryPolicy: 'MERCHANT',
        currencyCode: 'INR',
      },
    });
    const tipSettlement = await prisma.settlement.create({
      data: {
        merchantId: f.merchant.id,
        restaurantId: f.restaurant.id,
        payoutType: 'ORDER_TIP',
        status: 'COMPLETED',
        grossAmountMinor: 2000n,
        commissionBasisMinor: 0n,
        commissionMinor: 0n,
        amountMinor: 2000n,
        currencyCode: 'INR',
      },
    });
    await prisma.settlementItem.create({
      data: { settlementId: tipSettlement.id, orderId: f.order.id, tipPaymentId: tip.id, amountMinor: 2000n },
    });

    const first = await repo.createAdjustment({
      settlementId: tipSettlement.id,
      merchantId: f.merchant.id,
      type: 'TIP_REFUND',
      direction: 'DEBIT',
      amountMinor: 1200n,
      currencyCode: 'INR',
      idempotencyKey: uniq('tipadj1'),
      tipPaymentId: tip.id,
    });
    const second = await repo.createAdjustment({
      settlementId: tipSettlement.id,
      merchantId: f.merchant.id,
      type: 'TIP_REFUND',
      direction: 'DEBIT',
      amountMinor: 800n,
      currencyCode: 'INR',
      idempotencyKey: uniq('tipadj2'),
      tipPaymentId: tip.id,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    await expect(
      repo.createAdjustment({
        settlementId: tipSettlement.id,
        merchantId: f.merchant.id,
        type: 'TIP_REFUND',
        direction: 'DEBIT',
        amountMinor: 1n,
        currencyCode: 'INR',
        idempotencyKey: uniq('tipadj3'),
        tipPaymentId: tip.id,
      }),
    ).rejects.toThrow(/cumulative tip refund adjustments/i);

    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: f.order.id } });
    expect(orderAfter.grandTotalMinor).toBe(10000n);
    expect(orderAfter.tipMinor).toBe(2000n);
    const position = await repo.getPosition(tipSettlement.id);
    expect(position.adjustedAmountMinor).toBe(0n);
  });

  it('keeps the adjustment ledger append-only at the database boundary', async () => {
    const f = await createOrderFixture(1000n);
    const refund = await prisma.refund.create({
      data: {
        orderId: f.order.id,
        paymentIntentId: f.paymentIntent.id,
        method: 'WALLET',
        amountMinor: 100n,
        status: 'PROCESSED',
      },
    });
    const adjustment = await repo.createAdjustment({
      settlementId: f.settlement.id,
      merchantId: f.merchant.id,
      type: 'ORDER_REFUND',
      direction: 'DEBIT',
      amountMinor: 100n,
      currencyCode: 'INR',
      idempotencyKey: uniq('append'),
      orderId: f.order.id,
      paymentIntentId: f.paymentIntent.id,
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
