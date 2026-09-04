/**
 * Experience configuration domain types (P1.7.20). Merchant-owned bookable
 * experience CONFIGURATION over the new target `Experience` + `ExperienceMenu`
 * models. Money is exact integer minor units (`bigint`). Booking/payment/refund,
 * Diner/Order, media, scheduling engine, packages, and events are DEFERRED.
 */

export type ExperienceTypeName = 'FOOD' | 'EVENT';
export type ExperienceKindName = 'SPECIAL' | 'CURATED';
export type ExperienceFoodModeName = 'NONE' | 'INCLUDED' | 'SEPARATE' | 'OCCASION_TEXT';
export type ExperienceMenuModeName = 'NONE' | 'STANDARD' | 'CUSTOM' | 'PACKAGE';

export interface ExperienceMenuLinkInput {
  menuId: string;
  isDefault?: boolean;
}

export interface CreateExperienceInput {
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

export interface UpdateExperienceInput {
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
