import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformCatalogController } from './platform-catalog.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import { StaffPermissionRepository } from '../identity/staff-authentication/authorization/staff-permission.repository';
import {
  STAFF_PLATFORM_ONLY_KEY,
  STAFF_ROLES_KEY,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';

describe('PlatformCatalogController', () => {
  const service = {
    createGlobalCatalog: jest.fn(),
    updateGlobalCatalog: jest.fn(),
    createGlobalCategory: jest.fn(),
    createGlobalItem: jest.fn(),
    listGlobalCatalogs: jest.fn(),
    getGlobalCatalog: jest.fn(),
    listGlobalCategories: jest.fn(),
    listGlobalItems: jest.fn(),
    getGlobalItem: jest.fn(),
    materializeGlobalItem: jest.fn(),
  };
  const controller = new PlatformCatalogController(service as any);

  const principal = (role: string, merchantId: string | null = null): StaffPrincipal =>
    ({
      staffMemberId: 'staff-1',
      actorType: 'STAFF',
      staffRole: role,
      merchantId,
    }) as StaffPrincipal;

  beforeEach(() => jest.clearAllMocks());

  it('requires an authenticated staff principal before invoking the service', () => {
    expect(() => controller.createGlobal({} as any, { name: 'x' })).toThrow(Error);
    expect(service.createGlobalCatalog).not.toHaveBeenCalled();
  });

  it('passes the authenticated principal to global administration', async () => {
    const p = principal('SUPER_ADMIN');
    service.createGlobalCatalog.mockResolvedValue({ id: 'catalog-1' });
    await controller.createGlobal({ staffPrincipal: p } as any, { name: 'Global Menu' });
    expect(service.createGlobalCatalog).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ name: 'Global Menu' }),
    );
  });

  it('passes the authenticated principal to discovery reads', async () => {
    const p = principal('MERCHANT_OWNER', 'merchant-1');
    service.listGlobalCatalogs.mockResolvedValue([]);
    await controller.listGlobal({ staffPrincipal: p } as any, 'ACTIVE');
    expect(service.listGlobalCatalogs).toHaveBeenCalledWith(p, 'ACTIVE');
  });

  it('passes the authenticated principal to merchant materialization', async () => {
    const p = principal('MERCHANT_OWNER', 'merchant-1');
    service.materializeGlobalItem.mockResolvedValue({
      menuItemId: 'item-1',
      materializationId: 'link-1',
    });
    await controller.materialize({ staffPrincipal: p } as any, 'source-1', {
      restaurantId: 'restaurant-1',
    });
    expect(service.materializeGlobalItem).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ sourceItemId: 'source-1', restaurantId: 'restaurant-1' }),
    );
  });

  it('declares platform-only authorization on global catalogue administration routes', () => {
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformCatalogController.prototype.createGlobal,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformCatalogController.prototype.updateGlobal,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformCatalogController.prototype.createCategory,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(STAFF_PLATFORM_ONLY_KEY, PlatformCatalogController.prototype.createItem),
    ).toBe(true);
  });

  it('declares staff role authorization on discovery and materialization routes', () => {
    const discoveryRoles = ['SUPER_ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF'];
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.listGlobal),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.getGlobal),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.listCategories),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.listItems),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.getItem),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformCatalogController.prototype.materialize),
    ).toEqual(['MERCHANT_OWNER', 'MERCHANT_STAFF']);
  });
});

describe('PlatformCatalogController authorization guard contract', () => {
  const perms = {
    getPermissionKeys: async () => new Set<string>(),
  } as unknown as StaffPermissionRepository;
  const reflector = new Reflector();
  const guard = new StaffAuthorizationGuard(reflector, perms);

  function ctx(handler: object, principal?: StaffPrincipal) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ staffPrincipal: principal, params: {}, query: {}, body: {} }),
      }),
      getHandler: () => handler,
      getClass: () => PlatformCatalogController,
    } as any;
  }

  const merchant = {
    staffMemberId: 'm-staff',
    actorType: 'STAFF' as const,
    staffRole: 'MERCHANT_STAFF' as const,
    merchantId: 'merchant-1',
  };
  const admin = {
    staffMemberId: 'admin',
    actorType: 'STAFF' as const,
    staffRole: 'SUPER_ADMIN' as const,
    merchantId: null,
  };

  it('rejects unauthenticated access to discovery with 401', async () => {
    await expect(
      guard.canActivate(ctx(PlatformCatalogController.prototype.listGlobal, undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects merchant staff on platform-only create with 403', async () => {
    await expect(
      guard.canActivate(ctx(PlatformCatalogController.prototype.createGlobal, merchant)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows merchant staff to discover global catalogues', async () => {
    await expect(
      guard.canActivate(ctx(PlatformCatalogController.prototype.listGlobal, merchant)),
    ).resolves.toBe(true);
  });

  it('allows SUPER_ADMIN to administer global catalogues', async () => {
    await expect(
      guard.canActivate(ctx(PlatformCatalogController.prototype.createGlobal, admin)),
    ).resolves.toBe(true);
  });
});
