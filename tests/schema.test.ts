/**
 * P1.5 database foundation validation suite.
 * Runs against the TEST database (DATABASE_URL must point at amealio_test when invoked).
 * Validates: UUID generation, FKs, uniqueness, monetary (BigInt) behavior,
 * CHECK constraints, order-total integrity, idempotency, webhook uniqueness,
 * append-only ledger immutability, and soft-delete filtering.
 *
 * These tests do NOT assert any legacy numeric enum mapping (OD-11 blocked).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function uniq(p: string) {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function makeMerchant() {
  return prisma.merchant.create({ data: { legalName: uniq('M') } });
}
async function makeRestaurant(merchantId: string) {
  return prisma.restaurant.create({ data: { merchantId, name: uniq('R') } });
}

test.after(async () => { await prisma.$disconnect(); });

test('UUID primary keys are DB-generated', async () => {
  const m = await makeMerchant();
  assert.match(m.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('foreign keys are enforced', async () => {
  await assert.rejects(
    prisma.restaurant.create({ data: { merchantId: '00000000-0000-0000-0000-000000000000', name: uniq('R') } }),
    /foreign key|constraint/i,
  );
});

test('uniqueness is enforced (coupon code)', async () => {
  const m = await makeMerchant();
  const offer = await prisma.offer.create({ data: { merchantId: m.id, title: uniq('O') } });
  const code = uniq('CODE');
  await prisma.coupon.create({ data: { offerId: offer.id, code } });
  await assert.rejects(
    prisma.coupon.create({ data: { offerId: offer.id, code } }),
    /unique|constraint/i,
  );
});

test('unique (phoneCountryCode, phone) on user', async () => {
  const phone = uniq('9').replace(/\D/g, '').slice(0, 10).padEnd(10, '0');
  await prisma.user.create({ data: { phoneCountryCode: '+91', phone } });
  await assert.rejects(
    prisma.user.create({ data: { phoneCountryCode: '+91', phone } }),
    /unique|constraint/i,
  );
});

test('monetary BigInt minor units store & retrieve exactly', async () => {
  const m = await makeMerchant();
  const r = await makeRestaurant(m.id);
  const item = await prisma.menuItem.create({ data: { merchantId: m.id, restaurantId: r.id, name: uniq('I') } });
  const v = await prisma.itemVariant.create({ data: { menuItemId: item.id, priceMinor: 123456789n, currencyCode: 'INR' } });
  const fetched = await prisma.itemVariant.findUniqueOrThrow({ where: { id: v.id } });
  assert.equal(typeof fetched.priceMinor, 'bigint');
  assert.equal(fetched.priceMinor, 123456789n);
  assert.equal(fetched.currencyCode, 'INR');
});

test('CHECK constraint rejects negative money', async () => {
  const m = await makeMerchant();
  const r = await makeRestaurant(m.id);
  const item = await prisma.menuItem.create({ data: { merchantId: m.id, restaurantId: r.id, name: uniq('I') } });
  await assert.rejects(
    prisma.itemVariant.create({ data: { menuItemId: item.id, priceMinor: -1n } }),
    /variant_price_nonneg|violates check|constraint/i,
  );
});

test('order total integrity CHECK enforced', async () => {
  const m = await makeMerchant();
  const r = await makeRestaurant(m.id);
  // valid: grand = subtotal - discount + tax + fee + delivery
  const ok = await prisma.order.create({
    data: {
      orderNumber: uniq('ORD'), merchantId: m.id, restaurantId: r.id, type: 'TAKE_AWAY',
      subtotalMinor: 20000n, discountTotalMinor: 5000n, taxTotalMinor: 1000n, feeTotalMinor: 0n,
      deliveryChargeMinor: 0n, grandTotalMinor: 16000n,
    },
  });
  assert.equal(ok.grandTotalMinor, 16000n);
  // invalid total should be rejected
  await assert.rejects(
    prisma.order.create({
      data: {
        orderNumber: uniq('ORD'), merchantId: m.id, restaurantId: r.id, type: 'TAKE_AWAY',
        subtotalMinor: 20000n, discountTotalMinor: 5000n, taxTotalMinor: 1000n, feeTotalMinor: 0n,
        deliveryChargeMinor: 0n, grandTotalMinor: 99999n,
      },
    }),
    /order_total_integrity|violates check|constraint/i,
  );
});

test('payment idempotency key is unique', async () => {
  const m = await makeMerchant();
  const r = await makeRestaurant(m.id);
  const order = await prisma.order.create({
    data: { orderNumber: uniq('ORD'), merchantId: m.id, restaurantId: r.id, type: 'TAKE_AWAY' },
  });
  const pi = await prisma.paymentIntent.create({ data: { orderId: order.id, amountMinor: 16000n, method: 'RAZORPAY' } });
  const key = uniq('idem');
  await prisma.paymentAttempt.create({ data: { paymentIntentId: pi.id, amountMinor: 16000n, idempotencyKey: key } });
  await assert.rejects(
    prisma.paymentAttempt.create({ data: { paymentIntentId: pi.id, amountMinor: 16000n, idempotencyKey: key } }),
    /unique|constraint/i,
  );
});

test('webhook providerEventId uniqueness (replay protection)', async () => {
  const eid = uniq('evt');
  await prisma.webhookEvent.create({ data: { provider: 'RAZORPAY', providerEventId: eid, type: 'payment.captured', payload: {} } });
  await assert.rejects(
    prisma.webhookEvent.create({ data: { provider: 'RAZORPAY', providerEventId: eid, type: 'payment.captured', payload: {} } }),
    /unique|constraint/i,
  );
});

test('Transaction ledger is append-only (UPDATE blocked)', async () => {
  const txn = await prisma.transaction.create({
    data: { type: 'PAYMENT', direction: 'CREDIT', amountMinor: 16000n },
  });
  await assert.rejects(
    prisma.transaction.update({ where: { id: txn.id }, data: { amountMinor: 1n } }),
    /append-only/i,
  );
  await assert.rejects(
    prisma.transaction.delete({ where: { id: txn.id } }),
    /append-only/i,
  );
});

test('soft-delete via deletedAt filters correctly', async () => {
  const m = await makeMerchant();
  const r = await makeRestaurant(m.id);
  await prisma.restaurant.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
  const active = await prisma.restaurant.findFirst({ where: { id: r.id, deletedAt: null } });
  assert.equal(active, null);
  const withDeleted = await prisma.restaurant.findUnique({ where: { id: r.id } });
  assert.ok(withDeleted && withDeleted.deletedAt instanceof Date);
});
