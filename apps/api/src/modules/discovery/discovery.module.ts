import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MerchantModule } from '../merchant/merchant.module';
import { CanonicalRestaurantFeedProvider } from './application/canonical-restaurant-feed.provider';
import { DiscoveryService } from './application/discovery.service';
import { TaxonomyQuery } from './application/taxonomy.query';
import { DiscoveryController } from './api/discovery.controller';
import { DISCOVERY_FEED } from './domain/discovery-feed';

@Module({
  imports: [MerchantModule, CatalogModule],
  controllers: [DiscoveryController],
  providers: [
    TaxonomyQuery,
    CanonicalRestaurantFeedProvider,
    { provide: DISCOVERY_FEED, useExisting: CanonicalRestaurantFeedProvider },
    DiscoveryService,
  ],
  exports: [DiscoveryService, CanonicalRestaurantFeedProvider, DISCOVERY_FEED],
})
export class DiscoveryModule {}
