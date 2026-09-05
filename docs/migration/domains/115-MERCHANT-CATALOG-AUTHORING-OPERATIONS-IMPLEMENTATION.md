# 115 — Merchant Catalog Authoring & Operations — Implementation

**Status:** Smallest justified slice implemented on `replatform/backend-consolidation`.  
**Date:** 2026-09-05  
**Governing forensic contract:** [115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-RECONCILIATION.md](./115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-RECONCILIATION.md)  
**Gap matrix:** [115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-GAP-MATRIX.json](./115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-GAP-MATRIX.json)  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)

This document records what was implemented. It does **not** replace or reinterpret the forensic contract.

---

## 1. Starting HEAD

`c056433995962c654ca0ad29cb1d0dc83caeafc2` on `replatform/backend-consolidation`.

Accepted prior slices at that HEAD: Stages A–G implemented; Stage I Global → Merchant copy/materialization implemented; Stage J first slice (checkout address + `deliveryAddressSnapshot`) implemented; Stage 115 forensic-only.

## 2. Final HEAD

Documentation commit on `replatform/backend-consolidation`. A follow-up stamp records this file's commit SHA in §2.

## 3. Commits

| SHA | Message |
|---|---|
| `0276bd24afe64f25353cac581618b118b4ad7abf` | `feat(merchant): add catalog authoring UI for scratch items` |
| `5442cc44d24d1019d0da5d534680665a5a6ec3be` | `fix(catalog): serialize remaining catalog write money as strings` |
| `ef728458e30898036487142cd332009e3da5645e` | `feat(catalog): show merchant vs Global-import origin on item lists` |
| this commit | implementation record + `00` index pointer |

## 4. Files changed (implementation slice)

Relative to starting HEAD `c056433`:

| File | Change |
|---|---|
| `apps/merchant/src/App.tsx` | Routes for `/catalog/menus` and `/catalog/items/new` (before `:itemId`) |
| `apps/merchant/src/lib/api.ts` | Existing `/catalog` write methods + types |
| `apps/merchant/src/lib/catalog-form.ts` | Scratch payload + rupee↔minor helpers |
| `apps/merchant/src/lib/catalog-form.test.ts` | Focused form-helper tests |
| `apps/merchant/src/screens/MerchantCatalogScreen.tsx` | Create / Add from Global / Custom Menus CTAs; origin badges |
| `apps/merchant/src/screens/CreateItemScreen.tsx` | Path B scratch draft create |
| `apps/merchant/src/screens/MerchantItemDetailScreen.tsx` | Identity, publish, availability, section, variants, modifiers, channels |
| `apps/merchant/src/screens/MerchantMenusScreen.tsx` | Custom Menu + section CRUD/reorder via existing APIs |
| `apps/merchant/src/screens/AddFromGlobalScreen.tsx` | Preserve Stage I; keep `restaurantId` query |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Serialize remaining write responses that contain BigInt money |
| `apps/api/src/modules/catalog/application/catalog.service.ts` | Attach existing Global lineage to restaurant item lists |
| `apps/api/src/modules/catalog/application/catalog.service.spec.ts` | List lineage + SUPER_ADMIN restaurant-list isolation |
| `apps/api/test/stage-115-merchant-catalog-authoring.e2e-spec.ts` | Focused HTTP e2e for Path A + Path B + isolation |
| `docs/migration/domains/115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-IMPLEMENTATION.md` | This record |
| `docs/migration/00-BEHAVIORAL-RECONCILIATION-RULE.md` | Index pointer only |

No Prisma schema file. No migration. No new app. No consumer catalog engine.

## 5. APIs reused

No new HTTP resources. Merchant UI calls the existing staff `/api/v1/catalog` and Stage I `/api/v1/platform-catalog` surfaces:

| Capability | Existing endpoint |
|---|---|
| List restaurants | `GET /catalog/restaurants` |
| List / get items | `GET /catalog/restaurants/:id/items`, `GET /catalog/items/:id` |
| Scratch create | `POST /catalog/items` (`isPublished: false`) |
| Edit / publish / availability / section | `PATCH /catalog/items/:id` |
| Variants (SIZE) | `POST /catalog/items/:id/variants`, `PATCH /catalog/variants/:id` |
| Channels | `PATCH /catalog/items/:id/channel-config` |
| Modifier groups | `POST /catalog/items/:id/add-on-groups`, `PATCH /catalog/add-on-groups/:id` |
| Add-ons / variant prices | `POST …/add-ons`, `PATCH /catalog/add-ons/:id`, `POST …/variant-prices` |
| Custom Menus / sections | `POST/PATCH /catalog/menus`, `POST/PATCH /catalog/sections`, `POST …/sections/reorder` |
| Global browse + copy | `GET /platform-catalog/global*`, `POST /platform-catalog/global-items/:id/materialize` |
| Consumer visibility / quote | existing `GET /discover/items/:id`, `GET /discover/restaurants/:id/menu`, `POST /discover/quote` |

Consumer orderability remains Stage C. Commercial quote remains Stage D. Promotions remain Stage E. Combo remains Stage F. Cross-sell remains Stage G.

## 6. UI implemented

Existing `apps/merchant` shell, Inter / `--ame-*` tokens, existing `Button` / `Card` / `Field` / `Badge` / `Banner`.

Operational workflow (not a 9-step wizard):

`Catalog → Create item | Add from Global | Custom Menus → Item → Variants → Modifiers → Channels → Availability → Publish`

| Screen | Behavior |
|---|---|
| Merchant Catalog | Restaurant-scoped list. Origin badge (merchant-created vs imported). Unpublished vs published vs availability. |
| Create item | Name, description, optional Custom Menu section, optional first variant + HOME_DELIVERY. Always starts unpublished. Global Catalog is not required. |
| Item detail | Distinguishes merchant-created vs Global copy. Banner: merchant edits do not mutate the Global source. Save identity / publication / Stage C availability / one `menuSectionId`. Variant add/edit (no delete). Modifier groups/add-ons/`AddOnVariantPrice`. Channel enable/disable. |
| Custom Menus | List/create CUSTOM menus, visibility, rename, sections, reorder via existing `sortOrder` API. No M:N membership. No menu-specific pricing. |
| Add from Global | Unchanged Stage I Path A. |

## 7. Schema / migration status

**No migration. No schema change.**

The existing `Menu` → `MenuSection` → `MenuItem` → `ItemVariant` / `AddOnGroup` / `AddOn` / `AddOnVariantPrice` / `ItemChannelConfig` / `platform_catalog_item_materializations` graph already supported the accepted slice.

The only API-boundary change is JSON serialization of already-stored `BigInt` money on write responses that previously 500'd (`TypeError: Do not know how to serialize a BigInt`). That is not a data-model change.

## 8. Authorization model

Unchanged.

- Merchant writes use `JwtStaffGuard` + `StaffAuthorizationGuard` + `@RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')`.
- Tenant scope is derived from the server `StaffPrincipal` via `MerchantScopeService.assertRestaurantInScope`.
- Client `merchantId` is never trusted. Client `restaurantId` is only a target that must already be in scope.
- `CatalogService.listRestaurantsForStaff` rejects `SUPER_ADMIN` (`403`). Super Admin remains the Stage I `/platform-catalog` actor, not a merchant `/catalog` restaurant-list actor.
- Cross-merchant item writes remain `403`.

**Known pre-existing limitation (not changed):** `StaffAuthorizationGuard` short-circuits `SUPER_ADMIN` past `@RequireStaffRoles`. This slice does not alter that guard (OD-MCA-5 / “do not change owner/staff authorization”). Isolation is still enforced in `MerchantScopeService` / `listRestaurantsForStaff` for the restaurant list and cross-tenant writes.

## 9. Tests

Focused:

| Suite | Result |
|---|---|
| `apps/merchant` vitest (`catalog-form` + existing merchant tests) | **12 passed** |
| `catalog.service.spec.ts` | **9 passed** |
| `test/stage-115-merchant-catalog-authoring.e2e-spec.ts` | **3 passed** |

The Stage 115 e2e covers:

1. Merchant scratch create without Global Catalog
2. Edit name/description
3. Configure variant (size + SKU + minor-unit price)
4. Configure modifier group + add-on + `AddOnVariantPrice`
5. Configure `HOME_DELIVERY` channel
6. Change availability (`SOLDOUT` then `AVAILABLE`)
7. Publish
8. Unpublished item is consumer-hidden (`GET /discover/items/:id` → `404`)
9. Published + sold-out is visible but `orderable: false`; published + available + channel is `orderable: true`
10. Stage D quote uses server money (`unitMerchandiseMinor = '32400'`)
11. Global materialize still works
12. Merchant copy edit does not change the Global source
13. Cross-merchant write rejected
14. `SUPER_ADMIN` cannot list merchant `/catalog/restaurants`

Regressions run (not the entire repository):

| Suite | Result |
|---|---|
| `stage-a-merchandise` | PASS |
| `stage-b-menu-consistency` | PASS |
| `stage-c-availability` | PASS |
| `stage-d-commercial-quote` | PASS |
| `stage-e-promotion-phase-2` | PASS |
| `stage-f-combo-bundle` | PASS |
| `stage-g-upsell-crosssell` | PASS |
| `stage-i-global-catalog` | PASS |
| `stage-j-checkout-address` | PASS |

**9 suites / 63 tests passed.** The entire repository test suite was **not** run.

## 10. Browser validation

Headless Chrome against live `apps/merchant` `:5174`, `apps/web` `:5173`, and rebuilt `apps/api` `:3000` on seeded `amealio_dev`. Cursor `computerUse` was unavailable (spend-limit routing), so the same merchant / Global / consumer paths were driven through Chrome + the live UI.

| Flow | Result |
|---|---|
| Merchant login → Catalog → create scratch item → variant → modifier → channel → availability → publish | **PASS** (`S115 Browser Thali`, item `6cf420d7-d3ca-4bbb-aa96-a43dedfc685c`) |
| Global Catalog → Add to Merchant → edit copy → Global source unchanged | **PASS** (copy `76fa6ad8-b0b7-46d0-8d0a-d62f376b98ec` renamed `S115 Local Thali`; source `DEV Global Thali` / `1ccef9e3-c17a-427b-b342-6ecc401b6e6e` unchanged) |
| Consumer: unpublished hidden; published orderable → detail → quote → cart | **PASS** (hidden on restaurant menu before publish; visible + server quote ₹299 after publish; cart line `S115 Browser Thali`) |

Cursor `computerUse` GUI recording was not available in this environment. Screenshots from the Chrome walkthrough are the browser evidence.

## 11. Owner decisions deliberately left unresolved

No owner decision was assumed:

- OD-I-DUP
- OD-I-TEMP
- OD-MCA-1 (DELETE HTTP)
- OD-MCA-2 (invented `sortOrder` column/semantics — UI only uses the existing section reorder API)
- OD-MCA-3 (item-name uniqueness)
- OD-MCA-5 (owner/staff authorization redesign)
- OD-MCA-6 (optimistic concurrency tokens)
- OD-MCA-8 (modifier templates)
- OD-MCA-9 (media/upload)
- OD-MCA-11 (require a variant)
- OD-MCA-12 (Combo / Cross-sell authoring UI)
- G-MENU-4 (menu-specific pricing)

## 12. Deferred / out of slice

Seating, Book at Table, reservation, walk-in, waitlist, timer, events, celebrations, packages, experience booking, Stage H, Stage K, guest cart, maps/geo, advanced promotions / stacking, inventory/BOM, Chain Catalog, Global live sync, media upload, Combo authoring UI, Cross-sell authoring UI, scheduled availability, menu-specific pricing, numeric inventory, restaurant-level availability, variant×channel pricing, second product identity, M:N item↔menu membership.

## 13. Known limitations

- No variant DELETE (existing API does not expose a safe delete in this slice).
- No item DELETE.
- `PATCH /catalog/items/:id` write payload does not include `globalSource`; clients must `GET /catalog/items/:id` for lineage.
- SUPER_ADMIN role-decorator bypass is pre-existing; restaurant listing is still forbidden in `CatalogService`.
- Item list origin uses one extra lineage lookup per item (existing materialization table). Not live sync.
- Standard Menu remains virtual. Custom Menu is `Menu.type = CUSTOM`.
- Money display converts rupees → integer minor units in the client for input only. Quote remains server-authoritative.
