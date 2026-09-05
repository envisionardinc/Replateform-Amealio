import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import {
  PlatformExperienceCatalogueRepository,
  PlatformExperienceFolderListResult,
  PlatformExperienceFolderRecord,
  PlatformExperienceFolderStatus,
  PlatformExperienceMediaKind,
  PlatformExperienceMediaRecord,
} from './platform-experience-catalogue.repository';

/**
 * Platform Experience Media Folder catalogue.
 *
 * Legacy: experience_catalog / /experience-media (doc 83).
 * Distinct from merchant Experience (`apps/api/src/modules/experience/`).
 *
 * No lineage, sync, materialization, restaurants[] write path, or AI generation
 * in this slice — discovery only for merchants; client-side form clone remains
 * the verified reuse path.
 */
@Injectable()
export class PlatformExperienceCatalogueService {
  constructor(private readonly repo: PlatformExperienceCatalogueRepository) {}

  async createFolder(
    principal: StaffPrincipal,
    input: {
      name: string;
      categoryId: string;
      subcategoryId: string;
      tags?: string[];
      description?: string;
      userBenefits?: string;
      termsAndConditions?: string;
      status?: string;
      isAiGenerated?: boolean;
      legacyId?: string | null;
    },
  ): Promise<PlatformExperienceFolderRecord> {
    this.assertSuperAdmin(principal);
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    assertUuid(input.categoryId, 'categoryId');
    assertUuid(input.subcategoryId, 'subcategoryId');
    if (!(await this.repo.categoryExists(input.categoryId))) {
      throw new BadRequestException('categoryId is invalid');
    }
    if (!(await this.repo.categoryExists(input.subcategoryId))) {
      throw new BadRequestException('subcategoryId is invalid');
    }
    const status = normalizeStatus(input.status);
    const name = input.name.trim();
    if (
      await this.repo.findDuplicateName({
        name,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
      })
    ) {
      throw new ConflictException(
        'An experience media folder with the same name already exists under this category and subcategory',
      );
    }

    return this.repo.createFolder({
      name,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      tags: normalizeTags(input.tags),
      description: input.description?.trim() ?? '',
      userBenefits: input.userBenefits?.trim() ?? '',
      termsAndConditions: input.termsAndConditions?.trim() ?? '',
      status,
      isAiGenerated: input.isAiGenerated === true,
      legacyId: input.legacyId ?? null,
      createdBy: principal.staffMemberId,
    });
  }

  async updateFolder(
    principal: StaffPrincipal,
    folderId: string,
    input: {
      name?: string;
      tags?: string[];
      description?: string;
      userBenefits?: string;
      termsAndConditions?: string;
      status?: string;
      isAiGenerated?: boolean;
    },
  ): Promise<PlatformExperienceFolderRecord> {
    this.assertSuperAdmin(principal);
    assertUuid(folderId, 'folderId');

    const existing = await this.repo.findFolder(folderId);
    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Experience media folder not found');
    }

    // Category/subcategory are immutable after create (legacy patch rule).
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name is required when provided');
    }
    const status = input.status === undefined ? undefined : normalizeStatus(input.status);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (
        await this.repo.findDuplicateName({
          name,
          categoryId: existing.categoryId,
          subcategoryId: existing.subcategoryId,
          excludeId: folderId,
        })
      ) {
        throw new ConflictException(
          'An experience media folder with the same name already exists under this category and subcategory',
        );
      }
    }

    const updated = await this.repo.updateFolder({
      folderId,
      name: input.name === undefined ? undefined : input.name.trim(),
      tags: input.tags === undefined ? undefined : normalizeTags(input.tags),
      description: input.description === undefined ? undefined : input.description.trim(),
      userBenefits: input.userBenefits === undefined ? undefined : input.userBenefits.trim(),
      termsAndConditions:
        input.termsAndConditions === undefined ? undefined : input.termsAndConditions.trim(),
      status,
      isAiGenerated: input.isAiGenerated,
      updatedBy: principal.staffMemberId,
    });
    if (!updated) throw new NotFoundException('Experience media folder not found');
    return updated;
  }

  async listFolders(
    principal: StaffPrincipal,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      categoryId?: string;
      subcategoryId?: string;
    },
  ): Promise<PlatformExperienceFolderListResult> {
    this.assertDiscoveryAccess(principal);
    if (query.categoryId) assertUuid(query.categoryId, 'categoryId');
    if (query.subcategoryId) assertUuid(query.subcategoryId, 'subcategoryId');
    if (query.status) normalizeStatus(query.status);
    return this.repo.listFolders({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search,
      status: query.status,
      categoryId: query.categoryId,
      subcategoryId: query.subcategoryId,
    });
  }

  async getFolder(
    principal: StaffPrincipal,
    folderId: string,
  ): Promise<{
    folder: PlatformExperienceFolderRecord;
    media: PlatformExperienceMediaRecord[];
  }> {
    this.assertDiscoveryAccess(principal);
    assertUuid(folderId, 'folderId');
    const folder = await this.repo.findFolder(folderId);
    if (!folder || folder.deletedAt !== null) {
      throw new NotFoundException('Experience media folder not found');
    }
    const media = await this.repo.listMedia(folderId, { includeArchived: true });
    return { folder, media };
  }

  async listMedia(
    principal: StaffPrincipal,
    folderId: string,
    includeArchived = false,
  ): Promise<PlatformExperienceMediaRecord[]> {
    this.assertDiscoveryAccess(principal);
    assertUuid(folderId, 'folderId');
    const folder = await this.repo.findFolder(folderId);
    if (!folder || folder.deletedAt !== null) {
      throw new NotFoundException('Experience media folder not found');
    }
    return this.repo.listMedia(folderId, { includeArchived });
  }

  /**
   * Append media URLs (legacy PUT /experience-media). Does not replace or
   * delete existing media.
   */
  async appendMedia(
    principal: StaffPrincipal,
    folderId: string,
    input: { photos?: string[]; videos?: string[] },
  ): Promise<{
    folder: PlatformExperienceFolderRecord;
    media: PlatformExperienceMediaRecord[];
    appended: PlatformExperienceMediaRecord[];
  }> {
    this.assertSuperAdmin(principal);
    assertUuid(folderId, 'folderId');
    const folder = await this.repo.findFolder(folderId);
    if (!folder || folder.deletedAt !== null) {
      throw new NotFoundException('Experience media folder not found');
    }

    const photos = normalizeUrlList(input.photos, 'photos');
    const videos = normalizeUrlList(input.videos, 'videos');
    if (photos.length === 0 && videos.length === 0) {
      throw new BadRequestException('photos or videos array with at least one URL is required');
    }

    const appended: PlatformExperienceMediaRecord[] = [];
    if (photos.length) {
      appended.push(...(await this.repo.appendMedia({ folderId, kind: 'PHOTO', urls: photos })));
    }
    if (videos.length) {
      appended.push(...(await this.repo.appendMedia({ folderId, kind: 'VIDEO', urls: videos })));
    }

    const updated = await this.repo.findFolder(folderId);
    if (!updated) throw new NotFoundException('Experience media folder not found');
    const media = await this.repo.listMedia(folderId, { includeArchived: true });
    return { folder: updated, media, appended };
  }

  /**
   * Soft-archive one media item (legacy DELETE /experience-media/:id/media).
   * No hard delete in this slice.
   */
  async archiveMedia(
    principal: StaffPrincipal,
    folderId: string,
    input: { mediaId: string; type?: string },
  ): Promise<PlatformExperienceMediaRecord> {
    this.assertSuperAdmin(principal);
    assertUuid(folderId, 'folderId');
    if (!nonEmpty(input.mediaId)) throw new BadRequestException('mediaId is required');
    assertUuid(input.mediaId, 'mediaId');

    const folder = await this.repo.findFolder(folderId);
    if (!folder || folder.deletedAt !== null) {
      throw new NotFoundException('Experience media folder not found');
    }

    const kind = input.type === undefined ? undefined : normalizeMediaType(input.type);
    const archived = await this.repo.archiveMedia({
      folderId,
      mediaId: input.mediaId,
      kind,
    });
    if (!archived) throw new NotFoundException('Media item not found');
    return archived;
  }

  private assertSuperAdmin(principal: StaffPrincipal): void {
    if (principal.staffRole !== 'SUPER_ADMIN' || principal.merchantId !== null) {
      throw new ForbiddenException(
        'platform experience catalogue administration requires SUPER_ADMIN scope',
      );
    }
  }

  private assertDiscoveryAccess(principal: StaffPrincipal): void {
    if (principal.staffRole === 'SUPER_ADMIN' && principal.merchantId === null) return;
    if (
      (principal.staffRole === 'MERCHANT_OWNER' || principal.staffRole === 'MERCHANT_STAFF') &&
      principal.merchantId
    ) {
      return;
    }
    throw new ForbiddenException(
      'platform experience catalogue discovery requires staff authentication',
    );
  }
}

function nonEmpty(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  if (!Array.isArray(tags)) throw new BadRequestException('tags must be an array of strings');
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function normalizeStatus(status?: string): PlatformExperienceFolderStatus {
  const value = (status ?? 'active').trim().toLowerCase();
  if (value !== 'active' && value !== 'inactive') {
    throw new BadRequestException('status must be active or inactive');
  }
  return value;
}

function normalizeMediaType(type: string): PlatformExperienceMediaKind {
  const value = type.trim().toLowerCase();
  if (value === 'photo') return 'PHOTO';
  if (value === 'video') return 'VIDEO';
  throw new BadRequestException("type must be 'photo' or 'video'");
}

function normalizeUrlList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array of URL strings`);
  }
  const urls = value
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  if (urls.length !== value.length) {
    throw new BadRequestException(`${field} must contain only non-empty URL strings`);
  }
  return urls;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID`);
  }
}
