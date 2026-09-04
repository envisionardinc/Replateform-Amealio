import { BadRequestException, Injectable } from '@nestjs/common';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { PaymentService } from '../../payment/application/payment.service';
import type { PaymentIntentRecord } from '../../payment/domain/payment.types';
import { CartRepository } from '../infrastructure/cart.repository';
import { OrderRepository } from '../infrastructure/order.repository';
import type { CreateOrderItemInput, OrderRecord, OrderTypeName } from '../domain/ordering.types';
import { CartService } from './cart.service';
import { OrderService } from './order.service';

export type CheckoutSettlement = 'PREPAID' | 'COD' | 'PAY_LATER';

export interface CheckoutInput {
  restaurantId?: string;
  type?: OrderTypeName;
  settlement: CheckoutSettlement;
  couponCode?: string | null;
  tipMinor?: bigint;
  donationMinor?: bigint;
  items?: Array<{
    variantId: string;
    quantity: number;
    customization?: Record<string, unknown> | null;
    addOns?: unknown;
  }>;
  idempotencyKey?: string | null;
}

export interface CheckoutResult {
  order: OrderRecord;
  settlement: CheckoutSettlement;
  payment: PaymentIntentRecord | null;
}

const ORDER_TYPES = new Set<OrderTypeName>([
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
]);

@Injectable()
export class CheckoutService {
  constructor(
    private readonly carts: CartRepository,
    private readonly cartService: CartService,
    private readonly restaurants: RestaurantRepository,
    private readonly orders: OrderService,
    private readonly orderRepo: OrderRepository,
    private readonly payments: PaymentService,
  ) {}

  async checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
    if (!['PREPAID', 'COD', 'PAY_LATER'].includes(input.settlement)) {
      throw new BadRequestException('settlement must be PREPAID, COD, or PAY_LATER');
    }

    const key = input.idempotencyKey?.trim() || null;
    if (key) {
      const existing = await this.orderRepo.findByCheckoutIdempotencyKey(key);
      if (existing) {
        return this.replayExisting(existing, input.settlement);
      }
    }

    const cart = await this.carts.getOrCreate(userId);
    const type = (input.type ?? cart.type ?? null) as OrderTypeName | null;
    if (!type || !ORDER_TYPES.has(type)) {
      throw new BadRequestException('type is required');
    }

    const sourceItems =
      input.items && input.items.length > 0
        ? input.items
        : cart.items.map((it) => ({
            variantId: it.variantId ?? '',
            quantity: it.quantity,
            customization: (it.customization as Record<string, unknown> | null) ?? null,
            addOns: it.addOns,
          }));
    if (sourceItems.length === 0 || sourceItems.some((i) => !i.variantId)) {
      throw new BadRequestException('checkout requires at least one catalog item');
    }

    const priced: CreateOrderItemInput[] = [];
    let restaurantId: string | null = input.restaurantId ?? cart.restaurantId ?? null;
    for (const it of sourceItems) {
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new BadRequestException('each item requires a positive integer quantity');
      }
      const line = await this.cartService.requireSellableVariant(it.variantId, type);
      if (!restaurantId) restaurantId = line.restaurantId;
      if (line.restaurantId !== restaurantId) {
        throw new BadRequestException('checkout items must belong to one restaurant');
      }
      priced.push({
        menuItemId: line.menuItemId,
        nameSnapshot: line.name,
        variantSnapshot: line.size,
        unitPriceMinor: line.priceMinor,
        quantity: it.quantity,
        customization: it.customization ?? null,
        addOns: it.addOns ?? null,
      });
    }
    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    const restaurant = await this.restaurants.findById(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE') {
      throw new BadRequestException('Restaurant is not accepting orders');
    }

    const prepaid = input.settlement === 'PREPAID';
    const created = await this.orders.createOrder(
      { actorType: 'CUSTOMER', userId },
      {
        orderNumber: this.orderNumber(),
        restaurantId,
        userId,
        type,
        items: priced,
        tipMinor: input.tipMinor ?? 0n,
        donationMinor: input.donationMinor ?? 0n,
        couponCode: input.couponCode ?? null,
        checkoutIdempotencyKey: key,
        deferRedemption: prepaid && !!input.couponCode,
        status: prepaid ? 'INITIAL' : 'PENDING',
      },
    );

    if (!prepaid) {
      await this.carts.deleteByUserId(userId);
      return { order: created, settlement: input.settlement, payment: null };
    }

    const intent = await this.ensureIntent(created);
    const fresh = (await this.orderRepo.findById(created.id)) ?? created;
    return { order: fresh, settlement: 'PREPAID', payment: intent };
  }

  private async replayExisting(
    existing: OrderRecord,
    settlement: CheckoutSettlement,
  ): Promise<CheckoutResult> {
    if (settlement === 'PREPAID' || existing.status === 'INITIAL') {
      const intent = await this.ensureIntent(existing);
      const fresh = (await this.orderRepo.findById(existing.id)) ?? existing;
      return { order: fresh, settlement: 'PREPAID', payment: intent };
    }
    return { order: existing, settlement, payment: null };
  }

  private async ensureIntent(order: OrderRecord): Promise<PaymentIntentRecord> {
    const existing = order.paymentIntents[0];
    if (existing) {
      return {
        id: existing.id,
        orderId: order.id,
        amountMinor: existing.amountMinor,
        currencyCode: existing.currencyCode,
        status: existing.status as PaymentIntentRecord['status'],
        method: existing.method as PaymentIntentRecord['method'],
        razorpayOrderId: existing.razorpayOrderId,
        createdAt: existing.createdAt,
      };
    }
    return this.payments.createIntent({
      orderId: order.id,
      razorpayOrderId: `order_${order.id.replace(/-/g, '')}`,
      method: 'RAZORPAY',
    });
  }

  private orderNumber(): string {
    return `C${Date.now()}${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`;
  }
}
