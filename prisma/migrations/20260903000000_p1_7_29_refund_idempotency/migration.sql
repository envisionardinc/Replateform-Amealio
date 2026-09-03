-- P1.7.29 — Refund idempotency (additive only). Adds a DB-enforced unique
-- idempotency key to Refund so refund processing cannot create duplicate
-- financial effects (legacy had no idempotency; doc 56 §16/§25). No data change.

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_paymentIntentId_idx" ON "Refund"("paymentIntentId");
