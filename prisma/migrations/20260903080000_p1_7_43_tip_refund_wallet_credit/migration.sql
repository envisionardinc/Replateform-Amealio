-- P1.7.43 — Tip Pre-Settlement Refund Money-Return (additive only).
-- Adds a nullable Transaction.tipPaymentId (+ FK to TipPayment) so a tip refund's
-- wallet-credit REFUND transaction is linked to the tip and distinguishable from
-- order-payment transactions in the ledger. No existing column/constraint/data
-- change. Rollback: drop the FK + index + column (no data dependency).

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "tipPaymentId" UUID;

-- CreateIndex
CREATE INDEX "Transaction_tipPaymentId_idx" ON "Transaction"("tipPaymentId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tipPaymentId_fkey" FOREIGN KEY ("tipPaymentId") REFERENCES "TipPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
