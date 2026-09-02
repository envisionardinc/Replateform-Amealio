/**
 * Menu & Catalog domain read models (P1.7.5).
 *
 * Mirror the EXISTING P1.4/P1.5 catalog tables (no schema change). Catalog is
 * MERCHANT_DEFINED (owned by merchant/restaurant); `MenuSection.categoryId`
 * optionally references the PLATFORM_DEFINED taxonomy (P1.7.4). Money is exact
 * integer minor units (`bigint`) — never floating point.
 *
 * Grounding (amealio-vendordashboard): `menu` (restaurant-scoped, `vendor_id`),
 * `menuCategory` (per-menu section → target MenuSection), `vendorItems`
 * (`size[]` = variants, addons, availability `status`, `menu_id`/`vendor_id`).
 */

export type MenuTypeName = 'STANDARD' | 'CUSTOM';
export type ItemAvailabilityName = 'AVAILABLE' | 'SOLDOUT' | 'NOTAVAILABLE';
export type OrderChannel =
  'DINE_IN' | 'TAKE_AWAY' | 'CURB_SIDE' | 'SKIP_LINE' | 'HOME_DELIVERY' | 'CATERING';

export interface MenuRecord {
  id: string;
  legacyId: string | null;
  merchantId: string;
  restaurantId: string;
  name: string;
  type: MenuTypeName;
  visibility: boolean;
  deletedAt: Date | null;
}

export interface MenuSectionRecord {
  id: string;
  menuId: string;
  categoryId: string | null; // optional platform Category (P1.7.4)
  name: string;
  sortOrder: number;
}

export interface ItemVariantRecord {
  id: string;
  menuItemId: string;
  size: string | null;
  uomId: string | null;
  priceMinor: bigint;
  currencyCode: string;
  pax: number | null;
}

export interface ItemChannelConfigRecord {
  id: string;
  menuItemId: string;
  channel: OrderChannel;
  enabled: boolean;
  priceOverrideMinor: bigint | null;
  surcharges: unknown | null;
}

export interface AddOnRecord {
  id: string;
  addOnGroupId: string;
  name: string;
  priceMinor: bigint;
  currencyCode: string;
}

export interface AddOnGroupRecord {
  id: string;
  menuItemId: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  addOns: AddOnRecord[];
}

export interface MenuItemRecord {
  id: string;
  legacyId: string | null;
  merchantId: string;
  restaurantId: string;
  menuSectionId: string | null;
  name: string;
  description: string | null;
  availability: ItemAvailabilityName;
  posItemId: string | null;
  deletedAt: Date | null;
}

/** A menu item with its full catalog sub-structure. */
export interface MenuItemDetail extends MenuItemRecord {
  variants: ItemVariantRecord[];
  channelConfigs: ItemChannelConfigRecord[];
  addOnGroups: AddOnGroupRecord[];
}
