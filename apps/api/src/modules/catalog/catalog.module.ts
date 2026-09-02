import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { MenuRepository } from './infrastructure/menu.repository';
import { MenuItemRepository } from './infrastructure/menu-item.repository';
import { CatalogService } from './application/catalog.service';

/**
 * Menu & Catalog read foundation module (P1.7.5).
 *
 * Read access to the EXISTING merchant-owned catalog (`Menu`/`MenuSection`/
 * `MenuItem`/`ItemVariant`/`ItemChannelConfig`/`AddOnGroup`/`AddOn`) plus a
 * merchant-tenant-scoped catalog service (reuses P1.7.2 `MerchantScopeService`).
 * No schema change, no menu CRUD/publishing, no controllers, no ordering/cart/
 * POS/discovery. Auth/tenancy unchanged (server-derived per P1.7.1F).
 */
@Module({
  imports: [MerchantModule],
  providers: [MenuRepository, MenuItemRepository, CatalogService],
  exports: [MenuRepository, MenuItemRepository, CatalogService],
})
export class CatalogModule {}
