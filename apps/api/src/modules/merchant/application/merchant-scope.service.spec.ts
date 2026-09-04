import { ForbiddenException } from '@nestjs/common';
import { MerchantScopeService } from './merchant-scope.service';
import { RestaurantRepository } from '../infrastructure/restaurant.repository';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';

function fakeRestaurants(ownerByRestaurant: Record<string, string>): RestaurantRepository {
  return {
    belongsToMerchant: async (restaurantId: string, merchantId: string) =>
      ownerByRestaurant[restaurantId] === merchantId,
  } as unknown as RestaurantRepository;
}

const merchantStaff = (merchantId: string): StaffPrincipal => ({
  staffMemberId: 'staff-1',
  actorType: 'STAFF',
  staffRole: 'MERCHANT_STAFF',
  merchantId,
});
const superAdmin: StaffPrincipal = {
  staffMemberId: 'admin-1',
  actorType: 'STAFF',
  staffRole: 'SUPER_ADMIN',
  merchantId: null,
};

describe('MerchantScopeService', () => {
  it('resolves the trusted merchant scope from the principal', () => {
    const svc = new MerchantScopeService(fakeRestaurants({}));
    expect(svc.resolveMerchantScope(merchantStaff('m1'))).toBe('m1');
    expect(svc.resolveMerchantScope(superAdmin)).toBeNull();
  });

  it('allows a restaurant that belongs to the staff merchant', async () => {
    const svc = new MerchantScopeService(fakeRestaurants({ r1: 'm1' }));
    await expect(svc.assertRestaurantInScope(merchantStaff('m1'), 'r1')).resolves.toBeUndefined();
  });

  it('rejects a restaurant belonging to another merchant (403)', async () => {
    const svc = new MerchantScopeService(fakeRestaurants({ r1: 'm2' }));
    await expect(svc.assertRestaurantInScope(merchantStaff('m1'), 'r1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when a merchant staff has no merchant scope (403)', async () => {
    const svc = new MerchantScopeService(fakeRestaurants({ r1: 'm1' }));
    const noScope = { ...merchantStaff('m1'), merchantId: null };
    await expect(svc.assertRestaurantInScope(noScope, 'r1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not confine a platform SUPER_ADMIN', async () => {
    const svc = new MerchantScopeService(fakeRestaurants({ r1: 'm2' }));
    await expect(svc.assertRestaurantInScope(superAdmin, 'r1')).resolves.toBeUndefined();
  });
});
