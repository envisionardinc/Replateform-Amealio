import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PlatformCatalogRepository } from './platform-catalog.repository';
import { PlatformCatalogService } from './platform-catalog.service';
import { PlatformCatalogController } from './platform-catalog.controller';

@Module({
  imports: [MerchantModule, CatalogModule],
  controllers: [PlatformCatalogController],
  providers: [PlatformCatalogRepository, PlatformCatalogService],
  exports: [PlatformCatalogService],
})
export class PlatformCatalogModule {}
