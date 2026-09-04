import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type PlatformExperienceMediaKind = 'PHOTO' | 'VIDEO';
export type PlatformExperienceFolderStatus = 'active' | 'inactive';

export interface PlatformExperienceFolderRecord {
  id: string;
  legacyId: string | null;
  name: string;
  categoryId: string;
  subcategoryId: string;
  tags: string[];
  description: string;
  userBenefits: string;
  termsAndConditions: string;
  status: PlatformExperienceFolderStatus;
  isAiGenerated: boolean;
  photoCount: number;
  videoCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PlatformExperienceMediaRecord {
  id: string;
  folderId: string;
  kind: PlatformExperienceMediaKind;
  url: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformExperienceFolderListResult {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  data: PlatformExperienceFolderRecord[];
}

type FolderRow = Omit<PlatformExperienceFolderRecord, 'tags'> & { tags: unknown };

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === 'string');
}

function mapFolder(row: FolderRow): PlatformExperienceFolderRecord {
  return { ...row, tags: normalizeTags(row.tags) };
}

@Injectable()
export class PlatformExperienceCatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async categoryExists(categoryId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Category"
      WHERE "id" = ${categoryId}::uuid AND "deletedAt" IS NULL
    `;
    return rows.length > 0;
  }

  async findDuplicateName(input: {
    name: string;
    categoryId: string;
    subcategoryId: string;
    excludeId?: string;
  }): Promise<boolean> {
    if (input.excludeId) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "platform_experience_folders"
        WHERE "name" = ${input.name}
          AND "category_id" = ${input.categoryId}::uuid
          AND "subcategory_id" = ${input.subcategoryId}::uuid
          AND "deleted_at" IS NULL
          AND "id" <> ${input.excludeId}::uuid
        LIMIT 1
      `;
      return rows.length > 0;
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "platform_experience_folders"
      WHERE "name" = ${input.name}
        AND "category_id" = ${input.categoryId}::uuid
        AND "subcategory_id" = ${input.subcategoryId}::uuid
        AND "deleted_at" IS NULL
      LIMIT 1
    `;
    return rows.length > 0;
  }

  async createFolder(input: {
    name: string;
    categoryId: string;
    subcategoryId: string;
    tags?: string[];
    description?: string;
    userBenefits?: string;
    termsAndConditions?: string;
    status?: PlatformExperienceFolderStatus;
    isAiGenerated?: boolean;
    legacyId?: string | null;
    createdBy?: string | null;
  }): Promise<PlatformExperienceFolderRecord> {
    const tagsJson = JSON.stringify(input.tags ?? []);
    const rows = await this.prisma.$queryRaw<FolderRow[]>`
      INSERT INTO "platform_experience_folders"
        ("name", "category_id", "subcategory_id", "tags", "description", "user_benefits",
         "terms_and_conditions", "status", "is_ai_generated", "legacy_id", "created_by", "updated_by")
      VALUES
        (${input.name}, ${input.categoryId}::uuid, ${input.subcategoryId}::uuid,
         ${tagsJson}::jsonb, ${input.description ?? ''}, ${input.userBenefits ?? ''},
         ${input.termsAndConditions ?? ''}, ${input.status ?? 'active'},
         ${input.isAiGenerated ?? false}, ${input.legacyId ?? null},
         ${input.createdBy ?? null}::uuid, ${input.createdBy ?? null}::uuid)
      RETURNING
        "id",
        "legacy_id" AS "legacyId",
        "name",
        "category_id" AS "categoryId",
        "subcategory_id" AS "subcategoryId",
        "tags",
        "description",
        "user_benefits" AS "userBenefits",
        "terms_and_conditions" AS "termsAndConditions",
        "status",
        "is_ai_generated" AS "isAiGenerated",
        0 AS "photoCount",
        0 AS "videoCount",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt",
        "deleted_at" AS "deletedAt"
    `;
    return mapFolder(rows[0]);
  }

  async updateFolder(input: {
    folderId: string;
    name?: string;
    tags?: string[];
    description?: string;
    userBenefits?: string;
    termsAndConditions?: string;
    status?: PlatformExperienceFolderStatus;
    isAiGenerated?: boolean;
    updatedBy?: string | null;
  }): Promise<PlatformExperienceFolderRecord | null> {
    const existing = await this.findFolder(input.folderId);
    if (!existing || existing.deletedAt !== null) return null;

    const name = input.name !== undefined ? input.name : existing.name;
    const tags = input.tags !== undefined ? input.tags : existing.tags;
    const description = input.description !== undefined ? input.description : existing.description;
    const userBenefits =
      input.userBenefits !== undefined ? input.userBenefits : existing.userBenefits;
    const termsAndConditions =
      input.termsAndConditions !== undefined
        ? input.termsAndConditions
        : existing.termsAndConditions;
    const status = input.status !== undefined ? input.status : existing.status;
    const isAiGenerated =
      input.isAiGenerated !== undefined ? input.isAiGenerated : existing.isAiGenerated;
    const tagsJson = JSON.stringify(tags);

    await this.prisma.$queryRaw`
      UPDATE "platform_experience_folders"
      SET
        "name" = ${name},
        "tags" = ${tagsJson}::jsonb,
        "description" = ${description},
        "user_benefits" = ${userBenefits},
        "terms_and_conditions" = ${termsAndConditions},
        "status" = ${status},
        "is_ai_generated" = ${isAiGenerated},
        "updated_by" = ${input.updatedBy ?? null}::uuid,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.folderId}::uuid
        AND "deleted_at" IS NULL
    `;

    return this.findFolder(input.folderId);
  }

  async findFolder(folderId: string): Promise<PlatformExperienceFolderRecord | null> {
    const rows = await this.prisma.$queryRaw<FolderRow[]>`
      SELECT
        f."id",
        f."legacy_id" AS "legacyId",
        f."name",
        f."category_id" AS "categoryId",
        f."subcategory_id" AS "subcategoryId",
        f."tags",
        f."description",
        f."user_benefits" AS "userBenefits",
        f."terms_and_conditions" AS "termsAndConditions",
        f."status",
        f."is_ai_generated" AS "isAiGenerated",
        (
          SELECT COUNT(*)::int FROM "platform_experience_folder_media" m
          WHERE m."folder_id" = f."id" AND m."kind" = 'PHOTO' AND m."is_archived" = false
        ) AS "photoCount",
        (
          SELECT COUNT(*)::int FROM "platform_experience_folder_media" m
          WHERE m."folder_id" = f."id" AND m."kind" = 'VIDEO' AND m."is_archived" = false
        ) AS "videoCount",
        f."created_at" AS "createdAt",
        f."updated_at" AS "updatedAt",
        f."deleted_at" AS "deletedAt"
      FROM "platform_experience_folders" f
      WHERE f."id" = ${folderId}::uuid
    `;
    return rows[0] ? mapFolder(rows[0]) : null;
  }

  async listFolders(input: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    categoryId?: string;
    subcategoryId?: string;
  }): Promise<PlatformExperienceFolderListResult> {
    const page = input.page > 0 ? input.page : 1;
    const limit = input.limit > 0 ? input.limit : 10;
    const skip = (page - 1) * limit;
    const search = input.search?.trim() ?? '';
    const status = input.status ?? null;
    const categoryId = input.categoryId ?? null;
    const subcategoryId = input.subcategoryId ?? null;

    const rows = await this.prisma.$queryRaw<Array<FolderRow & { totalCount: number }>>`
      WITH filtered AS (
        SELECT f.*
        FROM "platform_experience_folders" f
        WHERE f."deleted_at" IS NULL
          AND (${search === ''} OR f."name" ILIKE ${'%' + search + '%'})
          AND (${status === null} OR f."status" = ${status ?? ''})
          AND (${categoryId === null} OR f."category_id" = ${categoryId}::uuid)
          AND (${subcategoryId === null} OR f."subcategory_id" = ${subcategoryId}::uuid)
      ),
      counted AS (
        SELECT COUNT(*)::int AS "totalCount" FROM filtered
      )
      SELECT
        f."id",
        f."legacy_id" AS "legacyId",
        f."name",
        f."category_id" AS "categoryId",
        f."subcategory_id" AS "subcategoryId",
        f."tags",
        f."description",
        f."user_benefits" AS "userBenefits",
        f."terms_and_conditions" AS "termsAndConditions",
        f."status",
        f."is_ai_generated" AS "isAiGenerated",
        (
          SELECT COUNT(*)::int FROM "platform_experience_folder_media" m
          WHERE m."folder_id" = f."id" AND m."kind" = 'PHOTO' AND m."is_archived" = false
        ) AS "photoCount",
        (
          SELECT COUNT(*)::int FROM "platform_experience_folder_media" m
          WHERE m."folder_id" = f."id" AND m."kind" = 'VIDEO' AND m."is_archived" = false
        ) AS "videoCount",
        f."created_at" AS "createdAt",
        f."updated_at" AS "updatedAt",
        f."deleted_at" AS "deletedAt",
        c."totalCount"
      FROM filtered f
      CROSS JOIN counted c
      ORDER BY f."updated_at" DESC
      OFFSET ${skip}
      LIMIT ${limit}
    `;

    const totalCount = rows[0]?.totalCount ?? 0;
    const data = rows.map(({ totalCount: _t, ...rest }) => mapFolder(rest));
    return {
      page,
      limit,
      totalCount,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / limit),
      data,
    };
  }

  async listMedia(
    folderId: string,
    options?: { includeArchived?: boolean },
  ): Promise<PlatformExperienceMediaRecord[]> {
    if (options?.includeArchived) {
      return this.prisma.$queryRaw<PlatformExperienceMediaRecord[]>`
        SELECT
          "id",
          "folder_id" AS "folderId",
          "kind",
          "url",
          "is_archived" AS "isArchived",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt"
        FROM "platform_experience_folder_media"
        WHERE "folder_id" = ${folderId}::uuid
        ORDER BY "created_at" ASC
      `;
    }
    return this.prisma.$queryRaw<PlatformExperienceMediaRecord[]>`
      SELECT
        "id",
        "folder_id" AS "folderId",
        "kind",
        "url",
        "is_archived" AS "isArchived",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "platform_experience_folder_media"
      WHERE "folder_id" = ${folderId}::uuid
        AND "is_archived" = false
      ORDER BY "created_at" ASC
    `;
  }

  async appendMedia(input: {
    folderId: string;
    kind: PlatformExperienceMediaKind;
    urls: string[];
  }): Promise<PlatformExperienceMediaRecord[]> {
    if (input.urls.length === 0) return [];

    const created: PlatformExperienceMediaRecord[] = [];
    for (const url of input.urls) {
      const rows = await this.prisma.$queryRaw<PlatformExperienceMediaRecord[]>`
        INSERT INTO "platform_experience_folder_media"
          ("folder_id", "kind", "url", "is_archived")
        VALUES
          (${input.folderId}::uuid, ${input.kind}, ${url}, false)
        RETURNING
          "id",
          "folder_id" AS "folderId",
          "kind",
          "url",
          "is_archived" AS "isArchived",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt"
      `;
      created.push(rows[0]);
    }

    await this.touchFolder(input.folderId);
    return created;
  }

  async archiveMedia(input: {
    folderId: string;
    mediaId: string;
    kind?: PlatformExperienceMediaKind;
  }): Promise<PlatformExperienceMediaRecord | null> {
    if (input.kind) {
      const rows = await this.prisma.$queryRaw<PlatformExperienceMediaRecord[]>`
        UPDATE "platform_experience_folder_media"
        SET "is_archived" = true, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.mediaId}::uuid
          AND "folder_id" = ${input.folderId}::uuid
          AND "kind" = ${input.kind}
        RETURNING
          "id",
          "folder_id" AS "folderId",
          "kind",
          "url",
          "is_archived" AS "isArchived",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt"
      `;
      if (rows[0]) await this.touchFolder(input.folderId);
      return rows[0] ?? null;
    }

    const rows = await this.prisma.$queryRaw<PlatformExperienceMediaRecord[]>`
      UPDATE "platform_experience_folder_media"
      SET "is_archived" = true, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.mediaId}::uuid
        AND "folder_id" = ${input.folderId}::uuid
      RETURNING
        "id",
        "folder_id" AS "folderId",
        "kind",
        "url",
        "is_archived" AS "isArchived",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `;
    if (rows[0]) await this.touchFolder(input.folderId);
    return rows[0] ?? null;
  }

  private async touchFolder(folderId: string): Promise<void> {
    await this.prisma.$queryRaw`
      UPDATE "platform_experience_folders"
      SET "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${folderId}::uuid
    `;
  }
}
