import 'reflect-metadata';
import { ExperienceController } from './experience.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { STAFF_ROLES_KEY } from '../identity/staff-authentication/authorization/staff-authorization.decorators';

describe('ExperienceController', () => {
  const service = {
    listExperiences: jest.fn(),
    getExperience: jest.fn(),
    createExperience: jest.fn(),
    updateExperience: jest.fn(),
    publishExperience: jest.fn(),
    unpublishExperience: jest.fn(),
    setCustomMenus: jest.fn(),
    deleteExperience: jest.fn(),
  };
  const controller = new ExperienceController(service as any);

  const principal = (role: StaffPrincipal['staffRole'], merchantId = 'merchant-1'): StaffPrincipal => ({
    staffMemberId: 'staff-1', actorType: 'STAFF', staffRole: role, merchantId,
  });

  beforeEach(() => jest.clearAllMocks());

  it('passes the authenticated principal to experience reads', async () => {
    const p = principal('MERCHANT_OWNER');
    await controller.get({ staffPrincipal: p } as any, 'experience-1');
    expect(service.getExperience).toHaveBeenCalledWith(p, 'experience-1');
  });

  it('passes the authenticated principal to experience writes', async () => {
    const p = principal('MERCHANT_STAFF');
    const input = { name: 'Dinner Experience', restaurantId: 'restaurant-1' };
    await controller.create({ staffPrincipal: p } as any, input);
    expect(service.createExperience).toHaveBeenCalledWith(p, input);
  });

  it('requires merchant owner or merchant staff for the entire controller', () => {
    expect(Reflect.getMetadata(STAFF_ROLES_KEY, ExperienceController)).toEqual([
      'MERCHANT_OWNER', 'MERCHANT_STAFF',
    ]);
  });

  it('normalizes experience money inputs at the HTTP boundary', async () => {
    const p = principal('MERCHANT_OWNER');
    const input = {
      restaurantId: 'restaurant-1', name: 'Dinner',
      listingPriceMinor: '1500', adultPriceMinor: 2000,
      kidsPriceMinor: null, occasionPriceMinor: '0',
    };
    await controller.create({ staffPrincipal: p } as any, input as any);
    const normalized = service.createExperience.mock.calls[0][1];
    expect(normalized.listingPriceMinor).toBe(1500n);
    expect(normalized.adultPriceMinor).toBe(2000n);
    expect(normalized.kidsPriceMinor).toBeNull();
    expect(normalized.occasionPriceMinor).toBe(0n);
  });
});
