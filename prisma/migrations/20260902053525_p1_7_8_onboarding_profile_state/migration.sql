-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "onboardingSubmitted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "softOnboarding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "completionPercentage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false;

