import { describe, expect, it } from 'vitest';
import {
  buildScratchItemPayload,
  catalogRestaurantHref,
  minorToRupees,
  parseOptionalMaxSelect,
  requiredFromMinSelect,
  rupeesToMinor,
  singleSelectFromMax,
} from './catalog-form';

describe('merchant catalog form helpers', () => {
  it('converts rupees to server integer minor units', () => {
    expect(rupeesToMinor('249')).toBe('24900');
    expect(rupeesToMinor('')).toBeNull();
    expect(rupeesToMinor('-1')).toBeNull();
    expect(minorToRupees('24900')).toBe('249');
  });

  it('builds an unpublished scratch item without requiring a variant', () => {
    expect(
      buildScratchItemPayload({
        restaurantId: 'r1',
        name: '  Chef Special  ',
        description: 'Seasonal',
      }),
    ).toEqual({
      restaurantId: 'r1',
      name: 'Chef Special',
      description: 'Seasonal',
      menuSectionId: null,
      isPublished: false,
      availability: 'AVAILABLE',
    });
  });

  it('includes one Stage A variant and HOME_DELIVERY when provided', () => {
    const payload = buildScratchItemPayload({
      restaurantId: 'r1',
      name: 'Thali',
      size: 'Regular',
      sku: 'THALI-REG',
      priceRupees: '299',
      homeDeliveryEnabled: true,
      menuSectionId: 'sec-1',
    });
    expect(payload.isPublished).toBe(false);
    expect(payload.menuSectionId).toBe('sec-1');
    expect(payload.variants).toEqual([
      {
        size: 'Regular',
        sku: 'THALI-REG',
        priceMinor: '29900',
        currencyCode: 'INR',
        isDefault: true,
        available: true,
      },
    ]);
    expect(payload.channelConfigs).toEqual([{ channel: 'HOME_DELIVERY', enabled: true }]);
  });

  it('maps Stage A selection rules without inventing freeOptions', () => {
    expect(requiredFromMinSelect(0)).toBe(false);
    expect(requiredFromMinSelect(1)).toBe(true);
    expect(singleSelectFromMax(1)).toBe(true);
    expect(singleSelectFromMax(null)).toBe(false);
    expect(parseOptionalMaxSelect('')).toBeNull();
    expect(parseOptionalMaxSelect('2')).toBe(2);
  });

  it('keeps restaurant scope on catalog links', () => {
    expect(catalogRestaurantHref('/catalog/items/new', 'r1')).toBe(
      '/catalog/items/new?restaurantId=r1',
    );
  });
});
