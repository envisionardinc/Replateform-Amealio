import { SetMetadata } from '@nestjs/common';
import type { StaffRoleName } from '../staff-principal';

/**
 * Staff/admin authorization metadata (P1.7.1F). Applied to controller handlers
 * (or classes) and enforced by `StaffAuthorizationGuard`. These are the reusable
 * primitives future domain modules compose; they do NOT encode the legacy
 * permission catalogue (that mapping is deferred — see doc 27).
 */

export const STAFF_ROLES_KEY = 'staff:roles';
export const STAFF_PERMISSIONS_KEY = 'staff:permissions';
export const STAFF_PLATFORM_ONLY_KEY = 'staff:platformOnly';
export const STAFF_MERCHANT_SCOPED_KEY = 'staff:merchantScoped';

/** Require the staff principal's coarse role to be one of `roles` (ANY). */
export const RequireStaffRoles = (...roles: StaffRoleName[]) => SetMetadata(STAFF_ROLES_KEY, roles);

/**
 * Require the staff principal's role to grant ALL of `permissionKeys`
 * (fine-grained RolePermission keys). SUPER_ADMIN bypasses (platform superuser).
 */
export const RequireStaffPermissions = (...permissionKeys: string[]) =>
  SetMetadata(STAFF_PERMISSIONS_KEY, permissionKeys);

/** Restrict the route to platform scope (SUPER_ADMIN with merchantId = null). */
export const PlatformOnly = () => SetMetadata(STAFF_PLATFORM_ONLY_KEY, true);

export interface MerchantScopedOptions {
  /** Request key inspected ONLY to REJECT cross-merchant access (never to grant). Default `merchantId`. */
  param?: string;
}

/**
 * Mark a route as merchant-tenant-scoped. Merchant staff are confined to their
 * server-derived `StaffPrincipal.merchantId`; a request-supplied merchant id is
 * used solely to reject mismatches, never to widen scope. SUPER_ADMIN operates
 * at platform scope (not restricted; act-as is deferred).
 */
export const MerchantScoped = (options: MerchantScopedOptions = {}) =>
  SetMetadata(STAFF_MERCHANT_SCOPED_KEY, { param: options.param ?? 'merchantId' });
