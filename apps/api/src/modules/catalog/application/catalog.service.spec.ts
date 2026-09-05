import { ForbiddenException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';

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

describe('CatalogService tenant isolation', () => {
  const scope = {
    assertRestaurantInScope: jest.fn(),
  };
  const menus = {
    listByRestaurant: jest.fn(),
    findById: jest.fn(),
    listSections: jest.fn(),
  };
  const items = {
    findById: jest.fn(),
    findDetailById: jest.fn(),
    listByRestaurant: jest.fn(),
    findGlobalSourceByMenuItemId: jest.fn(),
  };
  const restaurants = {
    listByMerchant: jest.fn(),
  };
  const service = new CatalogService(scope as any, menus as any, items as any, restaurants as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects menu listing when the restaurant is outside merchant scope', async () => {
    scope.assertRestaurantInScope.mockRejectedValue(
      new ForbiddenException('Cross-merchant access denied'),
    );
    await expect(
      service.getMenusForRestaurant(merchantStaff('m1'), 'r-other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(menus.listByRestaurant).not.toHaveBeenCalled();
  });

  it('lists menus after restaurant scope validation', async () => {
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    menus.listByRestaurant.mockResolvedValue([{ id: 'menu-1' }]);
    await expect(service.getMenusForRestaurant(merchantStaff('m1'), 'r1')).resolves.toEqual([
      { id: 'menu-1' },
    ]);
    expect(scope.assertRestaurantInScope).toHaveBeenCalledWith(merchantStaff('m1'), 'r1');
  });

  it('rejects menu sections when the menu belongs to another merchant', async () => {
    menus.findById.mockResolvedValue({ id: 'menu-1', merchantId: 'm2', restaurantId: 'r2' });
    await expect(service.getMenuSections(merchantStaff('m1'), 'menu-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(menus.listSections).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN to read menus for any restaurant', async () => {
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    menus.listByRestaurant.mockResolvedValue([]);
    await expect(service.getMenusForRestaurant(superAdmin, 'r-any')).resolves.toEqual([]);
    expect(scope.assertRestaurantInScope).toHaveBeenCalledWith(superAdmin, 'r-any');
  });

  it('rejects item detail when the item restaurant is outside merchant scope', async () => {
    items.findById.mockResolvedValue({ id: 'item-1', restaurantId: 'r-other' });
    scope.assertRestaurantInScope.mockRejectedValue(
      new ForbiddenException('Cross-merchant access denied'),
    );
    await expect(service.getItemDetail(merchantStaff('m1'), 'item-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(items.findDetailById).not.toHaveBeenCalled();
  });

  it('lists restaurants from the authenticated merchant scope only', async () => {
    restaurants.listByMerchant.mockResolvedValue([{ id: 'r1', merchantId: 'm1' }]);
    await expect(service.listRestaurantsForStaff(merchantStaff('m1'))).resolves.toEqual([
      { id: 'r1', merchantId: 'm1' },
    ]);
    expect(restaurants.listByMerchant).toHaveBeenCalledWith('m1');
  });

  it('rejects SUPER_ADMIN restaurant listing for the merchant catalog surface', async () => {
    await expect(service.listRestaurantsForStaff(superAdmin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(restaurants.listByMerchant).not.toHaveBeenCalled();
  });

  it('attaches Global Catalog lineage on restaurant item lists', async () => {
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    items.listByRestaurant.mockResolvedValue([
      { id: 'item-local', name: 'Scratch' },
      { id: 'item-copy', name: 'Copied' },
    ]);
    items.findGlobalSourceByMenuItemId.mockImplementation(async (id: string) =>
      id === 'item-copy'
        ? {
            sourceItemId: 'g-1',
            sourceItemName: 'Global Paneer',
            catalogId: 'c-1',
            catalogName: 'North Indian',
          }
        : null,
    );
    await expect(service.getItemsForRestaurant(merchantStaff('m1'), 'r1')).resolves.toEqual([
      { id: 'item-local', name: 'Scratch', globalSource: null },
      {
        id: 'item-copy',
        name: 'Copied',
        globalSource: expect.objectContaining({ sourceItemId: 'g-1' }),
      },
    ]);
  });

  it('attaches Global Catalog lineage as source information, not a synced state', async () => {
    items.findById.mockResolvedValue({ id: 'item-1', restaurantId: 'r1' });
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    items.findDetailById.mockResolvedValue({
      id: 'item-1',
      restaurantId: 'r1',
      name: 'Paneer',
      isPublished: false,
      variants: [],
      channelConfigs: [],
      addOnGroups: [],
    });
    items.findGlobalSourceByMenuItemId.mockResolvedValue({
      sourceItemId: 'g-1',
      sourceItemName: 'Global Paneer',
      catalogId: 'c-1',
      catalogName: 'North Indian',
    });
    await expect(service.getItemDetail(merchantStaff('m1'), 'item-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'item-1',
        globalSource: expect.objectContaining({ sourceItemId: 'g-1', catalogName: 'North Indian' }),
      }),
    );
  });
});
