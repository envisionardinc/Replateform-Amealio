-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT,
ADD COLUMN     "hexColor" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "iconCode" TEXT,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "Cuisine" ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_legacyId_key" ON "Category"("legacyId");

-- CreateIndex
CREATE INDEX "Category_type_idx" ON "Category"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Cuisine_legacyId_key" ON "Cuisine"("legacyId");

