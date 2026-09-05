import {
  MerchandiseConfigurationError,
  parseModifierGroupSelections,
  quoteMerchandise,
  resolveModifierPrice,
  snapshotMerchandise,
  type CatalogMerchandiseItem,
} from './merchandise-configuration';

const ITEM_ID = 'item-1';
const SMALL = 'var-s';
const MEDIUM = 'var-m';
const CRUST = 'grp-crust';
const TOPPINGS = 'grp-top';
const THIN = 'mod-thin';
const PEPPERONI = 'mod-pep';
const MUSHROOM = 'mod-mush';

function item(overrides: Partial<CatalogMerchandiseItem> = {}): CatalogMerchandiseItem {
  return {
    menuItemId: ITEM_ID,
    merchantId: 'merch-1',
    restaurantId: 'rest-1',
    isPublished: true,
    deletedAt: null,
    availability: 'AVAILABLE',
    variant: {
      id: SMALL,
      size: 'Small',
      priceMinor: 10000n,
      available: true,
      currencyCode: 'INR',
    },
    channelEnabled: null,
    groups: [
      {
        id: CRUST,
        name: 'Crust',
        minSelect: 1,
        maxSelect: 1,
        available: true,
        allowQuantity: false,
        modifiers: [
          {
            id: THIN,
            groupId: CRUST,
            name: 'Thin Crust',
            defaultPriceMinor: 0n,
            available: true,
            isDefault: true,
            variantPriceMinor: null,
          },
        ],
      },
      {
        id: TOPPINGS,
        name: 'Toppings',
        minSelect: 0,
        maxSelect: 2,
        available: true,
        allowQuantity: false,
        modifiers: [
          {
            id: PEPPERONI,
            groupId: TOPPINGS,
            name: 'Pepperoni',
            defaultPriceMinor: 100n,
            available: true,
            isDefault: false,
            variantPriceMinor: 200n,
          },
          {
            id: MUSHROOM,
            groupId: TOPPINGS,
            name: 'Mushrooms',
            defaultPriceMinor: 150n,
            available: true,
            isDefault: false,
            variantPriceMinor: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('merchandise configuration (Stage A)', () => {
  it('quotes variant price only when optional groups are empty', () => {
    const quote = quoteMerchandise(
      item(),
      { variantId: SMALL, quantity: 2, modifierGroups: [] },
      'Pizza',
    );
    expect(quote.variantPriceMinor).toBe(10000n);
    expect(quote.modifierTotalMinor).toBe(0n);
    expect(quote.unitMerchandiseMinor).toBe(10000n);
    expect(quote.lineMerchandiseMinor).toBe(20000n);
    expect(quote.selections).toEqual([
      expect.objectContaining({ modifierId: THIN, quantity: 1, priceAdjustmentMinor: 0n }),
    ]);
  });

  it('accepts a valid required + optional modifier selection', () => {
    const quote = quoteMerchandise(
      item(),
      {
        variantId: SMALL,
        quantity: 1,
        modifierGroups: [
          { groupId: CRUST, selections: [{ modifierId: THIN }] },
          { groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }, { modifierId: MUSHROOM }] },
        ],
      },
      'Pizza',
    );
    expect(quote.modifierTotalMinor).toBe(350n);
    expect(quote.unitMerchandiseMinor).toBe(10350n);
  });

  it('rejects a missing required modifier group', () => {
    const catalog = item({
      groups: item().groups.map((g) =>
        g.id === CRUST
          ? {
              ...g,
              modifiers: g.modifiers.map((m) => ({ ...m, isDefault: false })),
            }
          : g,
      ),
    });
    expect(() =>
      quoteMerchandise(catalog, { variantId: SMALL, quantity: 1, modifierGroups: [] }, 'Pizza'),
    ).toThrow(MerchandiseConfigurationError);
    try {
      quoteMerchandise(catalog, { variantId: SMALL, quantity: 1, modifierGroups: [] }, 'Pizza');
    } catch (err) {
      expect((err as MerchandiseConfigurationError).code).toBe('MIN_SELECTIONS');
    }
  });

  it('enforces minSelections on an explicit empty group', () => {
    expect(() =>
      quoteMerchandise(
        item(),
        { variantId: SMALL, quantity: 1, modifierGroups: [{ groupId: CRUST, selections: [] }] },
        'Pizza',
      ),
    ).toThrow(/at least 1/);
  });

  it('enforces maxSelections', () => {
    const catalog = item({
      groups: item().groups.map((g) => (g.id === TOPPINGS ? { ...g, maxSelect: 1 } : g)),
    });
    expect(() =>
      quoteMerchandise(
        catalog,
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [
            { groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }, { modifierId: MUSHROOM }] },
          ],
        },
        'Pizza',
      ),
    ).toThrow(MerchandiseConfigurationError);
    try {
      quoteMerchandise(
        catalog,
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [
            { groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }, { modifierId: MUSHROOM }] },
          ],
        },
        'Pizza',
      );
    } catch (err) {
      expect((err as MerchandiseConfigurationError).code).toBe('MAX_SELECTIONS');
    }
  });

  it('enforces single-select via maxSelect === 1', () => {
    expect(() =>
      quoteMerchandise(
        item(),
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [
            { groupId: CRUST, selections: [{ modifierId: THIN }, { modifierId: PEPPERONI }] },
          ],
        },
        'Pizza',
      ),
    ).toThrow(MerchandiseConfigurationError);
  });

  it('enforces multi-select within maxSelect', () => {
    const quote = quoteMerchandise(
      item(),
      {
        variantId: SMALL,
        quantity: 1,
        modifierGroups: [
          { groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }, { modifierId: MUSHROOM }] },
        ],
      },
      'Pizza',
    );
    expect(quote.selections.map((s) => s.modifierId)).toEqual(
      expect.arrayContaining([THIN, PEPPERONI, MUSHROOM]),
    );
  });

  it('enforces modifier quantity when allowQuantity is false', () => {
    expect(() =>
      quoteMerchandise(
        item(),
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI, quantity: 3 }] }],
        },
        'Pizza',
      ),
    ).toThrow(/does not allow quantity/);
  });

  it('counts quantity toward min/max when allowQuantity is true', () => {
    const catalog = item({
      groups: item().groups.map((g) =>
        g.id === TOPPINGS ? { ...g, allowQuantity: true, minSelect: 2, maxSelect: 4 } : g,
      ),
    });
    const quote = quoteMerchandise(
      catalog,
      {
        variantId: SMALL,
        quantity: 1,
        modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI, quantity: 2 }] }],
      },
      'Pizza',
    );
    expect(quote.modifierTotalMinor).toBe(400n);
    expect(() =>
      quoteMerchandise(
        catalog,
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI, quantity: 5 }] }],
        },
        'Pizza',
      ),
    ).toThrow(/at most 4/);
  });

  it('rejects an unavailable modifier', () => {
    const catalog = item({
      groups: item().groups.map((g) =>
        g.id === TOPPINGS
          ? {
              ...g,
              modifiers: g.modifiers.map((m) =>
                m.id === PEPPERONI ? { ...m, available: false } : m,
              ),
            }
          : g,
      ),
    });
    expect(() =>
      quoteMerchandise(
        catalog,
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }] }],
        },
        'Pizza',
      ),
    ).toThrow(MerchandiseConfigurationError);
    try {
      quoteMerchandise(
        catalog,
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }] }],
        },
        'Pizza',
      );
    } catch (err) {
      expect((err as MerchandiseConfigurationError).code).toBe('MODIFIER_UNAVAILABLE');
    }
  });

  it('rejects an unavailable variant', () => {
    const catalog = item({
      variant: { ...item().variant, available: false },
    });
    expect(() =>
      quoteMerchandise(catalog, { variantId: SMALL, quantity: 1 }, 'Pizza'),
    ).toThrow(MerchandiseConfigurationError);
    try {
      quoteMerchandise(catalog, { variantId: SMALL, quantity: 1 }, 'Pizza');
    } catch (err) {
      expect((err as MerchandiseConfigurationError).code).toBe('VARIANT_UNAVAILABLE');
    }
  });

  it('uses variant-specific modifier price instead of the default', () => {
    expect(resolveModifierPrice(item().groups[1].modifiers[0])).toBe(200n);
    const quote = quoteMerchandise(
      item(),
      {
        variantId: SMALL,
        quantity: 1,
        modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }] }],
      },
      'Pizza',
    );
    expect(quote.selections.find((s) => s.modifierId === PEPPERONI)?.priceAdjustmentMinor).toBe(200n);
    expect(quote.unitMerchandiseMinor).toBe(10200n);
  });

  it('falls back to the default modifier price when no variant override exists', () => {
    const quote = quoteMerchandise(
      item(),
      {
        variantId: SMALL,
        quantity: 1,
        modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: MUSHROOM }] }],
      },
      'Pizza',
    );
    expect(quote.selections.find((s) => s.modifierId === MUSHROOM)?.priceAdjustmentMinor).toBe(150n);
  });

  it('rejects an unknown modifier and an unknown group', () => {
    expect(() =>
      quoteMerchandise(
        item(),
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: 'nope' }] }],
        },
        'Pizza',
      ),
    ).toThrow(/does not belong/);
    expect(() =>
      quoteMerchandise(
        item(),
        {
          variantId: SMALL,
          quantity: 1,
          modifierGroups: [{ groupId: 'grp-missing', selections: [{ modifierId: PEPPERONI }] }],
        },
        'Pizza',
      ),
    ).toThrow(/does not belong to this item/);
  });

  it('rejects an unpublished, sold-out, or channel-disabled item', () => {
    expect(() =>
      quoteMerchandise(item({ isPublished: false }), { variantId: SMALL, quantity: 1 }, 'Pizza'),
    ).toThrow(/not orderable/);
    expect(() =>
      quoteMerchandise(item({ availability: 'SOLDOUT' }), { variantId: SMALL, quantity: 1 }, 'Pizza'),
    ).toThrow(/not orderable/);
    expect(() =>
      quoteMerchandise(item({ channelEnabled: false }), { variantId: SMALL, quantity: 1 }, 'Pizza'),
    ).toThrow(/not enabled/);
  });

  it('ignores client-supplied prices on the payload when parsing', () => {
    const groups = parseModifierGroupSelections({
      schema: 'merchandise.v1',
      modifierGroups: [
        {
          groupId: TOPPINGS,
          selections: [{ modifierId: PEPPERONI, quantity: 1, priceAdjustmentMinor: '999999' }],
        },
      ],
    });
    expect(groups[0].selections[0]).toEqual({ modifierId: PEPPERONI, quantity: 1 });
    const quote = quoteMerchandise(
      item(),
      { variantId: SMALL, quantity: 1, modifierGroups: groups },
      'Pizza',
    );
    expect(quote.selections.find((s) => s.modifierId === PEPPERONI)?.priceAdjustmentMinor).toBe(200n);
    expect(quote.unitMerchandiseMinor).toBe(10200n);
  });

  it('uses exact BigInt arithmetic and never floating-point money', () => {
    const quote = quoteMerchandise(
      item({
        variant: { ...item().variant, priceMinor: 123456789n },
      }),
      {
        variantId: SMALL,
        quantity: 3,
        modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }] }],
      },
      'Pizza',
    );
    expect(typeof quote.lineMerchandiseMinor).toBe('bigint');
    expect(quote.lineMerchandiseMinor).toBe((123456789n + 200n) * 3n);
  });

  it('rejects flat addon-id and legacy addon_id payloads', () => {
    expect(() => parseModifierGroupSelections(['a', 'b'])).toThrow(/flat addon ids/);
    expect(() => parseModifierGroupSelections({ addon_id: 'x', option_id: 'y' })).toThrow(
      /addon_id/,
    );
  });

  it('snapshots quoted prices as strings without becoming the price authority', () => {
    const quote = quoteMerchandise(
      item(),
      {
        variantId: SMALL,
        quantity: 1,
        modifierGroups: [{ groupId: TOPPINGS, selections: [{ modifierId: PEPPERONI }] }],
      },
      'Pizza',
    );
    const snap = snapshotMerchandise(quote);
    expect(snap.schema).toBe('merchandise.v1');
    expect(snap.variantId).toBe(SMALL);
    const pepperoni = snap.modifierGroups
      .flatMap((g) => g.selections)
      .find((s) => s.modifierId === PEPPERONI);
    expect(pepperoni?.priceAdjustmentMinor).toBe('200');
  });

  it('does not treat a Medium variant id as interchangeable with Small', () => {
    expect(() =>
      quoteMerchandise(item(), { variantId: MEDIUM, quantity: 1 }, 'Pizza'),
    ).toThrow(/does not match/);
  });
});
