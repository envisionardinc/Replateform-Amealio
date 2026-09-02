-- CreateTable
CREATE TABLE "Currency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legacyId" TEXT,
    "isoCode" TEXT NOT NULL,
    "symbol" TEXT,
    "name" TEXT,
    "countryName" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Currency_legacyId_key" ON "Currency"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_isoCode_key" ON "Currency"("isoCode");

