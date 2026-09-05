import { rupeesToMinor } from './global-item-payload';

export { rupeesToMinor };

export function minorToRupees(minor: string | number | null | undefined): string {
  const n = Number(minor ?? 0);
  if (!Number.isFinite(n)) return '';
  return String(n / 100);
}

export const ITEM_AVAILABILITIES = ['AVAILABLE', 'SOLDOUT', 'NOTAVAILABLE'] as const;

export function parseNonNegativeInt(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

export function parseOptionalMaxSelect(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function requiredFromMinSelect(minSelect: number): boolean {
  return minSelect >= 1;
}

export function singleSelectFromMax(maxSelect: number | null): boolean {
  return maxSelect === 1;
}

export function catalogRestaurantHref(path: string, restaurantId?: string): string {
  if (!restaurantId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}restaurantId=${encodeURIComponent(restaurantId)}`;
}

export function buildScratchItemPayload(input: {
  restaurantId: string;
  name: string;
  description?: string;
  menuSectionId?: string;
  size?: string;
  sku?: string;
  priceRupees?: string;
  homeDeliveryEnabled?: boolean;
}): {
  restaurantId: string;
  name: string;
  description: string | null;
  menuSectionId: string | null;
  isPublished: false;
  availability: 'AVAILABLE';
  variants?: Array<{
    size: string;
    sku?: string;
    priceMinor: string;
    currencyCode: 'INR';
    isDefault: true;
    available: true;
  }>;
  channelConfigs?: Array<{ channel: 'HOME_DELIVERY'; enabled: true }>;
} {
  const priceMinor = rupeesToMinor(input.priceRupees);
  const variants = priceMinor
    ? [
        {
          size: input.size?.trim() || 'Regular',
          ...(input.sku?.trim() ? { sku: input.sku.trim() } : {}),
          priceMinor,
          currencyCode: 'INR' as const,
          isDefault: true as const,
          available: true as const,
        },
      ]
    : undefined;
  const channelConfigs = input.homeDeliveryEnabled
    ? [{ channel: 'HOME_DELIVERY' as const, enabled: true as const }]
    : undefined;
  return {
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    menuSectionId: input.menuSectionId || null,
    isPublished: false,
    availability: 'AVAILABLE',
    ...(variants ? { variants } : {}),
    ...(channelConfigs ? { channelConfigs } : {}),
  };
}
