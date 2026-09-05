/**
 * Catalog WRITE inputs (P1.7.18). Merchant-scoped create/update over the EXISTING
 * catalog hierarchy (Menu → MenuSection → MenuItem → ItemVariant /
 * ItemChannelConfig / AddOnGroup → AddOn). Money is exact integer minor units
 * (`bigint`). Publication (`isPublished`) is distinct from stock `availability`
 * (P1.7.17 DEC-3). No combos, no tax engine, no scheduling, no POS sync.
 */

export type OrderTypeName =
  'DINE_IN' | 'TAKE_AWAY' | 'CURB_SIDE' | 'SKIP_LINE' | 'HOME_DELIVERY' | 'CATERING';

export type ItemAvailabilityName = 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';
export type MenuTypeName = 'STANDARD' | 'CUSTOM';

// ---- Menu ----
export interface CreateMenuInput {
  restaurantId: string;
  name: string;
  description?: string | null;
  type?: MenuTypeName;
  visibility?: boolean;
  legacyId?: string | null;
}
export interface UpdateMenuInput {
  name?: string;
  description?: string | null;
  type?: MenuTypeName;
  visibility?: boolean;
}

// ---- Menu section ----
export interface CreateSectionInput {
  menuId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  categoryId?: string | null;
}
export interface UpdateSectionInput {
  name?: string;
  description?: string | null;
  sortOrder?: number;
  categoryId?: string | null;
}

// ---- Item + children ----
export interface VariantInput {
  size?: string | null;
  sku?: string | null;
  uomId?: string | null;
  priceMinor: bigint;
  currencyCode?: string;
  pax?: number | null;
  isDefault?: boolean;
  available?: boolean;
}
export interface ChannelConfigInput {
  channel: OrderTypeName;
  enabled?: boolean;
  priceOverrideMinor?: bigint | null;
  surcharges?: unknown | null;
}
export interface AddOnInput {
  name: string;
  priceMinor?: bigint;
  currencyCode?: string;
  available?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
}
export interface AddOnGroupInput {
  name: string;
  minSelect?: number;
  maxSelect?: number | null;
  allowQuantity?: boolean;
  available?: boolean;
  sortOrder?: number;
  addOns?: AddOnInput[];
}
export interface CreateItemInput {
  restaurantId: string;
  menuSectionId?: string | null;
  name: string;
  description?: string | null;
  availability?: ItemAvailabilityName;
  isPublished?: boolean;
  posItemId?: string | null;
  legacyId?: string | null;
  variants?: VariantInput[];
  channelConfigs?: ChannelConfigInput[];
  addOnGroups?: AddOnGroupInput[];
}
export interface UpdateItemInput {
  menuSectionId?: string | null;
  name?: string;
  description?: string | null;
  availability?: ItemAvailabilityName;
  isPublished?: boolean;
  posItemId?: string | null;
}

// ---- Records (write results) ----
export interface MenuRecord {
  id: string;
  merchantId: string;
  restaurantId: string;
  name: string;
  description: string | null;
  type: MenuTypeName;
  visibility: boolean;
  legacyId: string | null;
}
export interface SectionRecord {
  id: string;
  menuId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
}
export interface ItemVariantRecord {
  id: string;
  menuItemId: string;
  size: string | null;
  sku: string | null;
  uomId: string | null;
  priceMinor: bigint;
  currencyCode: string;
  pax: number | null;
  isDefault: boolean;
  available: boolean;
}
export interface ChannelConfigRecord {
  id: string;
  menuItemId: string;
  channel: OrderTypeName;
  enabled: boolean;
  priceOverrideMinor: bigint | null;
}
export interface AddOnVariantPriceRecord {
  id: string;
  addOnId: string;
  variantId: string;
  priceMinor: bigint;
}
export interface AddOnRecord {
  id: string;
  addOnGroupId: string;
  name: string;
  priceMinor: bigint;
  currencyCode: string;
  available: boolean;
  isDefault: boolean;
  sortOrder: number;
  variantPrices: AddOnVariantPriceRecord[];
}
export interface AddOnGroupRecord {
  id: string;
  menuItemId: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  allowQuantity: boolean;
  available: boolean;
  sortOrder: number;
  addOns: AddOnRecord[];
}
export interface ItemRecord {
  id: string;
  merchantId: string;
  restaurantId: string;
  menuSectionId: string | null;
  name: string;
  description: string | null;
  availability: ItemAvailabilityName;
  isPublished: boolean;
  posItemId: string | null;
  legacyId: string | null;
  variants: ItemVariantRecord[];
  channelConfigs: ChannelConfigRecord[];
  addOnGroups: AddOnGroupRecord[];
}
