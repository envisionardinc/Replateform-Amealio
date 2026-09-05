import type { CatalogModifier, CatalogModifierGroup, ModifierGroupPayload } from './api';

/** groupId → modifierId → quantity. Client UX only — the server still validates. */
export type SelectionMap = Record<string, Record<string, number>>;

export function initialSelections(groups: CatalogModifierGroup[]): SelectionMap {
  const next: SelectionMap = {};
  for (const group of groups) {
    next[group.id] = {};
    if (!group.available) continue;
    for (const modifier of group.modifiers) {
      if (modifier.available && modifier.isDefault) {
        next[group.id][modifier.id] = 1;
      }
    }
  }
  return next;
}

export function selectionCount(
  group: CatalogModifierGroup,
  selected: Record<string, number> | undefined,
): number {
  const quantities = Object.values(selected ?? {}).filter((qty) => qty > 0);
  if (group.allowQuantity) return quantities.reduce((sum, qty) => sum + qty, 0);
  return quantities.length;
}

export function catalogAdjustmentMinor(modifier: CatalogModifier, variantId: string): string {
  return (
    modifier.variantPrices.find((row) => row.variantId === variantId)?.priceMinor ??
    modifier.priceMinor
  );
}

export function toModifierGroupPayload(
  groups: CatalogModifierGroup[],
  state: SelectionMap,
): ModifierGroupPayload[] {
  return groups
    .filter((group) => group.available)
    .map((group) => ({
      groupId: group.id,
      selections: Object.entries(state[group.id] ?? {})
        .filter(([, quantity]) => quantity > 0)
        .map(([modifierId, quantity]) => ({ modifierId, quantity })),
    }));
}

export function toggleModifier(
  group: CatalogModifierGroup,
  selected: Record<string, number>,
  modifierId: string,
): { selected: Record<string, number>; error?: string } {
  const modifier = group.modifiers.find((row) => row.id === modifierId);
  if (!group.available || !modifier?.available) {
    return { selected, error: 'This option is not available' };
  }

  const current = Object.fromEntries(
    Object.entries(selected).filter(([, quantity]) => quantity > 0),
  );
  const existing = current[modifierId] ?? 0;

  if (group.singleSelect || group.maxSelect === 1) {
    if (existing > 0) {
      const cleared = { ...current };
      delete cleared[modifierId];
      if (selectionCount(group, cleared) < group.minSelect) {
        return { selected: current };
      }
      return { selected: cleared };
    }
    return { selected: { [modifierId]: 1 } };
  }

  if (existing > 0 && !group.allowQuantity) {
    const next = { ...current };
    delete next[modifierId];
    if (selectionCount(group, next) < group.minSelect) {
      return { selected: current, error: `Choose at least ${group.minSelect}` };
    }
    return { selected: next };
  }

  if (existing === 0) {
    const prospective = { ...current, [modifierId]: 1 };
    if (group.maxSelect != null && selectionCount(group, prospective) > group.maxSelect) {
      return { selected: current, error: `Choose at most ${group.maxSelect}` };
    }
    return { selected: prospective };
  }

  return { selected: current };
}

export function setModifierQuantity(
  group: CatalogModifierGroup,
  selected: Record<string, number>,
  modifierId: string,
  quantity: number,
): { selected: Record<string, number>; error?: string } {
  const modifier = group.modifiers.find((row) => row.id === modifierId);
  if (!group.available || !modifier?.available) {
    return { selected, error: 'This option is not available' };
  }
  if (!group.allowQuantity && quantity > 1) {
    return { selected, error: 'Quantity is not allowed for this group' };
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { selected, error: 'Quantity must be a whole number' };
  }

  const next = { ...selected };
  if (quantity === 0) {
    delete next[modifierId];
    if (selectionCount(group, next) < group.minSelect) {
      return { selected, error: `Choose at least ${group.minSelect}` };
    }
    return { selected: next };
  }

  next[modifierId] = quantity;
  if (group.maxSelect != null && selectionCount(group, next) > group.maxSelect) {
    return { selected, error: `Choose at most ${group.maxSelect}` };
  }
  return { selected: next };
}
