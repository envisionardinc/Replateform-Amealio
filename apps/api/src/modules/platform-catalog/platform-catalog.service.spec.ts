import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlatformCatalogService } from './platform-catalog.service';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';

const UUID = {
  catalog: '11111111-1111-4111-8111-111111111111',
  category: '22222222-2222-4222-8222-222222222222',
  item: '33333333-3333-4333-8333-333333333333',
  restaurant: '44444444-4444-4444-8444-444444444444',
  section: '55555555-5555-4555-8555-555555555555',
  otherRestaurant: '66666666-6666-4666-8666-666666666666',
  otherSection: '77777777-7777-4777-8777-777777777777',
};

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

describe('PlatformCatalogService', () => {
  const repo = {
    createCatalog: jest.fn(),
    updateCatalog: jest.fn(),
    createCategory: jest.fn(),
    createItem: jest.fn(),
    listCatalogs: jest.fn(),
    findCatalog: jest.fn(),
    findCategory: jest.fn(),
    findItem: jest.fn(),
    listCategories: jest.fn(),
    listItems: jest.fn(),
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

  describe('administration', () => {
    it('rejects global catalogue administration when the principal is not SUPER_ADMIN', async () => {
      await expect(
        service.createGlobalCatalog(merchantStaff('m1', 'MERCHANT_OWNER'), { name: 'Global' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.createCatalog).not.toHaveBeenCalled();
    });

    it('allows SUPER_ADMIN to create a global catalogue', async () => {
      repo.createCatalog.mockResolvedValue({ id: UUID.catalog });
      await expect(service.createGlobalCatalog(superAdmin, { name: 'Global' })).resolves.toEqual({
        id: UUID.catalog,
      });
      expect(repo.createCatalog).toHaveBeenCalled();
    });

    it('rejects empty catalogue name', async () => {
      await expect(service.createGlobalCatalog(superAdmin, { name: '  ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates catalogue metadata for SUPER_ADMIN', async () => {
      repo.updateCatalog.mockResolvedValue({ id: UUID.catalog, name: 'Updated', status: 'ACTIVE' });
      await expect(
        service.updateGlobalCatalog(superAdmin, UUID.catalog, { name: 'Updated' }),
      ).resolves.toEqual(expect.objectContaining({ name: 'Updated' }));
    });

    it('rejects catalogue update when missing', async () => {
      repo.updateCatalog.mockResolvedValue(null);
      await expect(
        service.updateGlobalCatalog(superAdmin, UUID.catalog, { name: 'Updated' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects merchant updates to global catalogues', async () => {
      await expect(
        service.updateGlobalCatalog(merchantStaff('m1', 'MERCHANT_OWNER'), UUID.catalog, {
          name: 'Nope',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('discovery', () => {
    it('allows merchant staff to list global catalogues', async () => {
      repo.listCatalogs.mockResolvedValue([{ id: UUID.catalog, name: 'Global' }]);
      await expect(service.listGlobalCatalogs(merchantStaff('m1'))).resolves.toEqual([
        { id: UUID.catalog, name: 'Global' },
      ]);
    });

    it('allows SUPER_ADMIN to get catalogue detail with categories and items', async () => {
      repo.findCatalog.mockResolvedValue({ id: UUID.catalog, name: 'Global' });
      repo.listCategories.mockResolvedValue([{ id: UUID.category, name: 'Mains' }]);
      repo.listItems.mockResolvedValue([{ id: UUID.item, name: 'Paneer' }]);
      await expect(service.getGlobalCatalog(superAdmin, UUID.catalog)).resolves.toEqual({
        catalog: { id: UUID.catalog, name: 'Global' },
        categories: [{ id: UUID.category, name: 'Mains' }],
        items: [{ id: UUID.item, name: 'Paneer' }],
      });
    });

    it('rejects discovery of a missing catalogue', async () => {
      repo.findCatalog.mockResolvedValue(null);
      await expect(
        service.getGlobalCatalog(merchantStaff('m1'), UUID.catalog),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects malformed catalogue ids', async () => {
      await expect(
        service.getGlobalCatalog(merchantStaff('m1'), 'not-a-uuid'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lists items filtered by category after validating ownership', async () => {
      repo.findCatalog.mockResolvedValue({ id: UUID.catalog });
      repo.findCategory.mockResolvedValue({ id: UUID.category, catalogId: UUID.catalog });
      repo.listItems.mockResolvedValue([{ id: UUID.item, name: 'Paneer' }]);
      await expect(
        service.listGlobalItems(merchantStaff('m1'), UUID.catalog, UUID.category),
      ).resolves.toEqual([{ id: UUID.item, name: 'Paneer' }]);
      expect(repo.listItems).toHaveBeenCalledWith(UUID.catalog, UUID.category);
    });

    it('rejects category filters that belong to another catalogue', async () => {
      repo.findCatalog.mockResolvedValue({ id: UUID.catalog });
      repo.findCategory.mockResolvedValue({
        id: UUID.category,
        catalogId: '99999999-9999-4999-8999-999999999999',
      });
      await expect(
        service.listGlobalItems(merchantStaff('m1'), UUID.catalog, UUID.category),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns a single global item for merchant discovery', async () => {
      repo.findItem.mockResolvedValue({ id: UUID.item, name: 'Paneer' });
      await expect(service.getGlobalItem(merchantStaff('m1'), UUID.item)).resolves.toEqual({
        id: UUID.item,
        name: 'Paneer',
      });
    });

    it('rejects missing global items', async () => {
      repo.findItem.mockResolvedValue(null);
      await expect(service.getGlobalItem(merchantStaff('m1'), UUID.item)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('materialization tenant isolation', () => {
    it('rejects materialization when the restaurant is outside merchant scope', async () => {
      repo.findItem.mockResolvedValue({ id: UUID.item, name: 'Paneer', description: null });
      restaurants.findById.mockResolvedValue({
        id: UUID.otherRestaurant,
        merchantId: 'm2',
        deletedAt: null,
      });
      scope.assertRestaurantInScope.mockRejectedValue(
        new ForbiddenException('Cross-merchant access denied'),
      );

      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: UUID.otherRestaurant,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.materializeItem).not.toHaveBeenCalled();
    });

    it('materializes into the restaurant merchant after scope validation', async () => {
      repo.findItem.mockResolvedValue({ id: UUID.item, name: 'Paneer', description: 'spicy' });
      restaurants.findById.mockResolvedValue({
        id: UUID.restaurant,
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
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
        }),
      ).resolves.toEqual({ menuItemId: 'item-1', materializationId: 'link-1' });

      expect(repo.materializeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceItemId: UUID.item,
          merchantId: 'm1',
          restaurantId: UUID.restaurant,
          name: 'Paneer',
          product: null,
        }),
      );
    });

    it('rejects materialization when the menu section belongs to another restaurant', async () => {
      repo.findItem.mockResolvedValue({ id: UUID.item, name: 'Paneer', description: null });
      restaurants.findById.mockResolvedValue({
        id: UUID.restaurant,
        merchantId: 'm1',
        deletedAt: null,
      });
      scope.assertRestaurantInScope.mockResolvedValue(undefined);
      repo.sectionRestaurant.mockResolvedValue({ restaurantId: UUID.otherRestaurant });

      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
          menuSectionId: UUID.otherSection,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.materializeItem).not.toHaveBeenCalled();
    });

    it('rejects materialization when the global item is missing', async () => {
      repo.findItem.mockResolvedValue(null);
      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects materialization when restaurant is missing', async () => {
      repo.findItem.mockResolvedValue({ id: UUID.item, name: 'Paneer', description: null });
      restaurants.findById.mockResolvedValue(null);
      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects SUPER_ADMIN materialization without merchant scope', async () => {
      await expect(
        service.materializeGlobalItem(superAdmin, {
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('propagates materialization transaction failures', async () => {
      repo.findItem.mockResolvedValue({ id: UUID.item, name: 'Paneer', description: null });
      restaurants.findById.mockResolvedValue({
        id: UUID.restaurant,
        merchantId: 'm1',
        deletedAt: null,
      });
      scope.assertRestaurantInScope.mockResolvedValue(undefined);
      repo.materializeItem.mockRejectedValue(new Error('transaction failed'));

      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
        }),
      ).rejects.toThrow('transaction failed');
    });

    it('rejects empty restaurantId payloads', async () => {
      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: '',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects materialization when the source item belongs to another catalogue', async () => {
      repo.findItem.mockResolvedValue({
        id: UUID.item,
        catalogId: UUID.catalog,
        name: 'Paneer',
        description: null,
      });
      repo.findCatalog.mockResolvedValue({ id: UUID.otherRestaurant });
      await expect(
        service.materializeGlobalItem(merchantStaff('m1'), {
          sourceItemId: UUID.item,
          restaurantId: UUID.restaurant,
          catalogId: UUID.otherRestaurant,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.materializeItem).not.toHaveBeenCalled();
    });

    it('ignores a client-supplied merchantId and uses the restaurant owner', async () => {
      repo.findItem.mockResolvedValue({
        id: UUID.item,
        catalogId: UUID.catalog,
        name: 'Paneer',
        description: null,
      });
      restaurants.findById.mockResolvedValue({
        id: UUID.restaurant,
        merchantId: 'm1',
        deletedAt: null,
      });
      scope.assertRestaurantInScope.mockResolvedValue(undefined);
      repo.materializeItem.mockResolvedValue({
        menuItemId: 'item-1',
        materializationId: 'link-1',
      });

      await service.materializeGlobalItem(merchantStaff('m1'), {
        sourceItemId: UUID.item,
        restaurantId: UUID.restaurant,
        catalogId: UUID.catalog,
      });
      expect(repo.materializeItem).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 'm1', restaurantId: UUID.restaurant }),
      );
    });
  });
});
