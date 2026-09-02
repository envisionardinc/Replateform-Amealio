/**
 * Platform reference-data (taxonomy) read models (P1.7.4).
 *
 * Mirror the target `Category` (hierarchical, admin-defined; represents the
 * legacy unified `Category` + `Sub Category` taxonomy) and `Cuisine` lookup.
 * Ownership: PLATFORM_DEFINED (admin) → MERCHANT_SELECTED → USER-consumed.
 * Icons/media are EMBEDDED string fields (icon URL/key, iconCode, hexColor),
 * NOT a separate entity. `status` is exposed raw (legacy string; values not yet
 * canonicalized — see doc 31). `legacyId` anchors a future controlled import.
 */

export interface CategoryRecord {
  id: string;
  legacyId: string | null;
  name: string;
  code: string | null;
  type: string | null;
  description: string | null;
  icon: string | null;
  iconCode: string | null;
  hexColor: string | null;
  status: string | null;
  parentId: string | null;
  deletedAt: Date | null;
}

export interface CuisineRecord {
  id: string;
  legacyId: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  status: string | null;
}

/**
 * Platform currency reference (P1.7.6; legacy `currency`). Canonical identity is
 * `isoCode` (ISO 4217). Supplements the embedded `currencyCode` on money-bearing
 * models — it does NOT replace it, and there is no FX/conversion or Country FK.
 */
export interface CurrencyRecord {
  id: string;
  legacyId: string | null;
  isoCode: string;
  symbol: string | null;
  name: string | null;
  countryName: string | null;
  description: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}
