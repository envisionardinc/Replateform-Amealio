-- P1.7.38 — Tip Collection/Capture Foundation (additive only).
-- Adds a SEPARATE, isolated collected-tip payment component (TipPayment) plus the
-- merchant-configurable TipBeneficiaryPolicy enum (snapshotted per tip). Tip money
-- is deliberately kept OUT of Order.grandTotalMinor, the order PaymentIntent, the
-- commission basis, and merchant settlement. No existing table/column/constraint
-- changes; no data change. Rollback: DROP TABLE "TipPayment"; DROP TYPE
-- "TipBeneficiaryPolicy" (no data dependency).

-- CreateEnum
CREATE TYPE "TipBeneficiaryPolicy" AS ENUM ('MERCHANT', 'DELIVERY_PERSON', 'SHARED_POOLED');

-- CreateTable
CREATE TABLE "TipPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "basisMinor" BIGINT NOT NULL,
    "percentBps" INTEGER,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "amountMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "capturedAt" TIMESTAMP(3),
    "refundedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "refundStatus" "RefundStatus",
    "providerRefundId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "beneficiaryPolicy" "TipBeneficiaryPolicy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipPayment_razorpayOrderId_key" ON "TipPayment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "TipPayment_razorpayPaymentId_key" ON "TipPayment"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TipPayment_providerRefundId_key" ON "TipPayment"("providerRefundId");

-- CreateIndex
CREATE INDEX "TipPayment_orderId_idx" ON "TipPayment"("orderId");

-- CreateIndex
CREATE INDEX "TipPayment_merchantId_idx" ON "TipPayment"("merchantId");

-- CreateIndex
CREATE INDEX "TipPayment_status_idx" ON "TipPayment"("status");

-- Enforce AT MOST ONE captured tip per order (idempotent collection guarantee).
-- Partial unique index: a second CAPTURED tip for the same order is rejected at
-- the database level, even under concurrency.
CREATE UNIQUE INDEX "tip_one_captured_per_order" ON "TipPayment"("orderId") WHERE "status" = 'CAPTURED';

-- AddForeignKey
ALTER TABLE "TipPayment" ADD CONSTRAINT "TipPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipPayment" ADD CONSTRAINT "TipPayment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
