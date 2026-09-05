-- Platform Experience Media Folder catalogue.
-- Forensic basis: docs/migration/domains/83-GLOBAL-EXPERIENCE-CATALOGUE-FORENSIC-CONTRACT.md
-- Legacy: experience_catalog / /experience-media (NOT merchant Experience).
-- restaurants[] usage write-path deferred (unproven). No lineage/sync tables.

CREATE TABLE "platform_experience_folders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "legacy_id" TEXT,
  "name" TEXT NOT NULL,
  "category_id" UUID NOT NULL,
  "subcategory_id" UUID NOT NULL,
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "description" TEXT NOT NULL DEFAULT '',
  "user_benefits" TEXT NOT NULL DEFAULT '',
  "terms_and_conditions" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "platform_experience_folders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_experience_folders_legacy_id_key" UNIQUE ("legacy_id"),
  CONSTRAINT "platform_experience_folders_status_check"
    CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "platform_experience_folders_category_fk"
    FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_experience_folders_subcategory_fk"
    FOREIGN KEY ("subcategory_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "platform_experience_folders_category_idx"
  ON "platform_experience_folders"("category_id");
CREATE INDEX "platform_experience_folders_subcategory_idx"
  ON "platform_experience_folders"("subcategory_id");
CREATE INDEX "platform_experience_folders_status_idx"
  ON "platform_experience_folders"("status");
CREATE INDEX "platform_experience_folders_name_idx"
  ON "platform_experience_folders"("name");

-- Duplicate folder name under same category+subcategory (active rows only).
CREATE UNIQUE INDEX "platform_experience_folders_name_tax_uq"
  ON "platform_experience_folders"("name", "category_id", "subcategory_id")
  WHERE "deleted_at" IS NULL;

CREATE TABLE "platform_experience_folder_media" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "folder_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_experience_folder_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_experience_folder_media_kind_check"
    CHECK ("kind" IN ('PHOTO', 'VIDEO')),
  CONSTRAINT "platform_experience_folder_media_folder_fk"
    FOREIGN KEY ("folder_id") REFERENCES "platform_experience_folders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_experience_folder_media_folder_idx"
  ON "platform_experience_folder_media"("folder_id");
CREATE INDEX "platform_experience_folder_media_folder_kind_idx"
  ON "platform_experience_folder_media"("folder_id", "kind");
