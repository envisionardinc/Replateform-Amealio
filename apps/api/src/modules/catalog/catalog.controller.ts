import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import { RequireStaffRoles } from '../identity/staff-authentication/authorization/staff-authorization.decorators';
import type { RequestWithStaffPrincipal, StaffPrincipal as StaffPrincipalType } from '../identity/staff-authentication/staff-principal';
import { CatalogService } from './application/catalog.service';
import { CatalogWriteService } from './application/catalog-write.service';
import { ComboService } from './application/combo.service';
import type { CreateComboInput, UpdateComboInput } from './application/combo.service';
import {
  MerchandisingRelationService,
  type CreateMerchandisingInput,
  type UpdateMerchandisingInput,
} from './application/merchandising-relation.service';
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
    private readonly combos: ComboService,
    private readonly merchandising: MerchandisingRelationService,
  ) {}

  private principal(req: Request & RequestWithStaffPrincipal): StaffPrincipalType {
    if (!req.staffPrincipal) throw new Error('Authenticated staff principal missing');
    return req.staffPrincipal;
  }

  @Get('restaurants/:restaurantId/menus')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getMenus(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('restaurantId') restaurantId: string,
    @Query('visibleOnly') visibleOnly?: string,
  ) {
    return this.catalog.getMenusForRestaurant(this.principal(req), restaurantId, visibleOnly === 'true');
  }

  @Get('menus/:menuId/sections')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getSections(@Req() req: Request & RequestWithStaffPrincipal, @Param('menuId') menuId: string) {
    return this.catalog.getMenuSections(this.principal(req), menuId);
  }

  @Get('items/:menuItemId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getItem(@Req() req: Request & RequestWithStaffPrincipal, @Param('menuItemId') menuItemId: string) {
    return this.catalog.getItemDetail(this.principal(req), menuItemId);
  }

  @Get('restaurants/:restaurantId/items')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getItems(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('restaurantId') restaurantId: string,
    @Query('availableOnly') availableOnly?: string,
  ) {
    return this.catalog.getItemsForRestaurant(this.principal(req), restaurantId, availableOnly === 'true');
  }

  @Post('menus')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createMenu(@Req() req: Request & RequestWithStaffPrincipal, @Body() input: CreateMenuInput) {
    return this.writes.createMenu(this.principal(req), input);
  }

  @Patch('menus/:menuId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateMenu(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('menuId') menuId: string,
    @Body() input: UpdateMenuInput,
  ) {
    return this.writes.updateMenu(this.principal(req), menuId, input);
  }

  @Post('sections')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createSection(@Req() req: Request & RequestWithStaffPrincipal, @Body() input: CreateSectionInput) {
    return this.writes.createSection(this.principal(req), input);
  }

  @Patch('sections/:sectionId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateSection(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('sectionId') sectionId: string,
    @Body() input: UpdateSectionInput,
  ) {
    return this.writes.updateSection(this.principal(req), sectionId, input);
  }

  @Post('menus/:menuId/sections/reorder')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  reorderSections(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('menuId') menuId: string,
    @Body() body: { order: Array<{ sectionId: string; sortOrder: number }> },
  ) {
    return this.writes.reorderSections(this.principal(req), menuId, body.order);
  }

  @Post('items')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createItem(@Req() req: Request & RequestWithStaffPrincipal, @Body() input: CreateItemInput) {
    return this.writes.createItem(this.principal(req), normalizeMoney(input));
  }

  @Patch('items/:itemId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateItem(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('itemId') itemId: string,
    @Body() input: UpdateItemInput,
  ) {
    return this.writes.updateItem(this.principal(req), itemId, input);
  }

  @Post('items/:menuItemId/variants')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createVariant(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('menuItemId') menuItemId: string,
    @Body() input: VariantInput,
  ) {
    return this.writes.createVariant(this.principal(req), menuItemId, normalizeMoney(input));
  }

  @Patch('variants/:variantId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateVariant(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('variantId') variantId: string,
    @Body() input: Partial<VariantInput>,
  ) {
    return this.writes.updateVariant(this.principal(req), variantId, normalizeMoney(input));
  }

  @Patch('items/:menuItemId/channel-config')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  setChannelConfig(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('menuItemId') menuItemId: string,
    @Body() input: ChannelConfigInput,
  ) {
    return this.writes.setChannelConfig(this.principal(req), menuItemId, normalizeMoney(input));
  }

  @Post('items/:menuItemId/add-on-groups')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createAddOnGroup(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('menuItemId') menuItemId: string,
    @Body() input: {
      name: string;
      minSelect?: number;
      maxSelect?: number | null;
      allowQuantity?: boolean;
      available?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.writes.createAddOnGroup(this.principal(req), menuItemId, input);
  }

  @Patch('add-on-groups/:groupId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateAddOnGroup(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('groupId') groupId: string,
    @Body() input: {
      name?: string;
      minSelect?: number;
      maxSelect?: number | null;
      allowQuantity?: boolean;
      available?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.writes.updateAddOnGroup(this.principal(req), groupId, input);
  }

  @Post('add-on-groups/:addOnGroupId/add-ons')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createAddOn(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('addOnGroupId') addOnGroupId: string,
    @Body() input: {
      name: string;
      priceMinor?: bigint;
      currencyCode?: string;
      available?: boolean;
      isDefault?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.writes.createAddOn(this.principal(req), addOnGroupId, normalizeMoney(input));
  }

  @Patch('add-ons/:addOnId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateAddOn(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('addOnId') addOnId: string,
    @Body() input: {
      name?: string;
      priceMinor?: bigint;
      currencyCode?: string;
      available?: boolean;
      isDefault?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.writes.updateAddOn(this.principal(req), addOnId, normalizeMoney(input));
  }

  @Post('add-ons/:addOnId/variant-prices')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  setAddOnVariantPrice(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('addOnId') addOnId: string,
    @Body() input: { variantId: string; priceMinor: bigint },
  ) {
    return this.writes.setAddOnVariantPrice(this.principal(req), addOnId, normalizeMoney(input));
  }

  @Get('restaurants/:restaurantId/combos')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  listCombos(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.combos
      .listForRestaurant(this.principal(req), restaurantId)
      .then((rows) => rows.map((row) => this.combos.serialize(row)));
  }

  @Get('combos/:comboId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  getCombo(@Req() req: Request & RequestWithStaffPrincipal, @Param('comboId') comboId: string) {
    return this.combos
      .getForStaff(this.principal(req), comboId)
      .then((row) => this.combos.serialize(row));
  }

  @Post('combos')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createCombo(@Req() req: Request & RequestWithStaffPrincipal, @Body() input: CreateComboInput) {
    return this.combos
      .create(this.principal(req), normalizeMoney(input))
      .then((row) => this.combos.serialize(row));
  }

  @Patch('combos/:comboId')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateCombo(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('comboId') comboId: string,
    @Body() input: UpdateComboInput,
  ) {
    return this.combos
      .update(this.principal(req), comboId, normalizeMoney(input))
      .then((row) => this.combos.serialize(row));
  }

  @Get('restaurants/:restaurantId/merchandising-relations')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  listRestaurantRelations(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.merchandising
      .listForRestaurant(this.principal(req), restaurantId)
      .then((rows) => rows.map((row) => this.merchandising.serialize(row)));
  }

  @Get('items/:sourceItemId/merchandising-relations')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  listItemRelations(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('sourceItemId') sourceItemId: string,
  ) {
    return this.merchandising
      .listForSource(this.principal(req), sourceItemId)
      .then((rows) => rows.map((row) => this.merchandising.serialize(row)));
  }

  @Post('merchandising-relations')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  createRelation(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Body() input: CreateMerchandisingInput,
  ) {
    return this.merchandising
      .create(this.principal(req), input)
      .then((row) => this.merchandising.serialize(row));
  }

  @Patch('merchandising-relations/:id')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  updateRelation(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateMerchandisingInput,
  ) {
    return this.merchandising
      .update(this.principal(req), id, input)
      .then((row) => this.merchandising.serialize(row));
  }

  @Delete('merchandising-relations/:id')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  removeRelation(@Req() req: Request & RequestWithStaffPrincipal, @Param('id') id: string) {
    return this.merchandising.remove(this.principal(req), id);
  }
}

type MoneyPayload = Record<string, unknown> & {
  variants?: MoneyPayload[];
  channelConfigs?: MoneyPayload[];
  addOnGroups?: Array<MoneyPayload & { addOns?: MoneyPayload[] }>;
  addOns?: MoneyPayload[];
};

/** JSON cannot carry bigint; normalize only the known money fields at the API boundary. */
function normalizeMoney<T>(input: T): T {
  const source = input as unknown as MoneyPayload;
  const output: MoneyPayload = { ...source };
  for (const key of ['priceMinor', 'priceOverrideMinor', 'comboPriceMinor']) {
    const value = output[key];
    if (value !== undefined && value !== null && typeof value !== 'bigint') {
      if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        throw new TypeError(`${key} must be a safe integer or decimal string`);
      }
      output[key] = BigInt(value as string | number);
    }
  }
  if (Array.isArray(source.variants)) output.variants = source.variants.map(normalizeMoney);
  if (Array.isArray(source.channelConfigs)) output.channelConfigs = source.channelConfigs.map(normalizeMoney);
  if (Array.isArray(source.addOnGroups)) {
    output.addOnGroups = source.addOnGroups.map((group) => ({ ...group, addOns: group.addOns?.map(normalizeMoney) }));
  }
  if (Array.isArray(source.addOns)) output.addOns = source.addOns.map(normalizeMoney);
  return output as unknown as T;
}
