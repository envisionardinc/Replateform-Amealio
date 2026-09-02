import { ForbiddenException, Injectable } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { MenuRepository } from '../infrastructure/menu.repository';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';
import type { MenuItemDetail, MenuRecord, MenuSectionRecord } from '../domain/catalog.types';

/**
 * Merchant-tenant-scoped catalog reads (P1.7.5). Catalog is restaurant-scoped;
 * access is confined to the authenticated staff's merchant using the P1.7.2
 * `MerchantScopeService` over the server-derived `StaffPrincipal` (P1.7.1F).
 * SUPER_ADMIN (merchantId = null) is platform-scoped (not confined). A
 * request-supplied merchant/restaurant id is only used to reject a mismatch,
 * never to grant access.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly menus: MenuRepository,
    private readonly items: MenuItemRepository,
  ) {}

  /** Menus for a restaurant, after confirming the restaurant is in the staff's scope. */
  async getMenusForRestaurant(
    principal: StaffPrincipal,
    restaurantId: string,
    visibleOnly = false,
  ): Promise<MenuRecord[]> {
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    return this.menus.listByRestaurant(restaurantId, visibleOnly);
  }

  /** Sections of a menu the staff may access (menu's restaurant must be in scope). */
  async getMenuSections(principal: StaffPrincipal, menuId: string): Promise<MenuSectionRecord[]> {
    const menu = await this.menus.findById(menuId);
    if (!menu) return [];
    await this.assertMenuInScope(principal, menu);
    return this.menus.listSections(menuId);
  }

  /** Item detail (variants/channels/add-ons), after tenancy check on the item's restaurant. */
  async getItemDetail(
    principal: StaffPrincipal,
    menuItemId: string,
  ): Promise<MenuItemDetail | null> {
    const item = await this.items.findById(menuItemId);
    if (!item) return null;
    await this.scope.assertRestaurantInScope(principal, item.restaurantId);
    return this.items.findDetailById(menuItemId);
  }

  /** Items for a restaurant in the staff's scope (optionally available-only). */
  async getItemsForRestaurant(
    principal: StaffPrincipal,
    restaurantId: string,
    availableOnly = false,
  ) {
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    return this.items.listByRestaurant(restaurantId, availableOnly);
  }

  private async assertMenuInScope(principal: StaffPrincipal, menu: MenuRecord): Promise<void> {
    if (isSuperAdmin(principal)) return;
    if (!principal.merchantId || menu.merchantId !== principal.merchantId) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
  }
}
