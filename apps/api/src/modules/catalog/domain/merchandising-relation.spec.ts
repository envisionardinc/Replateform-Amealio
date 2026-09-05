import {
  CONSUMER_CROSS_SELL_LIMIT,
  MerchandisingError,
  assertCrossSellPair,
  compareMerchandisingRelations,
  parseMerchandisingStatus,
  parseMerchandisingType,
  requiresCustomization,
  selectConsumerRelations,
  type MerchandisingRelationRecord,
} from './merchandising-relation';

const MERCHANT = '11111111-1111-4111-8111-111111111111';
const RESTAURANT = '22222222-2222-4222-8222-222222222222';

function item(id: string, over: Partial<{ merchantId: string; restaurantId: string; deletedAt: Date | null }> = {}) {
  return {
    id,
    merchantId: over.merchantId ?? MERCHANT,
    restaurantId: over.restaurantId ?? RESTAURANT,
    deletedAt: over.deletedAt ?? null,
  };
}

function rel(
  over: Partial<MerchandisingRelationRecord> = {},
): MerchandisingRelationRecord {
  return {
    id: over.id ?? 'rel-1',
    merchantId: MERCHANT,
    restaurantId: RESTAURANT,
    type: 'CROSS_SELL',
    sourceItemId: 'pizza',
    targetItemId: over.targetItemId ?? 'coke',
    sortOrder: over.sortOrder ?? 0,
    status: over.status ?? 'ACTIVE',
    createdAt: over.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: over.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('merchandising-relation domain', () => {
  it('defaults type to CROSS_SELL and rejects other types', () => {
    expect(parseMerchandisingType(undefined)).toBe('CROSS_SELL');
    expect(() => parseMerchandisingType('UPSELL')).toThrow(MerchandisingError);
    expect(() => parseMerchandisingType('UPSELL')).toThrow(/CROSS_SELL/);
  });

  it('rejects a self pair and a cross-tenant pair', () => {
    expect(() => assertCrossSellPair(item('pizza'), item('pizza'))).toThrow(/different/);
    expect(() =>
      assertCrossSellPair(
        item('pizza'),
        item('coke', { merchantId: '99999999-9999-4999-8999-999999999999' }),
      ),
    ).toThrow(/same restaurant/);
    expect(() =>
      assertCrossSellPair(item('pizza', { deletedAt: new Date() }), item('coke')),
    ).toThrow(/source item/);
    expect(() =>
      assertCrossSellPair(item('pizza'), item('coke', { deletedAt: new Date() })),
    ).toThrow(/target item/);
  });

  it('orders by sortOrder then createdAt then id and caps consumer results', () => {
    const rows = [
      rel({ id: 'b', sortOrder: 2, targetItemId: 'fries', createdAt: new Date('2026-01-02') }),
      rel({ id: 'a', sortOrder: 1, targetItemId: 'coke', createdAt: new Date('2026-01-03') }),
      rel({ id: 'c', sortOrder: 1, targetItemId: 'lassi', createdAt: new Date('2026-01-01') }),
      rel({ id: 'inactive', sortOrder: 0, status: 'INACTIVE', targetItemId: 'hidden' }),
    ];
    const selected = selectConsumerRelations(rows);
    expect(selected.map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(selectConsumerRelations(rows, 2).map((row) => row.id)).toEqual(['c', 'a']);
    expect(CONSUMER_CROSS_SELL_LIMIT).toBe(8);
    expect(compareMerchandisingRelations(rel({ id: 'a' }), rel({ id: 'b' }))).toBeLessThan(0);
  });

  it('parses status and detects required customization', () => {
    expect(parseMerchandisingStatus(undefined)).toBe('ACTIVE');
    expect(parseMerchandisingStatus('INACTIVE')).toBe('INACTIVE');
    expect(() => parseMerchandisingStatus('ARCHIVED')).toThrow(MerchandisingError);
    expect(requiresCustomization([{ minSelect: 0 }, { minSelect: 1 }])).toBe(true);
    expect(requiresCustomization([{ minSelect: 0 }])).toBe(false);
  });
});
