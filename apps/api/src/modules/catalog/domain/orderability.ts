/**
 * Stage B/C shared consumer visibility + orderability (docs 103 / 105 / 106).
 *
 * Published ≠ visible-on-channel ≠ available ≠ orderable ≠ in stock.
 * The same gates apply to Standard (virtual) and Custom menus.
 * This is not a scheduling engine and not a pricing engine.
 */

export type OrderabilityAvailability = 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';

export interface OrderabilityInput {
  deletedAt: Date | null;
  isPublished: boolean;
  availability: OrderabilityAvailability;
  /** false = ItemChannelConfig.enabled is false for the requested channel. */
  channelEnabled: boolean | null;
  variants: ReadonlyArray<{ available: boolean }>;
  groups: ReadonlyArray<{
    available: boolean;
    minSelect: number;
    modifiers?: ReadonlyArray<{ available: boolean }>;
  }>;
}

export function isPublishedVisible(
  input: Pick<OrderabilityInput, 'deletedAt' | 'isPublished'>,
): boolean {
  return input.deletedAt === null && input.isPublished;
}

export function isChannelAllowed(channelEnabled: boolean | null): boolean {
  return channelEnabled !== false;
}

export function hasSellableVariant(variants: ReadonlyArray<{ available: boolean }>): boolean {
  return variants.some((variant) => variant.available);
}

export function availableModifierCount(
  group: Readonly<{ modifiers?: ReadonlyArray<{ available: boolean }> }>,
): number {
  return (group.modifiers ?? []).filter((modifier) => modifier.available).length;
}

/**
 * Required groups must be offered and have enough currently available modifiers.
 * Optional groups never block orderability.
 * When modifiers are omitted (older callers), group.available is the only gate.
 */
export function requiredGroupsSelectable(
  groups: ReadonlyArray<{
    available: boolean;
    minSelect: number;
    modifiers?: ReadonlyArray<{ available: boolean }>;
  }>,
): boolean {
  return groups.every((group) => {
    if (group.minSelect < 1) return true;
    if (!group.available) return false;
    if (!group.modifiers) return true;
    return availableModifierCount(group) >= group.minSelect;
  });
}

/** @deprecated Stage B name; use requiredGroupsSelectable. */
export function requiredGroupsAvailable(
  groups: ReadonlyArray<{
    available: boolean;
    minSelect: number;
    modifiers?: ReadonlyArray<{ available: boolean }>;
  }>,
): boolean {
  return requiredGroupsSelectable(groups);
}

/** Consumer may see the item on a menu (publication only). */
export function isConsumerVisible(input: OrderabilityInput): boolean {
  return isPublishedVisible(input);
}

/**
 * Consumer may add the item to cart for the requested channel.
 * Stock, channel, variant, and required-group availability are separate from publication.
 */
export function isConsumerOrderable(input: OrderabilityInput): boolean {
  return (
    isConsumerVisible(input) &&
    input.availability === 'AVAILABLE' &&
    isChannelAllowed(input.channelEnabled) &&
    hasSellableVariant(input.variants) &&
    requiredGroupsSelectable(input.groups)
  );
}

/**
 * Channel-disabled items are omitted from a channel-scoped menu.
 * Without a channel, publication is the only list gate.
 */
export function appearsOnConsumerMenu(input: OrderabilityInput, channel?: string): boolean {
  if (!isConsumerVisible(input)) return false;
  if (channel && !isChannelAllowed(input.channelEnabled)) return false;
  return true;
}
