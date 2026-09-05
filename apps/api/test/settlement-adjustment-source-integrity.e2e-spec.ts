import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SettlementAdjustmentRepository } from '../src/modules/settlement/infrastructure/settlement-adjustment.repository';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Settlement adjustment source integrity (P1.7.44)', () => {
  const prisma = new PrismaClient();
  let repo: SettlementAdjustmentRepository;

  const uniq = (p: string) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

  beforeAll(() => {
    repo = new SettlementAdjustmentRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects an ORDER_REFUND whose supplied source does not match the Refund', async () => {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('M') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R') },
    });
    const orderA = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD_A'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 5000n,
        grandTotalMinor: 5000n,
      },
    });
    const orderB = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD_B'),
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 5000n,
        grandTotalMinor: 5000n,
      },
    });
    const paymentIntentA = await prisma.paymentIntent.create({
      data: { orderId: orderA.id, amountMinor: 5000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const paymentIntentB = await prisma.paymentIntent.create({
      data: { orderId: orderB.id, amountMinor: 5000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER',
        amountMinor: 5000n,
        grossAmountMinor: 5000n,
      },
    });
    const refund = await prisma.refund.create({
      data: {
        orderId: orderA.id,
        paymentIntentId: paymentIntentA.id,
        method: 'WALLET',
        amountMinor: 1000n,
        status: 'PROCESSED',
      },
    });

    await expect(
      repo.createAdjustment({
        settlementId: settlement.id,
        merchantId: merchant.id,
        type: 'ORDER_REFUND',
        direction: 'DEBIT',
        amountMinor: 1000n,
        currencyCode: 'INR',
        idempotencyKey: uniq('mismatch'),
        orderId: orderB.id,
        paymentIntentId: paymentIntentB.id,
        refundId: refund.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an ORDER_REFUND larger than the processed refund source', async () => {
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
        subtotalMinor: 5000n,
        grandTotalMinor: 5000n,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor: 5000n, method: 'RAZORPAY', status: 'CAPTURED' },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER',
        amountMinor: 5000n,
        grossAmountMinor: 5000n,
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

    await expect(
      repo.createAdjustment({
        settlementId: settlement.id,
        merchantId: merchant.id,
        type: 'ORDER_REFUND',
        direction: 'DEBIT',
        amountMinor: 1001n,
        currencyCode: 'INR',
        idempotencyKey: uniq('oversized'),
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        refundId: refund.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a TIP_REFUND larger than the processed refunded amount', async () => {
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
        refundedAmountMinor: 500n,
        status: 'CAPTURED',
        beneficiaryPolicy: 'MERCHANT',
      },
    });
    const settlement = await prisma.settlement.create({
      data: {
        merchantId: merchant.id,
        restaurantId: restaurant.id,
        payoutType: 'ORDER_TIP',
        amountMinor: 2000n,
        grossAmountMinor: 2000n,
      },
    });

    await expect(
      repo.createAdjustment({
        settlementId: settlement.id,
        merchantId: merchant.id,
        type: 'TIP_REFUND',
        direction: 'DEBIT',
        amountMinor: 501n,
        currencyCode: 'INR',
        idempotencyKey: uniq('tip-oversized'),
        tipPaymentId: tip.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
