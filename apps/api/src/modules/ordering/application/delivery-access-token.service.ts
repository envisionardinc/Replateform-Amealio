import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface DeliveryAccessTokenClaims {
  sub: string;
  actorType: 'DELIVERY';
  mid: string;
  typ: 'access';
}

export interface DeliveryPrincipal {
  actorType: 'DELIVERY';
  deliveryPersonId: string;
  merchantId: string;
}

/**
 * Delivery-person access tokens (doc 91). Dedicated secret + audience
 * `amealio-delivery` so staff/consumer JWTs never verify here.
 */
@Injectable()
export class DeliveryAccessTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly issuer = 'amealio';
  private readonly audience = 'amealio-delivery';

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret =
      config.get<string>('DELIVERY_JWT_ACCESS_SECRET') ??
      'dev-only-delivery-access-secret-change-me';
    this.ttlSeconds = config.get<number>('DELIVERY_JWT_ACCESS_TTL_SECONDS') ?? 900;
  }

  get lifetimeSeconds(): number {
    return this.ttlSeconds;
  }

  async issue(subject: { id: string; merchantId: string }): Promise<string> {
    const claims: DeliveryAccessTokenClaims = {
      sub: subject.id,
      actorType: 'DELIVERY',
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

  async verify(token: string): Promise<DeliveryAccessTokenClaims> {
    try {
      const payload = await this.jwt.verifyAsync<DeliveryAccessTokenClaims>(token, {
        secret: this.secret,
        issuer: this.issuer,
        audience: this.audience,
      });
      if (
        payload.typ !== 'access' ||
        payload.actorType !== 'DELIVERY' ||
        !payload.sub ||
        !payload.mid
      ) {
        throw new Error('bad claims');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
