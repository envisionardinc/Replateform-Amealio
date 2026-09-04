-- Backwards-safe optional self-delivery assignment (doc 91).
ALTER TABLE "Order" ADD COLUMN "deliveryPersonId" UUID;
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryPersonId_fkey" FOREIGN KEY ("deliveryPersonId") REFERENCES "DeliveryPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_deliveryPersonId_status_idx" ON "Order"("deliveryPersonId", "status");
