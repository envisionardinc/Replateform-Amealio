import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderRepository } from '../infrastructure/order.repository';
import type { ListOrdersQuery, OrderRecord, TransitionOptions } from '../domain/ordering.types';
import { OrderManagementService } from './order-management.service';
import { OrderService } from './order.service';

@Injectable()
export class ConsumerOrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly orderService: OrderService,
    private readonly management: OrderManagementService,
  ) {}

  listMine(userId: string, query: ListOrdersQuery): Promise<OrderRecord[]> {
    return this.orders.listOrders({ ...query, userId });
  }

  async getMine(userId: string, orderId: string): Promise<OrderRecord> {
    const order = await this.orders.findById(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async cancelMine(
    userId: string,
    orderId: string,
    options?: TransitionOptions,
  ): Promise<OrderRecord> {
    const current = await this.getMine(userId, orderId);
    if (current.userId !== userId) {
      throw new ForbiddenException('Order does not belong to this customer');
    }
    const next = await this.orderService.applyTransition(
      { kind: 'CUSTOMER', actor: { actorType: 'CUSTOMER', userId } },
      orderId,
      'CANCELLED',
      options,
    );
    await this.management.refundCapturedIfAny(next);
    return (await this.orders.findById(next.id)) ?? next;
  }
}
