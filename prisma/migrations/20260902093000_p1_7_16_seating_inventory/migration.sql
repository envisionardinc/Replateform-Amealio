-- P1.7.16 — Merchant seating configuration & seating-request foundation.
-- Additive only: normalizes seating inventory (SeatingArea/RestaurantTable) and
-- adds the physical-table RUNTIME status enum. No existing column is altered or
-- dropped; historical migrations are untouched.

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'ON_HOLD', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "RestaurantTable" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "shape" TEXT,
ADD COLUMN     "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SeatingArea" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "legacyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_legacyId_key" ON "RestaurantTable"("legacyId");

-- CreateIndex
CREATE INDEX "RestaurantTable_seatingAreaId_idx" ON "RestaurantTable"("seatingAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingArea_legacyId_key" ON "SeatingArea"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingArea_restaurantId_name_key" ON "SeatingArea"("restaurantId", "name");
