import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  REQUIRE_MERCHANT_SCOPE_KEY,
  ROLES_KEY,
} from '../../../common/security/security.decorators';
import type { RequestWithPrincipal } from './principal';

/**
 * Role-based authorization guard (foundation).
 *
 * Roles are evidenced in the baseline (user / vendor / superadmin). This guard
 * enforces @Public / @Roles / @RequireMerchantScope against a `request.principal`.
 *
 * IMPORTANT: authentication is NOT implemented in P1.7.1 — nothing populates
 * `request.principal` yet, so this guard is not registered globally. It is a
 * tested extension point for the future authentication layer. The fine-grained
 * permission-tree model (baseline vendorPermission/superAdminPermission) is
 * NOT reproduced here (enforcement is UNKNOWN in the baseline — see doc 22).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = req.principal;
    if (!principal) {
      throw new UnauthorizedException('Authentication required');
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const ok = requiredRoles.some((r) => principal.roles?.includes(r));
      if (!ok) throw new ForbiddenException('Insufficient role');
    }

    const requireMerchantScope = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_MERCHANT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requireMerchantScope && !principal.merchantId) {
      throw new ForbiddenException('Merchant scope required');
    }

    return true;
  }
}
