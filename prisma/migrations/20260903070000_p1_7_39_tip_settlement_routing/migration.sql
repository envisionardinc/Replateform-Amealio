-- P1.7.39 — Config-Driven Tip Beneficiary Routing (additive only).
-- Adds a nullable, UNIQUE `SettlementItem.tipPaymentId` (+ FK to TipPayment) so a
-- collected MERCHANT tip can be routed to a dedicated ORDER_TIP settlement via the
-- EXISTING Settlement/SettlementItem/Payout architecture. The unique constraint is
-- the DB-enforced "route a tip once" idempotency boundary. No existing column,
-- constraint, or data changes; order-settlement items continue to use
-- `paymentIntentId` (tip items use `tipPaymentId`, with the other null).
-- Rollback: drop the FK + unique index + column (no data dependency).

-- AlterTable
ALTER TABLE "SettlementItem" ADD COLUMN "tipPaymentId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "SettlementItem_tipPaymentId_key" ON "SettlementItem"("tipPaymentId");

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_tipPaymentId_fkey" FOREIGN KEY ("tipPaymentId") REFERENCES "TipPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
