import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { MenuRepository } from './infrastructure/menu.repository';
import { MenuItemRepository } from './infrastructure/menu-item.repository';
import { CatalogService } from './application/catalog.service';
import { CatalogWriteRepository } from './infrastructure/catalog-write.repository';
import { CatalogWriteService } from './application/catalog-write.service';
import { CatalogController } from './catalog.controller';

/**
 * Menu & Catalog foundation module (P1.7.5 read + P1.7.18 write).
 *
 * The HTTP surface is merchant-role protected; tenant isolation remains in the
 * application services through the server-derived StaffPrincipal.
 */
@Module({
  imports: [MerchantModule, StaffAuthModule],
  controllers: [CatalogController],
  providers: [
    MenuRepository,
    MenuItemRepository,
    CatalogService,
    CatalogWriteRepository,
    CatalogWriteService,
  ],
  exports: [
    MenuRepository,
    MenuItemRepository,
    CatalogService,
    CatalogWriteRepository,
    CatalogWriteService,
  ],
})
export class CatalogModule {}
