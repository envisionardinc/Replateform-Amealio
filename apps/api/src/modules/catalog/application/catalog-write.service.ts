import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { CatalogWriteRepository } from '../infrastructure/catalog-write.repository';
import type {
  AddOnGroupRecord,
  AddOnRecord,
  ChannelConfigInput,
  ChannelConfigRecord,
  CreateItemInput,
  CreateMenuInput,
  CreateSectionInput,
  ItemAvailabilityName,
  ItemRecord,
  ItemVariantRecord,
  MenuRecord,
  MenuTypeName,
  OrderTypeName,
  SectionRecord,
  UpdateItemInput,
  UpdateMenuInput,
  UpdateSectionInput,
  VariantInput,
} from '../domain/catalog-write.types';

const ORDER_TYPES = new Set<OrderTypeName>([
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
]);
const AVAILABILITIES = new Set<ItemAvailabilityName>(['AVAILABLE', 'SOLDOUT', 'NOTAVAILABLE']);
const MENU_TYPES = new Set<MenuTypeName>(['STANDARD', 'CUSTOM']);

/**
 * Merchant catalog WRITE foundation (P1.7.18). Create/update Menu → MenuSection
 * → MenuItem → ItemVariant / ItemChannelConfig / AddOnGroup → AddOn over the
 * EXISTING models. Merchant-tenant-scoped (P1.7.1F/P1.7.2): merchant staff
 * operate only within their merchant; SUPER_ADMIN targets a restaurant
 * explicitly; cross-merchant/cross-restaurant/deleted/unknown are rejected;
 * merchant scope is server-derived (never trusted from input). Item creation
 * with children is atomic. Publication (`isPublished`) is distinct from stock
 * `availability`. No combos, tax engine, scheduling, or POS sync.
 */
@Injectable()
export class CatalogWriteService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly repo: CatalogWriteRepository,
  ) {}

  // ---- Menu ----
  async createMenu(principal: StaffPrincipal, input: CreateMenuInput): Promise<MenuRecord> {
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (input.type !== undefined && !MENU_TYPES.has(input.type)) {
      throw new BadRequestException('invalid menu type');
    }
    const merchantId = await this.assertRestaurant(principal, input.restaurantId);
    return this.repo.createMenu(merchantId, input);
  }

  async updateMenu(
    principal: StaffPrincipal,
    menuId: string,
    input: UpdateMenuInput,
  ): Promise<MenuRecord> {
    await this.assertMenu(principal, menuId);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    if (input.type !== undefined && !MENU_TYPES.has(input.type)) {
      throw new BadRequestException('invalid menu type');
    }
    return this.repo.updateMenu(menuId, input);
  }

  // ---- Section ----
  async createSection(
    principal: StaffPrincipal,
    input: CreateSectionInput,
  ): Promise<SectionRecord> {
    await this.assertMenu(principal, input.menuId);
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    await this.assertCategory(input.categoryId);
    return this.repo.createSection(input);
  }

  async updateSection(
    principal: StaffPrincipal,
    sectionId: string,
    input: UpdateSectionInput,
  ): Promise<SectionRecord> {
    await this.assertSection(principal, sectionId);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    await this.assertCategory(input.categoryId);
    return this.repo.updateSection(sectionId, input);
  }

  /** Reorder sections within a single menu (all sections must belong to it). */
  async reorderSections(
    principal: StaffPrincipal,
    menuId: string,
    order: Array<{ sectionId: string; sortOrder: number }>,
  ): Promise<void> {
    await this.assertMenu(principal, menuId);
    if (!order || order.length === 0) throw new BadRequestException('order is required');
    for (const o of order) {
      const belongsTo = await this.repo.sectionMenuId(o.sectionId);
      if (belongsTo !== menuId) {
        throw new BadRequestException('all sections must belong to the menu');
      }
    }
    await this.repo.reorderSections(
      order.map((o) => ({ id: o.sectionId, sortOrder: o.sortOrder })),
    );
  }

  // ---- Item ----
  async createItem(principal: StaffPrincipal, input: CreateItemInput): Promise<ItemRecord> {
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (input.availability !== undefined && !AVAILABILITIES.has(input.availability)) {
      throw new BadRequestException('invalid availability');
    }
    const merchantId = await this.assertRestaurant(principal, input.restaurantId);
    if (input.menuSectionId) {
      await this.assertSectionInRestaurant(input.menuSectionId, input.restaurantId);
    }
    this.validateVariants(input.variants);
    this.validateChannels(input.channelConfigs);
    this.validateAddOnGroups(input.addOnGroups);
    return this.repo.createItem(merchantId, input);
  }

  async updateItem(
    principal: StaffPrincipal,
    itemId: string,
    input: UpdateItemInput,
  ): Promise<ItemRecord> {
    const restaurantId = await this.assertItem(principal, itemId);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    if (input.availability !== undefined && !AVAILABILITIES.has(input.availability)) {
      throw new BadRequestException('invalid availability');
    }
    if (input.menuSectionId) {
      await this.assertSectionInRestaurant(input.menuSectionId, restaurantId);
    }
    return this.repo.updateItem(itemId, input);
  }

  // ---- Variant ----
  async createVariant(
    principal: StaffPrincipal,
    menuItemId: string,
    input: VariantInput,
  ): Promise<ItemVariantRecord> {
    await this.assertItem(principal, menuItemId);
    this.validateVariants([input]);
    return this.repo.createVariant(menuItemId, input);
  }

  async updateVariant(
    principal: StaffPrincipal,
    variantId: string,
    input: Partial<VariantInput>,
  ): Promise<ItemVariantRecord> {
    const v = await this.repo.variantRestaurant(variantId);
    if (!v) throw new NotFoundException('Variant not found');
    await this.assertRestaurant(principal, v.restaurantId);
    if (input.priceMinor !== undefined && input.priceMinor < 0n) {
      throw new BadRequestException('priceMinor must be >= 0');
    }
    return this.repo.updateVariant(variantId, input);
  }

  // ---- Channel config ----
  async setChannelConfig(
    principal: StaffPrincipal,
    menuItemId: string,
    input: ChannelConfigInput,
  ): Promise<ChannelConfigRecord> {
    await this.assertItem(principal, menuItemId);
    if (!ORDER_TYPES.has(input.channel)) throw new BadRequestException('invalid channel');
    if (input.priceOverrideMinor != null && input.priceOverrideMinor < 0n) {
      throw new BadRequestException('priceOverrideMinor must be >= 0');
    }
    return this.repo.upsertChannelConfig(menuItemId, input.channel, {
      enabled: input.enabled,
      priceOverrideMinor: input.priceOverrideMinor,
      surcharges: input.surcharges,
    });
  }

  // ---- Add-ons ----
  async createAddOnGroup(
    principal: StaffPrincipal,
    menuItemId: string,
    input: { name: string; minSelect?: number; maxSelect?: number | null },
  ): Promise<AddOnGroupRecord> {
    await this.assertItem(principal, menuItemId);
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    this.validateSelect(input.minSelect, input.maxSelect);
    return this.repo.createAddOnGroup(menuItemId, input);
  }

  async updateAddOnGroup(
    principal: StaffPrincipal,
    groupId: string,
    input: { name?: string; minSelect?: number; maxSelect?: number | null },
  ): Promise<AddOnGroupRecord> {
    const g = await this.repo.groupRestaurant(groupId);
    if (!g) throw new NotFoundException('Add-on group not found');
    await this.assertRestaurant(principal, g.restaurantId);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    this.validateSelect(input.minSelect, input.maxSelect);
    return this.repo.updateAddOnGroup(groupId, input);
  }

  async createAddOn(
    principal: StaffPrincipal,
    addOnGroupId: string,
    input: { name: string; priceMinor?: bigint; currencyCode?: string },
  ): Promise<AddOnRecord> {
    const g = await this.repo.groupRestaurant(addOnGroupId);
    if (!g) throw new NotFoundException('Add-on group not found');
    await this.assertRestaurant(principal, g.restaurantId);
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (input.priceMinor !== undefined && input.priceMinor < 0n) {
      throw new BadRequestException('priceMinor must be >= 0');
    }
    return this.repo.createAddOn(addOnGroupId, input);
  }

  async updateAddOn(
    principal: StaffPrincipal,
    addOnId: string,
    input: { name?: string; priceMinor?: bigint; currencyCode?: string },
  ): Promise<AddOnRecord> {
    const a = await this.repo.addOnRestaurant(addOnId);
    if (!a) throw new NotFoundException('Add-on not found');
    await this.assertRestaurant(principal, a.restaurantId);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    if (input.priceMinor !== undefined && input.priceMinor < 0n) {
      throw new BadRequestException('priceMinor must be >= 0');
    }
    return this.repo.updateAddOn(addOnId, input);
  }

  // ---- tenancy helpers ----
  private async assertRestaurant(principal: StaffPrincipal, restaurantId: string): Promise<string> {
    const restaurant = await this.restaurants.findById(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    return restaurant.merchantId;
  }

  private async assertMenu(principal: StaffPrincipal, menuId: string): Promise<string> {
    const m = await this.repo.menuRestaurant(menuId);
    if (!m || m.deletedAt !== null) throw new NotFoundException('Menu not found');
    await this.assertRestaurant(principal, m.restaurantId);
    return m.restaurantId;
  }

  private async assertSection(principal: StaffPrincipal, sectionId: string): Promise<string> {
    const s = await this.repo.sectionRestaurant(sectionId);
    if (!s) throw new NotFoundException('Menu section not found');
    await this.assertRestaurant(principal, s.restaurantId);
    return s.restaurantId;
  }

  private async assertItem(principal: StaffPrincipal, itemId: string): Promise<string> {
    const it = await this.repo.itemRestaurant(itemId);
    if (!it || it.deletedAt !== null) throw new NotFoundException('Menu item not found');
    await this.assertRestaurant(principal, it.restaurantId);
    return it.restaurantId;
  }

  private async assertSectionInRestaurant(sectionId: string, restaurantId: string): Promise<void> {
    const s = await this.repo.sectionRestaurant(sectionId);
    if (!s) throw new NotFoundException('Menu section not found');
    if (s.restaurantId !== restaurantId) {
      throw new BadRequestException('section does not belong to this restaurant');
    }
  }

  private async assertCategory(categoryId?: string | null): Promise<void> {
    if (!categoryId) return;
    if (!(await this.repo.categoryExists(categoryId))) {
      throw new BadRequestException('categoryId does not exist');
    }
  }

  // ---- validation ----
  private validateVariants(variants?: VariantInput[]): void {
    for (const v of variants ?? []) {
      if (v.priceMinor === undefined || v.priceMinor < 0n) {
        throw new BadRequestException('variant priceMinor must be >= 0');
      }
    }
  }

  private validateChannels(channels?: ChannelConfigInput[]): void {
    const seen = new Set<string>();
    for (const c of channels ?? []) {
      if (!ORDER_TYPES.has(c.channel)) throw new BadRequestException('invalid channel');
      if (seen.has(c.channel)) throw new BadRequestException('duplicate channel in item');
      seen.add(c.channel);
      if (c.priceOverrideMinor != null && c.priceOverrideMinor < 0n) {
        throw new BadRequestException('priceOverrideMinor must be >= 0');
      }
    }
  }

  private validateAddOnGroups(groups?: CreateItemInput['addOnGroups']): void {
    for (const g of groups ?? []) {
      if (!nonEmpty(g.name)) throw new BadRequestException('add-on group name is required');
      this.validateSelect(g.minSelect, g.maxSelect);
      for (const a of g.addOns ?? []) {
        if (!nonEmpty(a.name)) throw new BadRequestException('add-on name is required');
        if (a.priceMinor !== undefined && a.priceMinor < 0n) {
          throw new BadRequestException('add-on priceMinor must be >= 0');
        }
      }
    }
  }

  private validateSelect(minSelect?: number, maxSelect?: number | null): void {
    if (minSelect !== undefined && (!Number.isInteger(minSelect) || minSelect < 0)) {
      throw new BadRequestException('minSelect must be a non-negative integer');
    }
    if (maxSelect != null && (!Number.isInteger(maxSelect) || maxSelect < 1)) {
      throw new BadRequestException('maxSelect must be a positive integer');
    }
    if (minSelect !== undefined && maxSelect != null && maxSelect < minSelect) {
      throw new BadRequestException('maxSelect cannot be less than minSelect');
    }
  }
}

function nonEmpty(s?: string): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}
