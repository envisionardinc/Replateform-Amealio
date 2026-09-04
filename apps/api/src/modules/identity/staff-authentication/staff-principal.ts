/**
 * Authenticated staff/admin principal (P1.7.1E). Distinct from the consumer
 * `Principal` so a consumer token can never be used on a staff route (the guard
 * sets `request.staffPrincipal`, not `request.principal`).
 *
 * Scope semantics (AUTH-D2 / doc 26):
 *   - merchant staff  -> staffRole MERCHANT_OWNER|MERCHANT_STAFF, merchantId set
 *   - platform admin  -> staffRole SUPER_ADMIN, merchantId = null
 *
 * `merchantId` is always derived server-side from the StaffMember record and
 * never accepted from request input.
 */
export type StaffRoleName = 'MERCHANT_OWNER' | 'MERCHANT_STAFF' | 'SUPER_ADMIN';

export interface StaffPrincipal {
  staffMemberId: string;
  actorType: 'STAFF';
  staffRole: StaffRoleName;
  merchantId: string | null;
}

export interface RequestWithStaffPrincipal {
  staffPrincipal?: StaffPrincipal;
}
