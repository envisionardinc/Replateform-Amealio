import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import { MenuRepository } from '../../catalog/infrastructure/menu.repository';
import { MerchandiseQuoteService } from '../../catalog/application/merchandise-quote.service';
import type { ConsumerCatalogItem, OrderChannel } from '../../catalog/domain/catalog.types';
import type { ModifierGroupSelectionInput } from '../../catalog/domain/merchandise-configuration';
import { appearsOnConsumerMenu, isConsumerOrderable } from '../../catalog/domain/orderability';
import type { RestaurantRecord } from '../../merchant/domain/merchant.types';
import { DISCOVERY_FEED, type DiscoveryFeedProvider } from '../domain/discovery-feed';
import { TaxonomyQuery } from './taxonomy.query';

/**
 * Public consumer discovery. Standard menu is a virtual assembly of published
 * merchant catalog items. Custom Menu is a real Menu(type=CUSTOM) that references
 * those same items. Both use the Stage B orderability rule.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(DISCOVERY_FEED) private readonly feed: DiscoveryFeedProvider,
    private readonly restaurants: RestaurantRepository,
    private readonly items: MenuItemRepository,
    private readonly menus: MenuRepository,
    private readonly taxonomy: TaxonomyQuery,
    private readonly quotes: MerchandiseQuoteService,
  ) {}

  getHome(query: { city?: string; q?: string; categoryId?: string }) {
    return this.feed.getHomeFeed(query);
  }

  async listRestaurants(query: { city?: string; q?: string; categoryId?: string }) {
    const categoryIds = query.categoryId?.trim()
      ? await this.categoryIdsForFilter(query.categoryId)
      : undefined;
    return this.restaurants.listDiscoverable({
      city: query.city,
      q: query.q,
      categoryIds,
    });
  }

  async getRestaurant(id: string): Promise<RestaurantRecord> {
    const row = await this.requireDiscoverable(id);
    return row;
  }

  async getMenu(restaurantId: string, channel?: OrderChannel) {
    await this.requireDiscoverable(restaurantId);
    const items = await this.items.listConsumerItems({ restaurantId, channel });
    return {
      kind: 'STANDARD' as const,
      restaurantId,
      channel: channel ?? null,
      items: items
        .filter((item) => appearsOnConsumerMenu(item, channel))
        .map(serializeConsumerItem),
    };
  }

  async listCustomMenus(restaurantId: string) {
    await this.requireDiscoverable(restaurantId);
    const menus = await this.menus.listVisibleCustomMenus(restaurantId);
    return {
      restaurantId,
      menus: menus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        type: 'CUSTOM' as const,
        visibility: menu.visibility,
      })),
    };
  }

  async getCustomMenu(menuId: string, channel?: OrderChannel) {
    const menu = await this.menus.findVisibleCustomMenu(menuId);
    if (!menu) throw new NotFoundException('Menu not found');
    await this.requireDiscoverable(menu.restaurantId);
    const sectionIds = menu.sections.map((section) => section.id);
    const items = sectionIds.length
      ? await this.items.listConsumerItems({
          restaurantId: menu.restaurantId,
          channel,
          menuSectionIds: sectionIds,
        })
      : [];
    const visible = items.filter((item) => appearsOnConsumerMenu(item, channel));
    const bySection = new Map(visible.map((item) => [item.menuSectionId, [] as typeof visible]));
    for (const item of visible) {
      const list = bySection.get(item.menuSectionId) ?? [];
      list.push(item);
      bySection.set(item.menuSectionId, list);
    }
    return {
      kind: 'CUSTOM' as const,
      restaurantId: menu.restaurantId,
      channel: channel ?? null,
      menu: { id: menu.id, name: menu.name, type: 'CUSTOM' as const, visibility: menu.visibility },
      sections: menu.sections.map((section) => ({
        id: section.id,
        name: section.name,
        sortOrder: section.sortOrder,
        categoryId: section.categoryId,
        items: (bySection.get(section.id) ?? []).map(serializeConsumerItem),
      })),
      items: visible.map(serializeConsumerItem),
    };
  }

  async getItem(id: string, channel?: OrderChannel) {
    const item = await this.findPublishedConsumerItem(id, channel);
    if (!item || !appearsOnConsumerMenu(item, channel)) {
      throw new NotFoundException('Item not found');
    }
    await this.requireDiscoverable(item.restaurantId);
    return serializeConsumerItem(item);
  }

  async quoteItem(input: {
    variantId: string;
    quantity: number;
    type?: OrderChannel;
    modifierGroups?: ModifierGroupSelectionInput[];
  }) {
    const quote = await this.quotes.quote(input);
    await this.requireDiscoverable(quote.restaurantId);
    return {
      variantId: quote.variantId,
      menuItemId: quote.menuItemId,
      restaurantId: quote.restaurantId,
      quantity: quote.quantity,
      currencyCode: quote.currencyCode,
      variantPriceMinor: quote.variantPriceMinor.toString(),
      modifierTotalMinor: quote.modifierTotalMinor.toString(),
      unitMerchandiseMinor: quote.unitMerchandiseMinor.toString(),
      lineMerchandiseMinor: quote.lineMerchandiseMinor.toString(),
      selections: quote.selections.map((s) => ({
        groupId: s.groupId,
        modifierId: s.modifierId,
        name: s.name,
        quantity: s.quantity,
        priceAdjustmentMinor: s.priceAdjustmentMinor.toString(),
      })),
    };
  }

  private async findPublishedConsumerItem(
    id: string,
    channel?: OrderChannel,
  ): Promise<ConsumerCatalogItem | null> {
    const stub = await this.items.findById(id);
    if (!stub) return null;
    const rows = await this.items.listConsumerItems({
      restaurantId: stub.restaurantId,
      itemId: id,
      channel,
    });
    return rows[0] ?? null;
  }

  private async categoryIdsForFilter(categoryId: string): Promise<string[]> {
    if (!this.taxonomy.isCategoryId(categoryId)) {
      return ['00000000-0000-4000-8000-000000000000'];
    }
    return this.taxonomy.categoryIdsIncludingDescendants(categoryId.trim());
  }

  private async requireDiscoverable(id: string): Promise<RestaurantRecord> {
    const row = await this.restaurants.findById(id);
    if (!row || row.deletedAt !== null || row.status !== 'ACTIVE') {
      throw new NotFoundException('Restaurant not found');
    }
    return row;
  }
}

function serializeConsumerItem(item: ConsumerCatalogItem) {
  const orderable = isConsumerOrderable(item);
  return {
    id: item.id,
    restaurantId: item.restaurantId,
    name: item.name,
    description: item.description,
    availability: item.availability,
    isPublished: item.isPublished,
    visible: true,
    orderable,
    channelEnabled: item.channelEnabled,
    variants: item.variants.map((v) => ({
      id: v.id,
      size: v.size,
      sku: v.sku ?? null,
      priceMinor: v.priceMinor.toString(),
      currencyCode: v.currencyCode,
      available: v.available,
    })),
    modifierGroups: item.groups
      .filter((g) => g.available)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        allowQuantity: g.allowQuantity,
        available: g.available,
        sortOrder: g.sortOrder,
        required: g.minSelect >= 1,
        singleSelect: g.maxSelect === 1,
        modifiers: g.modifiers
          .filter((m) => m.available)
          .map((m) => ({
            id: m.id,
            name: m.name,
            priceMinor: m.priceMinor.toString(),
            currencyCode: m.currencyCode,
            available: m.available,
            isDefault: m.isDefault,
            sortOrder: m.sortOrder,
            variantPrices: m.variantPrices.map((p) => ({
              variantId: p.variantId,
              priceMinor: p.priceMinor.toString(),
            })),
          })),
      })),
  };
}
