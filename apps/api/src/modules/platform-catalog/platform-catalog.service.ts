import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../merchant/infrastructure/restaurant.repository';
import { CatalogWriteService } from '../catalog/application/catalog-write.service';
import type { CreateItemInput } from '../catalog/domain/catalog-write.types';
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
    private readonly catalogWrite: CatalogWriteService,
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
    return this.repo.createCatalog({ ...input, sourcePayload: jsonPayload(input.sourcePayload), createdBy: principal.staffMemberId });
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
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (!(await this.repo.findCatalog(input.catalogId))) throw new NotFoundException('Global catalogue not found');
    return this.repo.createCategory({ ...input, sourcePayload: jsonPayload(input.sourcePayload) });
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
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (!(await this.repo.findCatalog(input.catalogId))) throw new NotFoundException('Global catalogue not found');
    return this.repo.createItem({ ...input, sourcePayload: jsonPayload(input.sourcePayload) });
  }

  /**
   * Copy a reusable global item into the merchant's operational MenuItem layer.
   * The caller supplies the destination restaurant/menu section; merchant scope
   * is derived and checked server-side. Existing MenuItem write validation is
   * reused rather than bypassed.
   */
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
      throw new BadRequestException('global catalogue materialization requires merchant staff scope');
    }
    if (!principal.merchantId) throw new BadRequestException('merchant scope is required');

    const source = await this.repo.findItem(input.sourceItemId);
    if (!source) throw new NotFoundException('Global catalogue item not found');

    const restaurant = await this.restaurants.findById(input.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) throw new NotFoundException('Restaurant not found');
    await this.scope.assertRestaurantInScope(principal, input.restaurantId);

    const name = input.nameOverride ?? source.name;
    if (!nonEmpty(name)) throw new BadRequestException('materialized item name is required');

    if (input.menuSectionId) {
      // Reuse the existing catalog write path's tenancy/section validation by
      // constructing only the validated operational item fields here.
      const operationalInput: CreateItemInput = {
        restaurantId: input.restaurantId,
        menuSectionId: input.menuSectionId,
        name: name.trim(),
        description: input.descriptionOverride ?? source.description ?? undefined,
      };
      const item = await this.catalogWrite.createItem(principal, operationalInput);
      const linked = await this.repo.materializeItemLinkOnly({
        sourceItemId: source.id,
        menuItemId: item.id,
        merchantId: restaurant.merchantId,
        restaurantId: input.restaurantId,
      });
      return linked;
    }

    return this.repo.materializeItem({
      sourceItemId: source.id,
      merchantId: restaurant.merchantId,
      restaurantId: input.restaurantId,
      menuSectionId: null,
      name: name.trim(),
      description: input.descriptionOverride ?? source.description,
    });
  }

  private assertSuperAdmin(principal: StaffPrincipal): void {
    if (principal.staffRole !== 'SUPER_ADMIN' || principal.merchantId !== null) {
      throw new BadRequestException('global catalogue administration requires SUPER_ADMIN scope');
    }
  }
}

function nonEmpty(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function jsonPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}
