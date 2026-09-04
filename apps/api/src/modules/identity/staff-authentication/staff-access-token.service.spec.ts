import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StaffAccessTokenService } from './staff-access-token.service';
import { AccessTokenService } from '../authentication/access-token.service';

const staffConfig = {
  get: (k: string) => {
    if (k === 'STAFF_JWT_ACCESS_SECRET') return 'staff-secret';
    if (k === 'STAFF_JWT_ACCESS_TTL_SECONDS') return 900;
    return undefined;
  },
} as ConfigService;

const consumerConfig = {
  get: (k: string) => {
    if (k === 'JWT_ACCESS_SECRET') return 'consumer-secret';
    if (k === 'JWT_ACCESS_TTL_SECONDS') return 900;
    return undefined;
  },
} as ConfigService;

describe('StaffAccessTokenService', () => {
  const jwt = new JwtService();
  const svc = new StaffAccessTokenService(jwt, staffConfig);

  it('issues a verifiable staff token with minimal, non-sensitive claims', async () => {
    const token = await svc.issue({ id: 'st1', staffRole: 'MERCHANT_STAFF', merchantId: 'm1' });
    const claims = await svc.verify(token);
    expect(claims.sub).toBe('st1');
    expect(claims.actorType).toBe('STAFF');
    expect(claims.staffRole).toBe('MERCHANT_STAFF');
    expect(claims.mid).toBe('m1');
    expect(claims.typ).toBe('access');
    // No credential/secret/PII fields.
    expect(JSON.stringify(claims)).not.toMatch(/secret|password|hash|refresh/i);
  });

  it('represents SUPER_ADMIN with a null merchant scope', async () => {
    const token = await svc.issue({ id: 'admin1', staffRole: 'SUPER_ADMIN', merchantId: null });
    const claims = await svc.verify(token);
    expect(claims.staffRole).toBe('SUPER_ADMIN');
    expect(claims.mid).toBeNull();
  });

  it('rejects a tampered/garbage token', async () => {
    await expect(svc.verify('not.a.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does NOT accept a consumer token (dedicated secret + audience boundary)', async () => {
    const consumer = new AccessTokenService(jwt, consumerConfig);
    const consumerToken = await consumer.issue('user1');
    await expect(svc.verify(consumerToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a staff token is NOT accepted by the consumer access-token service', async () => {
    const consumer = new AccessTokenService(jwt, consumerConfig);
    const staffToken = await svc.issue({
      id: 'st1',
      staffRole: 'MERCHANT_OWNER',
      merchantId: 'm1',
    });
    await expect(consumer.verify(staffToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
