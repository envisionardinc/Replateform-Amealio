import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AccessTokenClaims {
  sub: string; // userId
  actorType: 'CUSTOMER';
  typ: 'access';
}

/**
 * Consumer access-token service (P1.7.1B). Short-lived Bearer JWT (HS256).
 * Claims contain only the minimum identity info (no PII, no credentials).
 * Signing secret + lifetime come from configuration (dev-only here).
 */
@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly issuer = 'amealio';
  private readonly audience = 'amealio-consumer';

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-only-access-secret-change-me';
    this.ttlSeconds = config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
  }

  get lifetimeSeconds(): number {
    return this.ttlSeconds;
  }

  async issue(userId: string): Promise<string> {
    const claims: AccessTokenClaims = { sub: userId, actorType: 'CUSTOMER', typ: 'access' };
    return this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: this.ttlSeconds,
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.secret,
        issuer: this.issuer,
        audience: this.audience,
      });
      if (payload.typ !== 'access' || payload.actorType !== 'CUSTOMER' || !payload.sub) {
        throw new Error('bad claims');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
