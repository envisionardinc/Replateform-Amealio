# 33 — Menu & Catalog Read Foundation (P1.7.5)

> **Status:** IMPLEMENTED — read foundation only. **No Prisma schema change** (the catalog schema was already complete; the reconciliation is confirmed). No menu CRUD/publishing, no controllers, no ordering/cart/checkout/payment/POS/discovery, no frontend. Auth (P1.7.1E/F), Merchant (P1.7.2), Subscription (P1.7.3), Taxonomy (P1.7.4) unchanged.
> **Grounding:** shared backend `amealio-vendordashboard` (`menu`/`menuCategory`/`vendorItems`) + the current target `prisma/schema.prisma`.

---

## 1. Legacy menu/catalog structures

- **`menu.model.ts`** — `name`, `description`, `type`, sections (`category_id → menuCategory`, items), **`restaurant → restaurant`**, **`vendor_id`**, `visibility`, `softOnboarding`. Restaurant-scoped, merchant-owned.
- **`menu-category.model.ts`** (`menuCategory`) — per-menu section (`ref: Menu`, `status`, tax config). = target `MenuSection` (NOT platform taxonomy — P1.7.4).
- **`vendor-items.model.ts`** (`vendorItems`) — `name`, `category → menuCategory`, `menu_id → Menu` (null = standard menu), **`vendor_id`**, `date_of_availability`, `description`, `veg`, `prepTime`, `status` (bool), **`size[]`** (`price`/`size`/`description`/`available` = variants), nested addon/modifier `sizes`, `personalization`, POS fields.

## 2. Ownership

**MERCHANT_DEFINED** — merchant/restaurant owns Menu/MenuSection/MenuItem/Variant/AddOns (`vendor_id`, `restaurant`). `MenuSection.categoryId` optionally references **PLATFORM_DEFINED** taxonomy (P1.7.4). Consumed by User (browse), Admin (oversight), Delivery (order lines), AI/RAG (reads `vendoritems`). The PLATFORM → MERCHANT → USER boundary is preserved; catalog is not moved into platform taxonomy, and `Category` is not duplicated.

## 3. Menu → Section → Item → Variant hierarchy

`Merchant → Restaurant → Menu → MenuSection (→ optional Category) → MenuItem → ItemVariant`. Implemented as read repositories over the existing tables; verified by integration tests (each relationship, ordered by `sortOrder`/`name`/`priceMinor`).

## 4. Add-on relationships

`MenuItem → AddOnGroup → AddOn`. `AddOnGroup` carries `minSelect`/`maxSelect` (read as data integrity — **not** cart-time validation). `AddOn` carries exact `priceMinor` (BigInt). Read via `findDetailById`.

## 5. Channel configuration

`ItemChannelConfig` = per-`OrderType` channel row (`channel`, `enabled`, `priceOverrideMinor?`, `surcharges Json?`), unique per `(menuItemId, channel)`. Read only; **no POS synchronization**, no channel behavior invented. `surcharges` JSON is preserved opaque.

## 6. Availability semantics

- **Menu:** `visibility` (bool) + `deletedAt` (soft-delete). `listByRestaurant(visibleOnly)` drops hidden + deleted.
- **MenuItem:** `availability` enum `ItemAvailability { AVAILABLE, SOLDOUT, NOTAVAILABLE }` + `deletedAt`. `listByRestaurant(availableOnly)` restricts to `AVAILABLE` and always excludes soft-deleted. Legacy `vendorItems.status` (bool) + `date_of_availability` + `size[].available` map onto these; the exact legacy→target availability mapping is an **import-time** concern (UNKNOWN §14). No new availability state was invented.

## 7. Platform taxonomy relationship

`MenuSection.categoryId → Category` is **optional** and preserved. `Category` is not made mandatory, not duplicated, and `menuCategory` remains represented by `MenuSection` (not conflated with platform `Category`).

## 8. Legacy IDs

`Menu.legacyId` and `MenuItem.legacyId` (`@unique`, already present) support `findByLegacyId` for a future controlled import. No import/backfill built.

## 9. Target Prisma mapping

| Legacy | Target | Notes |
|---|---|---|
| `menu` | `Menu` (`merchantId`,`restaurantId`,`name`,`type MenuType`,`visibility`,`legacyId`,`deletedAt`) | restaurant-scoped, merchant-owned |
| `menuCategory` | `MenuSection` (`menuId`,`categoryId?`,`name`,`sortOrder`) | per-menu section; optional platform Category |
| `vendorItems` | `MenuItem` (`merchantId`,`restaurantId`,`menuSectionId?`,`name`,`description`,`availability ItemAvailability`,`posItemId`,`legacyId`,`deletedAt`) | merchant-owned item |
| `vendorItems.size[]` | `ItemVariant` (`size`,`uomId?`,`priceMinor BigInt`,`currencyCode`,`pax?`) | exact minor-unit money |
| channel/POS pricing | `ItemChannelConfig` (`channel OrderType`,`enabled`,`priceOverrideMinor?`,`surcharges Json?`) | unique `(item,channel)` |
| addons/modifiers | `AddOnGroup` (`minSelect`,`maxSelect?`) → `AddOn` (`priceMinor`) | read-only |

**Target schema confirmed COMPLETE — no change made.**

## 10. Repository / service API

`apps/api/src/modules/catalog/`:
- **`MenuRepository`** — `findById`, `findByLegacyId`, `listByRestaurant(visibleOnly?)`, `listByMerchant`, `listSections(menuId)`.
- **`MenuItemRepository`** — `findById`, `findByLegacyId`, `listByRestaurant(availableOnly?)`, `listBySection`, `listVariants`, `listChannelConfigs`, `findDetailById` (variants + channel configs + add-on groups/add-ons).
- **`CatalogService`** — merchant-tenant-scoped reads: `getMenusForRestaurant`, `getMenuSections`, `getItemsForRestaurant`, `getItemDetail`. Read-only; no mutation/CRUD/controllers.

## 11. Tenancy behavior

Catalog is restaurant-scoped; `CatalogService` confines access to the authenticated staff's merchant via the P1.7.2 `MerchantScopeService.assertRestaurantInScope` over the server-derived `StaffPrincipal` (P1.7.1F). Merchant staff cannot read another merchant's catalog (403 `Cross-merchant access denied`); SUPER_ADMIN (merchantId = null) is platform-scoped (not confined). A request-supplied id is used only to reject a mismatch, never to grant. No JWT/claim/guard change.

## 12. Tests

10 real-DB integration (suite 172 → **182**, all green): menu identity + legacyId + ownership; list by restaurant/merchant; Menu→MenuSection + optional Category; MenuSection→MenuItem + item detail (variants/channels/add-ons + posItemId + min/max); **exact BigInt money** (variants/add-ons/channel override); `ItemChannelConfig` uniqueness per `(item,channel)`; availability filtering (SOLDOUT excluded) + soft-delete exclusion; missing/malformed-ref safety; **cross-merchant rejection** (menus/items/sections); SUPER_ADMIN platform access. P1.7.1E/F/2/3/4 suites unchanged and green.

## 13. Migration risks

- v1/v2 menu/item API disambiguation at import (`/user/menu` vs `/v2/user/menu`, `/vendor-items` vs `/v2/vendor-items`).
- `vendorItems.size[]` → `ItemVariant` mapping (calories/`size` numeric semantics; per-size `available`).
- Nested addon/modifier `sizes` → `AddOnGroup`/`AddOn` normalization.
- Legacy `status`(bool)/`date_of_availability`/`size[].available` → `ItemAvailability` mapping.
- Standard-menu items (`menu_id = null`) placement.
- Per-channel pricing + `surcharges` semantics; POS-linked items (`posItemId`).

## 14. UNKNOWNs

- Exact legacy→`ItemAvailability` mapping (bool `status` + `date_of_availability` + per-size `available`).
- `surcharges` JSON structure/consumers.
- Combos (`combo`/chain-catalogue) placement (not in this slice).
- Whether menu-level food taxonomy maps to `Category` `type` vs `RestaurantFeature` (P1.7.4 open).

## 15. Explicitly deferred downstream domains

Cart, Ordering, Checkout, Payment, Delivery, POS sync/webhooks, Discovery/search, Experience food, Celebrations, Events, Seating, AI, combos, menu CRUD/publishing + admin/merchant/user UI, Mongo import/backfill. ONDC remains DEFERRED — existing.

---

## Schema / validation

- **Schema/migrations:** unchanged (`git status -- prisma/` empty; `prisma validate` ✓; `migrate status` up to date). Reconciliation confirmed: catalog schema was already complete.
- **Application:** new `apps/api/src/modules/catalog/` (`MenuRepository`, `MenuItemRepository`, `CatalogService`, `CatalogModule` importing `MerchantModule`), registered in `AppModule`.
- **Validation:** `npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓ · `npm test` → **182/182** (24 suites) · `prisma validate` ✓ · `prisma migrate status` up to date.
- **Baseline evolution:** `docs/current-state/` lives on the forensic-audit branch (PR #21, not on this branch); menu ownership + v1/v2 canonicalization + size→variant mapping notes fold into `DATA-MODEL-INVENTORY.md` when integrated.
