/**
 * Stage A product snapshot copied during Global → Merchant materialization.
 * Stored on platform_catalog_items.source_payload (copy, not live inheritance).
 */

import type { OrderChannel } from './catalog.types';

export interface MaterializationVariant {
  size?: string | null;
  sku?: string | null;
  priceMinor: bigint;
  currencyCode?: string;
  isDefault?: boolean;
  available?: boolean;
}

export interface MaterializationAddOn {
  name: string;
  priceMinor?: bigint;
  available?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  variantPrices?: Array<{ size?: string | null; sku?: string | null; priceMinor: bigint }>;
}

export interface MaterializationGroup {
  name: string;
  minSelect?: number;
  maxSelect?: number | null;
  allowQuantity?: boolean;
  available?: boolean;
  sortOrder?: number;
  addOns?: MaterializationAddOn[];
}

export interface MaterializationChannel {
  channel: OrderChannel;
  enabled?: boolean;
  priceOverrideMinor?: bigint | null;
}

export interface MaterializationProduct {
  variants?: MaterializationVariant[];
  addOnGroups?: MaterializationGroup[];
  channelConfigs?: MaterializationChannel[];
}

const CHANNELS = new Set<OrderChannel>([
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
]);

export function parseMaterializationProduct(sourcePayload: unknown): MaterializationProduct | null {
  const root = asObject(sourcePayload);
  if (!root) return null;
  const raw = asObject(root.product) ?? (root.variants || root.addOnGroups || root.channelConfigs ? root : null);
  if (!raw) return null;

  const variants = Array.isArray(raw.variants)
    ? raw.variants.map(parseVariant).filter((row): row is MaterializationVariant => row !== null)
    : [];
  const addOnGroups = Array.isArray(raw.addOnGroups)
    ? raw.addOnGroups.map(parseGroup).filter((row): row is MaterializationGroup => row !== null)
    : [];
  const channelConfigs = Array.isArray(raw.channelConfigs)
    ? raw.channelConfigs.map(parseChannel).filter((row): row is MaterializationChannel => row !== null)
    : [];
  if (!variants.length && !addOnGroups.length && !channelConfigs.length) return null;
  return { variants, addOnGroups, channelConfigs };
}

function parseVariant(value: unknown): MaterializationVariant | null {
  const row = asObject(value);
  if (!row) return null;
  const priceMinor = toMinor(row.priceMinor);
  if (priceMinor === null || priceMinor < 0n) return null;
  return {
    size: optionalString(row.size),
    sku: optionalString(row.sku),
    priceMinor,
    currencyCode: optionalString(row.currencyCode) ?? 'INR',
    isDefault: row.isDefault === true,
    available: row.available !== false,
  };
}

function parseGroup(value: unknown): MaterializationGroup | null {
  const row = asObject(value);
  if (!row || typeof row.name !== 'string' || !row.name.trim()) return null;
  return {
    name: row.name.trim(),
    minSelect: typeof row.minSelect === 'number' && row.minSelect >= 0 ? row.minSelect : 0,
    maxSelect:
      row.maxSelect === null || row.maxSelect === undefined
        ? null
        : typeof row.maxSelect === 'number'
          ? row.maxSelect
          : null,
    allowQuantity: row.allowQuantity === true,
    available: row.available !== false,
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    addOns: Array.isArray(row.addOns)
      ? row.addOns.map(parseAddOn).filter((addon): addon is MaterializationAddOn => addon !== null)
      : [],
  };
}

function parseAddOn(value: unknown): MaterializationAddOn | null {
  const row = asObject(value);
  if (!row || typeof row.name !== 'string' || !row.name.trim()) return null;
  const priceMinor = row.priceMinor === undefined ? 0n : toMinor(row.priceMinor);
  if (priceMinor === null || priceMinor < 0n) return null;
  return {
    name: row.name.trim(),
    priceMinor,
    available: row.available !== false,
    isDefault: row.isDefault === true,
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    variantPrices: Array.isArray(row.variantPrices)
      ? row.variantPrices
          .map((entry) => {
            const price = asObject(entry);
            const minor = price ? toMinor(price.priceMinor) : null;
            if (!price || minor === null || minor < 0n) return null;
            return {
              size: optionalString(price.size),
              sku: optionalString(price.sku),
              priceMinor: minor,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [],
  };
}

function parseChannel(value: unknown): MaterializationChannel | null {
  const row = asObject(value);
  if (!row || typeof row.channel !== 'string' || !CHANNELS.has(row.channel as OrderChannel)) {
    return null;
  }
  const override =
    row.priceOverrideMinor === undefined || row.priceOverrideMinor === null
      ? null
      : toMinor(row.priceOverrideMinor);
  if (override !== null && override < 0n) return null;
  return {
    channel: row.channel as OrderChannel,
    enabled: row.enabled !== false,
    priceOverrideMinor: override,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toMinor(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return null;
}
