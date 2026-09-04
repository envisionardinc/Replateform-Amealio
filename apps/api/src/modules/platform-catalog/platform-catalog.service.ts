import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../merchant/infrastructure/restaurant.repository';
import {
  PlatformCatalogRepository,
  PlatformCatalogRecord,
  PlatformCatalogCategoryRecord,
  PlatformCatalogItemRecord,
} from './platform-catalog.repository';

/**
 * Global Catalogue source + merchant materialization foundation.
 *
 * Legacy contract recovered from Amealio-VendorDashboard and
 * AmealioDashboardMVP-:
 *   Super Admin owns reusable global catalogue/category/item records;
 *   merchants discover those records and copy them into merchant-local
 *   operational catalogue records.
 *
 * Discovery evidence:
 *   GET /catalogue (list) — Super Admin + merchant dashboards
 *   GET /catalogue/:id (detail with items) — Super Admin + merchant
 *   GET /vendor/items/:categoryId?catlogue_id= — merchant item discovery
 *   PATCH /catalogue/:id — Super Admin catalogue metadata update
 *
 * The source layer is deliberately separate from MenuItem. A materialization
 * is a copy, not a live inheritance relationship. Propagation/versioning is not
 * inferred because legacy evidence does not establish it.
 */
@Injectable()
export class PlatformCatalogService {
  constructor(
    private readonly repo: PlatformCatalogRepository,
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
  ) {}

  async createGlobalCatalog(
    principal: StaffPrincipal,
    input: {
      name: string;
      description?: string | null;
      cuisineType?: string | null;
      status?: string;
      legacyId?: string | null;
      sourcePayload?: unknown;
    },
  ): Promise<PlatformCatalogRecord> {
    this.assertSuperAdmin(principal);
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    return this.repo.createCatalog({
      ...input,
      sourcePayload: jsonPayload(input.sourcePayload),
      createdBy: principal.staffMemberId,
    });
  }

  async updateGlobalCatalog(
    principal: StaffPrincipal,
    catalogId: string,
    input: {
      name?: string;
      description?: string | null;
      cuisineType?: string | null;
      status?: string;
      sourcePayload?: unknown;
    },
  ): Promise<PlatformCatalogRecord> {
    this.assertSuperAdmin(principal);
    assertUuid(catalogId, 'catalogId');
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name is required');
    }
    if (input.status !== undefined && !nonEmpty(input.status)) {
      throw new BadRequestException('status is required when provided');
    }
    const updated = await this.repo.updateCatalog({
      catalogId,
      name: input.name,
      description: input.description,
      cuisineType: input.cuisineType,
      status: input.status,
      sourcePayload:
        input.sourcePayload === undefined ? undefined : jsonPayload(input.sourcePayload),
      updatedBy: principal.staffMemberId,
    });
    if (!updated) throw new NotFoundException('Global catalogue not found');
    return updated;
  }

  async createGlobalCategory(
    principal: StaffPrincipal,
    input: {
      catalogId: string;
      name: string;
      description?: string | null;
      sortOrder?: number;
      legacyId?: string | null;
      sourcePayload?: unknown;
    },
  ): Promise<PlatformCatalogCategoryRecord> {
    this.assertSuperAdmin(principal);
    assertUuid(input.catalogId, 'catalogId');
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (!(await this.repo.findCatalog(input.catalogId))) {
      throw new NotFoundException('Global catalogue not found');
    }
    return this.repo.createCategory({
      ...input,
      sourcePayload: jsonPayload(input.sourcePayload),
    });
  }

  async createGlobalItem(
    principal: StaffPrincipal,
    input: {
      catalogId: string;
      categoryId?: string | null;
      name: string;
      description?: string | null;
      legacyId?: string | null;
      sourcePayload?: unknown;
    },
  ): Promise<PlatformCatalogItemRecord> {
    this.assertSuperAdmin(principal);
    assertUuid(input.catalogId, 'catalogId');
    if (input.categoryId) assertUuid(input.categoryId, 'categoryId');
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (!(await this.repo.findCatalog(input.catalogId))) {
      throw new NotFoundException('Global catalogue not found');
    }
    if (input.categoryId) {
      const category = await this.repo.findCategory(input.categoryId);
      if (!category) throw new NotFoundException('Global catalogue category not found');
      if (category.catalogId !== input.catalogId) {
        throw new BadRequestException('category does not belong to this catalogue');
      }
    }
    return this.repo.createItem({
      ...input,
      sourcePayload: jsonPayload(input.sourcePayload),
    });
  }

  /** Legacy GET /catalogue — Super Admin + merchant discovery. */
  async listGlobalCatalogs(
    principal: StaffPrincipal,
    status?: string,
  ): Promise<PlatformCatalogRecord[]> {
    this.assertDiscoveryAccess(principal);
    return this.repo.listCatalogs(status);
  }

  /**
   * Legacy GET /catalogue/:id — catalogue container plus categories and items.
   * Target normalizes categories into an explicit collection (legacy embeds category
   * onto populated items via after-hooks).
   */
  async getGlobalCatalog(
    principal: StaffPrincipal,
    catalogId: string,
  ): Promise<{
    catalog: PlatformCatalogRecord;
    categories: PlatformCatalogCategoryRecord[];
    items: PlatformCatalogItemRecord[];
  }> {
    this.assertDiscoveryAccess(principal);
    assertUuid(catalogId, 'catalogId');
    const catalog = await this.repo.findCatalog(catalogId);
    if (!catalog) throw new NotFoundException('Global catalogue not found');
    const [categories, items] = await Promise.all([
      this.repo.listCategories(catalogId),
      this.repo.listItems(catalogId),
    ]);
    return { catalog, categories, items };
  }

  async listGlobalCategories(
    principal: StaffPrincipal,
    catalogId: string,
  ): Promise<PlatformCatalogCategoryRecord[]> {
    this.assertDiscoveryAccess(principal);
    assertUuid(catalogId, 'catalogId');
    if (!(await this.repo.findCatalog(catalogId))) {
      throw new NotFoundException('Global catalogue not found');
    }
    return this.repo.listCategories(catalogId);
  }

  /**
   * Legacy merchant item discovery within a catalogue, optionally filtered by
   * category (GET /vendor/items/:categoryId?catlogue_id=).
   */
  async listGlobalItems(
    principal: StaffPrincipal,
    catalogId: string,
    categoryId?: string,
  ): Promise<PlatformCatalogItemRecord[]> {
    this.assertDiscoveryAccess(principal);
    assertUuid(catalogId, 'catalogId');
    if (categoryId) assertUuid(categoryId, 'categoryId');
    if (!(await this.repo.findCatalog(catalogId))) {
      throw new NotFoundException('Global catalogue not found');
    }
    if (categoryId) {
      const category = await this.repo.findCategory(categoryId);
      if (!category) throw new NotFoundException('Global catalogue category not found');
      if (category.catalogId !== catalogId) {
        throw new BadRequestException('category does not belong to this catalogue');
      }
    }
    return this.repo.listItems(catalogId, categoryId);
  }

  async getGlobalItem(
    principal: StaffPrincipal,
    itemId: string,
  ): Promise<PlatformCatalogItemRecord> {
    this.assertDiscoveryAccess(principal);
    assertUuid(itemId, 'itemId');
    const item = await this.repo.findItem(itemId);
    if (!item) throw new NotFoundException('Global catalogue item not found');
    return item;
  }

  /** Copy a reusable global item into the merchant's operational MenuItem layer. */
  async materializeGlobalItem(
    principal: StaffPrincipal,
    input: {
      sourceItemId: string;
      restaurantId: string;
      menuSectionId?: string | null;
      nameOverride?: string;
      descriptionOverride?: string | null;
    },
  ): Promise<{ menuItemId: string; materializationId: string }> {
    if (!['MERCHANT_OWNER', 'MERCHANT_STAFF'].includes(principal.staffRole)) {
      throw new ForbiddenException(
        'global catalogue materialization requires merchant staff scope',
      );
    }
    if (!principal.merchantId) throw new ForbiddenException('merchant scope is required');
    assertUuid(input.sourceItemId, 'sourceItemId');
    if (!nonEmpty(input.restaurantId)) throw new BadRequestException('restaurantId is required');
    assertUuid(input.restaurantId, 'restaurantId');
    if (input.menuSectionId) assertUuid(input.menuSectionId, 'menuSectionId');

    const source = await this.repo.findItem(input.sourceItemId);
    if (!source) throw new NotFoundException('Global catalogue item not found');

    const restaurant = await this.restaurants.findById(input.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.scope.assertRestaurantInScope(principal, input.restaurantId);

    if (input.menuSectionId) {
      const section = await this.repo.sectionRestaurant(input.menuSectionId);
      if (!section) throw new NotFoundException('Menu section not found');
      if (section.restaurantId !== input.restaurantId) {
        throw new BadRequestException('section does not belong to this restaurant');
      }
    }

    const name = input.nameOverride ?? source.name;
    if (!nonEmpty(name)) throw new BadRequestException('materialized item name is required');

    return this.repo.materializeItem({
      sourceItemId: source.id,
      merchantId: restaurant.merchantId,
      restaurantId: input.restaurantId,
      menuSectionId: input.menuSectionId ?? null,
      name: name.trim(),
      description: input.descriptionOverride ?? source.description,
    });
  }

  private assertSuperAdmin(principal: StaffPrincipal): void {
    if (principal.staffRole !== 'SUPER_ADMIN' || principal.merchantId !== null) {
      throw new ForbiddenException('global catalogue administration requires SUPER_ADMIN scope');
    }
  }

  private assertDiscoveryAccess(principal: StaffPrincipal): void {
    if (principal.staffRole === 'SUPER_ADMIN' && principal.merchantId === null) return;
    if (
      (principal.staffRole === 'MERCHANT_OWNER' || principal.staffRole === 'MERCHANT_STAFF') &&
      principal.merchantId
    ) {
      return;
    }
    throw new ForbiddenException('global catalogue discovery requires staff authentication');
  }
}

function nonEmpty(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function jsonPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID`);
  }
}
