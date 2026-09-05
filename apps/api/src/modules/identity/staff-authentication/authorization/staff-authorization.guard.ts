import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestWithStaffPrincipal, StaffRoleName } from '../staff-principal';
import { StaffPermissionRepository } from './staff-permission.repository';
import { extractRequestedMerchantId, isSuperAdmin } from './merchant-scope';
import {
  MerchantScopedOptions,
  STAFF_MERCHANT_SCOPED_KEY,
  STAFF_PERMISSIONS_KEY,
  STAFF_PLATFORM_ONLY_KEY,
  STAFF_ROLES_KEY,
} from './staff-authorization.decorators';

/**
 * Staff/admin authorization guard (P1.7.1F). Composes AFTER `JwtStaffGuard`
 * (which authenticates and sets `request.staffPrincipal`). Enforces, from
 * handler/class metadata:
 *   - @PlatformOnly            → SUPER_ADMIN (platform scope) only
 *   - @MerchantScoped          → merchant staff confined to their own merchantId
 *   - @RequireStaffRoles       → principal role ∈ set (ANY)
 *   - @RequireStaffPermissions → role grants ALL keys (RolePermission)
 *
 * Behavior: no principal → 401; authenticated but not authorized → 403.
 * SUPER_ADMIN (merchantId = null) is a platform superuser and bypasses role /
 * permission gates; it is NOT confined by merchant scoping (act-as is deferred).
 * Merchant scope is always server-derived; a request-supplied merchant id is
 * used only to reject cross-merchant access, never to grant it.
 */
@Injectable()
export class StaffAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: StaffPermissionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithStaffPrincipal>();
    const principal = req.staffPrincipal;
    if (!principal) {
      // No authenticated staff principal (JwtStaffGuard did not run / rejected).
      throw new UnauthorizedException('Staff authentication required');
    }

    const targets = [context.getHandler(), context.getClass()] as const;
    const requiredRoles = this.reflector.getAllAndOverride<StaffRoleName[]>(STAFF_ROLES_KEY, [
      ...targets,
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [
      ...targets,
    ]);
    const platformOnly = this.reflector.getAllAndOverride<boolean>(STAFF_PLATFORM_ONLY_KEY, [
      ...targets,
    ]);
    const merchantScoped = this.reflector.getAllAndOverride<
      MerchantScopedOptions & { param: string }
    >(STAFF_MERCHANT_SCOPED_KEY, [...targets]);

    const superAdmin = isSuperAdmin(principal);

    // Platform-only routes: SUPER_ADMIN exclusively.
    if (platformOnly && !superAdmin) {
      throw new ForbiddenException('Platform scope required');
    }

    // Merchant tenant isolation (does not restrict a platform SUPER_ADMIN).
    if (merchantScoped && !superAdmin) {
      if (!principal.merchantId) {
        throw new ForbiddenException('Merchant scope required');
      }
      const requested = extractRequestedMerchantId(req, merchantScoped.param);
      if (requested !== undefined && requested !== principal.merchantId) {
        throw new ForbiddenException('Cross-merchant access denied');
      }
    }

    // SUPER_ADMIN is a platform superuser: bypass role/permission gates.
    if (superAdmin) return true;

    // Role requirement (ANY).
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(principal.staffRole)) {
        throw new ForbiddenException('Insufficient role');
      }
    }

    // Permission requirement (ALL). Deny-by-default when the role grants none.
    if (requiredPermissions && requiredPermissions.length > 0) {
      const granted = await this.permissions.getPermissionKeys(principal.staffMemberId);
      const missing = requiredPermissions.filter((p) => !granted.has(p));
      if (missing.length > 0) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    // No authorization metadata → authentication alone suffices.
    return true;
  }
}
