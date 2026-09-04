-- P1.7.22 — Merchant offer & coupon configuration foundation.
-- Additive only: new source-backed configuration columns on Offer (discount cap,
-- order-amount gates, usage-limit config, validity/active, description/terms,
-- legacyId). No existing column altered/dropped; Coupon/CouponRedemption unchanged;
-- historical migrations untouched.

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "maxDiscountMinor" BIGINT,
ADD COLUMN     "maxOrderMinor" BIGINT,
ADD COLUMN     "maxUsageLimit" INTEGER,
ADD COLUMN     "minOrderMinor" BIGINT,
ADD COLUMN     "perUserLimit" INTEGER,
ADD COLUMN     "termsAndConditions" TEXT,
ADD COLUMN     "useFrequency" TEXT,
ADD COLUMN     "useLimit" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Offer_legacyId_key" ON "Offer"("legacyId");
