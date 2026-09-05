import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { MaterializationProduct } from '../catalog/domain/materialization-product';

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

  async updateCatalog(input: {
    catalogId: string;
    name?: string;
    description?: string | null;
    cuisineType?: string | null;
    status?: string;
    sourcePayload?: unknown;
    updatedBy?: string | null;
  }): Promise<PlatformCatalogRecord | null> {
    const existing = await this.findCatalog(input.catalogId);
    if (!existing) return null;

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const description = input.description !== undefined ? input.description : existing.description;
    const cuisineType = input.cuisineType !== undefined ? input.cuisineType : existing.cuisineType;
    const status = input.status !== undefined ? input.status : existing.status;
    const sourcePayload =
      input.sourcePayload !== undefined ? input.sourcePayload : existing.sourcePayload;

    const rows = await this.prisma.$queryRaw<PlatformCatalogRecord[]>`
      UPDATE "platform_catalogs"
      SET
        "name" = ${name},
        "description" = ${description},
        "cuisine_type" = ${cuisineType},
        "status" = ${status},
        "source_payload" = ${sourcePayload ?? null},
        "updated_by" = ${input.updatedBy ?? null},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.catalogId}::uuid
      RETURNING
        "id", "legacy_id" AS "legacyId", "name", "description",
        "cuisine_type" AS "cuisineType", "status", "source_payload" AS "sourcePayload",
        "created_at" AS "createdAt", "updated_at" AS "updatedAt"
    `;
    return rows[0] ?? null;
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

  async listCatalogs(status?: string): Promise<PlatformCatalogRecord[]> {
    if (status) {
      return this.prisma.$queryRaw<PlatformCatalogRecord[]>`
        SELECT
          "id", "legacy_id" AS "legacyId", "name", "description",
          "cuisine_type" AS "cuisineType", "status", "source_payload" AS "sourcePayload",
          "created_at" AS "createdAt", "updated_at" AS "updatedAt"
        FROM "platform_catalogs"
        WHERE "status" = ${status}
        ORDER BY "name" ASC
      `;
    }
    return this.prisma.$queryRaw<PlatformCatalogRecord[]>`
      SELECT
        "id", "legacy_id" AS "legacyId", "name", "description",
        "cuisine_type" AS "cuisineType", "status", "source_payload" AS "sourcePayload",
        "created_at" AS "createdAt", "updated_at" AS "updatedAt"
      FROM "platform_catalogs"
      ORDER BY "name" ASC
    `;
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

  async listCategories(catalogId: string): Promise<PlatformCatalogCategoryRecord[]> {
    return this.prisma.$queryRaw<PlatformCatalogCategoryRecord[]>`
      SELECT
        "id", "catalog_id" AS "catalogId", "legacy_id" AS "legacyId", "name",
        "description", "sort_order" AS "sortOrder", "source_payload" AS "sourcePayload"
      FROM "platform_catalog_categories"
      WHERE "catalog_id" = ${catalogId}::uuid
      ORDER BY "sort_order" ASC, "name" ASC
    `;
  }

  async findCategory(categoryId: string): Promise<PlatformCatalogCategoryRecord | null> {
    const rows = await this.prisma.$queryRaw<PlatformCatalogCategoryRecord[]>`
      SELECT
        "id", "catalog_id" AS "catalogId", "legacy_id" AS "legacyId", "name",
        "description", "sort_order" AS "sortOrder", "source_payload" AS "sourcePayload"
      FROM "platform_catalog_categories"
      WHERE "id" = ${categoryId}::uuid
    `;
    return rows[0] ?? null;
  }

  async listItems(catalogId: string, categoryId?: string): Promise<PlatformCatalogItemRecord[]> {
    if (categoryId) {
      return this.prisma.$queryRaw<PlatformCatalogItemRecord[]>`
        SELECT
          "id", "catalog_id" AS "catalogId", "category_id" AS "categoryId", "legacy_id" AS "legacyId",
          "name", "description", "source_payload" AS "sourcePayload"
        FROM "platform_catalog_items"
        WHERE "catalog_id" = ${catalogId}::uuid
          AND "category_id" = ${categoryId}::uuid
        ORDER BY "name" ASC
      `;
    }
    return this.prisma.$queryRaw<PlatformCatalogItemRecord[]>`
      SELECT
        "id", "catalog_id" AS "catalogId", "category_id" AS "categoryId", "legacy_id" AS "legacyId",
        "name", "description", "source_payload" AS "sourcePayload"
      FROM "platform_catalog_items"
      WHERE "catalog_id" = ${catalogId}::uuid
      ORDER BY "name" ASC
    `;
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
    product?: MaterializationProduct | null;
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
      if (!materializationId)
        throw new Error('Catalogue materialization link did not return an id');

      if (input.product) {
        await copyMaterializedProduct(tx, menuItemId, input.product);
      }

      return { menuItemId, materializationId };
    });
  }
}

async function copyMaterializedProduct(
  tx: Prisma.TransactionClient,
  menuItemId: string,
  product: MaterializationProduct,
): Promise<void> {
  const variants: Array<{ id: string; size: string | null; sku: string | null }> = [];
  for (const variant of product.variants ?? []) {
    const created = await tx.itemVariant.create({
      data: {
        menuItemId,
        size: variant.size ?? null,
        sku: variant.sku ?? null,
        priceMinor: variant.priceMinor,
        currencyCode: variant.currencyCode ?? 'INR',
        isDefault: variant.isDefault ?? false,
        available: variant.available ?? true,
      },
      select: { id: true, size: true, sku: true },
    });
    variants.push(created);
  }

  for (const group of product.addOnGroups ?? []) {
    const createdGroup = await tx.addOnGroup.create({
      data: {
        menuItemId,
        name: group.name,
        minSelect: group.minSelect ?? 0,
        maxSelect: group.maxSelect ?? null,
        allowQuantity: group.allowQuantity ?? false,
        available: group.available ?? true,
        sortOrder: group.sortOrder ?? 0,
      },
      select: { id: true },
    });
    for (const addon of group.addOns ?? []) {
      const createdAddon = await tx.addOn.create({
        data: {
          addOnGroupId: createdGroup.id,
          name: addon.name,
          priceMinor: addon.priceMinor ?? 0n,
          available: addon.available ?? true,
          isDefault: addon.isDefault ?? false,
          sortOrder: addon.sortOrder ?? 0,
        },
        select: { id: true },
      });
      for (const override of addon.variantPrices ?? []) {
        const target = variants.find(
          (row) =>
            (override.sku && row.sku === override.sku) ||
            (override.size && row.size === override.size),
        );
        if (!target) continue;
        await tx.addOnVariantPrice.create({
          data: { addOnId: createdAddon.id, variantId: target.id, priceMinor: override.priceMinor },
        });
      }
    }
  }

  for (const channel of product.channelConfigs ?? []) {
    await tx.itemChannelConfig.create({
      data: {
        menuItemId,
        channel: channel.channel,
        enabled: channel.enabled ?? true,
        priceOverrideMinor: channel.priceOverrideMinor ?? null,
      },
    });
  }
}
