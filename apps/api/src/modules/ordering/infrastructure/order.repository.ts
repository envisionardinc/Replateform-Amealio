import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { istUsagePeriodWindow } from '../domain/usage-frequency';
import { TERMINAL_ORDER_STATUSES } from '../domain/order-status-graph';
import type {
  AppliedOffer,
  ListOrdersQuery,
  OrderItemRecord,
  OrderDeliveryPersonSummary,
  OrderPaymentSummary,
  OrderRecord,
  OrderStatusEventRecord,
  OrderStatusName,
  OrderTypeName,
  RedemptionDirective,
  RedemptionRecord,
  RedemptionStatusName,
} from '../domain/ordering.types';

const ORDER_INCLUDE = {
  items: {
    select: {
      id: true,
      menuItemId: true,
      nameSnapshot: true,
      variantSnapshot: true,
      unitPriceMinor: true,
      quantity: true,
      lineTotalMinor: true,
      currencyCode: true,
    },
  },
  statusEvents: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      actorType: true,
      actorId: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  paymentIntents: {
    select: {
      id: true,
      status: true,
      method: true,
      amountMinor: true,
      currencyCode: true,
      razorpayOrderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  deliveryPerson: {
    select: { id: true, name: true, phone: true, isOnline: true },
  },
} as const;

interface CreateArgs {
  orderNumber: string;
  merchantId: string;
  restaurantId: string;
  userId: string | null;
  type: OrderTypeName;
  status: OrderStatusName;
  subtotalMinor: bigint;
  taxTotalMinor: bigint;
  discountTotalMinor: bigint;
  feeTotalMinor: bigint;
  deliveryChargeMinor: bigint;
  grandTotalMinor: bigint;
  commercialSnapshot?: Prisma.InputJsonValue | null;
  tipMinor: bigint;
  donationMinor: bigint;
  currencyCode: string;
  checkoutIdempotencyKey?: string | null;
  items: Array<{
    menuItemId: string | null;
    nameSnapshot: string;
    variantSnapshot: string | null;
    unitPriceMinor: bigint;
    quantity: number;
    lineTotalMinor: bigint;
    currencyCode: string;
    customization: Prisma.InputJsonValue | undefined;
    addOns: Prisma.InputJsonValue | undefined;
  }>;
  actorType: string | null;
  actorId: string | null;
  redemption?: RedemptionDirective;
  deferRedemption?: boolean;
}

/**
 * Write/read access to `Order` / `OrderItem` / `OrderStatusEvent`.
 * Creation and status transitions are TRANSACTIONAL. Authorization and graph
 * validity stay in OrderService / OrderManagementService.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAppliedOfferByCouponCode(code: string): Promise<AppliedOffer | null> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      select: {
        id: true,
        offer: {
          select: {
            id: true,
            active: true,
            deletedAt: true,
            isGlobal: true,
            merchantId: true,
            restaurantId: true,
            discountPercent: true,
            discountMinor: true,
            maxDiscountMinor: true,
            minOrderMinor: true,
            maxOrderMinor: true,
            serviceTypes: true,
            validFrom: true,
            validTo: true,
            maxUsageLimit: true,
            perUserLimit: true,
            useLimit: true,
            useFrequency: true,
          },
        },
      },
    });
    if (!coupon) return null;
    const o = coupon.offer;
    return {
      offerId: o.id,
      couponId: coupon.id,
      active: o.active,
      deletedAt: o.deletedAt,
      isGlobal: o.isGlobal,
      merchantId: o.merchantId,
      restaurantId: o.restaurantId,
      discountPercent: o.discountPercent,
      discountMinor: o.discountMinor,
      maxDiscountMinor: o.maxDiscountMinor,
      minOrderMinor: o.minOrderMinor,
      maxOrderMinor: o.maxOrderMinor,
      serviceTypes: Array.isArray(o.serviceTypes) ? (o.serviceTypes as string[]) : null,
      validFrom: o.validFrom,
      validTo: o.validTo,
      maxUsageLimit: o.maxUsageLimit,
      perUserLimit: o.perUserLimit,
      useLimit: o.useLimit,
      useFrequency: o.useFrequency,
    };
  }

  async createOrderWithItems(args: CreateArgs): Promise<OrderRecord> {
    if (args.checkoutIdempotencyKey) {
      const existing = await this.findByCheckoutIdempotencyKey(args.checkoutIdempotencyKey);
      if (existing) return existing;
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const r = args.redemption;
        if (r) {
          await this.lockAndAssertRedemptionLimits(tx, r);
        }

        const order = await tx.order.create({
          data: {
            orderNumber: args.orderNumber,
            merchantId: args.merchantId,
            restaurantId: args.restaurantId,
            userId: args.userId,
            type: args.type,
            status: args.status,
            subtotalMinor: args.subtotalMinor,
            taxTotalMinor: args.taxTotalMinor,
            discountTotalMinor: args.discountTotalMinor,
            feeTotalMinor: args.feeTotalMinor,
            deliveryChargeMinor: args.deliveryChargeMinor,
            grandTotalMinor: args.grandTotalMinor,
            commercialSnapshot: args.commercialSnapshot ?? undefined,
            tipMinor: args.tipMinor,
            donationMinor: args.donationMinor,
            currencyCode: args.currencyCode,
            offerId: r?.offerId ?? null,
            couponId: r?.couponId ?? null,
            checkoutIdempotencyKey: args.checkoutIdempotencyKey ?? null,
            placedAt: new Date(),
            items: {
              create: args.items.map((i) => ({
                menuItemId: i.menuItemId,
                nameSnapshot: i.nameSnapshot,
                variantSnapshot: i.variantSnapshot,
                unitPriceMinor: i.unitPriceMinor,
                quantity: i.quantity,
                lineTotalMinor: i.lineTotalMinor,
                currencyCode: i.currencyCode,
                customization: i.customization,
                addOns: i.addOns,
              })),
            },
            statusEvents: {
              create: [
                {
                  fromStatus: null,
                  toStatus: args.status,
                  actorType: args.actorType,
                  actorId: args.actorId,
                },
              ],
            },
          },
          select: { id: true },
        });

        if (r && !args.deferRedemption) {
          await tx.couponRedemption.create({
            data: {
              couponId: r.couponId,
              userId: r.userId,
              orderId: order.id,
              status: 'ACTIVE',
              discountAppliedMinor: r.discountAppliedMinor,
            },
          });
        }
        return order.id;
      });
      return this.findByIdOrThrow(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        if (args.checkoutIdempotencyKey) {
          const winner = await this.findByCheckoutIdempotencyKey(args.checkoutIdempotencyKey);
          if (winner) return winner;
        }
      }
      throw e;
    }
  }

  async findByCheckoutIdempotencyKey(key: string): Promise<OrderRecord | null> {
    const row = await this.prisma.order.findUnique({
      where: { checkoutIdempotencyKey: key },
      include: ORDER_INCLUDE,
    });
    return row ? this.toRecord(row) : null;
  }

  /**
   * Capture side-effect (doc 90). Compare-and-set INITIAL→PENDING, commit a
   * deferred CouponRedemption exactly once, and clear the payer's cart.
   * Already-PENDING / missing orders are no-ops (verify + webhook retries).
   */
  async promoteOnPaymentCapture(orderId: string): Promise<OrderRecord | null> {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!existing) return null;

    if (existing.status === 'INITIAL') {
      await this.prisma.$transaction(async (tx) => {
        const cas = await tx.order.updateMany({
          where: { id: orderId, status: 'INITIAL' },
          data: { status: 'PENDING' },
        });
        if (cas.count === 0) return;
        await tx.orderStatusEvent.create({
          data: {
            orderId,
            fromStatus: 'INITIAL',
            toStatus: 'PENDING',
            actorType: 'SYSTEM',
            reason: 'PAYMENT_CAPTURED',
          },
        });
        await this.commitDeferredRedemption(tx, {
          id: existing.id,
          userId: existing.userId,
          couponId: existing.couponId,
          offerId: existing.offerId,
          discountTotalMinor: existing.discountTotalMinor,
        });
        if (existing.userId) {
          await tx.cart.deleteMany({ where: { userId: existing.userId } });
        }
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await this.commitDeferredRedemption(tx, {
          id: existing.id,
          userId: existing.userId,
          couponId: existing.couponId,
          offerId: existing.offerId,
          discountTotalMinor: existing.discountTotalMinor,
        });
        if (existing.userId && existing.status === 'PENDING') {
          await tx.cart.deleteMany({ where: { userId: existing.userId } });
        }
      });
    }
    return this.findById(orderId);
  }

  private async commitDeferredRedemption(
    tx: Prisma.TransactionClient,
    existing: {
      id: string;
      userId: string | null;
      couponId: string | null;
      offerId: string | null;
      discountTotalMinor: bigint;
    },
  ): Promise<void> {
    if (!existing.couponId || !existing.offerId) return;
    const already = await tx.couponRedemption.findFirst({
      where: { orderId: existing.id, couponId: existing.couponId },
    });
    if (already) return;

    const offer = await tx.offer.findUnique({ where: { id: existing.offerId } });
    if (!offer) return;
    try {
      await this.lockAndAssertRedemptionLimits(tx, {
        offerId: offer.id,
        couponId: existing.couponId,
        userId: existing.userId,
        discountAppliedMinor: existing.discountTotalMinor,
        maxUsageLimit: offer.maxUsageLimit,
        perUserLimit: offer.perUserLimit,
        isGlobal: offer.isGlobal,
        useLimit: offer.useLimit,
        useFrequency: offer.useFrequency,
      });
    } catch {
      return;
    }
    await tx.couponRedemption.create({
      data: {
        couponId: existing.couponId,
        userId: existing.userId,
        orderId: existing.id,
        status: 'ACTIVE',
        discountAppliedMinor: existing.discountTotalMinor,
      },
    });
  }

  async findRedemptionByOrder(orderId: string): Promise<RedemptionRecord | null> {
    const row = await this.prisma.couponRedemption.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      couponId: row.couponId,
      userId: row.userId,
      orderId: row.orderId,
      status: row.status as RedemptionStatusName,
      discountAppliedMinor: row.discountAppliedMinor,
      reversedAt: row.reversedAt,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string): Promise<OrderRecord | null> {
    try {
      const row = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      return row ? this.toRecord(row) : null;
    } catch {
      return null;
    }
  }

  async listOrders(query: ListOrdersQuery): Promise<OrderRecord[]> {
    const where: Prisma.OrderWhereInput = {};
    if (query.merchantId) where.merchantId = query.merchantId;
    if (query.restaurantId) where.restaurantId = query.restaurantId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.userId) where.userId = query.userId;
    if (query.lane === 'active') where.status = { notIn: [...TERMINAL_ORDER_STATUSES] };
    if (query.lane === 'history') where.status = { in: [...TERMINAL_ORDER_STATUSES] };
    if (query.status && query.lane) {
      where.status = query.status;
    }

    const rows = await this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.toRecord(row));
  }

  private async findByIdOrThrow(id: string): Promise<OrderRecord> {
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: ORDER_INCLUDE,
    });
    return this.toRecord(row);
  }

  /**
   * Compare-and-set status + append OrderStatusEvent.
   * `changed=false` when the row was no longer in `fromStatus` (lost race or
   * already advanced). Caller interprets same-status vs 409.
   */
  async updateStatusWithEvent(
    id: string,
    fromStatus: OrderStatusName,
    toStatus: OrderStatusName,
    actorType: string | null,
    actorId: string | null,
    reason?: string | null,
  ): Promise<{ order: OrderRecord; changed: boolean }> {
    let changed = false;
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateManyMutationInput = { status: toStatus };
      if (toStatus === 'CANCELLED' && reason) {
        data.cancelReason = reason;
      }
      const result = await tx.order.updateMany({
        where: { id, status: fromStatus },
        data,
      });
      if (result.count === 0) {
        return;
      }
      changed = true;
      await tx.orderStatusEvent.create({
        data: { orderId: id, fromStatus, toStatus, actorType, actorId, reason: reason ?? null },
      });
      if (toStatus === 'CANCELLED') {
        await tx.couponRedemption.updateMany({
          where: { orderId: id, status: 'ACTIVE' },
          data: { status: 'REVERSED', reversedAt: new Date() },
        });
      }
    });
    return { order: await this.findByIdOrThrow(id), changed };
  }

  /**
   * Bind a rider while the order is still READY. Does not change OrderStatus
   * (assignment is not a second state machine). CAS on status=READY.
   */
  async assignDeliveryPerson(
    orderId: string,
    deliveryPersonId: string,
  ): Promise<OrderRecord | null> {
    const result = await this.prisma.order.updateMany({
      where: { id: orderId, status: 'READY' },
      data: { deliveryPersonId },
    });
    if (result.count === 0) return null;
    return this.findById(orderId);
  }

  private async lockAndAssertRedemptionLimits(
    tx: Prisma.TransactionClient,
    r: RedemptionDirective,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${r.couponId}::uuid FOR UPDATE`;

    if (r.maxUsageLimit !== null) {
      const total = await tx.couponRedemption.count({
        where: { couponId: r.couponId, status: 'ACTIVE' },
      });
      if (total >= r.maxUsageLimit) {
        throw new ConflictException('Offer usage limit reached');
      }
    }
    if (r.perUserLimit !== null && r.userId) {
      const perUser = await tx.couponRedemption.count({
        where: { couponId: r.couponId, userId: r.userId, status: 'ACTIVE' },
      });
      if (perUser >= r.perUserLimit) {
        throw new ConflictException('Per-user usage limit reached for this offer');
      }
    }
    if (r.isGlobal && r.useLimit !== null && r.useFrequency && r.userId) {
      const window = istUsagePeriodWindow(r.useFrequency, new Date());
      if (window) {
        const inPeriod = await tx.couponRedemption.count({
          where: {
            couponId: r.couponId,
            userId: r.userId,
            status: 'ACTIVE',
            createdAt: { gte: window.start, lt: window.endExclusive },
          },
        });
        if (inPeriod >= r.useLimit) {
          throw new ConflictException('Offer usage frequency limit reached for this period');
        }
      }
    }
  }

  private toRecord(row: {
    id: string;
    orderNumber: string;
    merchantId: string;
    restaurantId: string;
    userId: string | null;
    type: string;
    status: string;
    subtotalMinor: bigint;
    taxTotalMinor: bigint;
    discountTotalMinor: bigint;
    feeTotalMinor: bigint;
    deliveryChargeMinor: bigint;
    grandTotalMinor: bigint;
    tipMinor: bigint;
    donationMinor: bigint;
    currencyCode: string;
    offerId: string | null;
    couponId: string | null;
    cancelReason: string | null;
    checkoutIdempotencyKey: string | null;
    deliveryPersonId: string | null;
    deliveryPerson?: OrderDeliveryPersonSummary | null;
    commercialSnapshot?: unknown | null;
    items: Array<Omit<OrderItemRecord, 'quantity'> & { quantity: number }>;
    statusEvents: Array<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      actorType: string | null;
      actorId: string | null;
      reason: string | null;
      createdAt: Date;
    }>;
    paymentIntents: OrderPaymentSummary[];
  }): OrderRecord {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      merchantId: row.merchantId,
      restaurantId: row.restaurantId,
      userId: row.userId,
      type: row.type as OrderTypeName,
      status: row.status as OrderStatusName,
      subtotalMinor: row.subtotalMinor,
      taxTotalMinor: row.taxTotalMinor,
      discountTotalMinor: row.discountTotalMinor,
      feeTotalMinor: row.feeTotalMinor,
      deliveryChargeMinor: row.deliveryChargeMinor,
      grandTotalMinor: row.grandTotalMinor,
      commercialSnapshot: row.commercialSnapshot ?? null,
      tipMinor: row.tipMinor,
      donationMinor: row.donationMinor,
      currencyCode: row.currencyCode,
      offerId: row.offerId,
      couponId: row.couponId,
      cancelReason: row.cancelReason,
      checkoutIdempotencyKey: row.checkoutIdempotencyKey ?? null,
      deliveryPersonId: row.deliveryPersonId ?? null,
      deliveryPerson: row.deliveryPerson ?? null,
      items: row.items as OrderItemRecord[],
      statusEvents: row.statusEvents.map((e): OrderStatusEventRecord => ({
        id: e.id,
        fromStatus: e.fromStatus as OrderStatusName | null,
        toStatus: e.toStatus as OrderStatusName,
        actorType: e.actorType,
        actorId: e.actorId,
        reason: e.reason,
        createdAt: e.createdAt,
      })),
      paymentIntents: row.paymentIntents,
    };
  }
}
