import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { istUsagePeriodWindow } from '../domain/usage-frequency';
import { TERMINAL_ORDER_STATUSES } from '../domain/order-status-graph';
import type {
  AppliedOffer,
  ListOrdersQuery,
  OrderItemRecord,
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
  tipMinor: bigint;
  donationMinor: bigint;
  currencyCode: string;
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
          tipMinor: args.tipMinor,
          donationMinor: args.donationMinor,
          currencyCode: args.currencyCode,
          offerId: r?.offerId ?? null,
          couponId: r?.couponId ?? null,
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

      if (r) {
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
      tipMinor: row.tipMinor,
      donationMinor: row.donationMinor,
      currencyCode: row.currencyCode,
      offerId: row.offerId,
      couponId: row.couponId,
      cancelReason: row.cancelReason,
      deliveryPersonId: null,
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
