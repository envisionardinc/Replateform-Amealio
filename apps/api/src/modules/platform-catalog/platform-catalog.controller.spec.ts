import { BadRequestException } from '@nestjs/common';
import { PlatformCatalogController } from './platform-catalog.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';

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

  it('rejects requests without an authenticated staff principal', () => {
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
});
