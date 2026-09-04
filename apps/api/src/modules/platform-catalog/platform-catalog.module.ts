import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PlatformCatalogRepository } from './platform-catalog.repository';
import { PlatformCatalogService } from './platform-catalog.service';

/**
 * Platform-owned reusable catalogue source layer. Global administration is
 * SUPER_ADMIN-only; merchant materialization reuses the existing merchant
 * catalog write path and server-derived tenant scope.
 */
@Module({
  imports: [MerchantModule, CatalogModule],
  providers: [PlatformCatalogRepository, PlatformCatalogService],
  exports: [PlatformCatalogService],
})
export class PlatformCatalogModule {}
