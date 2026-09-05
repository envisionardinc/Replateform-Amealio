import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import { CommercialQuoteService } from '../../catalog/application/commercial-quote.service';
import { MerchandiseQuoteService } from '../../catalog/application/merchandise-quote.service';
import { serializeCommercialQuote } from '../../catalog/domain/commercial-quote';
import { PromotionApplicationService } from '../../offer/application/promotion-application.service';
import { serializePromotion } from '../../offer/domain/promotion-application';
import type { CheckoutCatalogLine } from '../../catalog/domain/catalog.types';
import { CartRepository } from '../infrastructure/cart.repository';
import type { OrderTypeName } from '../domain/ordering.types';

export interface PricedCartItem {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  name: string | null;
  variantSnapshot: string | null;
  quantity: number;
  unitPriceMinor: string;
  lineTotalMinor: string;
  variantPriceMinor: string;
  modifierTotalMinor: string;
  currencyCode: string;
  available: boolean;
  customization: unknown;
  addOns: unknown;
}

export interface PricedCart {
  id: string;
  restaurantId: string | null;
  merchantId: string | null;
  type: OrderTypeName | null;
  currencyCode: string;
  subtotalMinor: string;
  merchandiseSubtotalMinor: string;
  discountMinor: string;
  taxableSubtotalMinor: string;
  taxes: Array<{ code: string; rateBps: number; mode: string; amountMinor: string }>;
  taxTotalMinor: string;
  fees: Array<{
    type: string;
    recipient: string;
    amountMinor: string;
    taxTreatment: string;
  }>;
  feeTotalMinor: string;
  deliveryChargeMinor: string;
  grandTotalMinor: string;
  promotion: {
    offerId: string;
    couponId: string | null;
    couponCode: string | null;
    title: string;
    source: 'CODE' | 'AUTOMATIC';
  } | null;
  items: PricedCartItem[];
}

export interface AddCartItemInput {
  variantId: string;
  quantity: number;
  restaurantId?: string;
  type?: OrderTypeName;
  customization?: Record<string, unknown> | null;
  modifierGroups?: Array<{
    groupId: string;
    selections: Array<{ modifierId: string; quantity?: number }>;
  }>;
  addOns?: unknown;
  couponCode?: string | null;
}

@Injectable()
export class CartService {
  constructor(
    private readonly carts: CartRepository,
    private readonly menuItems: MenuItemRepository,
    private readonly quotes: MerchandiseQuoteService,
    private readonly commercial: CommercialQuoteService,
    private readonly promotions: PromotionApplicationService,
  ) {}

  async getCart(userId: string, couponCode?: string | null): Promise<PricedCart> {
    const cart = await this.carts.getOrCreate(userId);
    return this.price(cart.id, { userId, couponCode });
  }

  async addItem(userId: string, input: AddCartItemInput): Promise<PricedCart> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const quote = await this.quotes.quote({
      variantId: input.variantId,
      quantity: input.quantity,
      channel: input.type,
      modifierGroups: input.modifierGroups,
      addOns: input.modifierGroups ? undefined : input.addOns,
    });
    if (input.restaurantId && input.restaurantId !== quote.restaurantId) {
      throw new BadRequestException('variant does not belong to restaurantId');
    }

    let cart = await this.carts.getOrCreate(userId);
    if (cart.restaurantId && cart.restaurantId !== quote.restaurantId) {
      cart = await this.carts.replaceForRestaurant(
        cart.id,
        quote.restaurantId,
        quote.merchantId,
        input.type ?? cart.type,
      );
    } else if (!cart.restaurantId) {
      cart = await this.carts.replaceForRestaurant(
        cart.id,
        quote.restaurantId,
        quote.merchantId,
        input.type ?? cart.type,
      );
    } else if (input.type && cart.type !== input.type) {
      await this.carts.setType(cart.id, input.type);
    }

    await this.carts.addItem(cart.id, {
      menuItemId: quote.menuItemId,
      variantId: quote.variantId,
      quantity: input.quantity,
      customization: (input.customization ?? undefined) as Prisma.InputJsonValue | undefined,
      addOns: this.quotes.snapshot(quote) as unknown as Prisma.InputJsonValue,
    });
    return this.price(cart.id, { userId, couponCode: input.couponCode });
  }

  async updateItem(
    userId: string,
    itemId: string,
    quantity: number,
    couponCode?: string | null,
  ): Promise<PricedCart> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const cart = await this.carts.getOrCreate(userId);
    const existing = cart.items.find((item) => item.id === itemId);
    if (!existing) throw new NotFoundException('Cart item not found');
    if (!existing.variantId) {
      throw new BadRequestException('Cart item is missing a catalog variant');
    }
    await this.quotes.quote({
      variantId: existing.variantId,
      quantity,
      channel: cart.type ?? undefined,
      addOns: existing.addOns,
    });
    const updated = await this.carts.updateItem(cart.id, itemId, quantity);
    if (!updated) throw new NotFoundException('Cart item not found');
    return this.price(cart.id, { userId, couponCode });
  }

  async removeItem(
    userId: string,
    itemId: string,
    couponCode?: string | null,
  ): Promise<PricedCart> {
    const cart = await this.carts.getOrCreate(userId);
    const removed = await this.carts.deleteItem(cart.id, itemId);
    if (!removed) throw new NotFoundException('Cart item not found');
    return this.price(cart.id, { userId, couponCode });
  }

  async price(
    cartId: string,
    opts?: { userId?: string | null; couponCode?: string | null },
  ): Promise<PricedCart> {
    const cart = await this.carts.findById(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    const items: PricedCartItem[] = [];
    const merchandise = [];
    let currencyCode = 'INR';
    for (const it of cart.items) {
      if (!it.variantId) {
        items.push(unpricedLine(it));
        continue;
      }
      try {
        const quote = await this.quotes.quote({
          variantId: it.variantId,
          quantity: it.quantity,
          channel: cart.type ?? undefined,
          addOns: it.addOns,
        });
        if (quote.currencyCode) currencyCode = quote.currencyCode;
        merchandise.push(quote);
        items.push({
          id: it.id,
          menuItemId: quote.menuItemId,
          variantId: quote.variantId,
          name: quote.itemName,
          variantSnapshot: quote.variantSize,
          quantity: it.quantity,
          unitPriceMinor: quote.unitMerchandiseMinor.toString(),
          lineTotalMinor: quote.lineMerchandiseMinor.toString(),
          variantPriceMinor: quote.variantPriceMinor.toString(),
          modifierTotalMinor: quote.modifierTotalMinor.toString(),
          currencyCode: quote.currencyCode,
          available: true,
          customization: it.customization,
          addOns: this.quotes.snapshot(quote),
        });
      } catch {
        items.push({
          ...unpricedLine(it),
          available: false,
        });
      }
    }
    const emptyTotals = {
      merchandiseSubtotalMinor: '0',
      discountMinor: '0',
      taxableSubtotalMinor: '0',
      taxes: [] as Array<{ code: string; rateBps: number; mode: string; amountMinor: string }>,
      taxTotalMinor: '0',
      fees: [] as Array<{
        type: string;
        recipient: string;
        amountMinor: string;
        taxTreatment: string;
      }>,
      feeTotalMinor: '0',
      deliveryChargeMinor: '0',
      grandTotalMinor: '0',
      promotion: null as null,
    };
    let commercial = emptyTotals;
    if (merchandise.length > 0) {
      let discountMinor = 0n;
      let promotion = null;
      if (cart.restaurantId && cart.merchantId && cart.type) {
        try {
          const composed = this.commercial.fromMerchandise(merchandise, 0n);
          const resolved = await this.promotions.resolve({
            restaurantId: cart.restaurantId,
            merchantId: cart.merchantId,
            orderType: cart.type,
            merchandiseSubtotalMinor: composed.merchandiseSubtotalMinor,
            lines: merchandise.map((q) => ({ lineTotalMinor: q.lineMerchandiseMinor })),
            userId: opts?.userId ?? null,
            couponCode: opts?.couponCode,
          });
          discountMinor = resolved.discountMinor;
          promotion = resolved.promotion;
        } catch (err) {
          this.promotions.toHttp(err);
        }
      }
      const quoted = this.commercial.fromMerchandise(merchandise, discountMinor);
      commercial = {
        ...serializeCommercialQuote(quoted),
        promotion: serializePromotion(promotion),
      };
    }
    return {
      id: cart.id,
      restaurantId: cart.restaurantId,
      merchantId: cart.merchantId,
      type: cart.type,
      currencyCode,
      subtotalMinor: commercial.merchandiseSubtotalMinor,
      merchandiseSubtotalMinor: commercial.merchandiseSubtotalMinor,
      discountMinor: commercial.discountMinor,
      taxableSubtotalMinor: commercial.taxableSubtotalMinor,
      taxes: commercial.taxes,
      taxTotalMinor: commercial.taxTotalMinor,
      fees: commercial.fees,
      feeTotalMinor: commercial.feeTotalMinor,
      deliveryChargeMinor: commercial.deliveryChargeMinor,
      grandTotalMinor: commercial.grandTotalMinor,
      promotion: commercial.promotion,
      items,
    };
  }

  async requireSellableVariant(
    variantId: string,
    type?: OrderTypeName,
  ): Promise<CheckoutCatalogLine> {
    const line = await this.menuItems.findVariantForCheckout(variantId, type);
    if (!line) throw new BadRequestException('Unknown menu variant');
    if (!this.isSellable(line)) {
      throw new BadRequestException('Item is not available for checkout');
    }
    if (line.channelEnabled === false) {
      throw new BadRequestException('Item is not enabled for this order type');
    }
    return line;
  }

  isSellable(line: CheckoutCatalogLine): boolean {
    return (
      line.deletedAt === null &&
      line.isPublished &&
      line.availability === 'AVAILABLE' &&
      line.variantAvailable
    );
  }
}

function unpricedLine(it: {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  quantity: number;
  customization: unknown;
  addOns: unknown;
}): PricedCartItem {
  return {
    id: it.id,
    menuItemId: it.menuItemId,
    variantId: it.variantId,
    name: null,
    variantSnapshot: null,
    quantity: it.quantity,
    unitPriceMinor: '0',
    lineTotalMinor: '0',
    variantPriceMinor: '0',
    modifierTotalMinor: '0',
    currencyCode: 'INR',
    available: false,
    customization: it.customization,
    addOns: it.addOns,
  };
}
