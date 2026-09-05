-- Stage A — canonical Item → Variant → Modifier foundation (doc 103 / 104).
-- Additive only. Existing rows keep current behavior via defaults:
--   groups remain available, quantity-per-modifier off, min/max unchanged;
--   modifiers remain available and non-default;
--   variants gain optional sku (null).
-- New AddOnVariantPrice holds explicit size-specific modifier adjustments.

ALTER TABLE "ItemVariant" ADD COLUMN "sku" TEXT;

ALTER TABLE "AddOnGroup"
  ADD COLUMN "allowQuantity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AddOn"
  ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AddOnVariantPrice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "addOnId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "priceMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AddOnVariantPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AddOnVariantPrice_addOnId_variantId_key" ON "AddOnVariantPrice"("addOnId", "variantId");
CREATE INDEX "AddOnVariantPrice_variantId_idx" ON "AddOnVariantPrice"("variantId");
CREATE INDEX "AddOnVariantPrice_addOnId_idx" ON "AddOnVariantPrice"("addOnId");

ALTER TABLE "AddOnVariantPrice"
  ADD CONSTRAINT "AddOnVariantPrice_addOnId_fkey"
  FOREIGN KEY ("addOnId") REFERENCES "AddOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AddOnVariantPrice"
  ADD CONSTRAINT "AddOnVariantPrice_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AddOnVariantPrice"
  ADD CONSTRAINT "addon_variant_price_nonneg" CHECK ("priceMinor" >= 0);
