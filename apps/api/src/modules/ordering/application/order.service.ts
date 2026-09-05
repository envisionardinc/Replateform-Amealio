import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import {
  CommercialQuoteError,
  assertCallerChargesNotAuthoritative,
  composeCommercialQuote,
  lineFromOrderItem,
  snapshotCommercial,
} from '../../catalog/domain/commercial-quote';
import { OrderRepository } from '../infrastructure/order.repository';
import { PromotionApplicationService } from '../../offer/application/promotion-application.service';
import { PromotionApplicationError } from '../../offer/domain/promotion-application';
import { isAllowedTransition, isPickupLike } from '../domain/order-status-graph';
import type {
  ConsumerActor,
  CreateOrderInput,
  DeliveryActor,
  OrderRecord,
  OrderStatusName,
  OrderTypeName,
  RedemptionDirective,
  SystemActor,
  TransitionOptions,
} from '../domain/ordering.types';

const ORDER_TYPES = new Set<OrderTypeName>([
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
]);

export type TransitionActor =
  | { kind: 'STAFF'; principal: StaffPrincipal }
  | { kind: 'CUSTOMER'; actor: ConsumerActor }
  | { kind: 'DELIVERY'; actor: DeliveryActor }
  | { kind: 'SYSTEM'; actor?: SystemActor };

/**
 * Canonical Order creation + status lifecycle. ONE OrderStatus graph.
 * HTTP/refund/assignment orchestration lives in OrderManagementService /
 * CheckoutService / DeliveryService so this kernel stays usable without PaymentModule
 * (ordering-foundation tests).
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly menuItems: MenuItemRepository,
    private readonly orders: OrderRepository,
    private readonly promotions: PromotionApplicationService,
  ) {}

  async createOrder(
    actor: StaffPrincipal | ConsumerActor,
    input: CreateOrderInput,
  ): Promise<OrderRecord> {
    if (!ORDER_TYPES.has(input.type)) {
      throw new BadRequestException('type must be a valid OrderType');
    }
    if (!input.orderNumber || input.orderNumber.trim().length === 0) {
      throw new BadRequestException('orderNumber is required');
    }
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('order must have at least one item');
    }

    const restaurant = await this.restaurants.findById(input.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }

    const isCustomer = actor.actorType === 'CUSTOMER';
    if (!isCustomer) {
      await this.scope.assertRestaurantInScope(actor, input.restaurantId);
    }

    const userId = isCustomer ? actor.userId : (input.userId ?? null);
    const currencyCode = input.currencyCode ?? 'INR';

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

    try {
      assertCallerChargesNotAuthoritative({
        taxTotalMinor: input.taxTotalMinor,
        feeTotalMinor: input.feeTotalMinor,
        deliveryChargeMinor: input.deliveryChargeMinor,
      });
    } catch (err) {
      throw this.toCommercialHttp(err);
    }
    const tipMinor = input.tipMinor ?? 0n;
    const donationMinor = input.donationMinor ?? 0n;

    let discountTotalMinor: bigint;
    let redemption: RedemptionDirective | undefined;
    let appliedOfferId: string | null = null;
    let appliedPromotion: {
      offerId: string;
      couponId: string | null;
      couponCode: string | null;
      title: string;
      source: 'CODE' | 'AUTOMATIC';
    } | null = null;

    const couponIntent = input.couponCode?.trim() ? input.couponCode : null;
    if (couponIntent || isCustomer) {
      try {
        const resolved = await this.promotions.resolve({
          restaurantId: input.restaurantId,
          merchantId: restaurant.merchantId,
          orderType: input.type,
          merchandiseSubtotalMinor: subtotalMinor,
          lines: items.map((it) => ({ lineTotalMinor: it.lineTotalMinor })),
          userId,
          couponCode: couponIntent,
        });
        discountTotalMinor = resolved.discountMinor;
        appliedPromotion = resolved.promotion;
        appliedOfferId = resolved.promotion?.offerId ?? null;
        if (resolved.promotion?.couponId && resolved.promotion.couponCode) {
          const offer = await this.orders.findAppliedOfferByCouponCode(
            resolved.promotion.couponCode,
          );
          if (offer) {
            redemption = {
              offerId: offer.offerId,
              couponId: offer.couponId,
              userId,
              discountAppliedMinor: resolved.discountMinor,
              maxUsageLimit: offer.maxUsageLimit,
              perUserLimit: offer.perUserLimit,
              isGlobal: offer.isGlobal,
              useLimit: offer.useLimit,
              useFrequency: offer.useFrequency,
            };
          }
        }
      } catch (err) {
        if (err instanceof PromotionApplicationError) {
          throw new BadRequestException({ message: err.message, code: err.code });
        }
        throw err;
      }
    } else {
      discountTotalMinor = input.discountTotalMinor ?? 0n;
    }

    if ([discountTotalMinor, tipMinor, donationMinor].some((v) => v < 0n)) {
      throw new BadRequestException('money components must be >= 0');
    }

    let commercial;
    try {
      commercial = composeCommercialQuote({
        lines: items.map((it) =>
          lineFromOrderItem({
            menuItemId: it.menuItemId,
            nameSnapshot: it.nameSnapshot,
            variantSnapshot: it.variantSnapshot,
            unitPriceMinor: it.unitPriceMinor,
            quantity: it.quantity,
            currencyCode,
            merchantId: restaurant.merchantId,
            restaurantId: input.restaurantId,
            addOns: it.addOns,
          }),
        ),
        discountMinor: discountTotalMinor,
        taxRules: [],
        feeRules: [],
        deliveryChargeMinor: 0n,
        merchantId: restaurant.merchantId,
        restaurantId: input.restaurantId,
        currencyCode,
      });
    } catch (err) {
      throw this.toCommercialHttp(err);
    }

    return this.orders.createOrderWithItems({
      orderNumber: input.orderNumber,
      merchantId: restaurant.merchantId,
      restaurantId: input.restaurantId,
      userId,
      type: input.type,
      status: input.status ?? 'INITIAL',
      subtotalMinor: commercial.merchandiseSubtotalMinor,
      taxTotalMinor: commercial.taxTotalMinor,
      discountTotalMinor: commercial.discountMinor,
      feeTotalMinor: commercial.feeTotalMinor,
      deliveryChargeMinor: commercial.deliveryChargeMinor,
      grandTotalMinor: commercial.grandTotalMinor,
      commercialSnapshot: snapshotCommercial(
        commercial,
        appliedPromotion,
      ) as unknown as Prisma.InputJsonValue,
      tipMinor,
      donationMinor,
      currencyCode,
      items,
      actorType: isCustomer ? 'CUSTOMER' : actor.actorType,
      actorId: isCustomer ? actor.userId : actor.staffMemberId,
      offerId: appliedOfferId,
      redemption,
      checkoutIdempotencyKey: input.checkoutIdempotencyKey ?? null,
      deferRedemption: input.deferRedemption === true,
      deliveryAddressId: input.deliveryAddressId ?? null,
      deliveryAddressSnapshot:
        (input.deliveryAddressSnapshot as Prisma.InputJsonValue | null) ?? null,
    });
  }

  /**
   * Prepaid capture hook (doc 90): INITIAL → PENDING, redeem deferred coupon once,
   * clear the consumer cart. Idempotent under verify/webhook retries.
   */
  async promoteOnPaymentCapture(orderId: string): Promise<OrderRecord | null> {
    return this.orders.promoteOnPaymentCapture(orderId);
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
    options?: TransitionOptions,
  ): Promise<OrderRecord> {
    return this.applyTransition({ kind: 'STAFF', principal }, orderId, toStatus, options);
  }

  async applyTransition(
    actor: TransitionActor,
    orderId: string,
    toStatus: OrderStatusName,
    options?: TransitionOptions,
  ): Promise<OrderRecord> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    await this.assertActorScope(actor, order);

    if (options?.expectedStatus && order.status !== options.expectedStatus) {
      throw new ConflictException(
        `expectedStatus ${options.expectedStatus} does not match current ${order.status}`,
      );
    }

    if (order.status === toStatus) {
      return order;
    }

    this.assertActorMayRequest(actor, order, toStatus);

    if (!isAllowedTransition(order.status, toStatus)) {
      throw new BadRequestException(`Invalid status transition ${order.status} -> ${toStatus}`);
    }

    this.assertTypeAwareReady(order, toStatus, actor);

    const reason = this.composeReason(options);
    const { order: next, changed } = await this.orders.updateStatusWithEvent(
      orderId,
      order.status,
      toStatus,
      this.actorType(actor),
      this.actorId(actor),
      reason,
    );

    if (!changed) {
      if (next.status === toStatus) return next;
      throw new ConflictException(`Concurrent status change: now ${next.status}`);
    }
    return next;
  }

  private async assertActorScope(actor: TransitionActor, order: OrderRecord): Promise<void> {
    if (actor.kind === 'STAFF') {
      await this.scope.assertRestaurantInScope(actor.principal, order.restaurantId);
      return;
    }
    if (actor.kind === 'CUSTOMER') {
      if (!order.userId || order.userId !== actor.actor.userId) {
        throw new ForbiddenException('Order does not belong to this customer');
      }
      return;
    }
    if (actor.kind === 'DELIVERY') {
      if (order.merchantId !== actor.actor.merchantId) {
        throw new ForbiddenException('Cross-merchant delivery access denied');
      }
      if (order.deliveryPersonId !== actor.actor.deliveryPersonId) {
        throw new ForbiddenException('Delivery person is not assigned to this order');
      }
    }
  }

  private assertActorMayRequest(
    actor: TransitionActor,
    order: OrderRecord,
    toStatus: OrderStatusName,
  ): void {
    if (actor.kind === 'CUSTOMER') {
      if (toStatus !== 'CANCELLED') {
        throw new ForbiddenException('Customer may only cancel an order');
      }
      if (order.status !== 'INITIAL' && order.status !== 'PENDING') {
        throw new BadRequestException('Customer can cancel only while INITIAL or PENDING');
      }
      return;
    }
    if (actor.kind === 'DELIVERY') {
      const ok =
        (order.status === 'READY' && toStatus === 'ON_THE_WAY') ||
        (order.status === 'ON_THE_WAY' && toStatus === 'DELIVERED');
      if (!ok) {
        throw new ForbiddenException('Delivery person may only set ON_THE_WAY or DELIVERED');
      }
      return;
    }
    if (actor.kind === 'SYSTEM') {
      if (!(order.status === 'INITIAL' && toStatus === 'PENDING')) {
        throw new ForbiddenException('System may only promote INITIAL to PENDING');
      }
      return;
    }
    // Staff: kitchen hops. Rider-owned hops blocked once assigned.
    if (order.deliveryPersonId && (toStatus === 'ON_THE_WAY' || toStatus === 'DELIVERED')) {
      throw new ForbiddenException('Assigned rider owns ON_THE_WAY and DELIVERED');
    }
  }

  private assertTypeAwareReady(
    order: OrderRecord,
    toStatus: OrderStatusName,
    actor: TransitionActor,
  ): void {
    if (order.status !== 'READY') return;
    if (actor.kind === 'DELIVERY') return;

    if (order.type === 'HOME_DELIVERY') {
      if (toStatus === 'COMPLETED') {
        throw new BadRequestException(
          'HOME_DELIVERY cannot skip delivery; complete after DELIVERED',
        );
      }
      if (toStatus === 'ON_THE_WAY' && order.deliveryPersonId) {
        throw new ForbiddenException('Assigned rider owns ON_THE_WAY');
      }
    } else if (isPickupLike(order.type) && toStatus === 'ON_THE_WAY') {
      throw new BadRequestException(`${order.type} cannot transition READY → ON_THE_WAY`);
    }
  }

  private composeReason(options?: TransitionOptions): string | null {
    if (!options) return null;
    if (options.reasonCode && options.reason) return `${options.reasonCode}: ${options.reason}`;
    return options.reasonCode ?? options.reason ?? null;
  }

  private actorType(actor: TransitionActor): string {
    if (actor.kind === 'STAFF') return actor.principal.actorType;
    if (actor.kind === 'CUSTOMER') return 'CUSTOMER';
    if (actor.kind === 'DELIVERY') return 'DELIVERY';
    return 'SYSTEM';
  }

  private actorId(actor: TransitionActor): string | null {
    if (actor.kind === 'STAFF') return actor.principal.staffMemberId;
    if (actor.kind === 'CUSTOMER') return actor.actor.userId;
    if (actor.kind === 'DELIVERY') return actor.actor.deliveryPersonId;
    return actor.actor?.actorId ?? null;
  }

  private toCommercialHttp(err: unknown): never {
    if (err instanceof CommercialQuoteError) {
      throw new BadRequestException({
        message: err.message,
        code: err.code,
      });
    }
    throw err;
  }
}
