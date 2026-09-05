import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MerchantModule } from '../merchant/merchant.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { PlatformCatalogRepository } from './platform-catalog.repository';
import { PlatformCatalogService } from './platform-catalog.service';
import { PlatformCatalogController } from './platform-catalog.controller';

@Module({
  imports: [MerchantModule, CatalogModule, StaffAuthModule],
  controllers: [PlatformCatalogController],
  providers: [PlatformCatalogRepository, PlatformCatalogService],
  exports: [PlatformCatalogService],
})
export class PlatformCatalogModule {}
