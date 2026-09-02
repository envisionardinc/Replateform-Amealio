import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenService } from '../access-token.service';
import type { RequestWithPrincipal } from '../../authorization/principal';

/**
 * Consumer authentication guard (P1.7.1B). Extracts a Bearer access token,
 * verifies signature/claims, and establishes `request.principal`. Does NOT
 * implement role/permission authorization (that is a later task).
 */
@Injectable()
export class JwtConsumerGuard implements CanActivate {
  constructor(private readonly accessTokens: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithPrincipal>();
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    const claims = await this.accessTokens.verify(token); // throws on invalid/expired
    req.principal = { userId: claims.sub, roles: ['CUSTOMER'] };
    return true;
  }
}
