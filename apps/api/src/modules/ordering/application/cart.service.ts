import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import { CommercialQuoteService } from '../../catalog/application/commercial-quote.service';
import { ComboService } from '../../catalog/application/combo.service';
import { MerchandiseQuoteService } from '../../catalog/application/merchandise-quote.service';
import type { ComboQuote, ComboSelectionInput } from '../../catalog/domain/combo';
import { serializeCommercialQuote } from '../../catalog/domain/commercial-quote';
import type { MerchandiseQuote } from '../../catalog/domain/merchandise-configuration';
import { PromotionApplicationService } from '../../offer/application/promotion-application.service';
import { serializePromotion } from '../../offer/domain/promotion-application';
import type { CheckoutCatalogLine } from '../../catalog/domain/catalog.types';
import { CartRepository } from '../infrastructure/cart.repository';
import type { OrderTypeName } from '../domain/ordering.types';

export interface PricedCartItem {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  comboId: string | null;
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
  variantId?: string;
  comboId?: string;
  quantity: number;
  restaurantId?: string;
  type?: OrderTypeName;
  customization?: Record<string, unknown> | null;
  modifierGroups?: Array<{
    groupId: string;
    selections: Array<{ modifierId: string; quantity?: number }>;
  }>;
  selections?: ComboSelectionInput[];
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
    private readonly combos: ComboService,
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
    if (Boolean(input.variantId) === Boolean(input.comboId)) {
      throw new BadRequestException('cart item requires exactly one of variantId or comboId');
    }
    if (input.comboId) {
      const quote = await this.combos.quote({
        comboId: input.comboId,
        quantity: input.quantity,
        channel: input.type,
        selections: input.selections,
      });
      if (input.restaurantId && input.restaurantId !== quote.restaurantId) {
        throw new BadRequestException('combo does not belong to restaurantId');
      }
      const cart = await this.placeCart(userId, quote.restaurantId, quote.merchantId, input.type);
      await this.carts.addItem(cart.id, {
        comboId: quote.comboId,
        quantity: input.quantity,
        customization: (input.customization ?? undefined) as Prisma.InputJsonValue | undefined,
        addOns: this.combos.snapshot(quote) as unknown as Prisma.InputJsonValue,
      });
      return this.price(cart.id, { userId, couponCode: input.couponCode });
    }
    const quote = await this.quotes.quote({
      variantId: input.variantId!,
      quantity: input.quantity,
      channel: input.type,
      modifierGroups: input.modifierGroups,
      addOns: input.modifierGroups ? undefined : input.addOns,
    });
    if (input.restaurantId && input.restaurantId !== quote.restaurantId) {
      throw new BadRequestException('variant does not belong to restaurantId');
    }
    const cart = await this.placeCart(userId, quote.restaurantId, quote.merchantId, input.type);
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
    if (existing.comboId) {
      await this.combos.quote({
        comboId: existing.comboId,
        quantity,
        channel: cart.type ?? undefined,
        selections: selectionsFromSnapshot(existing.addOns),
      });
    } else if (!existing.variantId) {
      throw new BadRequestException('Cart item is missing a catalog variant');
    } else {
      await this.quotes.quote({
        variantId: existing.variantId,
        quantity,
        channel: cart.type ?? undefined,
        addOns: existing.addOns,
      });
    }
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
    const merchandise: MerchandiseQuote[] = [];
    const comboQuotes: ComboQuote[] = [];
    let currencyCode = 'INR';
    for (const it of cart.items) {
      if (it.comboId) {
        try {
          const quote = await this.combos.quote({
            comboId: it.comboId,
            quantity: it.quantity,
            channel: cart.type ?? undefined,
            selections: selectionsFromSnapshot(it.addOns),
          });
          if (quote.currencyCode) currencyCode = quote.currencyCode;
          comboQuotes.push(quote);
          items.push({
            id: it.id,
            menuItemId: null,
            variantId: null,
            comboId: quote.comboId,
            name: quote.name,
            variantSnapshot: null,
            quantity: it.quantity,
            unitPriceMinor: quote.unitMerchandiseMinor.toString(),
            lineTotalMinor: quote.lineMerchandiseMinor.toString(),
            variantPriceMinor: quote.comboPriceMinor.toString(),
            modifierTotalMinor: quote.modifierTotalMinor.toString(),
            currencyCode: quote.currencyCode,
            available: true,
            customization: it.customization,
            addOns: this.combos.snapshot(quote),
          });
        } catch {
          items.push({
            ...unpricedLine(it),
            comboId: it.comboId,
            available: false,
          });
        }
        continue;
      }
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
          comboId: null,
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
      promotion: null as ReturnType<typeof serializePromotion>,
    };
    let commercial = emptyTotals;
    if (merchandise.length > 0 || comboQuotes.length > 0) {
      let discountMinor = 0n;
      let promotion = null;
      if (cart.restaurantId && cart.merchantId && cart.type) {
        try {
          const composed = this.commercial.fromParts({
            items: merchandise,
            combos: comboQuotes,
            discountMinor: 0n,
          });
          const resolved = await this.promotions.resolve({
            restaurantId: cart.restaurantId,
            merchantId: cart.merchantId,
            orderType: cart.type,
            merchandiseSubtotalMinor: composed.merchandiseSubtotalMinor,
            lines: [
              ...merchandise.map((q) => ({ lineTotalMinor: q.lineMerchandiseMinor })),
              ...comboQuotes.map((q) => ({ lineTotalMinor: q.lineMerchandiseMinor })),
            ],
            userId: opts?.userId ?? null,
            couponCode: opts?.couponCode,
          });
          discountMinor = resolved.discountMinor;
          promotion = resolved.promotion;
        } catch (err) {
          this.promotions.toHttp(err);
        }
      }
      const quoted = this.commercial.fromParts({
        items: merchandise,
        combos: comboQuotes,
        discountMinor,
      });
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

  private async placeCart(
    userId: string,
    restaurantId: string,
    merchantId: string,
    type?: OrderTypeName,
  ) {
    let cart = await this.carts.getOrCreate(userId);
    if (cart.restaurantId && cart.restaurantId !== restaurantId) {
      return this.carts.replaceForRestaurant(cart.id, restaurantId, merchantId, type ?? cart.type);
    }
    if (!cart.restaurantId) {
      return this.carts.replaceForRestaurant(cart.id, restaurantId, merchantId, type ?? cart.type);
    }
    if (type && cart.type !== type) {
      await this.carts.setType(cart.id, type);
    }
    return cart;
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
  comboId?: string | null;
  quantity: number;
  customization: unknown;
  addOns: unknown;
}): PricedCartItem {
  return {
    id: it.id,
    menuItemId: it.menuItemId,
    variantId: it.variantId,
    comboId: it.comboId ?? null,
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

function selectionsFromSnapshot(addOns: unknown): ComboSelectionInput[] | undefined {
  if (!addOns || typeof addOns !== 'object') return undefined;
  const snap = addOns as { schema?: string; components?: Array<{ slotId?: string; menuItemId?: string }> };
  if (snap.schema !== 'combo.v1' || !Array.isArray(snap.components)) return undefined;
  const selections = snap.components
    .filter((row) => typeof row.slotId === 'string' && typeof row.menuItemId === 'string')
    .map((row) => ({ slotId: row.slotId!, menuItemId: row.menuItemId! }));
  return selections.length > 0 ? selections : undefined;
}
