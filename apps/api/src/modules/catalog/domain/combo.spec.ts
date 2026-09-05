import {
  assertNoClientComboMoney,
  comboIsOrderable,
  componentOrderableForCombo,
  quoteCombo,
  resolveSelections,
  snapshotCombo,
  type ComboComponentAvailability,
  type ComboRecord,
} from './combo';

const MERCHANT = '11111111-1111-4111-8111-111111111111';
const RESTAURANT = '22222222-2222-4222-8222-222222222222';

function combo(over: Partial<ComboRecord> = {}): ComboRecord {
  return {
    id: 'combo-1',
    merchantId: MERCHANT,
    restaurantId: RESTAURANT,
    name: 'Meal',
    description: null,
    isPublished: true,
    availability: 'AVAILABLE',
    substitutable: false,
    comboPriceMinor: 29900n,
    currencyCode: 'INR',
    sortOrder: 0,
    deletedAt: null,
    slots: [
      {
        id: 'slot-pizza',
        name: 'Pizza',
        sortOrder: 0,
        options: [
          { id: 'opt-a', menuItemId: 'pizza', isDefault: true, sortOrder: 0 },
          { id: 'opt-b', menuItemId: 'deluxe', isDefault: false, sortOrder: 1 },
        ],
      },
      {
        id: 'slot-drink',
        name: 'Drink',
        sortOrder: 1,
        options: [{ id: 'opt-c', menuItemId: 'coke', isDefault: true, sortOrder: 0 }],
      },
    ],
    sectionIds: [],
    ...over,
  };
}

function item(id: string, over: Partial<ComboComponentAvailability> = {}): ComboComponentAvailability {
  return {
    menuItemId: id,
    restaurantId: RESTAURANT,
    merchantId: MERCHANT,
    deletedAt: null,
    isPublished: true,
    availability: 'AVAILABLE',
    channelEnabled: true,
    hasAvailableVariant: true,
    name: id,
    ...over,
  };
}

describe('combo domain (Stage F)', () => {
  it('quotes the fixed combo price and ignores component catalog prices', () => {
    const quoted = quoteCombo({
      combo: combo(),
      quantity: 2,
      components: [item('pizza'), item('deluxe'), item('coke')],
    });
    expect(quoted.unitMerchandiseMinor).toBe(29900n);
    expect(quoted.lineMerchandiseMinor).toBe(59800n);
    expect(quoted.modifierTotalMinor).toBe(0n);
    expect(quoted.components.map((row) => row.menuItemId)).toEqual(['pizza', 'coke']);
  });

  it('rejects a substitution on a fixed combo', () => {
    expect(() =>
      resolveSelections(combo(), [{ slotId: 'slot-pizza', menuItemId: 'deluxe' }]),
    ).toThrow(/substitution/i);
  });

  it('lets an explicit code win only when substitutable', () => {
    const quoted = quoteCombo({
      combo: combo({ substitutable: true }),
      quantity: 1,
      selections: [
        { slotId: 'slot-pizza', menuItemId: 'deluxe' },
        { slotId: 'slot-drink', menuItemId: 'coke' },
      ],
      components: [item('pizza'), item('deluxe'), item('coke')],
    });
    expect(quoted.components[0].menuItemId).toBe('deluxe');
    expect(quoted.lineMerchandiseMinor).toBe(29900n);
  });

  it('blocks an unavailable required component and does not substitute', () => {
    expect(
      comboIsOrderable({
        combo: combo(),
        components: [item('pizza', { availability: 'SOLDOUT' }), item('coke')],
      }),
    ).toBe(false);
    expect(() =>
      quoteCombo({
        combo: combo(),
        quantity: 1,
        components: [item('pizza', { availability: 'SOLDOUT' }), item('coke')],
      }),
    ).toThrow(/required combo component/i);
  });

  it('rejects a foreign-merchant component', () => {
    expect(() =>
      quoteCombo({
        combo: combo(),
        quantity: 1,
        components: [
          item('pizza', { merchantId: '99999999-9999-4999-8999-999999999999' }),
          item('coke'),
        ],
      }),
    ).toThrow(/another merchant/i);
  });

  it('does not treat a component with required modifiers as a second modifier system', () => {
    expect(componentOrderableForCombo(item('pizza'))).toBe(true);
  });

  it('rejects unpublished and unavailable combos', () => {
    expect(() =>
      quoteCombo({
        combo: combo({ isPublished: false }),
        quantity: 1,
        components: [item('pizza'), item('coke')],
      }),
    ).toThrow(/not published/i);
    expect(() =>
      quoteCombo({
        combo: combo({ availability: 'SOLDOUT' }),
        quantity: 1,
        components: [item('pizza'), item('coke')],
      }),
    ).toThrow(/not available/i);
  });

  it('rejects an option that is not a member of the slot', () => {
    expect(() =>
      resolveSelections(combo({ substitutable: true }), [
        { slotId: 'slot-pizza', menuItemId: 'salad' },
        { slotId: 'slot-drink', menuItemId: 'coke' },
      ]),
    ).toThrow(/missing a valid component/i);
  });

  it('requires a pick per substitutable slot when selections are sent', () => {
    expect(() =>
      resolveSelections(combo({ substitutable: true }), [
        { slotId: 'slot-pizza', menuItemId: 'deluxe' },
      ]),
    ).toThrow(/pick per slot/i);
  });

  it('ignores client combo money', () => {
    expect(() => assertNoClientComboMoney({ comboPriceMinor: 1n })).toThrow(/server-derived/);
  });

  it('snapshots combo.v1 configuration without treating it as money authority', () => {
    const quoted = quoteCombo({
      combo: combo(),
      quantity: 1,
      components: [item('pizza'), item('coke')],
    });
    const snap = snapshotCombo(quoted);
    expect(snap.schema).toBe('combo.v1');
    expect(snap.comboId).toBe('combo-1');
    expect(snap.components.map((row) => row.menuItemId)).toEqual(['pizza', 'coke']);
  });
});
