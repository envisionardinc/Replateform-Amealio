import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlatformCatalogService } from './platform-catalog.service';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';

const merchantStaff = (
  merchantId: string,
  role: StaffPrincipal['staffRole'] = 'MERCHANT_STAFF',
): StaffPrincipal => ({
  staffMemberId: 'staff-1',
  actorType: 'STAFF',
  staffRole: role,
  merchantId,
});

const superAdmin: StaffPrincipal = {
  staffMemberId: 'admin-1',
  actorType: 'STAFF',
  staffRole: 'SUPER_ADMIN',
  merchantId: null,
};

describe('PlatformCatalogService tenant isolation', () => {
  const repo = {
    createCatalog: jest.fn(),
    createCategory: jest.fn(),
    createItem: jest.fn(),
    findCatalog: jest.fn(),
    findItem: jest.fn(),
    sectionRestaurant: jest.fn(),
    materializeItem: jest.fn(),
  };
  const scope = {
    assertRestaurantInScope: jest.fn(),
  };
  const restaurants = {
    findById: jest.fn(),
  };
  const service = new PlatformCatalogService(repo as any, scope as any, restaurants as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects global catalogue administration when the principal is not SUPER_ADMIN', async () => {
    await expect(
      service.createGlobalCatalog(merchantStaff('m1', 'MERCHANT_OWNER'), { name: 'Global' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createCatalog).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN to create a global catalogue', async () => {
    repo.createCatalog.mockResolvedValue({ id: 'catalog-1' });
    await expect(service.createGlobalCatalog(superAdmin, { name: 'Global' })).resolves.toEqual({
      id: 'catalog-1',
    });
    expect(repo.createCatalog).toHaveBeenCalled();
  });

  it('rejects materialization when the restaurant is outside merchant scope', async () => {
    repo.findItem.mockResolvedValue({ id: 'source-1', name: 'Paneer', description: null });
    restaurants.findById.mockResolvedValue({
      id: 'r-other',
      merchantId: 'm2',
      deletedAt: null,
    });
    scope.assertRestaurantInScope.mockRejectedValue(
      new ForbiddenException('Cross-merchant access denied'),
    );

    await expect(
      service.materializeGlobalItem(merchantStaff('m1'), {
        sourceItemId: 'source-1',
        restaurantId: 'r-other',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.materializeItem).not.toHaveBeenCalled();
  });

  it('materializes into the restaurant merchant after scope validation', async () => {
    repo.findItem.mockResolvedValue({ id: 'source-1', name: 'Paneer', description: 'spicy' });
    restaurants.findById.mockResolvedValue({
      id: 'r1',
      merchantId: 'm1',
      deletedAt: null,
    });
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    repo.materializeItem.mockResolvedValue({
      menuItemId: 'item-1',
      materializationId: 'link-1',
    });

    await expect(
      service.materializeGlobalItem(merchantStaff('m1', 'MERCHANT_OWNER'), {
        sourceItemId: 'source-1',
        restaurantId: 'r1',
      }),
    ).resolves.toEqual({ menuItemId: 'item-1', materializationId: 'link-1' });

    expect(scope.assertRestaurantInScope).toHaveBeenCalledWith(merchantStaff('m1', 'MERCHANT_OWNER'), 'r1');
    expect(repo.materializeItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceItemId: 'source-1',
        merchantId: 'm1',
        restaurantId: 'r1',
        name: 'Paneer',
      }),
    );
  });

  it('rejects materialization when the menu section belongs to another restaurant', async () => {
    repo.findItem.mockResolvedValue({ id: 'source-1', name: 'Paneer', description: null });
    restaurants.findById.mockResolvedValue({ id: 'r1', merchantId: 'm1', deletedAt: null });
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    repo.sectionRestaurant.mockResolvedValue({ restaurantId: 'r-other' });

    await expect(
      service.materializeGlobalItem(merchantStaff('m1'), {
        sourceItemId: 'source-1',
        restaurantId: 'r1',
        menuSectionId: 'section-other',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.materializeItem).not.toHaveBeenCalled();
  });

  it('rejects materialization when the global item is missing', async () => {
    repo.findItem.mockResolvedValue(null);
    await expect(
      service.materializeGlobalItem(merchantStaff('m1'), {
        sourceItemId: 'missing',
        restaurantId: 'r1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
