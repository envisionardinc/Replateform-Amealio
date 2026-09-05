/**
 * Stage G merchandising relation (doc 110).
 *
 * CROSS_SELL is a merchant-authored complementary pair. It is not a variant,
 * modifier, combo, promotion, price, or personalized rank.
 */

export const MERCHANDISING_TYPES = ['CROSS_SELL'] as const;
export type MerchandisingRelationTypeName = (typeof MERCHANDISING_TYPES)[number];

export const MERCHANDISING_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MerchandisingRelationStatusName = (typeof MERCHANDISING_STATUSES)[number];

export const CONSUMER_CROSS_SELL_LIMIT = 8;

export class MerchandisingError extends Error {
  constructor(
    readonly code:
      | 'INVALID_PAIR'
      | 'INVALID_TYPE'
      | 'INVALID_STATUS'
      | 'SELF_RELATION'
      | 'TENANT_MISMATCH'
      | 'SOURCE_NOT_FOUND'
      | 'TARGET_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'MerchandisingError';
  }
}

export interface MerchandisingRelationRecord {
  id: string;
  merchantId: string;
  restaurantId: string;
  type: MerchandisingRelationTypeName;
  sourceItemId: string;
  targetItemId: string;
  sortOrder: number;
  status: MerchandisingRelationStatusName;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchandisingItemRef {
  id: string;
  merchantId: string;
  restaurantId: string;
  deletedAt: Date | null;
}

export function parseMerchandisingType(value: unknown): MerchandisingRelationTypeName {
  if (value === undefined || value === null || value === '') return 'CROSS_SELL';
  if (typeof value === 'string' && (MERCHANDISING_TYPES as readonly string[]).includes(value)) {
    return value as MerchandisingRelationTypeName;
  }
  throw new MerchandisingError('INVALID_TYPE', 'type must be CROSS_SELL');
}

export function parseMerchandisingStatus(value: unknown): MerchandisingRelationStatusName {
  if (value === undefined || value === null || value === '') return 'ACTIVE';
  if (typeof value === 'string' && (MERCHANDISING_STATUSES as readonly string[]).includes(value)) {
    return value as MerchandisingRelationStatusName;
  }
  throw new MerchandisingError('INVALID_STATUS', 'status must be ACTIVE or INACTIVE');
}

export function assertCrossSellPair(source: MerchandisingItemRef, target: MerchandisingItemRef): void {
  if (source.deletedAt) {
    throw new MerchandisingError('SOURCE_NOT_FOUND', 'source item is not available');
  }
  if (target.deletedAt) {
    throw new MerchandisingError('TARGET_NOT_FOUND', 'target item is not available');
  }
  if (source.id === target.id) {
    throw new MerchandisingError('SELF_RELATION', 'source and target must be different items');
  }
  if (source.merchantId !== target.merchantId || source.restaurantId !== target.restaurantId) {
    throw new MerchandisingError(
      'TENANT_MISMATCH',
      'source and target must belong to the same restaurant',
    );
  }
}

export function compareMerchandisingRelations(
  a: Pick<MerchandisingRelationRecord, 'sortOrder' | 'createdAt' | 'id'>,
  b: Pick<MerchandisingRelationRecord, 'sortOrder' | 'createdAt' | 'id'>,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function selectConsumerRelations<T extends MerchandisingRelationRecord>(
  rows: readonly T[],
  limit = CONSUMER_CROSS_SELL_LIMIT,
): T[] {
  return [...rows]
    .filter((row) => row.status === 'ACTIVE' && row.type === 'CROSS_SELL')
    .sort(compareMerchandisingRelations)
    .slice(0, limit);
}

export function requiresCustomization(groups: ReadonlyArray<{ minSelect: number }>): boolean {
  return groups.some((group) => group.minSelect >= 1);
}
