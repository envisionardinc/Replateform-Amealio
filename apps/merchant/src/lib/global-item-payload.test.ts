import { describe, expect, it } from 'vitest';
import { buildGlobalItemSourcePayload, rupeesToMinor } from './global-item-payload';

describe('global item source payload', () => {
  it('converts rupees to integer minor units', () => {
    expect(rupeesToMinor('249')).toBe('24900');
    expect(rupeesToMinor('')).toBeNull();
  });

  it('omits a product snapshot when no Stage A fields are provided', () => {
    expect(buildGlobalItemSourcePayload({})).toBeUndefined();
  });

  it('copies variant, add-on, and channel fields into sourcePayload.product', () => {
    expect(
      buildGlobalItemSourcePayload({
        size: 'Regular',
        sku: 'THALI-REG',
        priceRupees: '299',
        groupName: 'Raita',
        addOnName: 'Boondi',
        addOnPriceRupees: '20',
        deliveryEnabled: true,
      }),
    ).toEqual({
      product: {
        variants: [
          {
            size: 'Regular',
            sku: 'THALI-REG',
            priceMinor: '29900',
            currencyCode: 'INR',
            isDefault: true,
            available: true,
          },
        ],
        addOnGroups: [
          {
            name: 'Raita',
            minSelect: 0,
            maxSelect: 1,
            allowQuantity: false,
            available: true,
            addOns: [
              {
                name: 'Boondi',
                priceMinor: '2000',
                available: true,
                variantPrices: [{ sku: 'THALI-REG', priceMinor: '2000' }],
              },
            ],
          },
        ],
        channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: true }],
      },
    });
  });
});
