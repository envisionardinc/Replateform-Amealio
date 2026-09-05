import type { RestaurantRecord } from '../../merchant/domain/merchant.types';

/**
 * Home feed port (doc 92). UI and restaurant cards must not import a
 * recommendation engine. Canonical provider is the default.
 * RecommendationProvider (OD-8) is FUTURE and must fall back here.
 */
export type DiscoveryFeedSource = 'CANONICAL' | 'RECOMMENDATION';

export type DiscoveryQuery = { city?: string; q?: string; categoryId?: string };

export type DiscoveryTaxonomyChip = {
  id: string;
  label: string;
  type: string | null;
  available: boolean;
  restaurantCount: number;
};

export type DiscoveryTaxonomy = {
  kind: 'CATEGORY';
  chips: DiscoveryTaxonomyChip[];
};

export interface DiscoveryHomeFeed {
  source: DiscoveryFeedSource;
  taxonomy: DiscoveryTaxonomy;
  sections: Array<{
    id: string;
    title: string;
    restaurants: RestaurantRecord[];
  }>;
}

export interface DiscoveryFeedProvider {
  getHomeFeed(query: DiscoveryQuery): Promise<DiscoveryHomeFeed>;
}

export const DISCOVERY_FEED = 'DISCOVERY_FEED';
