import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { OrderingModule } from '../src/modules/ordering/ordering.module';
import { OrderService } from '../src/modules/ordering/application/order.service';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';
import type { CreateOrderInput } from '../src/modules/ordering/domain/ordering.types';

/**
 * P1.7.12 Ordering foundation — integration against the TEST DB.
 *
 * Canonical Order + OrderItem creation and the native OrderStatus lifecycle over
 * the EXISTING target `Order`/`OrderItem`/`OrderStatusEvent` (no schema change).
 * Money is exact BigInt minor units; creation + transitions are transactional;
 * merchant-tenant-scoped (P1.7.1F/P1.7.2). No separate rider state machine —
 * ON_THE_WAY/DELIVERED are native OrderStatus values (P1.7.11).
 */
describe('Ordering foundation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let orders: OrderService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
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

  // Create a merchant + restaurant and return their ids.
  const seedMerchantRestaurant = async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Bengaluru',
    });
    return { merchantId: m.id, restaurantId: r.id };
  };

  const baseInput = (
    restaurantId: string,
    over: Partial<CreateOrderInput> = {},
  ): CreateOrderInput => ({
    orderNumber: uniq('ORD'),
    restaurantId,
    type: 'HOME_DELIVERY',
    items: [
      { nameSnapshot: 'Paneer Tikka', unitPriceMinor: 25000n, quantity: 2 }, // 250.00 x2
      { nameSnapshot: 'Naan', unitPriceMinor: 5000n, quantity: 3 }, // 50.00 x3
    ],
    ...over,
  });

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
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    orders = app.get(OrderService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- ORDER CREATION ----
  it('creates a valid order with items, correct relationships, initial status, and exact money', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const user = await prisma.user.create({
      data: { phoneCountryCode: '+91', phone: uniq('9').slice(0, 12) },
    });

    const order = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { userId: user.id, discountTotalMinor: 5000n }),
    );

    // relationships
    expect(order.merchantId).toBe(merchantId);
    expect(order.restaurantId).toBe(restaurantId);
    expect(order.userId).toBe(user.id);
    // initial status is INITIAL (source-faithful: legacy creates as INITIAL)
    expect(order.status).toBe('INITIAL');
    // items + snapshots + line totals (BigInt)
    expect(order.items).toHaveLength(2);
    const paneer = order.items.find((i) => i.nameSnapshot === 'Paneer Tikka')!;
    expect(paneer.unitPriceMinor).toBe(25000n);
    expect(paneer.quantity).toBe(2);
    expect(paneer.lineTotalMinor).toBe(50000n);
    // subtotal = 25000*2 + 5000*3 = 65000; Stage D tax/fee are server-derived (0)
    expect(order.subtotalMinor).toBe(65000n);
    expect(order.taxTotalMinor).toBe(0n);
    expect(order.discountTotalMinor).toBe(5000n);
    expect(order.grandTotalMinor).toBe(60000n);
    expect(order.currencyCode).toBe('INR');

    // persisted values are exact BigInt (DB order_total_integrity CHECK satisfied)
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.grandTotalMinor).toBe(60000n);
    // payment/fulfillment remain SEPARATE default dimensions (not collapsed)
    expect(persisted.paymentStatus).toBe('CREATED');
    expect(persisted.fulfillmentStatus).toBe('UNFULFILLED');
  });

  it('validates menuItemId belongs to the order restaurant', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const itemInB = await prisma.menuItem.create({
      data: { merchantId: b.merchantId, restaurantId: b.restaurantId, name: 'B-Item' },
    });
    // using restaurant B's item in an order for restaurant A -> rejected
    await expect(
      orders.createOrder(
        staffOf(a.merchantId),
        baseInput(a.restaurantId, {
          items: [{ menuItemId: itemInB.id, nameSnapshot: 'x', unitPriceMinor: 100n, quantity: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // using it in an order for restaurant B -> accepted
    const ok = await orders.createOrder(
      staffOf(b.merchantId),
      baseInput(b.restaurantId, {
        items: [
          { menuItemId: itemInB.id, nameSnapshot: 'B-Item', unitPriceMinor: 100n, quantity: 1 },
        ],
      }),
    );
    expect(ok.items[0].menuItemId).toBe(itemInB.id);
  });

  it('rejects missing/invalid references (unknown restaurant, empty items, bad type)', async () => {
    const { merchantId } = await seedMerchantRestaurant();
    await expect(
      orders.createOrder(superAdmin, baseInput('00000000-0000-0000-0000-000000000000')),
    ).rejects.toBeInstanceOf(NotFoundException);
    const { restaurantId } = await seedMerchantRestaurant();
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { items: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { type: 'NOPE' as unknown as CreateOrderInput['type'] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when discount exceeds subtotal + charges (negative grand total)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    await expect(
      orders.createOrder(
        staffOf(merchantId),
        baseInput(restaurantId, { discountTotalMinor: 999999n }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---- TENANCY ----
  it('merchant staff can create within own merchant but not another merchant', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const ok = await orders.createOrder(staffOf(a.merchantId), baseInput(a.restaurantId));
    expect(ok.merchantId).toBe(a.merchantId);
    // staff of A cannot create against B's restaurant
    await expect(
      orders.createOrder(staffOf(a.merchantId), baseInput(b.restaurantId)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPER_ADMIN can target any restaurant explicitly and merchantId is server-derived', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const order = await orders.createOrder(superAdmin, baseInput(restaurantId));
    // merchant is derived from the restaurant, never from request input
    expect(order.merchantId).toBe(merchantId);
  });

  // ---- STATUS TRANSITIONS + EVENTS ----
  it('supports a valid delivery lifecycle and records ordered OrderStatusEvent history', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    let order = await orders.createOrder(staff, baseInput(restaurantId));
    expect(order.status).toBe('INITIAL');

    for (const next of [
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'PACKING',
      'READY',
      'ON_THE_WAY',
      'DELIVERED',
      'COMPLETED',
    ] as const) {
      order = await orders.transitionStatus(staff, order.id, next);
      expect(order.status).toBe(next);
    }

    // ON_THE_WAY and DELIVERED are represented on the SINGLE OrderStatus field
    // (rider semantics; no separate rider state machine).
    const events = order.statusEvents;
    // creation event (from null -> INITIAL) + 8 transitions = 9 events, ordered
    expect(events).toHaveLength(9);
    expect(events[0].fromStatus).toBeNull();
    expect(events[0].toStatus).toBe('INITIAL');
    // previous_status recorded correctly + reconstructable sequence
    const sequence = events.map((e) => e.toStatus);
    expect(sequence).toEqual([
      'INITIAL',
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'PACKING',
      'READY',
      'ON_THE_WAY',
      'DELIVERED',
      'COMPLETED',
    ]);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].fromStatus).toBe(events[i - 1].toStatus);
      expect(events[i].actorType).toBe('STAFF');
    }
    // no separate rider status entity exists on Order/events — status carries it
    expect(order.status).toBe('COMPLETED');
  });

  it('rejects invalid status transitions and transitions out of terminal states', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const staff = staffOf(merchantId);
    const order = await orders.createOrder(staff, baseInput(restaurantId));
    // INITIAL -> DELIVERED is not a valid transition
    await expect(orders.transitionStatus(staff, order.id, 'DELIVERED')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // reach a terminal state then attempt to leave it
    await orders.transitionStatus(staff, order.id, 'CANCELLED');
    await expect(orders.transitionStatus(staff, order.id, 'CONFIRMED')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('enforces tenancy on status transitions (cross-merchant rejected)', async () => {
    const a = await seedMerchantRestaurant();
    const b = await seedMerchantRestaurant();
    const order = await orders.createOrder(staffOf(a.merchantId), baseInput(a.restaurantId));
    await expect(
      orders.transitionStatus(staffOf(b.merchantId), order.id, 'PENDING'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---- INTEGRITY / DUPLICATES ----
  it('creation is transactional and duplicate order numbers are rejected (no partial write)', async () => {
    const { merchantId, restaurantId } = await seedMerchantRestaurant();
    const orderNumber = uniq('DUP');
    const first = await orders.createOrder(
      staffOf(merchantId),
      baseInput(restaurantId, { orderNumber }),
    );
    expect(first.items).toHaveLength(2);
    // same orderNumber (unique) -> rejected at the DB inside the transaction
    await expect(
      orders.createOrder(staffOf(merchantId), baseInput(restaurantId, { orderNumber })),
    ).rejects.toThrow(/unique|constraint/i);
    // exactly one order with that number, and its items/events are intact
    const rows = await prisma.order.findMany({
      where: { orderNumber },
      include: { items: true, statusEvents: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].items).toHaveLength(2);
    expect(rows[0].statusEvents).toHaveLength(1);
  });
});
