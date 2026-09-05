import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformExperienceCatalogueController } from './platform-experience-catalogue.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import { StaffPermissionRepository } from '../identity/staff-authentication/authorization/staff-permission.repository';
import {
  STAFF_PLATFORM_ONLY_KEY,
  STAFF_ROLES_KEY,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';

const UUID = {
  folder: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  media: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  category: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  subcategory: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

describe('PlatformExperienceCatalogueController', () => {
  const service = {
    createFolder: jest.fn(),
    updateFolder: jest.fn(),
    listFolders: jest.fn(),
    getFolder: jest.fn(),
    listMedia: jest.fn(),
    appendMedia: jest.fn(),
    archiveMedia: jest.fn(),
  };
  const controller = new PlatformExperienceCatalogueController(service as any);

  const principal = (role: string, merchantId: string | null = null): StaffPrincipal =>
    ({
      staffMemberId: 'staff-1',
      actorType: 'STAFF',
      staffRole: role,
      merchantId,
    }) as StaffPrincipal;

  beforeEach(() => jest.clearAllMocks());

  it('requires an authenticated staff principal before invoking the service', () => {
    expect(() =>
      controller.create({} as any, {
        name: 'Folder',
        categoryId: UUID.category,
        subcategoryId: UUID.subcategory,
      }),
    ).toThrow(Error);
    expect(service.createFolder).not.toHaveBeenCalled();
  });

  it('passes the authenticated principal to folder administration', async () => {
    const p = principal('SUPER_ADMIN');
    service.createFolder.mockResolvedValue({ id: UUID.folder });
    await controller.create({ staffPrincipal: p } as any, {
      name: 'Diwali Night',
      categoryId: UUID.category,
      subcategoryId: UUID.subcategory,
    });
    expect(service.createFolder).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ name: 'Diwali Night', categoryId: UUID.category }),
    );
  });

  it('passes the authenticated principal to discovery list', async () => {
    const p = principal('MERCHANT_OWNER', 'merchant-1');
    service.listFolders.mockResolvedValue({ data: [], totalCount: 0 });
    await controller.list({ staffPrincipal: p } as any, '1', '20', 'diwali');
    expect(service.listFolders).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ page: 1, limit: 20, search: 'diwali' }),
    );
  });

  it('maps legacy field aliases on create', async () => {
    const p = principal('SUPER_ADMIN');
    service.createFolder.mockResolvedValue({ id: UUID.folder });
    await controller.create({ staffPrincipal: p } as any, {
      exp_folder_name: 'Legacy Name',
      category: UUID.category,
      subcategory: UUID.subcategory,
      what_users_get: 'Benefits',
      terms_and_conditions: 'T&C',
      is_ai_generated: true,
    });
    expect(service.createFolder).toHaveBeenCalledWith(
      p,
      expect.objectContaining({
        name: 'Legacy Name',
        categoryId: UUID.category,
        subcategoryId: UUID.subcategory,
        userBenefits: 'Benefits',
        termsAndConditions: 'T&C',
        isAiGenerated: true,
      }),
    );
  });

  it('declares platform-only authorization on write routes', () => {
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformExperienceCatalogueController.prototype.create,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformExperienceCatalogueController.prototype.update,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformExperienceCatalogueController.prototype.appendMedia,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        STAFF_PLATFORM_ONLY_KEY,
        PlatformExperienceCatalogueController.prototype.archiveMedia,
      ),
    ).toBe(true);
  });

  it('declares staff role authorization on discovery routes', () => {
    const discoveryRoles = ['SUPER_ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF'];
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformExperienceCatalogueController.prototype.list),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(STAFF_ROLES_KEY, PlatformExperienceCatalogueController.prototype.get),
    ).toEqual(discoveryRoles);
    expect(
      Reflect.getMetadata(
        STAFF_ROLES_KEY,
        PlatformExperienceCatalogueController.prototype.listMedia,
      ),
    ).toEqual(discoveryRoles);
  });

  it('does not expose a materialize/clone route on the controller', () => {
    const proto = PlatformExperienceCatalogueController.prototype as unknown as Record<
      string,
      unknown
    >;
    expect(proto.materialize).toBeUndefined();
    expect(proto.clone).toBeUndefined();
    expect(proto.createExperience).toBeUndefined();
  });
});

describe('PlatformExperienceCatalogueController authorization guard contract', () => {
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
      getClass: () => PlatformExperienceCatalogueController,
    } as any;
  }

  const merchant = {
    staffMemberId: 'm-staff',
    actorType: 'STAFF' as const,
    staffRole: 'MERCHANT_STAFF' as const,
    merchantId: 'merchant-1',
  };
  const owner = {
    staffMemberId: 'm-owner',
    actorType: 'STAFF' as const,
    staffRole: 'MERCHANT_OWNER' as const,
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
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.list, undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects merchant staff on platform-only create with 403', async () => {
    await expect(
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.create, merchant)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects merchant owner on platform-only media append with 403', async () => {
    await expect(
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.appendMedia, owner)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects merchant staff on archive with 403', async () => {
    await expect(
      guard.canActivate(
        ctx(PlatformExperienceCatalogueController.prototype.archiveMedia, merchant),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows merchant staff to discover folders', async () => {
    await expect(
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.list, merchant)),
    ).resolves.toBe(true);
  });

  it('allows merchant owner to get folder detail', async () => {
    await expect(
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.get, owner)),
    ).resolves.toBe(true);
  });

  it('allows merchant staff to list media metadata', async () => {
    await expect(
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.listMedia, merchant)),
    ).resolves.toBe(true);
  });

  it('allows SUPER_ADMIN to administer folders', async () => {
    await expect(
      guard.canActivate(ctx(PlatformExperienceCatalogueController.prototype.create, admin)),
    ).resolves.toBe(true);
  });
});
