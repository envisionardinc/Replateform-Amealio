import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  OrderItemRecord,
  OrderRecord,
  OrderStatusEventRecord,
  OrderStatusName,
  OrderTypeName,
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

  /** Atomically create the Order + its OrderItems + the initial OrderStatusEvent. */
  async createOrderWithItems(args: CreateArgs): Promise<OrderRecord> {
    const created = await this.prisma.$transaction(async (tx) => {
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
      return order.id;
    });
    return this.findByIdOrThrow(created);
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
