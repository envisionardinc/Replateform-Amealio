/**
 * Database foundation validation (originally P1.5; migrated to Jest in P1.6 so
 * the repo uses a single test runner that also emits the decorator metadata
 * NestJS requires). Runs against the database in DATABASE_URL (use amealio_test).
 * Does NOT assert any legacy numeric enum mapping (OD-11 blocked).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function uniq(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
const makeMerchant = () => prisma.merchant.create({ data: { legalName: uniq('M') } });
const makeRestaurant = (merchantId: string) =>
  prisma.restaurant.create({ data: { merchantId, name: uniq('R') } });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PostgreSQL schema foundation', () => {
  it('generates UUID primary keys in-DB', async () => {
    const m = await makeMerchant();
    expect(m.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('enforces foreign keys', async () => {
    await expect(
      prisma.restaurant.create({
        data: { merchantId: '00000000-0000-0000-0000-000000000000', name: uniq('R') },
      }),
    ).rejects.toThrow(/foreign key|constraint/i);
  });

  it('enforces coupon code uniqueness', async () => {
    const m = await makeMerchant();
    const offer = await prisma.offer.create({ data: { merchantId: m.id, title: uniq('O') } });
    const code = uniq('CODE');
    await prisma.coupon.create({ data: { offerId: offer.id, code } });
    await expect(prisma.coupon.create({ data: { offerId: offer.id, code } })).rejects.toThrow(
      /unique|constraint/i,
    );
  });

  it('enforces unique (phoneCountryCode, phone) on user', async () => {
    const phone = uniq('9').replace(/\D/g, '').slice(0, 10).padEnd(10, '0');
    await prisma.user.create({ data: { phoneCountryCode: '+91', phone } });
    await expect(prisma.user.create({ data: { phoneCountryCode: '+91', phone } })).rejects.toThrow(
      /unique|constraint/i,
    );
  });

  it('stores & retrieves BigInt minor units exactly', async () => {
    const m = await makeMerchant();
    const r = await makeRestaurant(m.id);
    const item = await prisma.menuItem.create({
      data: { merchantId: m.id, restaurantId: r.id, name: uniq('I') },
    });
    const v = await prisma.itemVariant.create({
      data: { menuItemId: item.id, priceMinor: 123456789n, currencyCode: 'INR' },
    });
    const fetched = await prisma.itemVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(typeof fetched.priceMinor).toBe('bigint');
    expect(fetched.priceMinor).toBe(123456789n);
    expect(fetched.currencyCode).toBe('INR');
  });

  it('rejects negative money via CHECK constraint', async () => {
    const m = await makeMerchant();
    const r = await makeRestaurant(m.id);
    const item = await prisma.menuItem.create({
      data: { merchantId: m.id, restaurantId: r.id, name: uniq('I') },
    });
    await expect(
      prisma.itemVariant.create({ data: { menuItemId: item.id, priceMinor: -1n } }),
    ).rejects.toThrow(/variant_price_nonneg|violates check|constraint/i);
  });

  it('enforces order total integrity CHECK', async () => {
    const m = await makeMerchant();
    const r = await makeRestaurant(m.id);
    const ok = await prisma.order.create({
      data: {
        orderNumber: uniq('ORD'),
        merchantId: m.id,
        restaurantId: r.id,
        type: 'TAKE_AWAY',
        subtotalMinor: 20000n,
        discountTotalMinor: 5000n,
        taxTotalMinor: 1000n,
        feeTotalMinor: 0n,
        deliveryChargeMinor: 0n,
        grandTotalMinor: 16000n,
      },
    });
    expect(ok.grandTotalMinor).toBe(16000n);
    await expect(
      prisma.order.create({
        data: {
          orderNumber: uniq('ORD'),
          merchantId: m.id,
          restaurantId: r.id,
          type: 'TAKE_AWAY',
          subtotalMinor: 20000n,
          discountTotalMinor: 5000n,
          taxTotalMinor: 1000n,
          feeTotalMinor: 0n,
          deliveryChargeMinor: 0n,
          grandTotalMinor: 99999n,
        },
      }),
    ).rejects.toThrow(/order_total_integrity|violates check|constraint/i);
  });

  it('enforces payment idempotency key uniqueness', async () => {
    const m = await makeMerchant();
    const r = await makeRestaurant(m.id);
    const order = await prisma.order.create({
      data: { orderNumber: uniq('ORD'), merchantId: m.id, restaurantId: r.id, type: 'TAKE_AWAY' },
    });
    const pi = await prisma.paymentIntent.create({
      data: { orderId: order.id, amountMinor: 16000n, method: 'RAZORPAY' },
    });
    const key = uniq('idem');
    await prisma.paymentAttempt.create({
      data: { paymentIntentId: pi.id, amountMinor: 16000n, idempotencyKey: key },
    });
    await expect(
      prisma.paymentAttempt.create({
        data: { paymentIntentId: pi.id, amountMinor: 16000n, idempotencyKey: key },
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('enforces webhook providerEventId uniqueness (replay protection)', async () => {
    const eid = uniq('evt');
    await prisma.webhookEvent.create({
      data: { provider: 'RAZORPAY', providerEventId: eid, type: 'payment.captured', payload: {} },
    });
    await expect(
      prisma.webhookEvent.create({
        data: { provider: 'RAZORPAY', providerEventId: eid, type: 'payment.captured', payload: {} },
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('keeps the Transaction ledger append-only', async () => {
    const txn = await prisma.transaction.create({
      data: { type: 'PAYMENT', direction: 'CREDIT', amountMinor: 16000n },
    });
    await expect(
      prisma.transaction.update({ where: { id: txn.id }, data: { amountMinor: 1n } }),
    ).rejects.toThrow(/append-only/i);
    await expect(prisma.transaction.delete({ where: { id: txn.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it('supports soft-delete filtering via deletedAt', async () => {
    const m = await makeMerchant();
    const r = await makeRestaurant(m.id);
    await prisma.restaurant.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
    const active = await prisma.restaurant.findFirst({ where: { id: r.id, deletedAt: null } });
    expect(active).toBeNull();
    const withDeleted = await prisma.restaurant.findUnique({ where: { id: r.id } });
    expect(withDeleted?.deletedAt).toBeInstanceOf(Date);
  });
});
