-- P1.7.36 — Tip & donation Order-model foundation (additive only).
-- Adds two canonical customer-funded amounts to Order: tipMinor (legacy ORDER_TIP,
-- separately disbursable) and donationMinor (charity pass-through, legacy
-- UDBHAV_ACCOUNT). Both are integer minor units, NOT NULL DEFAULT 0.
--
-- These columns are held OUTSIDE the existing order_total_integrity CHECK
-- (grandTotalMinor = subtotalMinor - discountTotalMinor + taxTotalMinor
--  + feeTotalMinor + deliveryChargeMinor) and OUTSIDE the commissionable basis
-- (subtotal - vendor discount). No existing column, total, or constraint changes;
-- existing rows receive 0. Backfill/rollback: additive-only, safe to drop columns
-- to reverse (no data dependency). No settlement/payout/GST behavior change.

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN     "tipMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN     "donationMinor" BIGINT NOT NULL DEFAULT 0;
