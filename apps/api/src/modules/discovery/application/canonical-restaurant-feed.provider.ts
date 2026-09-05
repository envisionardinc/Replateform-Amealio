import { Injectable } from '@nestjs/common';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import type {
  DiscoveryFeedProvider,
  DiscoveryHomeFeed,
  DiscoveryQuery,
} from '../domain/discovery-feed';
import { TaxonomyQuery } from './taxonomy.query';

@Injectable()
export class CanonicalRestaurantFeedProvider implements DiscoveryFeedProvider {
  constructor(
    private readonly restaurants: RestaurantRepository,
    private readonly taxonomy: TaxonomyQuery,
  ) {}

  async getHomeFeed(query: DiscoveryQuery): Promise<DiscoveryHomeFeed> {
    const taxonomy = await this.taxonomy.listCategoryRail();
    let categoryIds: string[] | undefined;
    if (query.categoryId?.trim()) {
      categoryIds = this.taxonomy.isCategoryId(query.categoryId)
        ? await this.taxonomy.categoryIdsIncludingDescendants(query.categoryId.trim())
        : ['00000000-0000-4000-8000-000000000000'];
    }
    const restaurants = await this.restaurants.listDiscoverable({
      city: query.city,
      q: query.q,
      categoryIds,
    });
    return {
      source: 'CANONICAL',
      taxonomy,
      sections: [
        {
          id: 'restaurants',
          title: 'Restaurants near you',
          restaurants,
        },
      ],
    };
  }
}
