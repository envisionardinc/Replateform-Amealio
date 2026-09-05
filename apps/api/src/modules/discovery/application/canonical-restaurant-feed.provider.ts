import { Injectable } from '@nestjs/common';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import type { DiscoveryFeedProvider, DiscoveryHomeFeed } from '../domain/discovery-feed';

@Injectable()
export class CanonicalRestaurantFeedProvider implements DiscoveryFeedProvider {
  constructor(private readonly restaurants: RestaurantRepository) {}

  async getHomeFeed(query: { city?: string; q?: string }): Promise<DiscoveryHomeFeed> {
    const restaurants = await this.restaurants.listDiscoverable(query);
    return {
      source: 'CANONICAL',
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
