/**
 * Stage F food combo / meal-deal domain (doc 109).
 *
 * Combo is a bundle of MenuItem references with a fixed comboPriceMinor.
 * It is not a modifier group and not a Celebration Package.
 * composeCommercialQuote remains the only totals calculator.
 */

export const COMBO_SNAPSHOT_SCHEMA = 'combo.v1' as const;

export type ComboErrorCode =
  | 'COMBO_NOT_FOUND'
  | 'COMBO_UNAVAILABLE'
  | 'COMBO_NOT_PUBLISHED'
  | 'REQUIRED_COMPONENT_UNAVAILABLE'
  | 'INVALID_COMPONENT'
  | 'INVALID_SELECTION'
  | 'NESTED_COMBO_NOT_SUPPORTED'
  | 'CLIENT_MONEY_NOT_AUTHORITATIVE'
  | 'CROSS_TENANT_COMBO';

export class ComboError extends Error {
  constructor(
    readonly code: ComboErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ComboError';
  }
}

export interface ComboSelectionInput {
  slotId: string;
  menuItemId: string;
}

export interface ComboOptionRecord {
  id: string;
  menuItemId: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface ComboSlotRecord {
  id: string;
  name: string | null;
  sortOrder: number;
  options: ComboOptionRecord[];
}

export interface ComboComponentAvailability {
  menuItemId: string;
  restaurantId: string;
  merchantId: string;
  deletedAt: Date | null;
  isPublished: boolean;
  availability: 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';
  channelEnabled: boolean | null;
  hasAvailableVariant: boolean;
  name: string;
}

export interface ComboRecord {
  id: string;
  merchantId: string;
  restaurantId: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  availability: 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';
  substitutable: boolean;
  comboPriceMinor: bigint;
  currencyCode: string;
  sortOrder: number;
  deletedAt: Date | null;
  slots: ComboSlotRecord[];
  sectionIds: string[];
}

export interface ResolvedComboComponent {
  slotId: string;
  slotName: string | null;
  optionId: string;
  menuItemId: string;
  menuItemName: string;
}

export interface ComboQuote {
  comboId: string;
  restaurantId: string;
  merchantId: string;
  name: string;
  quantity: number;
  currencyCode: string;
  comboPriceMinor: bigint;
  unitMerchandiseMinor: bigint;
  lineMerchandiseMinor: bigint;
  modifierTotalMinor: bigint;
  components: ResolvedComboComponent[];
}

export function assertNoClientComboMoney(input: {
  comboPriceMinor?: bigint;
  discountMinor?: bigint;
  grandTotalMinor?: bigint;
}): void {
  if (input.comboPriceMinor !== undefined) {
    throw new ComboError('CLIENT_MONEY_NOT_AUTHORITATIVE', 'comboPriceMinor is server-derived');
  }
  if (input.discountMinor !== undefined && input.discountMinor !== 0n) {
    throw new ComboError('CLIENT_MONEY_NOT_AUTHORITATIVE', 'discountMinor is server-derived');
  }
  if (input.grandTotalMinor !== undefined && input.grandTotalMinor !== 0n) {
    throw new ComboError('CLIENT_MONEY_NOT_AUTHORITATIVE', 'grandTotalMinor is server-derived');
  }
}

export function isComboPublished(combo: ComboRecord): boolean {
  return combo.deletedAt === null && combo.isPublished;
}

export function isComboListed(combo: ComboRecord): boolean {
  return isComboPublished(combo);
}

export function componentOrderableForCombo(item: ComboComponentAvailability): boolean {
  return (
    item.deletedAt === null &&
    item.isPublished &&
    item.availability === 'AVAILABLE' &&
    item.channelEnabled !== false &&
    item.hasAvailableVariant
  );
}

export function defaultOption(slot: ComboSlotRecord): ComboOptionRecord | null {
  return (
    slot.options.find((option) => option.isDefault) ??
    [...slot.options].sort((a, b) => a.sortOrder - b.sortOrder)[0] ??
    null
  );
}

export function resolveSelections(
  combo: ComboRecord,
  selections: ComboSelectionInput[] | undefined,
): Array<{ slot: ComboSlotRecord; option: ComboOptionRecord }> {
  if (combo.slots.length === 0) {
    throw new ComboError('INVALID_COMPONENT', 'combo requires at least one component slot');
  }
  const bySlot = new Map((selections ?? []).map((row) => [row.slotId, row.menuItemId]));
  if (selections && new Set(selections.map((row) => row.slotId)).size !== selections.length) {
    throw new ComboError('INVALID_SELECTION', 'each combo slot may be selected once');
  }
  const resolved: Array<{ slot: ComboSlotRecord; option: ComboOptionRecord }> = [];
  for (const slot of [...combo.slots].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const chosenId = bySlot.get(slot.id);
    if (chosenId && !combo.substitutable) {
      const def = defaultOption(slot);
      if (!def || def.menuItemId !== chosenId) {
        throw new ComboError(
          'INVALID_SELECTION',
          'fixed combo does not allow component substitution',
        );
      }
    }
    const option = chosenId
      ? (slot.options.find((row) => row.menuItemId === chosenId) ?? null)
      : defaultOption(slot);
    if (!option) {
      throw new ComboError('INVALID_SELECTION', 'combo slot is missing a valid component');
    }
    if (combo.substitutable && !chosenId && selections && selections.length > 0) {
      throw new ComboError('INVALID_SELECTION', 'substitutable combo requires a pick per slot');
    }
    resolved.push({ slot, option });
  }
  if (combo.substitutable && selections && selections.length !== combo.slots.length) {
    throw new ComboError('INVALID_SELECTION', 'substitutable combo requires a pick per slot');
  }
  return resolved;
}

export function quoteCombo(input: {
  combo: ComboRecord;
  quantity: number;
  components: ComboComponentAvailability[];
  selections?: ComboSelectionInput[];
}): ComboQuote {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ComboError('INVALID_SELECTION', 'quantity must be a positive integer');
  }
  if (!isComboPublished(input.combo)) {
    throw new ComboError('COMBO_NOT_PUBLISHED', 'combo is not published');
  }
  if (input.combo.availability !== 'AVAILABLE') {
    throw new ComboError('COMBO_UNAVAILABLE', 'combo is not available');
  }
  if (input.combo.comboPriceMinor < 0n) {
    throw new ComboError('INVALID_COMPONENT', 'comboPriceMinor must be >= 0');
  }
  const byItem = new Map(input.components.map((row) => [row.menuItemId, row]));
  const picks = resolveSelections(input.combo, input.selections);
  const resolved: ResolvedComboComponent[] = [];
  for (const pick of picks) {
    const item = byItem.get(pick.option.menuItemId);
    if (!item) {
      throw new ComboError('INVALID_COMPONENT', 'combo component is not a catalog item');
    }
    if (
      item.restaurantId !== input.combo.restaurantId ||
      item.merchantId !== input.combo.merchantId
    ) {
      throw new ComboError('CROSS_TENANT_COMBO', 'combo component belongs to another merchant');
    }
    if (!componentOrderableForCombo(item)) {
      throw new ComboError(
        'REQUIRED_COMPONENT_UNAVAILABLE',
        'a required combo component is not available',
      );
    }
    resolved.push({
      slotId: pick.slot.id,
      slotName: pick.slot.name,
      optionId: pick.option.id,
      menuItemId: item.menuItemId,
      menuItemName: item.name,
    });
  }
  return {
    comboId: input.combo.id,
    restaurantId: input.combo.restaurantId,
    merchantId: input.combo.merchantId,
    name: input.combo.name,
    quantity: input.quantity,
    currencyCode: input.combo.currencyCode,
    comboPriceMinor: input.combo.comboPriceMinor,
    unitMerchandiseMinor: input.combo.comboPriceMinor,
    lineMerchandiseMinor: input.combo.comboPriceMinor * BigInt(input.quantity),
    modifierTotalMinor: 0n,
    components: resolved,
  };
}

export function comboIsOrderable(input: {
  combo: ComboRecord;
  components: ComboComponentAvailability[];
  selections?: ComboSelectionInput[];
}): boolean {
  try {
    quoteCombo({ ...input, quantity: 1 });
    return true;
  } catch (err) {
    if (err instanceof ComboError) return false;
    throw err;
  }
}

export function snapshotCombo(quote: ComboQuote) {
  return {
    schema: COMBO_SNAPSHOT_SCHEMA,
    comboId: quote.comboId,
    name: quote.name,
    quantity: quote.quantity,
    comboPriceMinor: quote.comboPriceMinor.toString(),
    unitMerchandiseMinor: quote.unitMerchandiseMinor.toString(),
    lineMerchandiseMinor: quote.lineMerchandiseMinor.toString(),
    currencyCode: quote.currencyCode,
    components: quote.components,
  };
}
