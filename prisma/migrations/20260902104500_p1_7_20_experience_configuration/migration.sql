-- P1.7.20 — Merchant experience configuration foundation.
-- Additive only: new Experience + ExperienceMenu tables + enums. No existing
-- column is altered/dropped; historical migrations are untouched.

-- CreateEnum
CREATE TYPE "ExperienceType" AS ENUM ('FOOD', 'EVENT');

-- CreateEnum
CREATE TYPE "ExperienceKind" AS ENUM ('SPECIAL', 'CURATED');

-- CreateEnum
CREATE TYPE "ExperienceFoodMode" AS ENUM ('NONE', 'INCLUDED', 'SEPARATE', 'OCCASION_TEXT');

-- CreateEnum
CREATE TYPE "ExperienceMenuMode" AS ENUM ('NONE', 'STANDARD', 'CUSTOM', 'PACKAGE');

-- CreateTable
CREATE TABLE "Experience" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legacyId" TEXT,
    "merchantId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "categoryId" UUID,
    "subCategoryId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ExperienceType" NOT NULL DEFAULT 'EVENT',
    "expType" "ExperienceKind",
    "foodMode" "ExperienceFoodMode" NOT NULL DEFAULT 'NONE',
    "menuMode" "ExperienceMenuMode" NOT NULL DEFAULT 'NONE',
    "foodDescription" TEXT,
    "occasionText" TEXT,
    "totalSeats" INTEGER,
    "minSeats" INTEGER,
    "maxSeats" INTEGER,
    "listingPriceMinor" BIGINT,
    "adultPriceMinor" BIGINT,
    "kidsPriceMinor" BIGINT,
    "occasionPriceMinor" BIGINT,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "scheduleConfig" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceMenu" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experienceId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceMenu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Experience_legacyId_key" ON "Experience"("legacyId");

-- CreateIndex
CREATE INDEX "Experience_restaurantId_idx" ON "Experience"("restaurantId");

-- CreateIndex
CREATE INDEX "Experience_merchantId_idx" ON "Experience"("merchantId");

-- CreateIndex
CREATE INDEX "Experience_restaurantId_active_idx" ON "Experience"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "ExperienceMenu_menuId_idx" ON "ExperienceMenu"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceMenu_experienceId_menuId_key" ON "ExperienceMenu"("experienceId", "menuId");

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceMenu" ADD CONSTRAINT "ExperienceMenu_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceMenu" ADD CONSTRAINT "ExperienceMenu_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
