/**
 * Stage A merchandise configuration (doc 103 / 104).
 *
 * Item = commercial product identity.
 * Variant = sellable variation (size is the evidenced axis).
 * Modifier group / modifier = configuration of a chosen variant — not a child SKU.
 *
 * Formula (integer minor units only):
 *   unitMerchandiseMinor = variantPriceMinor + Σ (modifierPriceMinor × modifierQty)
 *   lineMerchandiseMinor = unitMerchandiseMinor × lineQuantity
 *
 * Clients send identity + quantities. Prices are resolved from catalog.
 * Tax, fees, surcharges, promotions, delivery, tip, and donation are out of scope.
 */

export const MERCHANDISE_SNAPSHOT_SCHEMA = 'merchandise.v1' as const;

export type MerchandiseConfigErrorCode =
  | 'VARIANT_NOT_FOUND'
  | 'VARIANT_UNAVAILABLE'
  | 'ITEM_NOT_ORDERABLE'
  | 'CHANNEL_DISABLED'
  | 'UNKNOWN_GROUP'
  | 'UNKNOWN_MODIFIER'
  | 'MODIFIER_NOT_IN_GROUP'
  | 'MODIFIER_UNAVAILABLE'
  | 'GROUP_UNAVAILABLE'
  | 'INVALID_MODIFIER_QUANTITY'
  | 'QUANTITY_NOT_ALLOWED'
  | 'DUPLICATE_MODIFIER'
  | 'MIN_SELECTIONS'
  | 'MAX_SELECTIONS'
  | 'UNSUPPORTED_ADDON_PAYLOAD';

export class MerchandiseConfigurationError extends Error {
  constructor(
    readonly code: MerchandiseConfigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MerchandiseConfigurationError';
  }
}

export interface ModifierSelectionInput {
  modifierId: string;
  quantity?: number;
}

export interface ModifierGroupSelectionInput {
  groupId: string;
  selections: ModifierSelectionInput[];
}

export interface MerchandiseConfigurationInput {
  variantId: string;
  quantity: number;
  modifierGroups?: ModifierGroupSelectionInput[];
}

export interface CatalogModifier {
  id: string;
  groupId: string;
  name: string;
  defaultPriceMinor: bigint;
  available: boolean;
  isDefault: boolean;
  /** Override for the quoted variant; null/undefined → defaultPriceMinor. */
  variantPriceMinor: bigint | null;
}

export interface CatalogModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  available: boolean;
  allowQuantity: boolean;
  modifiers: CatalogModifier[];
}

export interface CatalogMerchandiseItem {
  menuItemId: string;
  merchantId: string;
  restaurantId: string;
  isPublished: boolean;
  deletedAt: Date | null;
  availability: 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';
  variant: {
    id: string;
    size: string | null;
    priceMinor: bigint;
    available: boolean;
    currencyCode: string;
  };
  /** null = no channel row (allowed). false = explicitly disabled. */
  channelEnabled: boolean | null;
  groups: CatalogModifierGroup[];
}

export interface QuotedModifierSelection {
  groupId: string;
  modifierId: string;
  name: string;
  quantity: number;
  priceAdjustmentMinor: bigint;
  lineAdjustmentMinor: bigint;
}

export interface MerchandiseQuote {
  variantId: string;
  menuItemId: string;
  restaurantId: string;
  merchantId: string;
  currencyCode: string;
  quantity: number;
  variantPriceMinor: bigint;
  modifierTotalMinor: bigint;
  unitMerchandiseMinor: bigint;
  lineMerchandiseMinor: bigint;
  variantSize: string | null;
  itemName: string;
  selections: QuotedModifierSelection[];
}

export interface MerchandiseSnapshot {
  schema: typeof MERCHANDISE_SNAPSHOT_SCHEMA;
  variantId: string;
  modifierGroups: Array<{
    groupId: string;
    selections: Array<{
      modifierId: string;
      quantity: number;
      priceAdjustmentMinor: string;
    }>;
  }>;
}

export function resolveModifierPrice(modifier: CatalogModifier): bigint {
  return modifier.variantPriceMinor ?? modifier.defaultPriceMinor;
}

export function isRequiredGroup(group: CatalogModifierGroup): boolean {
  return group.minSelect >= 1;
}

export function isSingleSelectGroup(group: CatalogModifierGroup): boolean {
  return group.maxSelect === 1;
}

export function selectionCount(
  group: CatalogModifierGroup,
  selections: ReadonlyArray<{ quantity: number }>,
): number {
  if (group.allowQuantity) {
    return selections.reduce((sum, s) => sum + s.quantity, 0);
  }
  return selections.length;
}

/**
 * Parse the canonical cart/order customization payload.
 * Flat addon-id arrays and `{addon_id, option_id}` blobs are rejected (doc 103 G-MOD-2).
 * Price fields on the payload are ignored — they never override the catalog.
 */
export function parseModifierGroupSelections(raw: unknown): ModifierGroupSelectionInput[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (raw.every((entry) => typeof entry === 'string')) {
      throw new MerchandiseConfigurationError(
        'UNSUPPORTED_ADDON_PAYLOAD',
        'flat addon ids are not a valid merchandise configuration',
      );
    }
    return raw.map((entry) => parseGroupEntry(entry));
  }
  if (typeof raw !== 'object') {
    throw new MerchandiseConfigurationError(
      'UNSUPPORTED_ADDON_PAYLOAD',
      'merchandise configuration must be structured modifier groups',
    );
  }
  const obj = raw as Record<string, unknown>;
  if ('addon_id' in obj || 'option_id' in obj) {
    throw new MerchandiseConfigurationError(
      'UNSUPPORTED_ADDON_PAYLOAD',
      'legacy addon_id/option_id payloads are not accepted',
    );
  }
  if (Array.isArray(obj.modifierGroups)) {
    return obj.modifierGroups.map(parseGroupEntry);
  }
  throw new MerchandiseConfigurationError(
    'UNSUPPORTED_ADDON_PAYLOAD',
    'merchandise configuration must include modifierGroups',
  );
}

function parseGroupEntry(entry: unknown): ModifierGroupSelectionInput {
  if (!entry || typeof entry !== 'object') {
    throw new MerchandiseConfigurationError(
      'UNSUPPORTED_ADDON_PAYLOAD',
      'each modifier group must be an object',
    );
  }
  const group = entry as Record<string, unknown>;
  if (typeof group.groupId !== 'string' || group.groupId.length === 0) {
    throw new MerchandiseConfigurationError('UNKNOWN_GROUP', 'groupId is required');
  }
  const rawSelections = Array.isArray(group.selections) ? group.selections : [];
  return {
    groupId: group.groupId,
    selections: rawSelections.map((sel) => {
      if (!sel || typeof sel !== 'object') {
        throw new MerchandiseConfigurationError(
          'UNSUPPORTED_ADDON_PAYLOAD',
          'each selection must be an object',
        );
      }
      const row = sel as Record<string, unknown>;
      if (typeof row.modifierId !== 'string' || row.modifierId.length === 0) {
        throw new MerchandiseConfigurationError('UNKNOWN_MODIFIER', 'modifierId is required');
      }
      const quantity =
        row.quantity === undefined || row.quantity === null ? 1 : Number(row.quantity);
      return { modifierId: row.modifierId, quantity };
    }),
  };
}

export function quoteMerchandise(
  catalog: CatalogMerchandiseItem,
  input: MerchandiseConfigurationInput,
  itemName: string,
): MerchandiseQuote {
  assertOrderable(catalog, input.variantId);
  assertRequiredGroupsSelectable(catalog);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new MerchandiseConfigurationError(
      'INVALID_MODIFIER_QUANTITY',
      'line quantity must be a positive integer',
    );
  }

  const submitted = indexSubmittedGroups(input.modifierGroups ?? []);
  const quoted: QuotedModifierSelection[] = [];
  let modifierTotal = 0n;

  for (const group of catalog.groups) {
    const explicit = submitted.get(group.id);
    if (!group.available) {
      if (explicit && explicit.selections.length > 0) {
        throw new MerchandiseConfigurationError(
          'GROUP_UNAVAILABLE',
          `modifier group ${group.id} is not available`,
        );
      }
      if (isRequiredGroup(group)) {
        throw new MerchandiseConfigurationError(
          'ITEM_NOT_ORDERABLE',
          `required modifier group ${group.id} is not available`,
        );
      }
      continue;
    }

    const resolved = explicit
      ? normalizeSelections(group, explicit.selections)
      : defaultSelections(group);
    const count = selectionCount(group, resolved);
    if (count < group.minSelect) {
      throw new MerchandiseConfigurationError(
        'MIN_SELECTIONS',
        `modifier group ${group.id} requires at least ${group.minSelect} selection(s)`,
      );
    }
    if (group.maxSelect != null && count > group.maxSelect) {
      throw new MerchandiseConfigurationError(
        'MAX_SELECTIONS',
        `modifier group ${group.id} allows at most ${group.maxSelect} selection(s)`,
      );
    }

    for (const sel of resolved) {
      const modifier = requireModifier(group, sel.modifierId);
      const price = resolveModifierPrice(modifier);
      const lineAdjustment = price * BigInt(sel.quantity);
      modifierTotal += lineAdjustment;
      quoted.push({
        groupId: group.id,
        modifierId: modifier.id,
        name: modifier.name,
        quantity: sel.quantity,
        priceAdjustmentMinor: price,
        lineAdjustmentMinor: lineAdjustment,
      });
    }
  }

  for (const groupId of submitted.keys()) {
    if (!catalog.groups.some((g) => g.id === groupId)) {
      throw new MerchandiseConfigurationError(
        'UNKNOWN_GROUP',
        `modifier group ${groupId} does not belong to this item`,
      );
    }
  }

  const unit = catalog.variant.priceMinor + modifierTotal;
  return {
    variantId: catalog.variant.id,
    menuItemId: catalog.menuItemId,
    restaurantId: catalog.restaurantId,
    merchantId: catalog.merchantId,
    currencyCode: catalog.variant.currencyCode,
    quantity: input.quantity,
    variantPriceMinor: catalog.variant.priceMinor,
    modifierTotalMinor: modifierTotal,
    unitMerchandiseMinor: unit,
    lineMerchandiseMinor: unit * BigInt(input.quantity),
    variantSize: catalog.variant.size,
    itemName,
    selections: quoted,
  };
}

export function snapshotMerchandise(quote: MerchandiseQuote): MerchandiseSnapshot {
  const byGroup = new Map<string, MerchandiseSnapshot['modifierGroups'][number]>();
  for (const sel of quote.selections) {
    const existing = byGroup.get(sel.groupId) ?? { groupId: sel.groupId, selections: [] };
    existing.selections.push({
      modifierId: sel.modifierId,
      quantity: sel.quantity,
      priceAdjustmentMinor: sel.priceAdjustmentMinor.toString(),
    });
    byGroup.set(sel.groupId, existing);
  }
  return {
    schema: MERCHANDISE_SNAPSHOT_SCHEMA,
    variantId: quote.variantId,
    modifierGroups: [...byGroup.values()],
  };
}

function assertRequiredGroupsSelectable(catalog: CatalogMerchandiseItem): void {
  for (const group of catalog.groups) {
    if (!isRequiredGroup(group)) continue;
    const availableCount = group.modifiers.filter((modifier) => modifier.available).length;
    if (!group.available || availableCount < group.minSelect) {
      throw new MerchandiseConfigurationError(
        'ITEM_NOT_ORDERABLE',
        `required modifier group ${group.id} has no valid available selection`,
      );
    }
  }
}

function assertOrderable(catalog: CatalogMerchandiseItem, variantId: string): void {
  if (catalog.variant.id !== variantId) {
    throw new MerchandiseConfigurationError('VARIANT_NOT_FOUND', 'variant does not match catalog');
  }
  if (catalog.deletedAt !== null || !catalog.isPublished || catalog.availability !== 'AVAILABLE') {
    throw new MerchandiseConfigurationError('ITEM_NOT_ORDERABLE', 'item is not orderable');
  }
  if (!catalog.variant.available) {
    throw new MerchandiseConfigurationError('VARIANT_UNAVAILABLE', 'variant is not available');
  }
  if (catalog.channelEnabled === false) {
    throw new MerchandiseConfigurationError(
      'CHANNEL_DISABLED',
      'item is not enabled for this order type',
    );
  }
}

function indexSubmittedGroups(
  groups: ModifierGroupSelectionInput[],
): Map<string, ModifierGroupSelectionInput> {
  const map = new Map<string, ModifierGroupSelectionInput>();
  for (const group of groups) {
    if (map.has(group.groupId)) {
      throw new MerchandiseConfigurationError(
        'DUPLICATE_MODIFIER',
        `modifier group ${group.groupId} was submitted more than once`,
      );
    }
    map.set(group.groupId, group);
  }
  return map;
}

function defaultSelections(group: CatalogModifierGroup): Array<{ modifierId: string; quantity: number }> {
  return group.modifiers
    .filter((m) => m.isDefault && m.available)
    .map((m) => ({ modifierId: m.id, quantity: 1 }));
}

function normalizeSelections(
  group: CatalogModifierGroup,
  selections: ModifierSelectionInput[],
): Array<{ modifierId: string; quantity: number }> {
  const seen = new Set<string>();
  const resolved: Array<{ modifierId: string; quantity: number }> = [];
  for (const sel of selections) {
    if (seen.has(sel.modifierId)) {
      throw new MerchandiseConfigurationError(
        'DUPLICATE_MODIFIER',
        `modifier ${sel.modifierId} was selected more than once`,
      );
    }
    seen.add(sel.modifierId);
    const quantity = sel.quantity === undefined ? 1 : sel.quantity;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new MerchandiseConfigurationError(
        'INVALID_MODIFIER_QUANTITY',
        'modifier quantity must be a positive integer',
      );
    }
    if (!group.allowQuantity && quantity !== 1) {
      throw new MerchandiseConfigurationError(
        'QUANTITY_NOT_ALLOWED',
        `modifier group ${group.id} does not allow quantity > 1`,
      );
    }
    const modifier = requireModifier(group, sel.modifierId);
    if (!modifier.available) {
      throw new MerchandiseConfigurationError(
        'MODIFIER_UNAVAILABLE',
        `modifier ${sel.modifierId} is not available`,
      );
    }
    resolved.push({ modifierId: sel.modifierId, quantity });
  }
  return resolved;
}

function requireModifier(group: CatalogModifierGroup, modifierId: string): CatalogModifier {
  const modifier = group.modifiers.find((m) => m.id === modifierId);
  if (!modifier) {
    throw new MerchandiseConfigurationError(
      'MODIFIER_NOT_IN_GROUP',
      `modifier ${modifierId} does not belong to group ${group.id}`,
    );
  }
  return modifier;
}
