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
  sku: string | null;
  uomId: string | null;
  priceMinor: bigint;
  currencyCode: string;
  pax: number | null;
  isDefault: boolean;
  available: boolean;
}

export interface ItemChannelConfigRecord {
  id: string;
  menuItemId: string;
  channel: OrderChannel;
  enabled: boolean;
  priceOverrideMinor: bigint | null;
  surcharges: unknown | null;
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

export interface MenuItemRecord {
  id: string;
  legacyId: string | null;
  merchantId: string;
  restaurantId: string;
  menuSectionId: string | null;
  name: string;
  description: string | null;
  availability: ItemAvailabilityName;
  isPublished: boolean;
  posItemId: string | null;
  deletedAt: Date | null;
}

/** Lineage for a merchant item that was copied from the Global Item Catalog. */
export interface GlobalCatalogSourceInfo {
  sourceItemId: string;
  sourceItemName: string;
  catalogId: string;
  catalogName: string;
}

/** A menu item with its full catalog sub-structure. */
export interface MenuItemDetail extends MenuItemRecord {
  variants: ItemVariantRecord[];
  channelConfigs: ItemChannelConfigRecord[];
  addOnGroups: AddOnGroupRecord[];
}

/** Staff item detail plus optional Global Catalog lineage (copy, not live sync). */
export interface StaffMenuItemDetail extends MenuItemDetail {
  globalSource: GlobalCatalogSourceInfo | null;
}

/** Consumer-visible catalog projection (Stage B). Same shape for Standard and Custom. */
export interface ConsumerCatalogItem {
  id: string;
  restaurantId: string;
  menuSectionId: string | null;
  name: string;
  description: string | null;
  availability: ItemAvailabilityName;
  isPublished: boolean;
  deletedAt: Date | null;
  channelEnabled: boolean | null;
  variants: Array<{
    id: string;
    size: string | null;
    sku: string | null;
    priceMinor: bigint;
    currencyCode: string;
    available: boolean;
  }>;
  groups: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number | null;
    allowQuantity: boolean;
    available: boolean;
    sortOrder: number;
    modifiers: Array<{
      id: string;
      name: string;
      priceMinor: bigint;
      currencyCode: string;
      available: boolean;
      isDefault: boolean;
      sortOrder: number;
      variantPrices: Array<{ variantId: string; priceMinor: bigint }>;
    }>;
  }>;
}

/** Catalog line used to reprice cart/checkout (doc 90). Never trust client totals. */
export interface CheckoutCatalogLine {
  variantId: string;
  menuItemId: string;
  restaurantId: string;
  merchantId: string;
  name: string;
  size: string | null;
  priceMinor: bigint;
  currencyCode: string;
  availability: ItemAvailabilityName;
  isPublished: boolean;
  deletedAt: Date | null;
  variantAvailable: boolean;
  channelEnabled: boolean | null;
  channelPriceOverrideMinor: bigint | null;
}
