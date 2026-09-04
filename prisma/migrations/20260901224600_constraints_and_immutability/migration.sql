-- P1.5 data-integrity constraints that Prisma cannot express in-schema.
-- Enforces P1.4 rules: non-negative money, order-total integrity, and
-- append-only (immutable) financial ledgers.

-- ---- Non-negative monetary amounts ----
ALTER TABLE "Order"
  ADD CONSTRAINT "order_money_nonneg" CHECK (
    "subtotalMinor" >= 0 AND "taxTotalMinor" >= 0 AND "discountTotalMinor" >= 0
    AND "feeTotalMinor" >= 0 AND "deliveryChargeMinor" >= 0 AND "grandTotalMinor" >= 0
  );

-- ---- Order total integrity (grand = subtotal - discount + tax + fee + delivery) ----
ALTER TABLE "Order"
  ADD CONSTRAINT "order_total_integrity" CHECK (
    "grandTotalMinor" = "subtotalMinor" - "discountTotalMinor" + "taxTotalMinor"
      + "feeTotalMinor" + "deliveryChargeMinor"
  );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "orderitem_money_nonneg" CHECK (
    "unitPriceMinor" >= 0 AND "lineTotalMinor" >= 0 AND "quantity" > 0
  );

ALTER TABLE "ItemVariant"  ADD CONSTRAINT "variant_price_nonneg"  CHECK ("priceMinor" >= 0);
ALTER TABLE "AddOn"        ADD CONSTRAINT "addon_price_nonneg"    CHECK ("priceMinor" >= 0);
ALTER TABLE "PaymentIntent"  ADD CONSTRAINT "pi_amount_nonneg"    CHECK ("amountMinor" >= 0);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "pa_amount_nonneg"    CHECK ("amountMinor" >= 0);
ALTER TABLE "Transaction"    ADD CONSTRAINT "txn_amount_nonneg"   CHECK ("amountMinor" >= 0);
ALTER TABLE "WalletEntry"    ADD CONSTRAINT "we_amount_nonneg"    CHECK ("amountMinor" >= 0);
ALTER TABLE "Refund"         ADD CONSTRAINT "refund_amount_nonneg" CHECK ("amountMinor" >= 0);
ALTER TABLE "Settlement"     ADD CONSTRAINT "settlement_amount_nonneg" CHECK ("amountMinor" >= 0);
ALTER TABLE "Payout"         ADD CONSTRAINT "payout_amount_nonneg" CHECK ("amountMinor" >= 0);
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "wr_amount_nonneg" CHECK ("amountMinor" >= 0);
ALTER TABLE "Wallet"         ADD CONSTRAINT "wallet_balance_nonneg" CHECK ("balanceMinor" >= 0);

-- ---- Append-only immutability for financial ledgers ----
CREATE OR REPLACE FUNCTION "amealio_prevent_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % not allowed on %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transaction_append_only"
  BEFORE UPDATE OR DELETE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION "amealio_prevent_mutation"();

CREATE TRIGGER "wallet_entry_append_only"
  BEFORE UPDATE OR DELETE ON "WalletEntry"
  FOR EACH ROW EXECUTE FUNCTION "amealio_prevent_mutation"();

CREATE TRIGGER "order_status_event_append_only"
  BEFORE UPDATE OR DELETE ON "OrderStatusEvent"
  FOR EACH ROW EXECUTE FUNCTION "amealio_prevent_mutation"();
