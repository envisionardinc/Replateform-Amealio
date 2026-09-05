import {
  assertCallerChargesNotAuthoritative,
  composeCommercialQuote,
  lineFromComboQuote,
  lineFromOrderItem,
  snapshotCommercial,
  type CommercialLineInput,
  type FeeRule,
  type TaxRule,
} from './commercial-quote';

const MERCHANT = '11111111-1111-4111-8111-111111111111';
const RESTAURANT = '22222222-2222-4222-8222-222222222222';
const OTHER_MERCHANT = '33333333-3333-4333-8333-333333333333';
const OTHER_RESTAURANT = '44444444-4444-4444-8444-444444444444';

function line(over: Partial<CommercialLineInput> = {}): CommercialLineInput {
  const quantity = over.quantity ?? 2;
  const variantPriceMinor = over.variantPriceMinor ?? 10000n;
  const modifierTotalMinor = over.modifierTotalMinor ?? 500n;
  const unitMerchandiseMinor = over.unitMerchandiseMinor ?? variantPriceMinor + modifierTotalMinor;
  return {
    menuItemId: over.menuItemId ?? 'item-1',
    variantId: over.variantId ?? 'var-1',
    name: over.name ?? 'Pizza',
    variantSize: over.variantSize ?? 'Large',
    quantity,
    variantPriceMinor,
    modifierTotalMinor,
    unitMerchandiseMinor,
    lineMerchandiseMinor: over.lineMerchandiseMinor ?? unitMerchandiseMinor * BigInt(quantity),
    currencyCode: over.currencyCode ?? 'INR',
    merchantId: over.merchantId ?? MERCHANT,
    restaurantId: over.restaurantId ?? RESTAURANT,
  };
}

function tax(over: Partial<TaxRule> = {}): TaxRule {
  return {
    id: over.id ?? 'tax-1',
    code: over.code ?? 'VAT-EXCL',
    rateBps: over.rateBps ?? 1000,
    mode: over.mode ?? 'EXCLUSIVE',
    merchantId: over.merchantId ?? MERCHANT,
    restaurantId: over.restaurantId ?? RESTAURANT,
  };
}

function fee(over: Partial<FeeRule> = {}): FeeRule {
  return {
    id: over.id ?? 'fee-1',
    type: over.type ?? 'PACKAGING',
    amountMinor: over.amountMinor ?? 200n,
    recipient: over.recipient ?? 'MERCHANT',
    taxTreatment: over.taxTreatment ?? 'NONE',
    merchantId: over.merchantId ?? MERCHANT,
    restaurantId: over.restaurantId ?? RESTAURANT,
  };
}

describe('composeCommercialQuote (Stage D)', () => {
  it('uses variant and modifier amounts as merchandise only', () => {
    const quote = composeCommercialQuote({
      lines: [line()],
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    expect(quote.merchandiseSubtotalMinor).toBe(21000n);
    expect(quote.discountMinor).toBe(0n);
    expect(quote.taxableSubtotalMinor).toBe(21000n);
    expect(quote.taxes).toEqual([]);
    expect(quote.taxTotalMinor).toBe(0n);
    expect(quote.fees).toEqual([]);
    expect(quote.feeTotalMinor).toBe(0n);
    expect(quote.grandTotalMinor).toBe(21000n);
  });

  it('multiplies unit merchandise by quantity', () => {
    const quote = composeCommercialQuote({
      lines: [line({ quantity: 3, variantPriceMinor: 2500n, modifierTotalMinor: 0n })],
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    expect(quote.merchandiseSubtotalMinor).toBe(7500n);
    expect(quote.grandTotalMinor).toBe(7500n);
  });

  it('places discount before tax and keeps tax/fee separate', () => {
    const quote = composeCommercialQuote({
      lines: [line({ quantity: 1, variantPriceMinor: 10000n, modifierTotalMinor: 0n })],
      discountMinor: 1000n,
      taxRules: [tax({ rateBps: 1000 })],
      feeRules: [fee({ amountMinor: 250n })],
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    expect(quote.merchandiseSubtotalMinor).toBe(10000n);
    expect(quote.discountMinor).toBe(1000n);
    expect(quote.taxableSubtotalMinor).toBe(9000n);
    expect(quote.taxTotalMinor).toBe(900n);
    expect(quote.feeTotalMinor).toBe(250n);
    expect(quote.grandTotalMinor).toBe(10150n);
    expect(quote.taxes[0]?.code).toBe('VAT-EXCL');
    expect(quote.fees[0]?.type).toBe('PACKAGING');
  });

  it('floors exclusive tax per line (deterministic rounding)', () => {
    const quote = composeCommercialQuote({
      lines: [line({ quantity: 1, variantPriceMinor: 999n, modifierTotalMinor: 0n })],
      taxRules: [tax({ rateBps: 1800 }), tax({ id: 'tax-2', code: 'LOCAL', rateBps: 500 })],
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    // 999 * 1800 / 10000 = 179.82 → 179; 999 * 500 / 10000 = 49.95 → 49
    expect(quote.taxes.map((t) => t.amountMinor)).toEqual([179n, 49n]);
    expect(quote.taxTotalMinor).toBe(228n);
    expect(quote.grandTotalMinor).toBe(1227n);
  });

  it('does not classify tax from a charge display name', () => {
    const quote = composeCommercialQuote({
      lines: [line({ name: 'GST Service Tax', quantity: 1, modifierTotalMinor: 0n })],
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    expect(quote.taxes).toEqual([]);
    expect(quote.taxTotalMinor).toBe(0n);
    expect(quote.grandTotalMinor).toBe(quote.merchandiseSubtotalMinor);
  });

  it('fails closed on invalid tax configuration', () => {
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        taxRules: [tax({ code: '' })],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/tax rule code/);
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        taxRules: [tax({ rateBps: -1 })],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/rateBps/);
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        taxRules: [{ ...tax(), mode: 'INCLUSIVE' as TaxRule['mode'] }],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/exclusive tax mode/);
  });

  it('fails closed on unsupported or invalid fees', () => {
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        feeRules: [{ ...fee(), type: 'DELIVERY' as FeeRule['type'] }],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/unsupported fee type/);
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        feeRules: [{ ...fee(), taxTreatment: 'TAXABLE' as FeeRule['taxTreatment'] }],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/tax treatment/);
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        feeRules: [fee({ amountMinor: -1n })],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/fee amount/);
  });

  it('rejects cross-tenant tax/fee rules', () => {
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        taxRules: [tax({ merchantId: OTHER_MERCHANT, restaurantId: OTHER_RESTAURANT })],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/does not belong/);
    expect(() =>
      composeCommercialQuote({
        lines: [line({ merchantId: OTHER_MERCHANT, restaurantId: OTHER_RESTAURANT })],
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/does not match/);
  });

  it('rejects non-zero delivery (not implemented)', () => {
    expect(() =>
      composeCommercialQuote({
        lines: [line()],
        deliveryChargeMinor: 1n,
        merchantId: MERCHANT,
        restaurantId: RESTAURANT,
      }),
    ).toThrow(/delivery pricing/);
  });

  it('rejects caller-supplied tax/fee/delivery', () => {
    expect(() => assertCallerChargesNotAuthoritative({ taxTotalMinor: 1n })).toThrow(
      /taxTotalMinor/,
    );
    expect(() => assertCallerChargesNotAuthoritative({ feeTotalMinor: 5n })).toThrow(
      /feeTotalMinor/,
    );
    expect(() => assertCallerChargesNotAuthoritative({ deliveryChargeMinor: 9n })).toThrow(
      /deliveryChargeMinor/,
    );
    expect(() =>
      assertCallerChargesNotAuthoritative({
        taxTotalMinor: 0n,
        feeTotalMinor: 0n,
        deliveryChargeMinor: 0n,
      }),
    ).not.toThrow();
  });

  it('snapshots totals as strings so catalog changes cannot rewrite history', () => {
    const quote = composeCommercialQuote({
      lines: [
        lineFromOrderItem({
          nameSnapshot: 'Paneer',
          unitPriceMinor: 25000n,
          quantity: 2,
          currencyCode: 'INR',
          merchantId: MERCHANT,
          restaurantId: RESTAURANT,
        }),
      ],
      discountMinor: 5000n,
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    const snap = snapshotCommercial(quote);
    expect(snap.schema).toBe('commercial.v1');
    expect(snap.merchandiseSubtotalMinor).toBe('50000');
    expect(snap.discountMinor).toBe('5000');
    expect(snap.taxableSubtotalMinor).toBe('45000');
    expect(snap.taxes).toEqual([]);
    expect(snap.fees).toEqual([]);
    expect(snap.grandTotalMinor).toBe('45000');
    expect(snap.lines[0]?.unitMerchandiseMinor).toBe('25000');
    expect(snap.lines[0]?.comboId).toBeNull();
  });

  it('lifts combo.v1 addOns onto the commercial snapshot line', () => {
    const quote = composeCommercialQuote({
      lines: [
        lineFromOrderItem({
          nameSnapshot: 'Meal',
          unitPriceMinor: 29900n,
          quantity: 1,
          currencyCode: 'INR',
          merchantId: MERCHANT,
          restaurantId: RESTAURANT,
          addOns: {
            schema: 'combo.v1',
            comboId: 'combo-1',
            components: [{ menuItemId: 'pizza', menuItemName: 'Pizza' }],
          },
        }),
      ],
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    expect(snapshotCommercial(quote).lines[0]?.comboId).toBe('combo-1');
    expect(snapshotCommercial(quote).lines[0]?.components).toEqual([
      { menuItemId: 'pizza', name: 'Pizza' },
    ]);
  });

  it('quotes a fixed combo as one merchandise line without a second calculator', () => {
    const quote = composeCommercialQuote({
      lines: [
        lineFromComboQuote({
          comboId: 'combo-1',
          name: 'Meal',
          quantity: 2,
          comboPriceMinor: 29900n,
          lineMerchandiseMinor: 59800n,
          currencyCode: 'INR',
          merchantId: MERCHANT,
          restaurantId: RESTAURANT,
          components: [{ menuItemId: 'pizza', name: 'Pizza' }],
        }),
      ],
      discountMinor: 1000n,
      merchantId: MERCHANT,
      restaurantId: RESTAURANT,
    });
    expect(quote.merchandiseSubtotalMinor).toBe(59800n);
    expect(quote.discountMinor).toBe(1000n);
    expect(quote.taxableSubtotalMinor).toBe(58800n);
    expect(quote.taxTotalMinor).toBe(0n);
    expect(quote.feeTotalMinor).toBe(0n);
    expect(quote.grandTotalMinor).toBe(58800n);
    expect(snapshotCommercial(quote).lines[0]?.comboId).toBe('combo-1');
  });
});
