import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import { OrderRepository } from '../infrastructure/order.repository';
import { assertOfferEligible, calculateDiscountMinor } from '../domain/offer-discount';
import type {
  CreateOrderInput,
  OrderRecord,
  OrderStatusName,
  OrderTypeName,
  RedemptionDirective,
} from '../domain/ordering.types';

const ORDER_TYPES = new Set<OrderTypeName>([
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
]);

/**
 * Native order-status transition graph (P1.7.11-verified; single OrderStatus).
 * Terminal states (COMPLETED/CANCELLED/RETURNED) have no outgoing transitions.
 * READY → COMPLETED covers dine-in/takeaway (no delivery); READY → ON_THE_WAY →
 * DELIVERED covers home delivery (rider advances the SAME field).
 */
const TRANSITIONS: Record<OrderStatusName, OrderStatusName[]> = {
  INITIAL: ['PENDING', 'CANCELLED'],
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['PACKING', 'READY', 'CANCELLED'],
  PACKING: ['READY', 'CANCELLED'],
  READY: ['ON_THE_WAY', 'COMPLETED', 'CANCELLED'],
  ON_THE_WAY: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'RETURNED'],
  COMPLETED: [],
  CANCELLED: [],
  RETURNED: [],
};

/**
 * Canonical Order creation + status lifecycle (P1.7.12). Merchant-tenant-scoped
 * (P1.7.1F/P1.7.2): a staff member operates only within their merchant; an order
 * cannot be created against another merchant's restaurant; SUPER_ADMIN is
 * platform-scoped. Money is exact BigInt minor units; grandTotal is derived to
 * satisfy the DB order_total_integrity CHECK. No payment/delivery/POS/realtime.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly menuItems: MenuItemRepository,
    private readonly orders: OrderRepository,
  ) {}

  async createOrder(principal: StaffPrincipal, input: CreateOrderInput): Promise<OrderRecord> {
    if (!ORDER_TYPES.has(input.type)) {
      throw new BadRequestException('type must be a valid OrderType');
    }
    if (!input.orderNumber || input.orderNumber.trim().length === 0) {
      throw new BadRequestException('orderNumber is required');
    }
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('order must have at least one item');
    }

    // Tenancy: the restaurant must exist and be within the caller's merchant scope.
    const restaurant = await this.restaurants.findById(input.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.scope.assertRestaurantInScope(principal, input.restaurantId);

    const currencyCode = input.currencyCode ?? 'INR';

    // Validate items + compute exact money (integer minor units).
    let subtotalMinor = 0n;
    const items = [] as Array<{
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
    for (const it of input.items) {
      if (!it.nameSnapshot || it.nameSnapshot.trim().length === 0) {
        throw new BadRequestException('each item requires a nameSnapshot');
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new BadRequestException('each item requires a positive integer quantity');
      }
      if (it.unitPriceMinor < 0n) {
        throw new BadRequestException('unitPriceMinor must be >= 0');
      }
      if (it.menuItemId) {
        const mi = await this.menuItems.findById(it.menuItemId);
        if (!mi || mi.deletedAt !== null || mi.restaurantId !== input.restaurantId) {
          throw new BadRequestException('menuItemId does not belong to this restaurant');
        }
      }
      const lineTotalMinor = it.unitPriceMinor * BigInt(it.quantity);
      subtotalMinor += lineTotalMinor;
      items.push({
        menuItemId: it.menuItemId ?? null,
        nameSnapshot: it.nameSnapshot,
        variantSnapshot: it.variantSnapshot ?? null,
        unitPriceMinor: it.unitPriceMinor,
        quantity: it.quantity,
        lineTotalMinor,
        currencyCode,
        customization: (it.customization ?? undefined) as Prisma.InputJsonValue | undefined,
        addOns: (it.addOns ?? undefined) as Prisma.InputJsonValue | undefined,
      });
    }

    const taxTotalMinor = input.taxTotalMinor ?? 0n;
    const feeTotalMinor = input.feeTotalMinor ?? 0n;
    const deliveryChargeMinor = input.deliveryChargeMinor ?? 0n;

    // Discount is server-authoritative when an offer/coupon is applied (P1.7.24,
    // DEC-OFF-1): the client-supplied discountTotalMinor is IGNORED in that case
    // and the server validates the offer + computes the discount from the
    // server-priced subtotal. Without a coupon, the existing ad-hoc discount
    // behavior is preserved.
    const couponCode = input.couponCode?.trim();
    let discountTotalMinor: bigint;
    let redemption: RedemptionDirective | undefined;
    if (couponCode) {
      const offer = await this.orders.findAppliedOfferByCouponCode(couponCode);
      if (!offer) {
        throw new BadRequestException('Invalid coupon code');
      }
      assertOfferEligible(
        offer,
        input.restaurantId,
        restaurant.merchantId,
        subtotalMinor,
        input.type,
        new Date(),
      );
      discountTotalMinor = calculateDiscountMinor(offer, subtotalMinor);
      redemption = {
        offerId: offer.offerId,
        couponId: offer.couponId,
        userId: input.userId ?? null,
        discountAppliedMinor: discountTotalMinor,
        maxUsageLimit: offer.maxUsageLimit,
        perUserLimit: offer.perUserLimit,
      };
    } else {
      discountTotalMinor = input.discountTotalMinor ?? 0n;
    }

    if (
      [taxTotalMinor, discountTotalMinor, feeTotalMinor, deliveryChargeMinor].some((v) => v < 0n)
    ) {
      throw new BadRequestException('money components must be >= 0');
    }
    // Derived to satisfy the order_total_integrity CHECK. This is the authoritative
    // grand total — never a client-supplied value when an offer is involved.
    const grandTotalMinor =
      subtotalMinor - discountTotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor;
    if (grandTotalMinor < 0n) {
      throw new BadRequestException('discount cannot exceed subtotal + charges');
    }

    // Legacy creates orders as INITIAL (draft), then transitions to PENDING/etc.
    return this.orders.createOrderWithItems({
      orderNumber: input.orderNumber,
      merchantId: restaurant.merchantId,
      restaurantId: input.restaurantId,
      userId: input.userId ?? null,
      type: input.type,
      status: 'INITIAL',
      subtotalMinor,
      taxTotalMinor,
      discountTotalMinor,
      feeTotalMinor,
      deliveryChargeMinor,
      grandTotalMinor,
      currencyCode,
      items,
      actorType: principal.actorType,
      actorId: principal.staffMemberId,
      redemption,
    });
  }

  async getOrder(principal: StaffPrincipal, orderId: string): Promise<OrderRecord | null> {
    const order = await this.orders.findById(orderId);
    if (!order) return null;
    await this.scope.assertRestaurantInScope(principal, order.restaurantId);
    return order;
  }

  /** Advance the native OrderStatus (records an OrderStatusEvent). */
  async transitionStatus(
    principal: StaffPrincipal,
    orderId: string,
    toStatus: OrderStatusName,
  ): Promise<OrderRecord> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.scope.assertRestaurantInScope(principal, order.restaurantId);

    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Invalid status transition ${order.status} -> ${toStatus}`);
    }
    return this.orders.updateStatusWithEvent(
      orderId,
      order.status,
      toStatus,
      principal.actorType,
      principal.staffMemberId,
    );
  }
}
