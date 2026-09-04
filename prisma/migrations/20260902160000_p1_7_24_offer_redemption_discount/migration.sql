-- P1.7.24 — Offer redemption & server-side discount at order creation.
-- Additive only: extends CouponRedemption into a status-bearing ledger, links an
-- applied Offer/Coupon onto Order, and enforces one redemption per (coupon, order)
-- for idempotency. No historical migrations are modified; no data is destroyed.

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterTable
ALTER TABLE "CouponRedemption" ADD COLUMN     "discountAppliedMinor" BIGINT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "status" "RedemptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponId" UUID,
ADD COLUMN     "offerId" UUID;

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_orderId_key" ON "CouponRedemption"("couponId", "orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
