import { PlatformCatalogController } from './platform-catalog.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import {
  STAFF_PLATFORM_ONLY_KEY,
  STAFF_ROLES_KEY,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';

describe('PlatformCatalogController', () => {
  const service = {
    createGlobalCatalog: jest.fn(),
    createGlobalCategory: jest.fn(),
    createGlobalItem: jest.fn(),
    materializeGlobalItem: jest.fn(),
  };
  const controller = new PlatformCatalogController(service as any);

  const principal = (role: string, merchantId: string | null = null): StaffPrincipal => ({
    staffMemberId: 'staff-1',
    staffRole: role,
    merchantId,
  } as StaffPrincipal);

  beforeEach(() => jest.clearAllMocks());

  it('requires an authenticated staff principal before invoking the service', () => {
    expect(() => controller.createGlobal({} as any, { name: 'x' })).toThrow(Error);
    expect(service.createGlobalCatalog).not.toHaveBeenCalled();
  });

  it('passes the authenticated principal to global administration', async () => {
    const p = principal('SUPER_ADMIN');
    service.createGlobalCatalog.mockResolvedValue({ id: 'catalog-1' });
    await controller.createGlobal({ staffPrincipal: p } as any, { name: 'Global Menu' });
    expect(service.createGlobalCatalog).toHaveBeenCalledWith(p, expect.objectContaining({ name: 'Global Menu' }));
  });

  it('passes the authenticated principal to merchant materialization', async () => {
    const p = principal('MERCHANT_OWNER', 'merchant-1');
    service.materializeGlobalItem.mockResolvedValue({ menuItemId: 'item-1', materializationId: 'link-1' });
    await controller.materialize({ staffPrincipal: p } as any, 'source-1', { restaurantId: 'restaurant-1' });
    expect(service.materializeGlobalItem).toHaveBeenCalledWith(p, expect.objectContaining({ sourceItemId: 'source-1', restaurantId: 'restaurant-1' }));
  });

  it('declares platform-only authorization on global catalogue administration routes', () => {
    expect(Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, PlatformCatalogController.prototype.createGlobal)).toBe(true);
    expect(Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, PlatformCatalogController.prototype.createCategory)).toBe(true);
    expect(Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, PlatformCatalogController.prototype.createItem)).toBe(true);
  });

  it('declares merchant staff role authorization on global item materialization', () => {
    expect(Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.materialize)).toEqual([
      'MERCHANT_OWNER',
      'MERCHANT_STAFF',
    ]);
  });
});
