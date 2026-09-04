import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/guards/staff-authorization.guard';
import { RequireStaffRoles } from '../identity/staff-authentication/authorization/staff-authorization.decorators';
import { StaffPrincipal } from '../identity/staff-authentication/staff-principal.decorator';
import type { StaffPrincipal as StaffPrincipalType } from '../identity/staff-authentication/staff-principal';
import { CatalogService } from './application/catalog.service';
import { CatalogWriteService } from './application/catalog-write.service';
import type {
  ChannelConfigInput,
  CreateItemInput,
  CreateMenuInput,
  CreateSectionInput,
  UpdateItemInput,
  UpdateMenuInput,
  UpdateSectionInput,
  VariantInput,
} from './domain/catalog-write.types';

/**
 * Merchant catalog/menu HTTP surface.
 *
 * Authentication and coarse RBAC are enforced here; tenant isolation remains
 * in the application services, using the server-derived StaffPrincipal.
 * SUPER_ADMIN is intentionally not included on merchant catalog routes: the
 * platform-admin surface is the separate Global Item Catalogue.
 */
@Controller('catalog')
@UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly writes: CatalogWriteService,
  ) {}

  @Get('restaurants/:restaurantId/menus')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getMenus(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('restaurantId') restaurantId: string,
    @Query('visibleOnly') visibleOnly?: string,
  ) {
    return this.catalog.getMenusForRestaurant(principal, restaurantId, visibleOnly === 'true');
  }

  @Get('menus/:menuId/sections')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getSections(@StaffPrincipal() principal: StaffPrincipalType, @Param('menuId') menuId: string) {
    return this.catalog.getMenuSections(principal, menuId);
  }

  @Get('items/:menuItemId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getItem(@StaffPrincipal() principal: StaffPrincipalType, @Param('menuItemId') menuItemId: string) {
    return this.catalog.getItemDetail(principal, menuItemId);
  }

  @Get('restaurants/:restaurantId/items')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getItems(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('restaurantId') restaurantId: string,
    @Query('availableOnly') availableOnly?: string,
  ) {
    return this.catalog.getItemsForRestaurant(principal, restaurantId, availableOnly === 'true');
  }

  @Post('menus')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createMenu(@StaffPrincipal() principal: StaffPrincipalType, @Body() input: CreateMenuInput) {
    return this.writes.createMenu(principal, input);
  }

  @Patch('menus/:menuId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateMenu(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('menuId') menuId: string,
    @Body() input: UpdateMenuInput,
  ) {
    return this.writes.updateMenu(principal, menuId, input);
  }

  @Post('sections')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createSection(@StaffPrincipal() principal: StaffPrincipalType, @Body() input: CreateSectionInput) {
    return this.writes.createSection(principal, input);
  }

  @Patch('sections/:sectionId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateSection(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('sectionId') sectionId: string,
    @Body() input: UpdateSectionInput,
  ) {
    return this.writes.updateSection(principal, sectionId, input);
  }

  @Post('menus/:menuId/sections/reorder')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  reorderSections(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('menuId') menuId: string,
    @Body() body: { order: Array<{ sectionId: string; sortOrder: number }> },
  ) {
    return this.writes.reorderSections(principal, menuId, body.order);
  }

  @Post('items')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createItem(@StaffPrincipal() principal: StaffPrincipalType, @Body() input: CreateItemInput) {
    return this.writes.createItem(principal, normalizeMoney(input));
  }

  @Patch('items/:itemId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateItem(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('itemId') itemId: string,
    @Body() input: UpdateItemInput,
  ) {
    return this.writes.updateItem(principal, itemId, input);
  }

  @Post('items/:menuItemId/variants')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createVariant(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('menuItemId') menuItemId: string,
    @Body() input: VariantInput,
  ) {
    return this.writes.createVariant(principal, menuItemId, normalizeMoney(input));
  }

  @Patch('variants/:variantId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateVariant(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('variantId') variantId: string,
    @Body() input: Partial<VariantInput>,
  ) {
    return this.writes.updateVariant(principal, variantId, normalizeMoney(input));
  }

  @Patch('items/:menuItemId/channel-config')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  setChannelConfig(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('menuItemId') menuItemId: string,
    @Body() input: ChannelConfigInput,
  ) {
    return this.writes.setChannelConfig(principal, menuItemId, normalizeMoney(input));
  }

  @Post('items/:menuItemId/add-on-groups')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createAddOnGroup(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('menuItemId') menuItemId: string,
    @Body() input: { name: string; minSelect?: number; maxSelect?: number | null },
  ) {
    return this.writes.createAddOnGroup(principal, menuItemId, input);
  }

  @Patch('add-on-groups/:groupId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateAddOnGroup(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('groupId') groupId: string,
    @Body() input: { name?: string; minSelect?: number; maxSelect?: number | null },
  ) {
    return this.writes.updateAddOnGroup(principal, groupId, input);
  }

  @Post('add-on-groups/:addOnGroupId/add-ons')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createAddOn(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('addOnGroupId') addOnGroupId: string,
    @Body() input: { name: string; priceMinor?: bigint; currencyCode?: string },
  ) {
    return this.writes.createAddOn(principal, addOnGroupId, normalizeMoney(input));
  }

  @Patch('add-ons/:addOnId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateAddOn(
    @StaffPrincipal() principal: StaffPrincipalType,
    @Param('addOnId') addOnId: string,
    @Body() input: { name?: string; priceMinor?: bigint; currencyCode?: string },
  ) {
    return this.writes.updateAddOn(principal, addOnId, normalizeMoney(input));
  }
}

/**
 * JSON cannot carry bigint. The public contract therefore accepts decimal
 * integer strings (or safe JSON integers) and converts only known money fields
 * before the domain service sees them. No currency arithmetic is introduced.
 */
function normalizeMoney<T extends Record<string, unknown>>(input: T): T {
  const output = { ...input } as T;
  for (const key of ['priceMinor', 'priceOverrideMinor']) {
    const value = output[key];
    if (value !== undefined && value !== null && typeof value !== 'bigint') {
      output[key] = BigInt(value as string | number) as T[Extract<keyof T, string>];
    }
  }

  if (Array.isArray(output.variants)) {
    output.variants = output.variants.map((v: VariantInput) => normalizeMoney(v));
  }
  if (Array.isArray(output.channelConfigs)) {
    output.channelConfigs = output.channelConfigs.map((v: ChannelConfigInput) => normalizeMoney(v));
  }
  if (Array.isArray(output.addOnGroups)) {
    output.addOnGroups = output.addOnGroups.map((group) => ({
      ...group,
      addOns: group.addOns?.map((addOn) => normalizeMoney(addOn)),
    }));
  }
  return output;
}
