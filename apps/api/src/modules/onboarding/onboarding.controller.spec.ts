import { OnboardingController } from './onboarding.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import {
  STAFF_PLATFORM_ONLY_KEY,
  STAFF_ROLES_KEY,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';

describe('OnboardingController', () => {
  const provisioning = {
    createMerchant: jest.fn(),
    createRestaurant: jest.fn(),
    createSubscription: jest.fn(),
  };
  const owner = {
    provisionOwner: jest.fn(),
    activateMerchant: jest.fn(),
    deactivateMerchant: jest.fn(),
    updateRestaurantProfile: jest.fn(),
    updateSubscriptionConfig: jest.fn(),
  };
  const controller = new OnboardingController(provisioning as any, owner as any);

  const principal = (role: StaffPrincipal['staffRole'], merchantId: string | null = null): StaffPrincipal => ({
    staffMemberId: 'staff-1',
    actorType: 'STAFF',
    staffRole: role,
    merchantId,
  });

  beforeEach(() => jest.clearAllMocks());

  it('passes the authenticated principal to merchant creation', async () => {
    const p = principal('SUPER_ADMIN');
    provisioning.createMerchant.mockResolvedValue({ id: 'merchant-1' });
    await controller.createMerchant({ staffPrincipal: p } as any, { legalName: 'Acme' });
    expect(provisioning.createMerchant).toHaveBeenCalledWith(p, { legalName: 'Acme' });
  });

  it('uses the route merchant id as the owner provisioning target', async () => {
    const p = principal('SUPER_ADMIN');
    owner.provisionOwner.mockResolvedValue({ id: 'owner-1' });
    await controller.provisionOwner(
      { staffPrincipal: p } as any,
      'merchant-1',
      { name: 'Owner', password: 'password123', email: 'owner@example.com' },
    );
    expect(owner.provisionOwner).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ merchantId: 'merchant-1', name: 'Owner' }),
    );
  });

  it('passes merchant staff principals to merchant-scoped operations', async () => {
    const p = principal('MERCHANT_OWNER', 'merchant-1');
    provisioning.createRestaurant.mockResolvedValue({ id: 'restaurant-1' });
    await controller.createRestaurant(
      { staffPrincipal: p } as any,
      { merchantId: 'merchant-1', name: 'Main' },
    );
    expect(provisioning.createRestaurant).toHaveBeenCalledWith(p, { merchantId: 'merchant-1', name: 'Main' });
  });

  it('declares platform-only authorization for merchant creation, owner provisioning and activation', () => {
    expect(Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, OnboardingController.prototype.createMerchant)).toBe(true);
    expect(Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, OnboardingController.prototype.provisionOwner)).toBe(true);
    expect(Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, OnboardingController.prototype.setActivation)).toBe(true);
  });

  it('declares merchant-owner/staff authorization for merchant operations', () => {
    const expected = ['MERCHANT_OWNER', 'MERCHANT_STAFF'];
    expect(Reflect.getMetadata(STAFF_ROLES_KEY, OnboardingController.prototype.createRestaurant)).toEqual(expected);
    expect(Reflect.getMetadata(STAFF_ROLES_KEY, OnboardingController.prototype.createSubscription)).toEqual(expected);
    expect(Reflect.getMetadata(STAFF_ROLES_KEY, OnboardingController.prototype.updateRestaurantProfile)).toEqual(expected);
    expect(Reflect.getMetadata(STAFF_ROLES_KEY, OnboardingController.prototype.updateSubscriptionConfig)).toEqual(expected);
  });
});
