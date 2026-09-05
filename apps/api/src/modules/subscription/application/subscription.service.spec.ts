import { ForbiddenException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from '../infrastructure/subscription.repository';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';

function fakeRepo(): SubscriptionRepository {
  return {
    findByMerchant: jest.fn(async (m: string) => [{ merchantId: m }]),
    findActiveByMerchant: jest.fn(async (m: string) => [{ merchantId: m, status: 'ACTIVE' }]),
  } as unknown as SubscriptionRepository;
}

const merchantStaff = (merchantId: string): StaffPrincipal => ({
  staffMemberId: 'staff',
  actorType: 'STAFF',
  staffRole: 'MERCHANT_STAFF',
  merchantId,
});
const superAdmin: StaffPrincipal = {
  staffMemberId: 'admin',
  actorType: 'STAFF',
  staffRole: 'SUPER_ADMIN',
  merchantId: null,
};

describe('SubscriptionService (tenancy)', () => {
  it('resolves a merchant staff to their own merchant', () => {
    const svc = new SubscriptionService(fakeRepo());
    expect(svc.resolveTargetMerchant(merchantStaff('m1'))).toBe('m1');
    expect(svc.resolveTargetMerchant(merchantStaff('m1'), 'm1')).toBe('m1'); // matching request ok
  });

  it('rejects a request-supplied merchant id that differs from the principal (403)', () => {
    const svc = new SubscriptionService(fakeRepo());
    expect(() => svc.resolveTargetMerchant(merchantStaff('m1'), 'm2')).toThrow(ForbiddenException);
  });

  it('rejects a merchant staff without a merchant scope (403)', () => {
    const svc = new SubscriptionService(fakeRepo());
    const noScope = { ...merchantStaff('m1'), merchantId: null };
    expect(() => svc.resolveTargetMerchant(noScope)).toThrow(ForbiddenException);
  });

  it('SUPER_ADMIN targets a merchant only via an explicit id; none => platform (null)', async () => {
    const svc = new SubscriptionService(fakeRepo());
    expect(svc.resolveTargetMerchant(superAdmin)).toBeNull();
    expect(svc.resolveTargetMerchant(superAdmin, 'm9')).toBe('m9');
    expect(await svc.getForStaff(superAdmin)).toEqual([]); // no target -> empty
    expect(await svc.getForStaff(superAdmin, 'm9')).toEqual([{ merchantId: 'm9' }]);
  });

  it('getForStaff / getActiveForStaff scope to the principal merchant', async () => {
    const svc = new SubscriptionService(fakeRepo());
    expect(await svc.getForStaff(merchantStaff('m1'))).toEqual([{ merchantId: 'm1' }]);
    expect(await svc.getActiveForStaff(merchantStaff('m1'))).toEqual([
      { merchantId: 'm1', status: 'ACTIVE' },
    ]);
  });
});
