import { CatalogController } from './catalog.controller';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import {
  STAFF_ROLES_KEY,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';

describe('CatalogController', () => {
  const catalog = {
    getMenusForRestaurant: jest.fn(),
    getMenuSections: jest.fn(),
    getItemDetail: jest.fn(),
    getItemsForRestaurant: jest.fn(),
  };
  const writes = {
    createMenu: jest.fn(),
    updateMenu: jest.fn(),
    createSection: jest.fn(),
    updateSection: jest.fn(),
    reorderSections: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    createVariant: jest.fn(),
    updateVariant: jest.fn(),
    setChannelConfig: jest.fn(),
    createAddOnGroup: jest.fn(),
    updateAddOnGroup: jest.fn(),
    createAddOn: jest.fn(),
    updateAddOn: jest.fn(),
  };
  const controller = new CatalogController(catalog as any, writes as any);

  const principal = (role: StaffPrincipal['staffRole'], merchantId = 'merchant-1'): StaffPrincipal => ({
    staffMemberId: 'staff-1',
    actorType: 'STAFF',
    staffRole: role,
    merchantId,
  });

  beforeEach(() => jest.clearAllMocks());

  it('passes the authenticated principal to catalog reads', async () => {
    const p = principal('MERCHANT_STAFF');
    catalog.getMenusForRestaurant.mockResolvedValue([]);
    await controller.getMenus({ staffPrincipal: p } as any, 'restaurant-1', 'true');
    expect(catalog.getMenusForRestaurant).toHaveBeenCalledWith(p, 'restaurant-1', true);
  });

  it('passes the authenticated principal to catalog writes', async () => {
    const p = principal('MERCHANT_OWNER');
    writes.createMenu.mockResolvedValue({ id: 'menu-1' });
    const input = { restaurantId: 'restaurant-1', name: 'Dinner' };
    await controller.createMenu({ staffPrincipal: p } as any, input);
    expect(writes.createMenu).toHaveBeenCalledWith(p, input);
  });

  it('declares merchant-owner/staff authorization on every catalog endpoint', () => {
    const expected = ['MERCHANT_OWNER', 'MERCHANT_STAFF'];
    const methods = [
      'getMenus', 'getSections', 'getItem', 'getItems', 'createMenu', 'updateMenu',
      'createSection', 'updateSection', 'reorderSections', 'createItem', 'updateItem',
      'createVariant', 'updateVariant', 'setChannelConfig', 'createAddOnGroup',
      'updateAddOnGroup', 'createAddOn', 'updateAddOn',
    ] as const;

    for (const method of methods) {
      expect(Reflect.getMetadata(STAFF_ROLES_KEY, CatalogController.prototype[method])).toEqual(expected);
    }
  });
});
