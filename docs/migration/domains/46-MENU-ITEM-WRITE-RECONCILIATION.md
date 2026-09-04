# P1.7.17 — Menu & Item Write Reconciliation

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no tests. Establishes the exact merchant/admin **Menu & Item WRITE contract** for P1.7.18 and resolves **DEC-3** (item availability / category-tax / combos) where source permits.
> **Authority:** legacy source (`amealio-vendordashboard` `menu.model.ts`/`menu-category.model.ts`/`vendor-items.model.ts`/`combo.model.ts`/`catalogue*`, `amealiodashboardmvp-` menu/item wizard) + target `replateform-amealio` (Prisma + P1.7.5 catalog read module, doc 33). Baseline **242/242**, unchanged.
> **Method:** frontend → API → service → persistence tracing with file:line evidence.

---

## 1. Executive Summary

- **Legacy menu hierarchy = `Menu` (custom) + `menuCategory` (sections) + `vendorItems` (items).** A "standard menu" is **virtual** (no `Menu` doc — assembled from `menuCategory` rows without a `menu` ref); a "custom menu" is a `Menu` doc with an embedded `categories[]` junction. Writes flow through `POST/PATCH/DELETE /menu`, `/menu-category` (+ `/menuCategory/order`), and `/vendor-items` (Feathers mongoose + hooks).
- **`menuCategory → MenuSection` is CONFIRMED** (merchant menu section, not platform taxonomy; platform `Category`/`Sub Category` are only string-label pickers on the section). **`vendorItems → MenuItem (+ ItemVariant + ItemChannelConfig + AddOnGroup/AddOn)` is CONFIRMED.** The existing target hierarchy is the right shape; several legacy fields have **no target column** (schedule, publication flag, variant `available`/`isDefault`, per-variant channel pricing, dietary/nutrition, menu-category charges).
- **DEC-3:** **ITEM AVAILABILITY = RESOLVED** (three legacy layers untangled: `status` Boolean = publication gate; `availability` enum = stock, maps 1:1 to target `ItemAvailability`; `checkIfOpen()`+schedule = runtime overlay, deferred). **CATEGORY/TAX = PARTIALLY RESOLVED** (item per-channel `sur_charges` → existing `ItemChannelConfig.surcharges Json` — preserve; `menuCategory.charges[]` is a small owner decision). **COMBOS = UNRESOLVED** (live merchant feature, separate `Combo` collection, **no target model** — owner decision; defer from P1.7.18).
- **"No platform Item Catalog" is RE-CONFIRMED:** `catalogue`/`chaincatalogue` are curated groupings of `vendorItems` refs; "global" items are `vendorItems` with `is_global:true` cloned into merchant rows on import (`vendor-catalogue.class.ts:47-58`). Optional onboarding accelerators, not required for basic menu setup.
- **POS** (`posItemId`/`pos_category_id`, PetPooja) is **optional/deferred** — preserve optional `MenuItem.posItemId`; do not block writes or sync.
- **Menu/Item writes depend HARD on Restaurant + Merchant activation, NOT on Seating/Offers/Experiences/Ordering/Payment.**

---

## 2. Source Repositories Inspected

| Repo | Role | Inspected |
|---|---|---|
| `amealio-vendordashboard` | Legacy Feathers/Mongo backend (truth) | `menu.model.ts`, `menu-category.model.ts`, `vendor-items.model.ts`, `combo.model.ts`, `catalogue.model.ts`, `chain-catalogue.model.ts`, `pos.model.ts`, `category.model.ts`, `sub-category.model.ts`, `subscription.model.ts`; services `menu/*`, `menu-category/*`, `vendor-items/*`, `catalogue/*`, `usercart/*`; hooks; `helpers/petpooja.ts`, `menu-availability.ts`; `cron.ts`; `config/default.js` |
| `amealiodashboardmvp-` | Merchant+Admin SPA | menu setup + item wizard (`MenuSetup.js`, `CreateCustomMenu.js`, `AddCategories.js`, `AddItem/*`, `CreateCombos.js`) + redux (`vendorSubscription*Action.js`, `onboardingAction.js`) |
| `replateform-amealio` | Target | `prisma/schema.prisma` catalog models; `apps/api/src/modules/catalog/*` (P1.7.5 read); docs 33/34 |

`amealio_web_app`/others: consumer read paths referenced only to prove config-vs-runtime.

---

## 3. Merchant/Admin Menu Setup Flow

`UI → redux (vendorSubscription*Action / onboardingAction) → Feathers /menu, /menu-category, /menuCategory/order, /vendor-items → hooks → Mongo`. Key operations (all cited):

| Operation | HTTP / service | Persistence | Notes |
|---|---|---|---|
| Create custom menu | `POST /menu` (`menu.class.ts:587-694`) | `Menu` | requires `name`+`restaurant`; resolves `vendor_id`; no create hook; Firebase share link |
| Update / publish menu | `PATCH /menu/:id` (`menu.class.ts:762-779`) | `Menu.visibility` | patch requires `visibility`; edit forces `visibility:true` |
| Delete menu | `DELETE /menu/:id` (`menu.class.ts:1035-1049`) | hard delete | after-hook notifications |
| List/create/update/delete section | `/menu-category` (+hooks `menu-category.hooks.ts`) | `menuCategory` | create sets `vendor_id`; if `menuId`, after-hook `$push` `{category_id,item:[]}` onto `Menu.categories` + `visibility:true` |
| Reorder sections/items | `POST /menuCategory/order` (`menu-category-order.class.ts:28-67`) | `menuCategory.sortOrder`, `vendorItems.sortOrder` | |
| Create/update/delete item | `POST/PATCH/DELETE /vendor-items` (`vendor-items.hooks.ts`) | `vendorItems` | create dedupes on `name+vendor_id+category`; auto `vendor_id`; hard delete |
| Bulk availability / reset sold-out | `POST /items`, `GET /resetsoldout` | `vendorItems.availability` | merchant runtime |
| Mark "menu setup complete" | `PATCH /subscription` `*.menu_setup.value` | `Subscription` | **restaurant onboarding flag** (gates ordering/cart), NOT menu publish |

**Item↔section link** is primarily `vendorItems.category → menuCategory._id` (`user-menu.class.ts:836-843`); the `Menu.categories[].item[]` junction is populated mainly by catalogue import, not the main Add-Item flow.

---

## 4. Menu Model Reconciliation

Legacy `menu.model.ts`: `{ name*, description*, menuType(STANDARD|CUSTOM, default CUSTOM), categories[]{category_id→menuCategory, item[]→vendorItems}, shareLink, restaurant*, vendor_id, visibility(default true), softOnboarding }`. Target `Menu { legacyId, merchantId, restaurantId, name, type MenuType, visibility, timestamps, deletedAt, sections[] }`.

| Legacy field | Target | Class |
|---|---|---|
| `name` | `name` | REQUIRED |
| `description` | — (**gap**) | REQUIRED in legacy; DEFERRED/optional add |
| `menuType` | `type` | CONFIGURATION |
| `restaurant`/`vendor_id` | `restaurantId`/`merchantId` | REQUIRED (server-resolved) |
| `visibility` | `visibility` | CONFIGURATION (publish gate) |
| `softOnboarding` | — | CONFIGURATION (optional) |
| `categories[]` | `sections[]` | assembled via section writes (not atomic on menu) |
| `shareLink` | — | DERIVED (Firebase) |
| `status`/`active`/`schedule`/`meal period`/`channel` | — | NOT ON MENU (UNKNOWN/DEFERRED) |

**Minimum menu WRITE contract:** `{ restaurantId, name, type?=CUSTOM, visibility?=true }` (+ optional `description`, `softOnboarding`). No draft/archive state exists (delete is hard).

---

## 5. MenuSection / menuCategory Reconciliation

**Verdict: CONFIRMED `menuCategory → MenuSection`.** `menuCategory` is a vendor-scoped section (`name`, `sortOrder`, optional `menu` ref, items via `vendorItems.category`). It stores **string** classification labels (`product_classification`, `category_classification`) picked from the platform taxonomy UI — **not** FKs to `Category`. Target `MenuSection { menuId, categoryId?, name, sortOrder }`.

Extra legacy section fields beyond a minimal section: `charges[]` + `price_include_tax` (tax → §11), `cross_selling`, `availability` enum, `is_global`/`is_chain_catalogue`/`is_temp_local`/`catalogue_id` (catalogue workflow → §12), `pos_category_id` (→ §14), `description`.

**Minimum section WRITE contract:** `{ menuId, name, sortOrder?, categoryId?(optional Category FK) }`; reorder via a batch sort update. Side effect in legacy: junction push + parent `visibility:true`.

---

## 6. MenuItem / vendorItems Reconciliation

`vendorItems` is one large document (lines 12–608). Field routing to the target:

| Legacy field(s) | Target |
|---|---|
| `name`, `description` | `MenuItem.name`, `.description` |
| `category` (→menuCategory) | `MenuItem.menuSectionId` |
| `vendor_id` | `MenuItem.merchantId` (+ derive `restaurantId`) |
| `menu_id` (nullable = standard menu) | placement rule at write/import |
| `availability` enum | `MenuItem.availability` (§10) |
| `status` Boolean | **publication gate** (§10) — NOT the enum |
| `pos_item_id` | `MenuItem.posItemId` (`pos_category_id` = gap) |
| `size[]` | `ItemVariant[]` (§7) |
| `{channel}` blocks | `ItemChannelConfig[]` (§9) |
| `addOns[]` | `AddOnGroup`/`AddOn` (§8) |
| weekly `monday`–`sunday`, `itemAvailableTime`, `date_of_availability`, `lead_time`, `cut_off_time` | **gap** (schedule; deferred) |
| dietary/media/tags/nutrition/allergy/personalization | **gap** (deferred metadata) |
| `auto_accept`, `counter_number`, `currentState`/`runingTrack` | operational/import-filter only |
| hard delete | `MenuItem.deletedAt` (new soft-delete) |

**Belongs on `MenuItem`:** name, description, availability, posItemId, menuSectionId, merchant/restaurant, legacyId, deletedAt (+ a publication flag, §10). Everything else routes to children or is deferred.

---

## 7. Item Variants

Variants are **embedded** `vendorItems.size[]` (`{ price, size, uom, pax, description, isDefault, available, calories, alcoholContent, alternateUnitArr[] }`); `itemSize ∈ {SINGLE, MULTIPLE, CUSTOM}`. Target `ItemVariant { size?, uomId?, priceMinor BigInt, currencyCode, pax? }`.

| Legacy | Target | |
|---|---|---|
| `description`/`size`+`uom` | `size` / `uomId` | map (UOM lookup) |
| `price` (major) | `priceMinor` | ×100 at import |
| `pax` | `pax` | direct |
| `isDefault` | — | **gap** |
| `available` (variant availability) | — | **gap** |
| `calories`/`alcoholContent`/alt units | — | gap (deferred) |
| per-channel `{channel}.sizes[]` price | — | **structural gap** (target channel price is single `priceOverrideMinor`, not per-variant) |

**Minimum variant WRITE contract:** `{ menuItemId, size?, uomId?, priceMinor, pax? }`. Owner decision (optional additive): `isDefault`/`available` on `ItemVariant`.

---

## 8. Add-ons

Legacy `vendorItems.addOns[]` (schemaless) + `sameAddOn`/`diffrentAddon`. Normalized shape (from bulk import): group `{ name, mandatory_item, single_select, allow_adding_multiple, available, active, sizeOption, options[] }`; option `{ name, price | multipleSize[].itemPrice, veg, option_type, … }`. Target `AddOnGroup { name, minSelect, maxSelect } → AddOn { name, priceMinor }`.

| Legacy | Target | |
|---|---|---|
| group `name` | `AddOnGroup.name` | |
| `mandatory_item` | `minSelect` (0/1) | inference |
| `single_select`/`allow_adding_multiple` | `maxSelect` | inference |
| option `price`/`multipleSize.itemPrice` | `AddOn.priceMinor` | multi-size → multiple AddOn rows or gap |
| option veg/allergy/nutrition, group available/active, `sizeOption` (variant-scoped add-ons via `diffrentAddon`) | — | **gap** |

**Verdict:** `AddOnGroup → AddOn` is sufficient for the basic contract **with documented import inference**; do not invent a new modifier model. Variant-scoped add-on pricing (`diffrentAddon`) is a gap → defer.

---

## 9. Item Channel Configuration

Six legacy per-channel blocks (`skip_line, take_away, curb_side, dine_in, home_delivery, catering_banquet`), each `{ value, sizes[], sur_charges_value, sur_charges[] }`. Map to `OrderType {SKIP_LINE, TAKE_AWAY, CURB_SIDE, DINE_IN, HOME_DELIVERY, CATERING}` and `ItemChannelConfig { channel, enabled, priceOverrideMinor?, surcharges Json? }`.

| Legacy | Target | Sufficient? |
|---|---|---|
| `{channel}.value` | `enabled` | ✓ |
| `{channel}.sur_charges[]` | `surcharges Json?` | ✓ (opaque, per doc 33) |
| `{channel}.sizes[].price` (per variant) | `priceOverrideMinor` (single) | **gap** (per-variant channel pricing) |
| `{channel}.sizes[].available/isDefault` | — | gap |

**Minimum channel WRITE contract:** `{ menuItemId, channel, enabled, priceOverrideMinor?, surcharges? }`. Per-variant channel pricing deferred (owner decision).

---

## 10. Item Availability / DEC-3

**Three distinct legacy layers (do not conflate):**
1. **`status` (Boolean, default false)** — **publication/active gate**. Consumer menu requires `status:true` AND `currentState:9` (`user-menu.class.ts:1014-1018`). Merchant toggles "Active" (`Availability.js:425-427`, `ItemAvailability/.../TableBody.js:113-126`). **CONFIGURATION.**
2. **`availability` (enum AVAILABLE|SOLDOUT|NOTAVAILABLE, default AVAILABLE)** — **stock/state**. Written by merchant dashboard, bulk `/items`, `/resetsoldout`, and PetPooja webhook (`petpoojainstance.class.ts:234-243`). Maps **1:1** to target `ItemAvailability`. **CONFIGURATION + RUNTIME writes** (SOLDOUT = merchant/POS stock; NOTAVAILABLE = bulk + schedule).
3. **Runtime schedule overlay** — `checkIfOpen()` (`user-menu.class.ts:302-348`) + weekly `monday`–`sunday`/`itemAvailableTime` + `date_of_availability` (`menu-availability.ts:63-84`) can downgrade displayed availability to NOTAVAILABLE **without persisting**. **RUNTIME/DERIVED.**

**DEC-3 availability = RESOLVED:**
- `availability` enum → `MenuItem.availability` (1:1).
- `status` (publication) → a **separate target flag** (e.g. additive `MenuItem.isPublished Boolean @default(false)`), NOT the enum, NOT name-matched. (Owner decision: field name / whether to reuse `deletedAt` for `status:false` — recommend an explicit publish flag so unpublished ≠ deleted.)
- Schedule overlay + `date_of_availability` + variant `available` → **DEFERRED** (no persisted target field; runtime concern).

---

## 11. Category / Tax / Charges

Tax is **not** an engine; it is layered and only item-level surcharges are consumed at checkout:
- **Subscription** `order_general.tax_code`/`tax_values` (per-channel + `flatCharges`) → stays in `Subscription.config` (P1.7.3). `add_tax_on_price`/`menu_price_include_price` are **stored but have no runtime consumer** (UNKNOWN).
- **`menuCategory.charges[]`** + `price_include_tax` (per-channel template) → **propagated** to item `sur_charges` on write (`vendor-menu-category.class.ts:49-106`); **not read directly at checkout**.
- **Item `{channel}.sur_charges[]`** → **canonical**, consumed by cart `splitTaxes`/`calcSurCharges` (`usercart.class.ts:250-327`) → maps to existing **`ItemChannelConfig.surcharges Json?`** (preserve).
- **Variant-level tax: none.**

**Part J charges verdict:** CONFIGURATION that propagates to item surcharges (which do affect order totals); `menuCategory.charges` itself is not read at checkout. **The write foundation must preserve item channel `surcharges` (already modeled).** `menuCategory.charges[]`+`price_include_tax` is a **GAP** on `MenuSection` → owner decision: (a) additive `MenuSection.charges Json?` + `priceIncludeTax Boolean?`, or (b) propagate-only at write time. Do not build a tax engine.

---

## 12. Combos / Catalogue / ChainCatalogue

- **Combos:** live **merchant-owned** functionality — separate `Combo` collection (`vendor_id` required; optional `restaurant`/`menu_id`/`category_id`; `comboItems[]→vendorItems`; own `pricing.{channel}.comboPrice`, `taxesIncluded`), `/combo` CRUD, merchant UI (`CreateCombos.js`), cart/checkout + user-menu-v2 integration. **No target `Combo` model.** Not a `MenuItem` variant.
- **Catalogue/chaincatalogue:** curated groupings of `vendorItems` refs (`items[]→vendorItems`); super-admin `/catalogue`, `/chaincatalogue`, `/global-catalogue`; merchant import clones into merchant-owned `vendorItems` with explicit `vendor_id` (`vendor-catalogue.class.ts:47-58`). **"No platform Item Catalog" RE-CONFIRMED** (doc 34 accurate). Optional onboarding accelerators; not required for basic menu setup; not dead.

---

## 13. Publishing / Activation

| State | Entity / field | Class |
|---|---|---|
| Menu visible | `Menu.visibility` (default true) | CONFIGURATION (menu-level) |
| Section active | `menuCategory.status` (default true) | CONFIGURATION |
| Item published | `vendorItems.status` + `currentState:9` | CONFIGURATION |
| Item stock | `vendorItems.availability` enum | CONFIGURATION + RUNTIME |
| Ordering enabled | `subscription.*.menu_setup.value` | CONFIGURATION (restaurant-level; gates cart) |
| Draft / archive | — | **NOT PRESENT** (delete is hard) |

No cron/queue for publishing; side effects are synchronous hooks (notifications, Firebase links). No generic publishing workflow exists — do not invent one; the target uses boolean flags (`Menu.visibility`, item publish flag).

---

## 14. POS Integration Boundary

`vendorItems.pos_item_id`/`pos_category_id`, `menuCategory.pos_category_id`, `restaurant.pos` (→ `posConfig`), PetPooja mapping (`petpooja.ts:14-18`), webhook-driven (cron `fetchMenu` commented out). **Target has only optional `MenuItem.posItemId`.** POS identity is **optional at write time** — preserve `posItemId` if present; **defer** POS config/sync/category-id. Do not block writes on POS.

---

## 15. Target-State Reconciliation

| Legacy | Target existing | Gap | Write-foundation flag |
|---|---|---|---|
| `menu` | `Menu` | `description`; write APIs | REQUIRED |
| `menuCategory` | `MenuSection` | `charges`/`price_include_tax`/`posCategoryId`/`description`/cross-sell | REQUIRED (+ charges owner decision) |
| `vendorItems` | `MenuItem` | publication flag, schedule, dietary/nutrition, min/max | REQUIRED (core) / GAP (metadata) |
| `size[]` | `ItemVariant` | `isDefault`/`available`; per-channel variant price | REQUIRED / GAP |
| `{channel}` | `ItemChannelConfig` (+`surcharges Json`) | per-variant price | REQUIRED |
| `addOns[]` | `AddOnGroup`/`AddOn` | multi-size options, selection constraints, variant-scoped | REQUIRED (w/ import inference) |
| platform taxonomy on items (`food_type`/`cuisin_type`) | `Category`/`Cuisine` | item→Category FKs | GAP (optional) |
| `availability` enum | `ItemAvailability` | — | REQUIRED |
| weekly/date availability | — | schedule model | DEFERRED |
| `menuCategory.charges` / item `sur_charges` | `ItemChannelConfig.surcharges Json` | section charges | REQUIRED (item) / owner decision (section) |
| combos | — | `Combo` model | UNKNOWN (owner decision) |
| catalogue/chaincatalogue | — | grouping model | DEFERRED |
| POS ids/sync | `posItemId` only | config/webhooks/category id | DEFERRED |
| catalog **write** module | — (P1.7.5 read only) | full write | REQUIRED (P1.7.18) |

P1.7.5 `CatalogService` is confirmed **read-only** (no create/update/delete, no controllers).

---

## 16. Merchant / Restaurant Ownership

Legacy owns catalog by **`vendor_id`** (→ target `Merchant`) with a `restaurant` link; sections/items via `menu`/`category` chains. Target ownership:
- `Menu` → `merchantId` + `restaurantId` (both).
- `MenuSection` → via `menuId` (→ Menu → restaurant/merchant).
- `MenuItem` → `merchantId` + `restaurantId` + optional `menuSectionId`.
- `ItemVariant`/`ItemChannelConfig`/`AddOnGroup`/`AddOn` → via `menuItemId`.

**Enforcement:** all writes merchant-tenant-scoped (P1.7.1F/P1.7.2); a menu/section/item/child of another merchant or restaurant must be rejected; server-derived scope; SUPER_ADMIN explicit target; no cross-merchant/cross-restaurant writes; owner must be active (P1.7.14).

---

## 17. P1.7.18 Write Contract

| Bucket | Scope |
|---|---|
| **MUST — menu setup** | `Menu` create/update (name, type=CUSTOM, visibility) + `MenuSection` create/update/delete/reorder (name, sortOrder, optional `categoryId`), merchant/restaurant-scoped |
| **MUST — item setup** | `MenuItem` create/update/soft-delete (name, description, `availability`, `menuSectionId`, optional `posItemId`, publication flag) |
| **MUST — variant setup** | `ItemVariant` create/update (size, uomId?, priceMinor, pax) |
| **MUST — add-on setup** | `AddOnGroup` + `AddOn` (name, minSelect, maxSelect, priceMinor) with documented import inference |
| **MUST — channel config** | `ItemChannelConfig` (channel, enabled, priceOverrideMinor?, surcharges Json) |
| **OPTIONAL / LATER** | `MenuSection` charges/price-include-tax, item↔Category dietary FKs, weekly/date schedule, variant `isDefault`/`available`, per-variant channel pricing, cross-selling, dietary/nutrition/media, catalogue import |
| **ORDERING-ONLY** | cart/checkout tax consumption, flat order charges, `menu_setup` gate |
| **POS-ONLY** | POS config/webhooks/sync, `pos_category_id` |
| **UNKNOWN** | combos (owner decision), min/max order qty, `date_of_availability` semantics, `add_tax_on_price` |

**Recommended minimal P1.7.18:** a merchant-scoped `CatalogWriteService` over the EXISTING models for Menu / MenuSection / MenuItem / ItemVariant / ItemChannelConfig / AddOnGroup / AddOn, plus the small additive fields flagged below. No customer UI, no ordering, no POS sync, no combos.

**Likely additive schema for P1.7.18 (to be justified in that slice, not now):** `MenuItem.isPublished` (publication gate, DEC-3); optionally `Menu.description`, `MenuSection.description`, `ItemVariant.isDefault`/`available`, `MenuSection.charges Json?`/`priceIncludeTax`. Combos + schedule remain out.

---

## 18. DEC-3 Resolution

| Sub-decision | Status | Direction / owner decision |
|---|---|---|
| **ITEM AVAILABILITY** | **RESOLVED** | `availability` enum → `MenuItem.availability` (1:1); `status` (publication) → separate `MenuItem.isPublished` flag (NOT the enum); schedule overlay + `date_of_availability` + variant `available` DEFERRED (runtime). Minor owner decision: publish-flag naming / vs `deletedAt`. |
| **CATEGORY / TAX** | **PARTIALLY RESOLVED** | Item per-channel `sur_charges` → existing `ItemChannelConfig.surcharges Json` (**preserve** — resolved). `menuCategory.charges[]`+`price_include_tax` → owner decision: additive `MenuSection.charges Json?`/`priceIncludeTax` vs propagate-only. Subscription tax stays in `Subscription.config`. No tax engine. |
| **COMBOS** | **UNRESOLVED** | Owner decision required: (1) first-class `Combo` entity, (2) composite `MenuItem`, or (3) defer. Recommend **defer** from P1.7.18 (accept a combo migration gap) until the decision lands. |

---

## 19. Dependency Impact

| Menu/Item setup depends on | Class | Why |
|---|---|---|
| Restaurant | **HARD** | menu/item belong to a restaurant |
| Merchant activation (P1.7.14) | **HARD** | active owner/staff required to write (tenancy) |
| Subscription | **SOFT** | `menu_setup` flag gates ordering/cart, not menu writes; tax config in config |
| Categories | **SOFT/OPTIONAL** | `MenuSection.categoryId` + item dietary refs optional |
| Cuisine | **OPTIONAL** | optional item/section classification |
| Currency | **SOFT** | variant `priceMinor` + `currencyCode` (default INR) |
| Seating | **NO DEPENDENCY** | independent (P1.7.15/16) |
| Offers | **NO DEPENDENCY** | apply at cart/order |
| Experiences | **NO DEPENDENCY** | — |
| Ordering | **NO DEPENDENCY** | Menu→Items HARD internally; ordering not required to write catalog (P1.7.12 untouched) |
| Payment | **NO DEPENDENCY** | — |
| POS | **OPTIONAL** | posItemId optional; sync deferred |

---

## 20. Remaining UNKNOWNs / Owner Decisions

- **DEC-3 combos** — first-class entity vs composite MenuItem vs defer (recommend defer).
- **Item publication flag** — `MenuItem.isPublished` name / vs `deletedAt` reuse.
- **`menuCategory.charges` representation** — additive `MenuSection.charges Json?` vs propagate-only.
- **Per-variant channel pricing** — target has single `priceOverrideMinor`; legacy has per-variant `{channel}.sizes[]` prices.
- **Weekly/date availability schedule** — no target model; defer or add later.
- **Add-on selection semantics** — legacy booleans → target `minSelect`/`maxSelect` inference; multi-size options.
- **Dietary/nutrition/allergy/personalization** metadata — deferred surface.
- **Min/max order qty**, **`date_of_availability`** semantics, **`add_tax_on_price`/`menu_price_include_price`** (stored, unused) — UNKNOWN.
- **item↔platform Category** dietary FKs (`food_type`/`cuisin_type`) — optional.

---

## 21. Explicitly Deferred

Combos; weekly/date availability schedule; dietary/nutrition/allergy/personalization metadata; media (images/videos); menu-category charges normalization (pending decision); per-variant channel pricing; cross-selling; catalogue/chaincatalogue import; POS config/sync/webhooks; subscription tax engine; customer/merchant UI; complete ordering/cart/payment/delivery; ONDC; Mongo data import. **P1.7.12 Ordering, P1.7.15/16 Seating, Offers, Experiences are untouched.**

---

## 22. Evidence / Source References

**Menu/section:** `menu.model.ts:8-55`; `menu.class.ts:587-694,762-779,1035-1049`; `menu-category.model.ts:12-82`; `menu-category.hooks.ts:124-259,314-378`; `menu-category-order.class.ts:28-67`; `vendor-menu-category.class.ts:49-159`; SPA `CreateCustomMenu.js:90-107`, `AddCategories.js:381-531`, `MenuSetup.js:593-617`; `user-menu.class.ts:790-793,982-987,1143-1148`.

**Items/variants/addons/channels/availability:** `vendor-items.model.ts:12-608` (esp. `size[]` 96-120, channels 316-475, `status` 94, `availability` 584-588, POS 594-598); `vendor-items.hooks.ts:61-286`; `vendorSubscriptionGetAction.js:124-195`; `AddItem/{BasicDetails,SizePricing,Availability,Customization,Services}.js`; `ItemAvailability/.../TableBody.js:113-158`; `user-menu.class.ts:302-348,407-472,1014-1018`; `menu-availability.ts:63-84`; `usercart.class.ts:250-327,694-699`; `cart.class.ts:512-568`.

**Tax/combos/catalogue/POS/target:** `menu-category.model.ts:31-45`; `subscription.model.ts:728-758`; `combo.model.ts:9-231`; `combo.class.ts:84-128`; `catalogue.model.ts:14-27`; `chain-catalogue.model.ts:14-30`; `vendor-catalogue.class.ts:47-58,126-245`; `global-catalogue.class.ts:61-146`; `petpooja.ts:14-18,1128-1137`; `pos.model.ts:5-64`; `restaurant.model.ts:647-666`; target `prisma/schema.prisma:711-802,192-201`; `apps/api/src/modules/catalog/application/catalog.service.ts:9-62`; docs 33/34.
