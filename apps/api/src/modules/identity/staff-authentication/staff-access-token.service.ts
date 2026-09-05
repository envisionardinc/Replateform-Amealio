import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StaffRoleName } from './staff-principal';

export interface StaffAccessTokenClaims {
  sub: string; // staffMemberId
  actorType: 'STAFF';
  staffRole: StaffRoleName;
  mid: string | null; // merchantId (null for platform-scoped SUPER_ADMIN)
  typ: 'access';
}

export interface StaffTokenSubject {
  id: string;
  staffRole: StaffRoleName;
  merchantId: string | null;
}

/**
 * Staff/admin access-token service (P1.7.1E). Short-lived Bearer JWT (HS256)
 * with a DEDICATED secret + audience — a consumer token can never verify here
 * and vice versa. Claims carry only the minimum identity + scope info (no PII,
 * no credentials, no refresh secrets). merchantId is derived server-side.
 */
@Injectable()
export class StaffAccessTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly issuer = 'amealio';
  private readonly audience = 'amealio-staff';

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret =
      config.get<string>('STAFF_JWT_ACCESS_SECRET') ?? 'dev-only-staff-access-secret-change-me';
    this.ttlSeconds = config.get<number>('STAFF_JWT_ACCESS_TTL_SECONDS') ?? 900;
  }

  get lifetimeSeconds(): number {
    return this.ttlSeconds;
  }

  async issue(subject: StaffTokenSubject): Promise<string> {
    const claims: StaffAccessTokenClaims = {
      sub: subject.id,
      actorType: 'STAFF',
      staffRole: subject.staffRole,
      mid: subject.merchantId,
      typ: 'access',
    };
    return this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: this.ttlSeconds,
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  async verify(token: string): Promise<StaffAccessTokenClaims> {
    try {
      const payload = await this.jwt.verifyAsync<StaffAccessTokenClaims>(token, {
        secret: this.secret,
        issuer: this.issuer,
        audience: this.audience,
      });
      if (payload.typ !== 'access' || payload.actorType !== 'STAFF' || !payload.sub) {
        throw new Error('bad claims');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
