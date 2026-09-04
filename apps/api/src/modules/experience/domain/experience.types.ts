/**
 * Experience configuration domain types (P1.7.20 + media reconciliation).
 * Merchant-owned bookable experience CONFIGURATION. Money is exact integer
 * minor units (`bigint`). Media is URL-string arrays matching legacy Experience
 * (photos/photoThumbnails/videos/promotional_videos). Booking/payment/refund,
 * Diner/Order, scheduling engine, packages, events, and platform-folder lineage
 * remain out of scope.
 */

export type ExperienceTypeName = 'FOOD' | 'EVENT';
export type ExperienceKindName = 'SPECIAL' | 'CURATED';
export type ExperienceFoodModeName = 'NONE' | 'INCLUDED' | 'SEPARATE' | 'OCCASION_TEXT';
export type ExperienceMenuModeName = 'NONE' | 'STANDARD' | 'CUSTOM' | 'PACKAGE';

export interface ExperienceMenuLinkInput {
  menuId: string;
  isDefault?: boolean;
}

/** Media/content fields shared by create + update (legacy Experience URL arrays). */
export interface ExperienceMediaFields {
  photos?: string[];
  photoThumbnails?: string[];
  videos?: string[];
  promotionalVideos?: string[];
  userBenefits?: string | null;
  termsAndConditions?: string | null;
  tags?: string[];
}

export interface CreateExperienceInput extends ExperienceMediaFields {
  restaurantId: string;
  name: string;
  description?: string | null;
  type?: ExperienceTypeName;
  expType?: ExperienceKindName | null;
  foodMode?: ExperienceFoodModeName;
  menuMode?: ExperienceMenuModeName;
  foodDescription?: string | null;
  occasionText?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  totalSeats?: number | null;
  minSeats?: number | null;
  maxSeats?: number | null;
  listingPriceMinor?: bigint | null;
  adultPriceMinor?: bigint | null;
  kidsPriceMinor?: bigint | null;
  occasionPriceMinor?: bigint | null;
  currencyCode?: string;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  scheduleConfig?: Record<string, unknown> | null;
  legacyId?: string | null;
  customMenus?: ExperienceMenuLinkInput[];
}

export interface UpdateExperienceInput extends ExperienceMediaFields {
  name?: string;
  description?: string | null;
  type?: ExperienceTypeName;
  expType?: ExperienceKindName | null;
  foodMode?: ExperienceFoodModeName;
  menuMode?: ExperienceMenuModeName;
  foodDescription?: string | null;
  occasionText?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  totalSeats?: number | null;
  minSeats?: number | null;
  maxSeats?: number | null;
  listingPriceMinor?: bigint | null;
  adultPriceMinor?: bigint | null;
  kidsPriceMinor?: bigint | null;
  occasionPriceMinor?: bigint | null;
  currencyCode?: string;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  scheduleConfig?: Record<string, unknown> | null;
}

export interface ExperienceMenuRecord {
  id: string;
  menuId: string;
  isDefault: boolean;
}

export interface ExperienceRecord {
  id: string;
  legacyId: string | null;
  merchantId: string;
  restaurantId: string;
  categoryId: string | null;
  subCategoryId: string | null;
  name: string;
  description: string | null;
  type: ExperienceTypeName;
  expType: ExperienceKindName | null;
  foodMode: ExperienceFoodModeName;
  menuMode: ExperienceMenuModeName;
  foodDescription: string | null;
  occasionText: string | null;
  photos: string[];
  photoThumbnails: string[];
  videos: string[];
  promotionalVideos: string[];
  userBenefits: string | null;
  termsAndConditions: string | null;
  tags: string[];
  totalSeats: number | null;
  minSeats: number | null;
  maxSeats: number | null;
  listingPriceMinor: bigint | null;
  adultPriceMinor: bigint | null;
  kidsPriceMinor: bigint | null;
  occasionPriceMinor: bigint | null;
  currencyCode: string;
  startAt: Date | null;
  endAt: Date | null;
  active: boolean;
  isDraft: boolean;
  menus: ExperienceMenuRecord[];
}
