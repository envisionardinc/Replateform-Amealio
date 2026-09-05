import type { ExperienceMediaFields } from './experience.types';

/**
 * Platform folder detail shape returned by GET /platform-experience-catalogue/:id
 * (subset used by the legacy CloneFolderPopup → Formik mapping).
 */
export interface PlatformFolderDiscoverySource {
  folder: {
    name: string;
    categoryId: string;
    subcategoryId: string;
    description: string;
    userBenefits: string;
    termsAndConditions: string;
    tags: string[];
  };
  media: Array<{
    kind: 'PHOTO' | 'VIDEO';
    url: string;
    isArchived: boolean;
  }>;
}

/**
 * Client-side clone-from-folder mapping (doc 83 / legacy CreateExpericence.onCloneFromFolder).
 *
 * Produces merchant Experience media/content fields only. Does NOT create an
 * Experience, does NOT store sourceFolderId, and does NOT link to the platform folder.
 */
export function mapPlatformFolderToExperienceMedia(
  source: PlatformFolderDiscoverySource,
): ExperienceMediaFields & {
  name: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
} {
  const photos = source.media.filter((m) => m.kind === 'PHOTO' && !m.isArchived).map((m) => m.url);
  const videos = source.media.filter((m) => m.kind === 'VIDEO' && !m.isArchived).map((m) => m.url);

  return {
    name: source.folder.name,
    description: source.folder.description,
    categoryId: source.folder.categoryId,
    subCategoryId: source.folder.subcategoryId,
    userBenefits: source.folder.userBenefits,
    termsAndConditions: source.folder.termsAndConditions,
    tags: [...source.folder.tags],
    photos,
    // Legacy CloneFolderPopup copies photo URLs into photoThumbnails when folder
    // has no separate thumbnail field.
    photoThumbnails: [...photos],
    videos,
    // Platform folders have no promotional_videos field — leave empty.
    promotionalVideos: [],
  };
}
