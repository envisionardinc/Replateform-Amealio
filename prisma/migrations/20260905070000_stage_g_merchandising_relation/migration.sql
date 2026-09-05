-- Stage G — merchant-owned item-to-item CROSS_SELL (doc 110).
-- Additive. Does not alter pricing, promotions, combos, or variants.

CREATE TYPE "MerchandisingRelationType" AS ENUM ('CROSS_SELL');
CREATE TYPE "MerchandisingRelationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "MerchandisingRelation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchantId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "type" "MerchandisingRelationType" NOT NULL DEFAULT 'CROSS_SELL',
    "sourceItemId" UUID NOT NULL,
    "targetItemId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MerchandisingRelationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandisingRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchandisingRelation_sourceItemId_targetItemId_type_key"
  ON "MerchandisingRelation"("sourceItemId", "targetItemId", "type");

CREATE INDEX "MerchandisingRelation_restaurantId_type_status_idx"
  ON "MerchandisingRelation"("restaurantId", "type", "status");

CREATE INDEX "MerchandisingRelation_sourceItemId_type_status_sortOrder_idx"
  ON "MerchandisingRelation"("sourceItemId", "type", "status", "sortOrder");

CREATE INDEX "MerchandisingRelation_merchantId_idx"
  ON "MerchandisingRelation"("merchantId");

CREATE INDEX "MerchandisingRelation_targetItemId_idx"
  ON "MerchandisingRelation"("targetItemId");

ALTER TABLE "MerchandisingRelation"
  ADD CONSTRAINT "MerchandisingRelation_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MerchandisingRelation"
  ADD CONSTRAINT "MerchandisingRelation_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchandisingRelation"
  ADD CONSTRAINT "MerchandisingRelation_sourceItemId_fkey"
  FOREIGN KEY ("sourceItemId") REFERENCES "MenuItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchandisingRelation"
  ADD CONSTRAINT "MerchandisingRelation_targetItemId_fkey"
  FOREIGN KEY ("targetItemId") REFERENCES "MenuItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
