import { parseMaterializationProduct } from './materialization-product';

describe('materialization product snapshot', () => {
  it('reads a Stage A product from source_payload.product', () => {
    const product = parseMaterializationProduct({
      product: {
        variants: [{ size: 'Small', sku: 'PIZ-S', priceMinor: '10000', isDefault: true }],
        addOnGroups: [
          {
            name: 'Toppings',
            minSelect: 0,
            maxSelect: 2,
            addOns: [
              {
                name: 'Pepperoni',
                priceMinor: 100,
                variantPrices: [{ size: 'Small', priceMinor: 200 }],
              },
            ],
          },
        ],
        channelConfigs: [{ channel: 'HOME_DELIVERY', enabled: true }],
      },
    });
    expect(product?.variants?.[0]).toMatchObject({ size: 'Small', sku: 'PIZ-S', priceMinor: 10000n });
    expect(product?.addOnGroups?.[0].addOns?.[0].variantPrices?.[0].priceMinor).toBe(200n);
    expect(product?.channelConfigs?.[0].channel).toBe('HOME_DELIVERY');
  });

  it('ignores empty or unknown payloads', () => {
    expect(parseMaterializationProduct(null)).toBeNull();
    expect(parseMaterializationProduct({ note: 'legacy blob' })).toBeNull();
  });
});
