-- Global Catalogue source foundation.
-- Forensic basis: legacy /catalogue + /global-catalogue + merchant copy flow.
-- This migration intentionally keeps the reusable source layer separate from
-- merchant MenuItem records; propagation/versioning is not inferred.

CREATE TABLE "platform_catalogs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "legacy_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "cuisine_type" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "source_payload" JSONB,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_catalogs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_catalogs_legacy_id_key" UNIQUE ("legacy_id")
);

CREATE INDEX "platform_catalogs_status_idx" ON "platform_catalogs"("status");

CREATE TABLE "platform_catalog_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "catalog_id" UUID NOT NULL,
  "legacy_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "source_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_catalog_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_catalog_categories_legacy_id_key" UNIQUE ("legacy_id"),
  CONSTRAINT "platform_catalog_categories_catalog_fk" FOREIGN KEY ("catalog_id") REFERENCES "platform_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_catalog_categories_catalog_idx" ON "platform_catalog_categories"("catalog_id");

CREATE TABLE "platform_catalog_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "catalog_id" UUID NOT NULL,
  "category_id" UUID,
  "legacy_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "source_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_catalog_items_legacy_id_key" UNIQUE ("legacy_id"),
  CONSTRAINT "platform_catalog_items_catalog_fk" FOREIGN KEY ("catalog_id") REFERENCES "platform_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_catalog_items_category_fk" FOREIGN KEY ("category_id") REFERENCES "platform_catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "platform_catalog_items_catalog_idx" ON "platform_catalog_items"("catalog_id");
CREATE INDEX "platform_catalog_items_category_idx" ON "platform_catalog_items"("category_id");

CREATE TABLE "platform_catalog_item_materializations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_item_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_catalog_item_materializations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_catalog_item_materializations_source_menu_key" UNIQUE ("source_item_id", "menu_item_id"),
  CONSTRAINT "platform_catalog_item_materializations_source_fk" FOREIGN KEY ("source_item_id") REFERENCES "platform_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_catalog_item_materializations_menu_item_fk" FOREIGN KEY ("menu_item_id") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_catalog_item_materializations_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_catalog_item_materializations_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "platform_catalog_item_materializations_merchant_restaurant_idx" ON "platform_catalog_item_materializations"("merchant_id", "restaurant_id");
CREATE INDEX "platform_catalog_item_materializations_source_idx" ON "platform_catalog_item_materializations"("source_item_id");
