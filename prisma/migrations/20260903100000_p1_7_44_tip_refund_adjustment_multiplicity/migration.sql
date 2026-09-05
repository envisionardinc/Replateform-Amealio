-- P1.7.44 corrective migration.
-- A TipPayment supports partial refunds across multiple provider refund events.
-- SettlementAdjustment therefore remains one-row-per-idempotency-event for tips;
-- cumulative source validation is performed while the TipPayment row is locked.
-- Order Refunds remain one-adjustment-per-Refund via refundId uniqueness.

DROP INDEX IF EXISTS "SettlementAdjustment_tipPaymentId_key";
