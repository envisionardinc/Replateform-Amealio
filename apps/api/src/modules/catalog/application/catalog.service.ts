import { ForbiddenException, Injectable } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { MenuRepository } from '../infrastructure/menu.repository';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';
import type { MenuRecord, MenuSectionRecord, StaffMenuItemDetail } from '../domain/catalog.types';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import type { RestaurantRecord } from '../../merchant/domain/merchant.types';

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
    private readonly restaurants: RestaurantRepository,
  ) {}

  /**
   * Restaurants owned by the authenticated merchant. Scope is the server
   * principal — never a client-supplied merchantId.
   */
  async listRestaurantsForStaff(principal: StaffPrincipal): Promise<RestaurantRecord[]> {
    if (isSuperAdmin(principal)) {
      throw new ForbiddenException('merchant catalog restaurants require merchant staff scope');
    }
    if (!principal.merchantId) {
      throw new ForbiddenException('merchant scope is required');
    }
    return this.restaurants.listByMerchant(principal.merchantId);
  }

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
  ): Promise<StaffMenuItemDetail | null> {
    const item = await this.items.findById(menuItemId);
    if (!item) return null;
    await this.scope.assertRestaurantInScope(principal, item.restaurantId);
    const detail = await this.items.findDetailById(menuItemId);
    if (!detail) return null;
    const globalSource = await this.items.findGlobalSourceByMenuItemId(menuItemId);
    return { ...detail, globalSource };
  }

  /** Items for a restaurant in the staff's scope (optionally available-only). */
  async getItemsForRestaurant(
    principal: StaffPrincipal,
    restaurantId: string,
    availableOnly = false,
  ) {
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    const rows = await this.items.listByRestaurant(restaurantId, availableOnly);
    const sources = await Promise.all(
      rows.map((row) => this.items.findGlobalSourceByMenuItemId(row.id)),
    );
    return rows.map((row, index) => ({ ...row, globalSource: sources[index] }));
  }

  private async assertMenuInScope(principal: StaffPrincipal, menu: MenuRecord): Promise<void> {
    if (isSuperAdmin(principal)) return;
    if (!principal.merchantId || menu.merchantId !== principal.merchantId) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
  }
}
