import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
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
  addOns?: unknown;
}

@Injectable()
export class CartService {
  constructor(
    private readonly carts: CartRepository,
    private readonly menuItems: MenuItemRepository,
  ) {}

  async getCart(userId: string): Promise<PricedCart> {
    const cart = await this.carts.getOrCreate(userId);
    return this.price(cart.id);
  }

  async addItem(userId: string, input: AddCartItemInput): Promise<PricedCart> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const line = await this.requireSellableVariant(input.variantId, input.type);
    if (input.restaurantId && input.restaurantId !== line.restaurantId) {
      throw new BadRequestException('variant does not belong to restaurantId');
    }

    let cart = await this.carts.getOrCreate(userId);
    if (cart.restaurantId && cart.restaurantId !== line.restaurantId) {
      cart = await this.carts.replaceForRestaurant(
        cart.id,
        line.restaurantId,
        line.merchantId,
        input.type ?? cart.type,
      );
    } else if (!cart.restaurantId) {
      cart = await this.carts.replaceForRestaurant(
        cart.id,
        line.restaurantId,
        line.merchantId,
        input.type ?? cart.type,
      );
    } else if (input.type && cart.type !== input.type) {
      await this.carts.setType(cart.id, input.type);
    }

    await this.carts.addItem(cart.id, {
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      quantity: input.quantity,
      customization: (input.customization ?? undefined) as Prisma.InputJsonValue | undefined,
      addOns: (input.addOns ?? undefined) as Prisma.InputJsonValue | undefined,
    });
    return this.price(cart.id);
  }

  async updateItem(userId: string, itemId: string, quantity: number): Promise<PricedCart> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const cart = await this.carts.getOrCreate(userId);
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
      const line = it.variantId
        ? await this.menuItems.findVariantForCheckout(it.variantId, cart.type ?? undefined)
        : null;
      const available = !!line && this.isSellable(line);
      const unit = line?.priceMinor ?? 0n;
      const lineTotal = unit * BigInt(it.quantity);
      if (available) subtotal += lineTotal;
      if (line?.currencyCode) currencyCode = line.currencyCode;
      items.push({
        id: it.id,
        menuItemId: it.menuItemId,
        variantId: it.variantId,
        name: line?.name ?? null,
        variantSnapshot: line?.size ?? null,
        quantity: it.quantity,
        unitPriceMinor: unit.toString(),
        lineTotalMinor: lineTotal.toString(),
        currencyCode: line?.currencyCode ?? 'INR',
        available,
        customization: it.customization,
        addOns: it.addOns,
      });
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
