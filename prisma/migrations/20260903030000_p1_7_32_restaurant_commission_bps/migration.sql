-- P1.7.32 — Commission configuration (additive only). Adds the authoritative
-- restaurant-scoped commission rate (basis points). Legacy stored this as
-- restaurant.comissionCode -> SubCategory.description (%); the target normalizes it
-- to an explicit integer bps, snapshotted onto each Settlement. No data change.

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "commissionBps" INTEGER;
