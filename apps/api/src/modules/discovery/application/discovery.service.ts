import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
import { MerchandiseQuoteService } from '../../catalog/application/merchandise-quote.service';
import type { OrderChannel } from '../../catalog/domain/catalog.types';
import type { ModifierGroupSelectionInput } from '../../catalog/domain/merchandise-configuration';
import type { RestaurantRecord } from '../../merchant/domain/merchant.types';
import { DISCOVERY_FEED, type DiscoveryFeedProvider } from '../domain/discovery-feed';
import { TaxonomyQuery } from './taxonomy.query';

@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(DISCOVERY_FEED) private readonly feed: DiscoveryFeedProvider,
    private readonly restaurants: RestaurantRepository,
    private readonly items: MenuItemRepository,
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

  async getMenu(restaurantId: string) {
    await this.requireDiscoverable(restaurantId);
    const items = await this.items.listPublishedByRestaurant(restaurantId);
    return { restaurantId, items: items.map(serializePublishedItem) };
  }

  async getItem(id: string) {
    const item = await this.items.findPublishedDetailById(id);
    if (!item) throw new NotFoundException('Item not found');
    await this.requireDiscoverable(item.restaurantId);
    return serializePublishedItem(item);
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

function serializePublishedItem(item: {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  availability: string;
  isPublished: boolean;
  variants: Array<{
    id: string;
    size: string | null;
    sku?: string | null;
    priceMinor: bigint;
    currencyCode: string;
    available: boolean;
  }>;
  modifierGroups?: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number | null;
    allowQuantity: boolean;
    available: boolean;
    sortOrder: number;
    required: boolean;
    singleSelect: boolean;
    modifiers: Array<{
      id: string;
      name: string;
      priceMinor: bigint;
      currencyCode: string;
      available: boolean;
      isDefault: boolean;
      sortOrder: number;
      variantPrices: Array<{ variantId: string; priceMinor: bigint }>;
    }>;
  }>;
}) {
  return {
    id: item.id,
    restaurantId: item.restaurantId,
    name: item.name,
    description: item.description,
    availability: item.availability,
    isPublished: item.isPublished,
    variants: item.variants.map((v) => ({
      id: v.id,
      size: v.size,
      sku: v.sku ?? null,
      priceMinor: v.priceMinor.toString(),
      currencyCode: v.currencyCode,
      available: v.available,
    })),
    ...(item.modifierGroups
      ? {
          modifierGroups: item.modifierGroups.map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            allowQuantity: g.allowQuantity,
            available: g.available,
            sortOrder: g.sortOrder,
            required: g.required,
            singleSelect: g.singleSelect,
            modifiers: g.modifiers.map((m) => ({
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
        }
      : {}),
  };
}
