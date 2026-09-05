-- Historical checkout destination. Nullable so existing rows stay valid.
-- deliveryAddressId remains lineage-only; this JSON is the order SoT.
ALTER TABLE "Order" ADD COLUMN "deliveryAddressSnapshot" JSONB;
