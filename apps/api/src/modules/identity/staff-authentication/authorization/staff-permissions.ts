/**
 * Foundation permission keys (P1.7.1F).
 *
 * These are a SMALL, explicitly-documented set used only to exercise and
 * demonstrate the permission mechanism (tests/examples). They are NOT the
 * legacy `role-management` catalogue (vendorPermission / superAdminPermission
 * trees), which is NOT yet mapped — see doc 27 "Deferred: legacy permission
 * mapping". Do not treat these as the target business permission set.
 *
 * Permission keys are free-form strings persisted in `RolePermission.permissionKey`;
 * the authorization mechanism checks required keys against those a role grants
 * (`allowed = true`). Real domain keys will be introduced per-domain later.
 */
export const StaffFoundationPermissions = {
  /** Example read permission (foundation/testing only). */
  STAFF_READ: 'staff.read',
  /** Example write permission (foundation/testing only). */
  STAFF_WRITE: 'staff.write',
} as const;

export type StaffFoundationPermission =
  (typeof StaffFoundationPermissions)[keyof typeof StaffFoundationPermissions];
