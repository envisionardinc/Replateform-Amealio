-- P1.7.34 — Commission-basis reconciliation (additive only). Persist the
-- commissionable basis on Settlement for auditability: commission is charged on the
-- order subtotal minus vendor-funded discount (VERIFIED legacy basis), NOT on the
-- tax/delivery-inclusive captured amount. No data change.

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "commissionBasisMinor" BIGINT NOT NULL DEFAULT 0;
