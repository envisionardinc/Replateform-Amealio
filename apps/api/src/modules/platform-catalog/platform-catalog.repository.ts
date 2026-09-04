import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface PlatformCatalogRecord {
  id: string;
  legacyId: string | null;
  name: string;
  description: string | null;
  cuisineType: string | null;
  status: string;
  sourcePayload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformCatalogCategoryRecord {
  id: string;
  catalogId: string;
  legacyId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  sourcePayload: unknown;
}

export interface PlatformCatalogItemRecord {
  id: string;
  catalogId: string;
  categoryId: string | null;
  legacyId: string | null;
  name: string;
  description: string | null;
  sourcePayload: unknown;
}

@Injectable()
export class PlatformCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createCatalog(input: {
    name: string;
    description?: string | null;
    cuisineType?: string | null;
    status?: string;
    legacyId?: string | null;
    sourcePayload?: unknown;
    createdBy?: string | null;
  }): Promise<PlatformCatalogRecord> {
    const rows = await this.prisma.$queryRaw<PlatformCatalogRecord[]>`
      INSERT INTO "platform_catalogs"
        ("name", "description", "cuisine_type", "status", "legacy_id", "source_payload", "created_by", "updated_by")
      VALUES
        (${input.name.trim()}, ${input.description ?? null}, ${input.cuisineType ?? null},
         ${input.status ?? 'ACTIVE'}, ${input.legacyId ?? null}, ${input.sourcePayload ?? null},
         ${input.createdBy ?? null}, ${input.createdBy ?? null})
      RETURNING
        "id", "legacy_id" AS "legacyId", "name", "description",
        "cuisine_type" AS "cuisineType", "status", "source_payload" AS "sourcePayload",
        "created_at" AS "createdAt", "updated_at" AS "updatedAt"
    `;
    return rows[0];
  }

  async createCategory(input: {
    catalogId: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
    legacyId?: string | null;
    sourcePayload?: unknown;
  }): Promise<PlatformCatalogCategoryRecord> {
    const rows = await this.prisma.$queryRaw<PlatformCatalogCategoryRecord[]>`
      INSERT INTO "platform_catalog_categories"
        ("catalog_id", "name", "description", "sort_order", "legacy_id", "source_payload")
      VALUES
        (${input.catalogId}::uuid, ${input.name.trim()}, ${input.description ?? null},
         ${input.sortOrder ?? 0}, ${input.legacyId ?? null}, ${input.sourcePayload ?? null})
      RETURNING
        "id", "catalog_id" AS "catalogId", "legacy_id" AS "legacyId", "name",
        "description", "sort_order" AS "sortOrder", "source_payload" AS "sourcePayload"
    `;
    return rows[0];
  }

  async createItem(input: {
    catalogId: string;
    categoryId?: string | null;
    name: string;
    description?: string | null;
    legacyId?: string | null;
    sourcePayload?: unknown;
  }): Promise<PlatformCatalogItemRecord> {
    const rows = await this.prisma.$queryRaw<PlatformCatalogItemRecord[]>`
      INSERT INTO "platform_catalog_items"
        ("catalog_id", "category_id", "name", "description", "legacy_id", "source_payload")
      VALUES
        (${input.catalogId}::uuid, ${input.categoryId ?? null}::uuid, ${input.name.trim()},
         ${input.description ?? null}, ${input.legacyId ?? null}, ${input.sourcePayload ?? null})
      RETURNING
        "id", "catalog_id" AS "catalogId", "category_id" AS "categoryId", "legacy_id" AS "legacyId",
        "name", "description", "source_payload" AS "sourcePayload"
    `;
    return rows[0];
  }

  async findItem(itemId: string): Promise<PlatformCatalogItemRecord | null> {
    const rows = await this.prisma.$queryRaw<PlatformCatalogItemRecord[]>`
      SELECT "id", "catalog_id" AS "catalogId", "category_id" AS "categoryId",
             "legacy_id" AS "legacyId", "name", "description", "source_payload" AS "sourcePayload"
      FROM "platform_catalog_items"
      WHERE "id" = ${itemId}::uuid
    `;
    return rows[0] ?? null;
  }

  async findCatalog(catalogId: string): Promise<PlatformCatalogRecord | null> {
    const rows = await this.prisma.$queryRaw<PlatformCatalogRecord[]>`
      SELECT "id", "legacy_id" AS "legacyId", "name", "description",
             "cuisine_type" AS "cuisineType", "status", "source_payload" AS "sourcePayload",
             "created_at" AS "createdAt", "updated_at" AS "updatedAt"
      FROM "platform_catalogs"
      WHERE "id" = ${catalogId}::uuid
    `;
    return rows[0] ?? null;
  }

  async sectionRestaurant(sectionId: string): Promise<{ restaurantId: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ restaurantId: string }>>`
      SELECT m."restaurantId" AS "restaurantId"
      FROM "MenuSection" s
      JOIN "Menu" m ON m."id" = s."menuId"
      WHERE s."id" = ${sectionId}::uuid
    `;
    return rows[0] ?? null;
  }

  async materializeItem(input: {
    sourceItemId: string;
    merchantId: string;
    restaurantId: string;
    menuSectionId?: string | null;
    name: string;
    description?: string | null;
  }): Promise<{ menuItemId: string; materializationId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const menuItemRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MenuItem"
          ("id", "merchantId", "restaurantId", "menuSectionId", "name", "description", "availability", "isPublished", "createdAt", "updatedAt")
        VALUES
          (gen_random_uuid(), ${input.merchantId}::uuid, ${input.restaurantId}::uuid,
           ${input.menuSectionId ?? null}::uuid, ${input.name}, ${input.description ?? null},
           'AVAILABLE'::"ItemAvailability", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING "id"
      `;
      const menuItemId = menuItemRows[0]?.id;
      if (!menuItemId) throw new Error('Menu item materialization did not return an id');

      const linkRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "platform_catalog_item_materializations"
          ("source_item_id", "menu_item_id", "merchant_id", "restaurant_id")
        VALUES
          (${input.sourceItemId}::uuid, ${menuItemId}::uuid, ${input.merchantId}::uuid, ${input.restaurantId}::uuid)
        RETURNING "id"
      `;
      const materializationId = linkRows[0]?.id;
      if (!materializationId) throw new Error('Catalogue materialization link did not return an id');

      return { menuItemId, materializationId };
    });
  }
}
