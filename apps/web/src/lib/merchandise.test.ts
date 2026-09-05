import { describe, expect, it } from 'vitest';
import type { CatalogModifier, CatalogModifierGroup } from './api';
import {
  catalogAdjustmentMinor,
  initialSelections,
  setModifierQuantity,
  toModifierGroupPayload,
  toggleModifier,
} from './merchandise';

function modifier(
  over: Partial<CatalogModifier> & Pick<CatalogModifier, 'id' | 'name'>,
): CatalogModifier {
  return {
    priceMinor: '100',
    currencyCode: 'INR',
    available: true,
    isDefault: false,
    sortOrder: 0,
    variantPrices: [],
    ...over,
  };
}

function group(
  over: Partial<CatalogModifierGroup> & Pick<CatalogModifierGroup, 'id' | 'name' | 'modifiers'>,
): CatalogModifierGroup {
  return {
    minSelect: 0,
    maxSelect: 2,
    allowQuantity: false,
    available: true,
    sortOrder: 0,
    required: false,
    singleSelect: false,
    ...over,
  };
}

const crust = group({
  id: 'grp-crust',
  name: 'Crust',
  minSelect: 1,
  maxSelect: 1,
  required: true,
  singleSelect: true,
  modifiers: [
    modifier({ id: 'thin', name: 'Thin Crust', priceMinor: '0', isDefault: true }),
    modifier({ id: 'thick', name: 'Thick Crust', priceMinor: '50' }),
  ],
});

const toppings = group({
  id: 'grp-top',
  name: 'Toppings',
  modifiers: [
    modifier({
      id: 'pep',
      name: 'Pepperoni',
      priceMinor: '100',
      variantPrices: [{ variantId: 'small', priceMinor: '200' }],
    }),
    modifier({ id: 'mush', name: 'Mushrooms', priceMinor: '150' }),
    modifier({ id: 'gone', name: 'Sold out', available: false }),
  ],
});

describe('merchandise selection (consumer Stage A)', () => {
  it('applies default modifiers without inventing prices', () => {
    const state = initialSelections([crust, toppings]);
    expect(state['grp-crust']).toEqual({ thin: 1 });
    expect(state['grp-top']).toEqual({});
    const payload = toModifierGroupPayload([crust, toppings], state);
    expect(payload).toEqual([
      { groupId: 'grp-crust', selections: [{ modifierId: 'thin', quantity: 1 }] },
      { groupId: 'grp-top', selections: [] },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/price/i);
  });

  it('enforces single-select replacement and keeps a required choice', () => {
    const picked = toggleModifier(crust, { thin: 1 }, 'thick');
    expect(picked.selected).toEqual({ thick: 1 });
    const cleared = toggleModifier(crust, picked.selected, 'thick');
    expect(cleared.selected).toEqual({ thick: 1 });
  });

  it('enforces max selections and rejects unavailable modifiers', () => {
    const one = toggleModifier(toppings, {}, 'pep');
    const two = toggleModifier(toppings, one.selected, 'mush');
    const over = toggleModifier(
      group({
        ...toppings,
        modifiers: [...toppings.modifiers, modifier({ id: 'olives', name: 'Olives' })],
      }),
      two.selected,
      'olives',
    );
    expect(over.error).toMatch(/at most 2/);
    const blocked = toggleModifier(toppings, {}, 'gone');
    expect(blocked.error).toMatch(/not available/);
    expect(blocked.selected).toEqual({});
  });

  it('counts quantity toward max when allowQuantity is true', () => {
    const qtyGroup = group({
      ...toppings,
      allowQuantity: true,
      maxSelect: 2,
      modifiers: [modifier({ id: 'pep', name: 'Pepperoni' })],
    });
    const two = setModifierQuantity(qtyGroup, { pep: 1 }, 'pep', 2);
    expect(two.selected).toEqual({ pep: 2 });
    const three = setModifierQuantity(qtyGroup, two.selected, 'pep', 3);
    expect(three.error).toMatch(/at most 2/);
  });

  it('does not preselect an unavailable default modifier', () => {
    const crustUnavailableDefault = group({
      id: 'grp-crust',
      name: 'Crust',
      minSelect: 1,
      maxSelect: 1,
      required: true,
      singleSelect: true,
      modifiers: [
        modifier({
          id: 'thin',
          name: 'Thin Crust',
          priceMinor: '0',
          isDefault: true,
          available: false,
        }),
        modifier({ id: 'thick', name: 'Thick Crust', priceMinor: '50' }),
      ],
    });
    expect(initialSelections([crustUnavailableDefault])['grp-crust']).toEqual({});
    const blocked = toggleModifier(crustUnavailableDefault, {}, 'thin');
    expect(blocked.error).toMatch(/not available/);
    expect(blocked.selected).toEqual({});
  });

  it('reads variant-specific catalog adjustments for display only', () => {
    const pep = toppings.modifiers[0];
    expect(catalogAdjustmentMinor(pep, 'small')).toBe('200');
    expect(catalogAdjustmentMinor(pep, 'large')).toBe('100');
  });
});
