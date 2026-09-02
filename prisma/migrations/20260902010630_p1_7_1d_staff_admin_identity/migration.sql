-- CreateEnum
CREATE TYPE "StaffAccountStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "StaffCredentialType" AS ENUM ('PASSWORD');

-- DropForeignKey
ALTER TABLE "StaffMember" DROP CONSTRAINT "StaffMember_merchantId_fkey";

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "status" "StaffAccountStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "merchantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StaffCredential" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staffMemberId" UUID NOT NULL,
    "type" "StaffCredentialType" NOT NULL DEFAULT 'PASSWORD',
    "secretHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staffMemberId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffCredential_staffMemberId_idx" ON "StaffCredential"("staffMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffCredential_staffMemberId_type_key" ON "StaffCredential"("staffMemberId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_refreshTokenHash_key" ON "StaffSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_staffMemberId_idx" ON "StaffSession"("staffMemberId");

-- CreateIndex
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_legacyId_key" ON "StaffMember"("legacyId");

-- CreateIndex
CREATE INDEX "StaffMember_status_idx" ON "StaffMember"("status");

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCredential" ADD CONSTRAINT "StaffCredential_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

