-- Backwards-safe: nullable unique key. Multiple NULLs are allowed in PostgreSQL.
ALTER TABLE "Order" ADD COLUMN "checkoutIdempotencyKey" TEXT;
CREATE UNIQUE INDEX "Order_checkoutIdempotencyKey_key" ON "Order"("checkoutIdempotencyKey");
