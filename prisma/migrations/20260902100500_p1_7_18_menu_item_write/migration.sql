-- P1.7.18 — Merchant menu & item write foundation.
-- Additive only: adds the item publication gate (distinct from availability),
-- source-backed variant flags, and optional descriptions. No existing column is
-- dropped/altered; historical migrations are untouched.

-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "MenuSection" ADD COLUMN     "description" TEXT;

-- AlterTable: publication gate (legacy vendorItems.status), NOT stock availability
ALTER TABLE "MenuItem" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: source-backed variant flags (legacy size[].isDefault / .available)
ALTER TABLE "ItemVariant" ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;
