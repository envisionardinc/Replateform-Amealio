import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';

function configWith(ttl: number): ConfigService {
  return {
    get: (k: string) =>
      k === 'JWT_ACCESS_SECRET' ? 'test-secret' : k === 'JWT_ACCESS_TTL_SECONDS' ? ttl : undefined,
  } as ConfigService;
}

describe('AccessTokenService', () => {
  const jwt = new JwtService({});

  it('issues a token that verifies with the correct claims', async () => {
    const svc = new AccessTokenService(jwt, configWith(900));
    const token = await svc.issue('user-123');
    const claims = await svc.verify(token);
    expect(claims.sub).toBe('user-123');
    expect(claims.actorType).toBe('CUSTOMER');
    expect(claims.typ).toBe('access');
  });

  it('rejects a tampered/invalid token', async () => {
    const svc = new AccessTokenService(jwt, configWith(900));
    const token = await svc.issue('user-123');
    await expect(svc.verify(token + 'x')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.verify('not.a.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with a different secret', async () => {
    const a = new AccessTokenService(jwt, configWith(900));
    const b = new AccessTokenService(jwt, {
      get: (k: string) =>
        k === 'JWT_ACCESS_SECRET'
          ? 'other-secret'
          : k === 'JWT_ACCESS_TTL_SECONDS'
            ? 900
            : undefined,
    } as ConfigService);
    const token = await a.issue('user-123');
    await expect(b.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const svc = new AccessTokenService(jwt, configWith(900));
    // sign a token that is already expired
    const expired = await jwt.signAsync(
      { sub: 'u', actorType: 'CUSTOMER', typ: 'access' },
      { secret: 'test-secret', expiresIn: -10, issuer: 'amealio', audience: 'amealio-consumer' },
    );
    await expect(svc.verify(expired)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
