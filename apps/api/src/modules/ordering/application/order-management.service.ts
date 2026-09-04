import { Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RefundService } from '../../payment/application/refund.service';
import { CAPTURED_PAYMENT_STATUSES, refundMethodFromPaymentIntent } from '../domain/refund-rail';
import type { PaymentMethodName } from '../../payment/domain/payment.types';
import { OrderRepository } from '../infrastructure/order.repository';
import { OrderService } from './order.service';
import type {
  ListOrdersQuery,
  OrderRecord,
  OrderStatusName,
  TransitionOptions,
} from '../domain/ordering.types';

/**
 * Merchant order HTTP use-cases (doc 88). Reuses OrderService.applyTransition
 * (one graph) and RefundService (existing rails). Does not own status or money.
 */
@Injectable()
export class OrderManagementService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly orders: OrderRepository,
    private readonly orderService: OrderService,
    private readonly refunds: RefundService,
  ) {}

  async listOrders(principal: StaffPrincipal, query: ListOrdersQuery): Promise<OrderRecord[]> {
    if (query.restaurantId) {
      await this.scope.assertRestaurantInScope(principal, query.restaurantId);
    } else if (principal.merchantId) {
      query = { ...query, merchantId: principal.merchantId };
    } else if (!principal.merchantId && !query.restaurantId) {
      // SUPER_ADMIN must pass restaurantId to avoid an unbounded platform dump.
      return [];
    }
    return this.orders.listOrders(query);
  }

  async getOrder(principal: StaffPrincipal, orderId: string): Promise<OrderRecord> {
    const order = await this.orderService.getOrder(principal, orderId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async transitionMerchant(
    principal: StaffPrincipal,
    orderId: string,
    toStatus: OrderStatusName,
    options?: TransitionOptions,
  ): Promise<OrderRecord> {
    const next = await this.orderService.transitionStatus(principal, orderId, toStatus, options);
    if (toStatus === 'CANCELLED') {
      await this.refundCapturedIfAny(next);
    }
    return (await this.orders.findById(next.id)) ?? next;
  }

  /**
   * Paid cancel/reject: RefundService, rail = PaymentIntent.method.
   * Unpaid / COD (no captured intent): no refund row.
   * Idempotent via `order-cancel:${orderId}:${intentId}`.
   */
  async refundCapturedIfAny(order: OrderRecord): Promise<void> {
    for (const intent of order.paymentIntents) {
      if (!CAPTURED_PAYMENT_STATUSES.has(intent.status)) continue;
      const method = refundMethodFromPaymentIntent(intent.method as PaymentMethodName);
      await this.refunds.executeRefund({
        paymentIntentId: intent.id,
        idempotencyKey: `order-cancel:${order.id}:${intent.id}`,
        method,
      });
    }
  }
}
