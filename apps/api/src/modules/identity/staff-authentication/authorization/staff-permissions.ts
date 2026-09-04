/**
 * Foundation permission keys (P1.7.1F).
 *
 * These are a SMALL, explicitly-documented set used only to exercise and
 * demonstrate the permission mechanism (tests/examples). They are NOT a
 * business permission catalogue.
 *
 * Doc 81 (legacy RBAC linkage/enforcement forensic) establishes that legacy
 * `vendorPermission` / `superAdminPermission` trees are unfinished UI + schema
 * and are NOT backend-enforced. Do not invent domain keys from those labels.
 * Verified Admin/Merchant parity uses coarse staff roles + merchant scope.
 *
 * Permission keys are free-form strings persisted in `RolePermission.permissionKey`;
 * the authorization mechanism checks required keys against those a role grants
 * (`allowed = true`). Domain keys may be added later only with forensic proof
 * of runtime enforcement or an explicit product decision to finish the catalogue.
 */
export const StaffFoundationPermissions = {
  /** Example read permission (foundation/testing only). */
  STAFF_READ: 'staff.read',
  /** Example write permission (foundation/testing only). */
  STAFF_WRITE: 'staff.write',
} as const;

export type StaffFoundationPermission =
  (typeof StaffFoundationPermissions)[keyof typeof StaffFoundationPermissions];
