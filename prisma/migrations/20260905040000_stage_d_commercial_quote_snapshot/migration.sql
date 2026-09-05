-- Stage D — canonical commercial quote snapshot (doc 107).
-- Additive only. Existing orders keep scalar totals; commercialSnapshot is null
-- until a new order is created through the Stage D quote path.

ALTER TABLE "Order" ADD COLUMN "commercialSnapshot" JSONB;
