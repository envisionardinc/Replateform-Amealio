import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import { MerchandiseQuoteService } from '../../catalog/application/merchandise-quote.service';
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
}

@Injectable()
export class CartService {
  constructor(
    private readonly carts: CartRepository,
    private readonly menuItems: MenuItemRepository,
    private readonly quotes: MerchandiseQuoteService,
  ) {}

  async getCart(userId: string): Promise<PricedCart> {
    const cart = await this.carts.getOrCreate(userId);
    return this.price(cart.id);
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
    return this.price(cart.id);
  }

  async updateItem(userId: string, itemId: string, quantity: number): Promise<PricedCart> {
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
    return this.price(cart.id);
  }

  async removeItem(userId: string, itemId: string): Promise<PricedCart> {
    const cart = await this.carts.getOrCreate(userId);
    const removed = await this.carts.deleteItem(cart.id, itemId);
    if (!removed) throw new NotFoundException('Cart item not found');
    return this.price(cart.id);
  }

  async price(cartId: string): Promise<PricedCart> {
    const cart = await this.carts.findById(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    const items: PricedCartItem[] = [];
    let subtotal = 0n;
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
        subtotal += quote.lineMerchandiseMinor;
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
    return {
      id: cart.id,
      restaurantId: cart.restaurantId,
      merchantId: cart.merchantId,
      type: cart.type,
      currencyCode,
      subtotalMinor: subtotal.toString(),
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
