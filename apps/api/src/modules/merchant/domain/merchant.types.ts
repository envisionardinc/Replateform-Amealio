/**
 * Merchant/Location domain read models (P1.7.2).
 *
 * These mirror the EXISTING P1.5 `Merchant` (tenant/business) and `Restaurant`
 * (location) tables — no schema change. They expose only the fields the
 * foundation needs; sensitive/credential data is never part of these types.
 *
 * Grounding (current-state audit): legacy has no `Merchant` entity — the owner
 * is a `VendorUser` (via `restaurant.vendor_id`) and the business unit is
 * `restaurant`. The target `Merchant` is the approved tenant abstraction that
 * groups a vendor's restaurants; `Restaurant` is the location. Relationship is
 * Merchant 1 → N Restaurant.
 */

export interface MerchantRecord {
  id: string;
  legacyId: string | null;
  organizationId: string | null;
  legalName: string;
  email: string | null;
  phone: string | null;
  isBlocked: boolean;
  deletedAt: Date | null;
}

export interface RestaurantRecord {
  id: string;
  legacyId: string | null;
  merchantId: string;
  chainId: string | null;
  name: string;
  city: string | null;
  status: string;
  deletedAt: Date | null;
}
