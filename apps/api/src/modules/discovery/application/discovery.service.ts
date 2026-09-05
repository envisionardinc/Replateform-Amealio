import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { MenuItemRepository } from '../../catalog/infrastructure/menu-item.repository';
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
    priceMinor: bigint;
    currencyCode: string;
    available: boolean;
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
      priceMinor: v.priceMinor.toString(),
      currencyCode: v.currencyCode,
      available: v.available,
    })),
  };
}
