-- P1.7.44 — Canonical Settlement Adjustment Foundation.
-- Append-only, auditable debit/credit ledger attached to a historical Settlement.
-- Initial supported business types: ORDER_REFUND and TIP_REFUND.
-- This migration intentionally does NOT implement gateway charges, GST,
-- donations, delivery allocation, ADMIN reimbursement, or generic misc adjustments.

CREATE TYPE "SettlementAdjustmentType" AS ENUM ('ORDER_REFUND', 'TIP_REFUND');
CREATE TYPE "SettlementAdjustmentDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "SettlementAdjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "settlementId" UUID NOT NULL,
  "merchantId" UUID NOT NULL,
  "orderId" UUID,
  "paymentIntentId" UUID,
  "tipPaymentId" UUID,
  "refundId" UUID,
  "type" "SettlementAdjustmentType" NOT NULL,
  "direction" "SettlementAdjustmentDirection" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'INR',
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SettlementAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_adjustment_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "settlement_adjustment_currency_nonempty" CHECK (length(trim("currencyCode")) > 0),
  CONSTRAINT "settlement_adjustment_idempotency_nonempty" CHECK (length(trim("idempotencyKey")) > 0),
  CONSTRAINT "settlement_adjustment_source_consistency" CHECK (
    ("type" = 'ORDER_REFUND' AND "direction" = 'DEBIT'
      AND "orderId" IS NOT NULL AND "paymentIntentId" IS NOT NULL
      AND "refundId" IS NOT NULL AND "tipPaymentId" IS NULL)
    OR
    ("type" = 'TIP_REFUND' AND "direction" = 'DEBIT'
      AND "tipPaymentId" IS NOT NULL AND "orderId" IS NULL
      AND "paymentIntentId" IS NULL AND "refundId" IS NULL)
  ),
  CONSTRAINT "SettlementAdjustment_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SettlementAdjustment_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SettlementAdjustment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SettlementAdjustment_paymentIntentId_fkey"
    FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SettlementAdjustment_tipPaymentId_fkey"
    FOREIGN KEY ("tipPaymentId") REFERENCES "TipPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SettlementAdjustment_refundId_fkey"
    FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SettlementAdjustment_idempotencyKey_key"
  ON "SettlementAdjustment"("idempotencyKey");
CREATE UNIQUE INDEX "SettlementAdjustment_refundId_key"
  ON "SettlementAdjustment"("refundId");
CREATE UNIQUE INDEX "SettlementAdjustment_tipPaymentId_key"
  ON "SettlementAdjustment"("tipPaymentId");
CREATE INDEX "SettlementAdjustment_settlementId_createdAt_idx"
  ON "SettlementAdjustment"("settlementId", "createdAt");
CREATE INDEX "SettlementAdjustment_merchantId_createdAt_idx"
  ON "SettlementAdjustment"("merchantId", "createdAt");
CREATE INDEX "SettlementAdjustment_orderId_idx"
  ON "SettlementAdjustment"("orderId");
CREATE INDEX "SettlementAdjustment_paymentIntentId_idx"
  ON "SettlementAdjustment"("paymentIntentId");
CREATE INDEX "SettlementAdjustment_tipPaymentId_idx"
  ON "SettlementAdjustment"("tipPaymentId");
CREATE INDEX "SettlementAdjustment_refundId_idx"
  ON "SettlementAdjustment"("refundId");

-- SettlementAdjustment is a financial ledger: append-only at the database boundary.
CREATE TRIGGER "settlement_adjustment_append_only"
  BEFORE UPDATE OR DELETE ON "SettlementAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "amealio_prevent_mutation"();
