import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { MenuRepository } from './infrastructure/menu.repository';
import { MenuItemRepository } from './infrastructure/menu-item.repository';
import { CatalogService } from './application/catalog.service';
import { CatalogWriteRepository } from './infrastructure/catalog-write.repository';
import { CatalogWriteService } from './application/catalog-write.service';

/**
 * Menu & Catalog foundation module (P1.7.5 read + P1.7.18 write).
 *
 * Read (P1.7.5) + merchant-scoped WRITE (P1.7.18) over the EXISTING catalog
 * hierarchy (`Menu`/`MenuSection`/`MenuItem`/`ItemVariant`/`ItemChannelConfig`/
 * `AddOnGroup`/`AddOn`). Reuses P1.7.2 `MerchantScopeService` (server-derived
 * tenancy per P1.7.1F). No controllers, no customer/merchant UI, no ordering/
 * cart/POS-sync/combos/tax-engine/scheduling.
 */
@Module({
  imports: [MerchantModule],
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
