-- P1.7.30 — Live Razorpay refund integration (additive only). Adds the provider
-- refund id to Refund so a provider refund maps to exactly one internal Refund and
-- the async refund.processed/failed webhook can be keyed on it. No data change.

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "providerRefundId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");
