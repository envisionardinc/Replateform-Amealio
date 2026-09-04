-- Merchant Experience media/content fields for legacy create + CloneFolder form flow.
-- Forensic: Experience.photos/photoThumbnails/videos/promotional_videos (string URL arrays),
-- userBenefits, tc → termsAndConditions, tags.
-- Additive only. No lineage/sourceFolderId. No binary media tables.

ALTER TABLE "Experience"
  ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "photoThumbnails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "videos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "promotionalVideos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "userBenefits" TEXT,
  ADD COLUMN "termsAndConditions" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
