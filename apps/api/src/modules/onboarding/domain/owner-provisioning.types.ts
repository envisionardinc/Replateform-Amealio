/**
 * Merchant owner provisioning + activation types (P1.7.14).
 *
 * Maps the legacy owner (`VendorUser` with `role`, `password`, `has_admin_approved`)
 * onto the EXISTING target identity models (`StaffMember` + `StaffCredential`,
 * P1.7.1D/E) — no schema change, no new entity, no second auth system.
 *
 * Activation: legacy `has_admin_approved` (default false; SUPER_ADMIN grants) is
 * represented by the owner `StaffMember.status` (BLOCKED = pending/not-approved,
 * ACTIVE = approved) and enforced by the EXISTING staff auth guard/session infra.
 */

export type StaffAccountStatusName = 'ACTIVE' | 'BLOCKED';

export interface ProvisionOwnerInput {
  merchantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  password: string;
  /** Optional initial status; defaults to BLOCKED (pending activation). */
  status?: StaffAccountStatusName;
}

export interface ProvisionedOwner {
  id: string;
  merchantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  staffRole: 'MERCHANT_OWNER';
  status: StaffAccountStatusName;
}

export interface UpdateRestaurantProfileInput {
  // Only the evidenced onboarding/profile fields (legacy RestaurantDetailsSettings /
  // map setup). No media/taxonomy/hours/KYC/geography normalization here.
  name?: string;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  country?: string | null;
  timezone?: string | null;
  currencyCode?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface RestaurantProfileRecord {
  id: string;
  merchantId: string;
  name: string;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  country: string | null;
  timezone: string | null;
  currencyCode: string;
  lat: number | null;
  lon: number | null;
  status: string;
}

export interface UpdateSubscriptionConfigInput {
  status?: string;
  /** Config paths to merge non-destructively into the existing JSON config. */
  config?: Record<string, unknown>;
}
