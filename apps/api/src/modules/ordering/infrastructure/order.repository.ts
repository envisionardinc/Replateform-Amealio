import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  AppliedOffer,
  OrderItemRecord,
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
  // P1.7.24: when present, the offer/coupon discount is persisted on the Order and
  // a CouponRedemption is created atomically (usage-limit enforced under lock).
  redemption?: RedemptionDirective;
}

/**
 * Write/read access to `Order` / `OrderItem` / `OrderStatusEvent` (P1.7.12).
 * Creation and status transitions are TRANSACTIONAL (an Order always has its
 * items + an initial status event; a transition always records an event).
 * Authorization/tenancy + transition validity are enforced by OrderService.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a coupon code to its offer for server-side validation (P1.7.24).
   * Returns exactly the fields needed to validate eligibility + compute discount.
   */
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
    };
  }

  /** Atomically create the Order + its OrderItems + the initial OrderStatusEvent. */
  async createOrderWithItems(args: CreateArgs): Promise<OrderRecord> {
    const created = await this.prisma.$transaction(async (tx) => {
      const r = args.redemption;
      if (r) {
        // Serialize concurrent redemptions of the SAME coupon by row-locking the
        // Coupon inside this transaction. Under READ COMMITTED, a competing txn
        // blocks here until we commit, then observes our new redemption in its
        // own count — so the derived usage check cannot oversubscribe (P1.7.24).
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
        // Idempotency invariant: @@unique([couponId, orderId]) — at most one
        // redemption per (coupon, order). ACTIVE at order placement (commit point).
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

  /** Read the (single) redemption attached to an order, if any. */
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

  private async findByIdOrThrow(id: string): Promise<OrderRecord> {
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: ORDER_INCLUDE,
    });
    return this.toRecord(row);
  }

  /** Atomically update the order status + append an OrderStatusEvent. */
  async updateStatusWithEvent(
    id: string,
    fromStatus: OrderStatusName,
    toStatus: OrderStatusName,
    actorType: string | null,
    actorId: string | null,
  ): Promise<OrderRecord> {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: toStatus } });
      await tx.orderStatusEvent.create({
        data: { orderId: id, fromStatus, toStatus, actorType, actorId },
      });
      // P1.7.24: cancelling an order reverses its ACTIVE redemption(s) so usage is
      // released (derived counts exclude REVERSED). This is the ONLY reversal path
      // in this slice — it reuses the EXISTING cancellation transition (P1.7.12).
      // Refund-driven reversal is deferred (P1.7.25).
      if (toStatus === 'CANCELLED') {
        await tx.couponRedemption.updateMany({
          where: { orderId: id, status: 'ACTIVE' },
          data: { status: 'REVERSED', reversedAt: new Date() },
        });
      }
    });
    return this.findByIdOrThrow(id);
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
    currencyCode: string;
    offerId: string | null;
    couponId: string | null;
    items: Array<Omit<OrderItemRecord, 'quantity'> & { quantity: number }>;
    statusEvents: Array<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      actorType: string | null;
      actorId: string | null;
      createdAt: Date;
    }>;
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
      currencyCode: row.currencyCode,
      offerId: row.offerId,
      couponId: row.couponId,
      items: row.items as OrderItemRecord[],
      statusEvents: row.statusEvents.map((e): OrderStatusEventRecord => ({
        id: e.id,
        fromStatus: e.fromStatus as OrderStatusName | null,
        toStatus: e.toStatus as OrderStatusName,
        actorType: e.actorType,
        actorId: e.actorId,
        createdAt: e.createdAt,
      })),
    };
  }
}
