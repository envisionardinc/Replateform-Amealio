import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { StaffAccessTokenService } from '../staff-access-token.service';
import { StaffMemberRepository } from '../staff-member.repository';
import type { RequestWithStaffPrincipal } from '../staff-principal';

/**
 * Staff/admin authentication guard (P1.7.1E). Requires `Authorization: Bearer
 * <jwt>` (the legacy raw-header format is rejected), verifies the staff JWT
 * (dedicated secret + actorType STAFF — a consumer token cannot pass), then
 * re-loads the StaffMember to reject deleted/blocked staff immediately (not a
 * token blacklist — just the principal's current record). Establishes
 * `request.staffPrincipal`. Does NOT perform RBAC/permission checks (P1.7.1F).
 */
@Injectable()
export class JwtStaffGuard implements CanActivate {
  constructor(
    private readonly accessTokens: StaffAccessTokenService,
    private readonly staff: StaffMemberRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithStaffPrincipal>();
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    const claims = await this.accessTokens.verify(token); // throws on invalid/expired/wrong-actor

    const identity = await this.staff.findIdentityById(claims.sub);
    if (!identity || identity.deletedAt || identity.status !== 'ACTIVE') {
      throw new UnauthorizedException('Staff account is not active');
    }

    req.staffPrincipal = {
      staffMemberId: identity.id,
      actorType: 'STAFF',
      staffRole: identity.staffRole,
      merchantId: identity.merchantId,
    };
    return true;
  }
}
