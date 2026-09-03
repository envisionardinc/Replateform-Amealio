-- P1.7.31 — Settlement & payout foundation (additive only).
-- Settlement: gross/commission audit fields. SettlementItem: link + unique the
-- captured payment it settles (settle-a-payment-once idempotency). Payout: request
-- idempotency key. No data change.

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "grossAmountMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "commissionMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "commissionBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SettlementItem" ADD COLUMN     "paymentIntentId" UUID;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SettlementItem_paymentIntentId_key" ON "SettlementItem"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
