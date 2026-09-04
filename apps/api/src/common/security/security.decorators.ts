import { SetMetadata } from '@nestjs/common';

/**
 * Security FOUNDATION only (P1.6). These define metadata conventions for the
 * future Identity/authorization domain. NO guard enforces them yet, and NO
 * authentication behavior is implemented or migrated here.
 */

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as public (no auth) once an AuthGuard is introduced later. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Declares required roles; enforced by a future RolesGuard (not implemented). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_MERCHANT_SCOPE_KEY = 'requireMerchantScope';
/** Marks a route as requiring merchant/tenant scoping; enforced later. */
export const RequireMerchantScope = () => SetMetadata(REQUIRE_MERCHANT_SCOPE_KEY, true);
