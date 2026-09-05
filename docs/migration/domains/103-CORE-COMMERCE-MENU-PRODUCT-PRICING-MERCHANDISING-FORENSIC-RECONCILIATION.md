# 103 — Core Commerce: Menu / Product / Pricing / Merchandising Forensic Reconciliation

**Status:** FORENSIC + INDUSTRY RECONCILIATION ONLY. No target architecture is implemented by this document.  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Date:** 2026-09-05  
**Brand:** amealio  
**Canonical target:** `Replateform-Amealio` / `replatform/backend-consolidation`  
**Machine-readable gap matrix:** [103-CORE-COMMERCE-GAP-MATRIX.json](./103-CORE-COMMERCE-GAP-MATRIX.json)

**Prior contracts this document must not contradict**

- Global Catalog exists and is copy/materialization, not live inheritance — [75](./75-PLATFORM-CATALOG-REALITY-RECONCILIATION.md), [76](./76-GLOBAL-CATALOG-MATERIALIZATION-FORENSIC-MAP.md), [78](./78-GLOBAL-CATALOG-API-CONTRACT-FORENSIC-TRACE.md), [82](./82-GLOBAL-ITEM-CATALOGUE-TARGET-VALIDATION.md)
- Menu read/write foundations — [33](./33-MENU-CATALOG-FOUNDATION.md), [46](./46-MENU-ITEM-WRITE-RECONCILIATION.md), [47](./47-MENU-ITEM-WRITE-FOUNDATION.md)
- Publication ⊥ stock — docs 46 / 47 (`status`/`isPublished` vs `availability`)
- Server-authoritative money + coupon commit — [52](./52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md), [53](./53-OFFER-REDEMPTION-DISCOUNT-FOUNDATION.md), [90](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)
- Promotions architecture + isolated Phase 1 kernel — [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md), [101](./101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md), [102](./102-PROMOTION-EVALUATION-KERNEL.md) (`41ec1fb`)

**Governing authority**

Legacy implementation is evidence, not authority.  
Industry practice is evidence, not authority.  
Amealio business intent remains the final authority.

**STOP condition**

Do not implement the L4 contract from this document without a subsequent explicit GO.  
Do not start Promotion Phase 2 from this document. Phase 1 (`41ec1fb`) remains an isolated quote-only kernel.

---

## 1. Scope

Recover and reconcile amealio's **core menu / product / commerce model** across:

1. Standard / a-la-carte menu  
2. Custom menu  
3. Items within items  
4. Item variations  
5. Size  
6. Customization / modifiers  
7. Combo / bundled item behavior (food combos only)  
8. Pricing  
9. Taxes  
10. Fees and surcharges  
11. Offers / coupons / promotions  
12. Upselling  
13. Cross-selling  
14. Personalization  
15. Product / item / menu availability  
16. Global Catalog → Merchant Catalog materialization  
17. Merchant Catalog → consumer presentation / orderability  

Establish:

- **L1** — Legacy Reality  
- **L2** — Industry Benchmark  
- **L3** — Gap Analysis (`PRESERVE` | `IMPROVE` | `CORRECT` | `OWNER DECISION` | `FUTURE`)  
- **L4** — Canonical amealio Target Contract (design only)

Purpose: prevent the replatform from reproducing legacy structural debt before the product/pricing model is approved.

---

## 2. Explicit exclusions

This document does **not**:

- Investigate or redesign **Celebration Packages, Celebrations, Occasions, Festivals**, or their specialized setup (doc 48 remains the Experience/Celebrations forensic record; those domains are investigated separately after their legacy reality is fully restored).
- Implement L4, create Prisma migrations, or invent speculative schema.
- Integrate Promotion Phase 2 into cart, checkout, payment, UI, or redemption.
- Modify checkout, payment, cart runtime, or `grandTotalMinor` calculation.
- Treat `41ec1fb` as incomplete; Phase 1 is accepted as an isolated quote-only slice and is preserved.
- Introduce legacy repositories as runtime dependencies.
- Claim that Global Catalog does not exist (that earlier conclusion in doc 34 is superseded by docs 75–82).
- Collapse variant / modifier / component / combo / inventory merely because legacy stored several of them on `vendorItems`.
- Copy another vendor's architecture wholesale.

---

## 3. Legacy repositories inspected

| Repository | Role | Inspected |
|---|---|---|
| `Amealio-VendorDashboard` (`/agent/repos/amealio-vendordashboard`) | Primary legacy backend / business logic | **Yes** — models, cart/order/menu/catalogue/combo/tax/settlement services |
| `amealio_web_app` (`/agent/repos/amealio_web_app`) | Legacy consumer / User App | **Yes** — restaurant menu, V2 customization, cart payload, combo drawer, checkout |
| `AmealioDashboardMVP-` (`/agent/repos/amealiodashboardmvp-`) | Legacy Merchant + Super Admin UI | **Yes** — MenuSetup, CreateCustomMenu, AddItem/Customization, CreateCombos, CrossSelling, ItemAvailability, SuperAdminGlobalCatalogue |
| `amealio-self-delivery-app` (`/agent/repos/amealio-self-delivery-app`) | Rider / self-delivery | **Limited** — order bill / charge display only |
| `amealio-nestjs-backend` (`/agent/repos/amealio-nestjs-backend`) | Secondary Nest reference | **Limited** — not treated as authority; Feathers VendorDashboard remains the primary runtime evidence |
| `Amealio-VendorApp` | Legacy merchant mobile | **Not in this workspace** — not inspected |
| `Amealio-Homepage-V2-RAG-Server` | Personalization / discovery RAG | **Not in this workspace** — not inspected; no RAG/recommendation evidence was found in the four inspected consumer/merchant/backend repos |

**Target inspected:** `Replateform-Amealio` — `prisma/schema.prisma` Menu–AddOn + Offer/Coupon; `apps/api/src/modules/catalog/`; `apps/api/src/modules/platform-catalog/`; `apps/api/src/modules/ordering/` (`CartService.price`, `OrderService` totals); `apps/api/src/modules/offer/` Phase 1 kernel.

---

## 4. Legacy backend evidence

Primary Feathers services and models (absolute paths under `amealio-vendordashboard`):

| Domain | Evidence |
|---|---|
| Menu document | `src/models/menu.model.ts` — `menuType` `STANDARD\|CUSTOM` default `CUSTOM`; `categories[{category_id, item[]}]`; `visibility`; `softOnboarding`; `restaurant`; `vendor_id` |
| Menu category / section | `src/models/menu-category.model.ts` — optional `menu` FK; `status`; `availability`; `sortOrder`; `charges[]`; `cross_selling.category[]`; `is_global` / `is_local` / `is_temp_local` / `is_chain_catalogue`; `price_include_tax` |
| Item | `src/models/vendor-items.model.ts` — `menu_id` nullable (“standard menu”); `category`; per-channel `{value, sizes[], sur_charges[]}`; top-level `size[]`; `addOns[]`; `sameAddOn` / `diffrentAddon`; level sliders; `currentState`; `status`; `availability`; `date_of_availability`; `itemSize` `SINGLE\|MULTIPLE\|CUSTOM` |
| Reusable modifier templates | `src/models/templates.model.ts` — `mandatory_item`, `single_select`, `allow_adding_multiple`, `sizeOption`, `options[].multipleSize[]`, `is_global` / `is_chain_catalogue` |
| Combo | `src/models/combo.model.ts` — `comboItems[].items[]` refs to `vendorItems`; `default`; `additionalPrice`; `substitutable`; `condiments[]`; per-channel `pricing.*.comboPrice` / `listPrice` / `packingCharges` |
| Consumer menu assembly | `src/services/vendor-items/user-menu.class.ts` — virtual `"Standard Menu"` vs `customMenuId` path |
| Custom menu write | `src/services/menu/menu.class.ts` `POST /menu` |
| Global catalogue | `src/services/catalogue/global-catalogue.class.ts`; `src/services/vendor-catalogue/` (localCategoryItems + `POST /vendor/items?add=true`) |
| Cart / money | `src/services/usercart/cart.class.ts`, `usercart.class.ts` (`calcDiscount`, `splitTaxes`), `guest-cart.class.ts` |
| Order snapshot + `gstTaxes` | `src/services/ordering/ordering.class.ts` ~1919–2027; `src/models/ordering.model.ts` |
| Settlement use of `gstTaxes` | `src/services/settlement/settlement.class.ts` |
| Availability windows | `src/helpers/menu-availability.ts` |
| Recommended / personalization | `src/services/vendor-items/recommended-items.class.ts`; `user-personalisation-menu.class.ts` |
| PetPooja mapping | `src/helpers/petpooja.ts` (min/max, packaging, `currentState=9`) |

---

## 5. Legacy frontend evidence

### Consumer (`amealio_web_app`)

| Surface | Evidence |
|---|---|
| Restaurant menu + switcher | `src/screens/menu/RestaurantMainMenu.jsx`; `SwitchMenuAndSearchHeader.jsx` — standard first, then custom menus |
| À la carte label | `V2AlacarteMenu.jsx` — **UI label** for the standard `/user/menu` path, not a third menu type |
| V2 customization mapper | `src/components/AmealioReusableComponents/utils/V2MapItemDetails.js` — maps `mandatory_item` / `allow_adding_multiple`; **drops `multipleSize` and `sizeOption`** |
| V2 required label | `V2AddItemDetailsSection.jsx` — `(required)` is display-only |
| Add-to-cart payload | `RestaurantMainMenu.jsx` ~1117–1143 — flattens selected addon **option objects / ids**, not `{addon_id, option_id, multipleSize_id}` |
| Legacy buttons | `src/screens/ReusableComponent/Buttons.js` often sends `addons: []` |
| Combo UX | `ComboCustomizationDrawer.jsx` → `cartAddCombo` in `src/common/utility/cartManager.js` |
| Client totals (unsafe) | `OrderingCalculations.js` + sessionStorage — already classified CORRECT-not-to-copy in docs 52 / 90 |

### Merchant + Super Admin (`amealiodashboardmvp-`)

| Surface | Evidence |
|---|---|
| Menu list + fake Standard stub | `…/MenuSetup/MenuSetup.js` ~361–365 inserts `{ name: "Standard menu", _id: "123456" }` — **not a backend Menu id** |
| Create custom menu | `CreateCustomMenu.js` → `POST /menu` |
| Item wizard | `AddItem/*` — `currentState` advances to `9` (consumer-complete) |
| Customization | `AddItem/Customization.js` — `mandatory_item`, `single_select`, `allow_adding_multiple`, `freeOptions`, `sizeOption` |
| Combos | `CreateCombos.js` |
| Cross-sell | `MenuSetup/CrossSelling.js` writes `menuCategory.cross_selling.category[]` |
| Availability | `ItemAvailability.js` (same Standard stub `_id: "123456"`) |
| Super Admin Global Catalogue | `client/src/components/superAdminComponents/…/SuperAdminGlobalCatalogue/` |

---

## 6. L1 — Legacy Reality

### 6.1 “Menu” is not one concept

Legacy uses **at least eight** menu-related concepts. Do not collapse them.

| # | Concept | What it actually is | Persistence |
|---|---|---|---|
| 1 | **Standard / a-la-carte menu** | **Virtual assembly** at read time from merchant-local `menuCategory` + `vendorItems` (`is_global:false`, `is_temp_local:false`, `status:true`; consumer standard also `currentState:9`). Labeled `"Standard Menu"` / `STANDARD` in `user-menu.class.ts` (~1131–1134, ~1310–1344). | Not a consumer `Menu` document |
| 2 | **Custom menu** | First-class Mongo `Menu` (`menuType` default `CUSTOM`) | `Menu` collection |
| 3 | **Merchant `Menu` with `menuType:"STANDARD"`** | Write path on `/merchant/menu` can insert a STANDARD-typed Menu document | Distinct from the virtual consumer standard menu |
| 4 | **Global catalogue** | Super Admin reusable source (`is_global:true`) | `catalogue` + global `menuCategory` / `vendorItems` |
| 5 | **Chain catalogue** | Chain-scoped reusable source (`is_chain_catalogue`) | `/chaincatalogue` |
| 6 | **Vendor-local materialized copies** | `is_temp_local` → `is_local` via `/vendor/localCategoryItems` | Local copies with `catalogue_id` lineage |
| 7 | **ONDC restaurant menu** | Separate schema / path | Out of this commerce-core contract |
| 8 | **Experience menu routing** | Experience `isStandardMenu` / `isCustomMenu` / package | Excluded (Celebrations / Experiences) |

**À la carte** in the consumer app is a **label** for the virtual standard menu, not a third persistence type.

Merchant dashboard “Standard menu” with `_id: "123456"` is a **UI stub**, not a backend identifier.

`vendorItems.menu_id` is optional; null means “lives on the standard/virtual menu.” Comment in `vendor-items.model.ts` states this explicitly.

### 6.2 Standard / a-la-carte flow

```
Super Admin Global Catalogue (optional)
  → merchant materializes local copies (is_temp_local → is_local) OR creates local items
Merchant
  → categories (menuCategory, often menu=null for standard)
  → items (vendorItems, menu_id null, currentState → 9, status true)
  → activate / availability / channel sizes
Consumer
  → GET /user/menu  (no customMenuId)
  → virtual "Standard Menu"
  → item → cart → order
```

Consumer standard path filters: `status:true`, `is_global:false`, `is_temp_local:false`, `currentState:9`, plus `shouldIncludeMenuItemForDate` and channel/`orderType` filters.

Item display sequence: `sortOrder`, then `createdAt`, optional `prepTime`.

Publication for standard items is `vendorItems.status` (boolean), **not** a Menu.visibility flag. Stock is `availability` (`AVAILABLE|SOLDOUT|NOTAVAILABLE`). These are already proven distinct (docs 46/47).

`currentState` is a **merchant item-wizard progress counter** (default 1). Consumer standard listing requires `9`. Custom-by-id listing does **not** apply that gate. PetPooja import forces `currentState=9`.

### 6.3 Custom menu — recovered behavior

**Create.** Merchant UI (`CreateCustomMenu.js`) posts name / description / `softOnboarding` / `menuType:CUSTOM` / `restaurant` to `POST /menu` (`menu.class.ts`).

**What can be placed.** Categories (`menuCategory` with `menu` set) and items that belong to those categories. Combos also attach by `category_id` and appear on the custom consumer fetch.

**Copy vs reference.** Items are **referenced `vendorItems`**, not cloned into the Menu. Consumer fetch for `customMenuId` loads items with `vendorItems.category == category_id` and `status:true` (`user-menu.class.ts` ~1158–1166). It does **not** use `menu.categories[].item[]` as the source of truth. The embedded `item[]` array on the Menu document is therefore **not authoritative for consumer orderability**.

**Independent pricing?** **No.** Same `vendorItems` documents; channel size prices are shared with the standard menu.

**Independent availability?** **No** at the item document level. Menu has `visibility` (must be `true` for consumer fetch). Edit paths observed always send `visibility:true` — no real hide toggle found in merchant UI.

**Independent customization?** **No.** Add-on groups live on the item.

**Independent categories?** Partially. A custom menu has its own category list, but those categories are ordinary `menuCategory` rows. The same category/item can appear on standard + custom because items are keyed by `category`, not by a menu-owned clone.

**Same item across menus?** **Yes**, via shared `vendorItems` / category membership.

**Channel / service specific?** Channel/`orderType` filters apply on the **standard** assembly path. The **custom-by-id** path does not apply the same channel filter. This is a legacy inconsistency (CORRECT for target: channel must apply to every sellable menu).

**Publication.** `Menu.visibility` + item `status`. Soft onboarding menus are view-oriented (`softOnboarding` / `softOnboardingCat`).

**Consumer resolution.** `GET /user/menu?customMenuId=`. Restaurant menu UI lists standard, then custom menus.

**Existing orders.** Historical orders snapshot line objects (`order_items` with names, prices, addons, notes). Editing a custom menu after the fact does **not** rewrite past orders. There is no live menu versioning.

### 6.4 Items within items — do not collapse

| Legacy mechanism | Actual type | Storage | Notes |
|---|---|---|---|
| Per-channel `sizes[]` | **Variant** (sellable size / SKU-like row) | `vendorItems.{dine_in\|home_delivery\|take_away\|…}.sizes[]` | Price, pax, uom, `isDefault`, `available`, calories |
| Top-level `size[]` | Variant / physical spec | `vendorItems.size[]` | Also used for UOM, pax, alcohol-ish specs |
| `addOns[]` groups + `options[]` | **Option group + modifier options** | Embedded on item; reusable via `templates` | Free-text names (“Extra Toppings”, “Add Beverage”). **Not child SKUs** |
| `options[].multipleSize[]` | Size-specific modifier price | Embedded | Backend cart can reprice if `{addon_id,option_id,multipleSize_id}` is sent |
| `sameAddOn` / `diffrentAddon` + `sizeOption` | Variant-scoped modifier groups | Item flags + template `sizeOption` | V2 consumer mapper ignores `sizeOption` |
| Level sliders (spice, salt, sugar, oil, ice, temperature, flavour, meat/egg cook) | Unpriced personalization modifiers | `*_level` / `customised_details` | Not a price component |
| `Combo.comboItems[].items[]` | **Bundle components** | `Combo` collection, refs to `vendorItems` | One pick per group intended |
| `Combo.condiments[]` | Combo extras | On Combo | Not a first-class modifier group |
| `menuCategory.cross_selling.category[]` | Related-category merchandising | Category | Cross-sell, not composition |

**Not found as first-class types:** crust, topping, side, beverage-as-child, apparel color/style, inventory BOM / recipe components.

Pizza in production samples is generic **size variant + named add-on groups**. PetPooja can send min/max; those values are **not persisted** on `templates` / `addOns` schema.

### 6.5 Variations

Legacy “size” is the only widely used true variation.

| Variation | Legacy treatment | Independent price | Independent SKU / barcode | Independent inventory | Independent media | Independent tax | Independent modifiers |
|---|---|---|---|---|---|---|---|
| Pizza / beverage size | Channel `sizes[]` | Yes | No first-class SKU | Per-size `available` boolean only | No | No (item `sur_charges`) | Intended via `sizeOption` / `multipleSize`; V2 broken |
| Weight / UOM / pax | Fields on size row | Via size price | No | No | No | No | No |
| Quantity | Cart line qty | N/A | N/A | N/A | N/A | N/A | N/A |
| Color / style / packaging / apparel | **Not found** as variants | — | — | — | — | — | — |

Where legacy treats a real product variation as a text option: **modifier option names** that are actually alternate products (e.g. “Add Beverage” options that are other menu items). Those are **not** inventory-linked child products.

### 6.6 Customization / modifiers

Merchant can configure (UI + `templates` / embedded `addOns`):

- `mandatory_item` (required)
- `single_select` vs `allow_adding_multiple`
- `freeOptions` (merchant UI; stored on untyped `addOns[]`; **not** a first-class schema field)
- `sizeOption` (variant-scoped groups)
- option `price` and `multipleSize[].itemPrice`
- `available` / `active` on templates
- notes / `personalization_text` (merchant static copy, not diner free-text field name)
- diner `order_items[].notes`
- `incase_of_unavailable` enum on cart (contact / substitute / cancel)

**Backend cart enforcement (CRITICAL):**

- **Does** validate `size_id` against the item.
- **Does** recompute addon price from DB when payload is `{addon_id, option_id, multipleSize_id}` (`cart.class.ts` ~271–275, ~586–601).
- **Does not** validate mandatory / min / max / single-select / `sizeOption` / `freeOptions`.
- Consumer V2 **never sends** `{addon_id, option_id}` — it flattens option ids (`RestaurantMainMenu.jsx` ~1125). So the server reprice path often never runs for V2.
- V2 “required” is a **label only**.
- `freeOptions` is **UI-only** (merchant Customization + some merchant-side order UI). Consumer V2 does not implement free-then-paid.

This is the canonical **UI-supports / backend-does-not-enforce** case.

### 6.7 Combos / bundles (not Celebration Packages)

Legacy combo is a **separate `Combo` collection**, not a modifier and not merely a parent `vendorItems` row.

- Component selection: one intended pick per `comboItems[]` group; `default` + `additionalPrice`; `substitutable`.
- Channel pricing: `pricing.{dineIn|delivery|…}.{listPrice, comboPrice, packingCharges}`.
- Cart: `combos[{combo_id, items[], quantity}]` plus a header line at `comboPrice`.
- Kitchen / order: **children are not expanded as separate kitchen lines** in the recovered cart path.
- Backend does **not** validate one-per-group or membership — ObjectId presence only.
- Premium substitution: UI may add `additionalPrice`; backend charges **fixed `comboPrice`**.
- No combo inventory decrement found.
- Tax: combo line uses the same `sur_charges` / `splitTaxes` path as items if present on the line; no component-level tax split.
- Promotions: order-level only; no combo-specific targeting.
- Refund: order-level paid amount; no combo-component refund split.

**Classification of legacy “combo”:** a **bundle / meal-deal entity** whose components reference items, priced as a **fixed bundle**, weakly validated. It is not a modifier group and not a true parent/child inventory BOM.

Target Stage F: first-class `Combo` / `ComboSlot` / `ComboSlotOption` (doc [109](./109-STAGE-F-COMBO-BUNDLE.md)). Not a modifier and not a Celebration Package.

### 6.8 Pricing

Canonical **server** path (`cart.class.ts` / `usercart.class.ts`):

```
catalog size price for order_type
  → addons (from DB if structured ids present; else client-shaped)
  → × quantity
  → comboPrice for combo lines
  → calcDiscount (legacy usercart apply/patch)
  → splitTaxes on post-discount line totals
  → item sur_charges + subscription flatCharges
  → delivery estimate
  → + tip / donation (outside some totals)
```

- Authoritative source for v1 `/user/cart` rebuild: **server, from catalog**.
- Legacy sessionStorage + `OrderingCalculations.js`: **client-authoritative** — CORRECT not to copy (docs 52/90).
- Checkout copies cart snapshots onto the order — **no reprice at order create**.
- Rounding: server `.toFixed(2)` (rupee decimal, not minor units). Vendor MVP client sometimes rounds to integer.
- Overrides: vendor `updatePrice`; delivery final vs estimate.
- Historical orders store `order_items` + `base_amount` / `total_amount` / `gstAmount` / `surCharges` / `gstTaxes` / `tax_amount`.
- Refund = paid RAZORPAY/WALLET minus donation; **no GST-line refund split**.

Subscription flags `menu_price_include_price` / `add_tax_on_price` / `tax_code` exist as **settings**. They are **not used** in the recovered cart `splitTaxes` calculation.

### 6.9 Taxes

`splitTaxes` (`usercart.class.ts` ~250–327):

- Reads each line’s `sur_charges[]`.
- Applies `PERCENTAGE` to **post-discount line total**, or `VALUE × quantity`.
- Classifies a charge as “tax” vs “surcharge” by whether the **last token of the name** is `"tax"` (after optional subscription tax-code rewrite).
- Named tax buckets become `gstAmount`.
- Non-tax names become `chargeKeys` and are later moved into `surCharges`.
- Order create (`ordering.class.ts` ~1919–1938) sums **both** `gstAmount` and `surCharges` into `tax_amount`.
- `gstTaxes` (~2017–2026) is the sum of `gstAmount` keys whose code token is `CGST`, `SGST`, or `GST`. Settlement subtracts `gstTaxes` (`settlement.class.ts`).

**Therefore `gstTaxes` is a settlement artifact**, not an independent tax engine output.  
**`tax_amount` mixes government tax and fees.**  
**Inclusive vs exclusive GST is not actually calculated** despite category `price_include_tax` and subscription tax flags.

Do **not** automatically preserve this GST behavior.

### 6.10 Fees and surcharges (keep separate)

| Charge | Who receives (legacy evidence) | Basis | Notes |
|---|---|---|---|
| Item `sur_charges` named *tax | Government GST (via settlement `gstTaxes`) | % or value on post-discount line | Name-token classification |
| Item `sur_charges` not named *tax | Ambiguous — folded into `surCharges` then often into `tax_amount` | % or value | **Unsafe mixing** |
| Subscription `tax_values` with `flatCharges:true` | Merchant / platform (unclear) | Flat per order type | Added in cart |
| Delivery (Porter slabs / Dunzo / self) | Split `deliveryCharges.user/merchant/amealio` | Distance / partner | Self-delivery often no user charge |
| Packaging | PetPooja mapping only | — | **Not** in user-cart calc |
| Tip | Separate from commission (docs 70–73) | Customer | Outside `grandTotal` in target |
| Donation | Charity; excluded from refund | Customer | FUTURE / already contracted |
| `gatewayCharges` / `outgoingCharges` | Settlement / payout | Config % | Not a customer menu fee |

Do not merge these into one generic `fee`.

### 6.11 Offers / coupons / promotions

Aligns with docs 50–55, 99, 101, 102:

- Legacy: **one Mongo Offer + `coupon_code`**. Usage incremented at apply (CORRECT forbidden).
- % / fixed / cap; min/max order; dates; vendor / restaurant / global; `service_type`; usage limits.
- Delivery-offer fields exist on some quote paths.
- No item, variant, category, BOGO, buy-X-get-Y, audience, or daypart targeting.
- Target: `Offer` + `Coupon` + `CouponRedemption` + `assertOfferEligible` + `calculateDiscountMinor` + Phase 1 `evaluate()` — **adequate as an isolated kernel**.
- Checkout applies coupon only if `couponCode` is sent; web currently does not send it.

### 6.12 Upselling

**True upsell engine (small→medium, standard→premium SKU upgrade) was not found.**

Size selection is **variant choice**, not an upsell offer. Premium toppings are **modifiers**. Help-page marketing copy mentions “upsell” as platform aspiration, not an implemented model.

Record as a **gap**, not a hidden legacy implementation.

### 6.13 Cross-selling

**Yes — merchant-defined, category-level.**

- `menuCategory.cross_selling.category[]`
- Consumer: `GET /user/menu-category?cross_selling=true`
- Merchant UI: `CrossSelling.js`

This is complementary-category merchandising, **not** modifiers and not purchase-history FBT.

Recommended / Best Seller / Chef's Special (`recommended-items.class.ts`) is **tag-based merchandising**, not collaborative filtering.

### 6.14 Personalization

Recovered, deterministic:

- Dietary preferences on profile (doc 96)
- Favorites (doc 97)
- Scored sort: favourites + cuisine (`user-personalisation-menu.class.ts`)
- Unpriced taste sliders on items
- Merchant `personalization_text`

**Not recovered in inspected repos:** RAG APIs, purchase-history recommenders, contextual ML.

Distinguish: Personalization ≠ Upsell ≠ Cross-sell ≠ Discovery. AI/RAG = **FUTURE** unless later evidence from the RAG server (not in workspace) proves otherwise.

### 6.15 Availability

Not boolean-only.

| Layer | Mechanism |
|---|---|
| Item / category stock | `AVAILABLE \| SOLDOUT \| NOTAVAILABLE` |
| Publication | item `status`; menu `visibility`; `currentState` (wizard) |
| Date window | `date_of_availability` + `shouldIncludeMenuItemForDate` |
| Weekday / daypart | `multiple_timings` / `itemAvailableTime` |
| Channel | `{take_away.value, sizes[]}` etc. |
| Variant | `size.available` |
| Add-on | template `available`/`active`; no sold-out enum |
| Combo | combo availability filter on user-menu |
| Ops | `reset_all_sold_out` vendor action |

### 6.16 Global Catalog → Merchant Catalog

Already established (docs 75–82). Restated, not reversed:

```
Super Admin /catalogue + /global-catalogue
  → global menuCategory + vendorItems (is_global)
  → GET /vendor/localCategoryItems/:catalogueId   (temp copies)
  → merchant selects
  → POST /vendor/localCategoryItems               (is_local, status:false until activate)
  → optional attach to custom Menu
```

Also `POST /vendor/items?add=true` field-copy if name unique.

**Copy, not live reference. No automatic propagation.** Merchant overrides are local-document edits. Deletion of global source does not have a proven safe cascade (doc 82 defers delete).

Chain catalogue is a **separate** source (`is_chain_catalogue`).

### 6.17 Consumer UX (legacy vs target web)

Legacy consumer: restaurant → standard + custom switcher → item detail / V2 drawer → size + addons + sliders + notes → cart → checkout (client totals historically) → order with `gstAmount` / `surCharges` display.

Target `apps/web`: simple variant + cart + checkout. **Missing:** custom menu switcher, add-on UI, combo UI, tax/fee breakdown, coupon field, size-specific modifier prices.

### 6.18 Merchant + Super Admin UX

Merchant: create/edit items (wizard to `currentState=9`), variants as sizes, customization templates, combos, offers, category cross-sell, item availability, custom menus, Global/Chain pick.

Super Admin: Global Catalogue create / assign / view (doc 75).

UX debt: fake Standard `_id`, visibility always true on edit, V2/backend addon payload mismatch, `freeOptions` not enforced, combo validation only in UI.

---

## 7. L2 — Industry Benchmark

Sources used as **evidence, not templates to copy**:

- Restaurant POS catalog practice (Toast-style): **Item ≠ ModifierGroup ≠ ModifierOption**; size as a size-price dimension or a size modifier group; size-specific topping prices; min/max on groups; tax on item and modifier separately; server `/prices`.
- Retail / Square Catalog: **Item → Variations** (SKU, price, inventory) vs **Modifiers** (optional priced configuration).
- Marketplace ordering (DoorDash / Uber Eats style): menu-wide, item, daypart, BOGO, delivery promotions — richer than amealio today; treat as **FUTURE** unless amealio intent requires them now.
- Modern tax engines: line-level taxability, inclusive vs exclusive as an explicit policy, fees taxed by their own tax class, settlement uses the same breakdown the customer saw.
- Merchandising: merchant-controlled related products (cross-sell) and explicit upgrade paths (upsell) are first-class relationships, not inference from modifier names.

**Industry principles that improve amealio without stealing a vendor model**

1. **Variant = sellable SKU.** Independent price; optionally SKU/barcode/inventory/media/tax class.
2. **Modifier = configuration of a chosen SKU.** Required/optional, min/max, defaults, priced options; server-enforced.
3. **Component = inventory or recipe constituent.** Distinct from a diner-facing modifier.
4. **Combo / bundle = composition of sellable SKUs** (or of selections from groups) with an explicit price policy (fixed, sum, or sum-plus-upgrades).
5. **Tax ≠ fee ≠ surcharge ≠ delivery ≠ tip.** Separate ledgers and receipt lines.
6. **Server quote is authoritative.** Clients send intent (variant, options, qty, coupon code), never money.
7. **Order stores a pricing snapshot** (lines, modifiers, taxes, fees, promotions) so later catalog edits cannot rewrite history.
8. **Global catalog is a source library.** Materialization is an explicit copy with lineage; no silent live inheritance unless product later asks for sync.
9. **Merchandising relationships are merchant-owned and deterministic** before any intelligence layer.

---

## 8. L3 — Gap Matrix

| ID | Finding | L1 | L2 | Class | Target implication |
|---|---|---|---|---|---|
| G-MENU-1 | Multiple menu concepts exist | Virtual standard + Custom Menu + global/chain/temp-local | One operational catalog + optional named menus / dayparts | **PRESERVE** distinction; **IMPROVE** modeling | Do not store standard as a fake Menu id; keep a first-class Custom Menu |
| G-MENU-2 | Custom menu `item[]` unused at consumer read | Category membership wins | Menu membership is explicit | **CORRECT** | Consumer resolution must use an explicit membership, not a dead array |
| G-MENU-3 | Custom path skips channel filter and `currentState:9` | Inconsistent | Channel applies to all sellable surfaces | **CORRECT** | Same orderability rules on every menu |
| G-MENU-4 | Custom menu shares item price/availability | Shared documents | Menus may override price/availability | **OWNER DECISION** | Independent custom-menu price? Default recommendation: shared item, menu-level visibility only, unless product wants overrides |
| G-MENU-5 | Dashboard Standard `_id:"123456"` | UI stub | Real identifiers | **CORRECT** | Never persist or migrate that id |
| G-ITEM-1 | Size is the only real variant | Channel sizes | Variants are SKUs | **IMPROVE** | Keep size-as-variant; add SKU/barcode/inventory later as needed |
| G-ITEM-2 | Apparel color/style absent | Not found | True variant axes | **FUTURE** / **OWNER DECISION** if apparel is in-scope |
| G-ITEM-3 | Modifiers stored as untyped `addOns[]` | Embedded + templates | First-class groups/options | **IMPROVE** | Preserve group/option behavior; type it |
| G-ITEM-4 | Other items used as named options | Text options | Child products or cross-sell | **CORRECT** | Do not treat “Add Beverage” options as inventory children until modeled |
| G-MOD-1 | Mandatory/min/max not server-enforced | UI only | Server enforces | **CORRECT** | Cart must reject invalid configurations |
| G-MOD-2 | V2 payload ≠ server reprice contract | Flat option ids | Structured `{groupId,optionId}` | **CORRECT** | One payload contract |
| G-MOD-3 | `multipleSize` / `sizeOption` ignored by V2 | Backend can reprice | Size-specific modifier price is standard POS | **IMPROVE** | First-class variant×option price |
| G-MOD-4 | `freeOptions` UI-only | Merchant form | Free-then-paid is common | **OWNER DECISION** | Keep as merchandising rule only if product wants it |
| G-MOD-5 | Taste sliders unpriced | Yes | Prep instructions / modifiers | **PRESERVE** as unpriced personalization |
| G-COMBO-1 | Combo is a bundle entity | Separate collection | Bundle/combo construct | **PRESERVE** as its own layer, not a modifier |
| G-COMBO-2 | Combo rules not server-enforced | ObjectId only | Server validates composition | **CORRECT** | |
| G-COMBO-3 | Premium `additionalPrice` not server-charged | UI vs fixed `comboPrice` | Explicit bundle price policy | **OWNER DECISION** | Fixed vs sum-plus-upgrades |
| G-COMBO-4 | No kitchen expansion / inventory | Header line only | Component lines + decrement | **IMPROVE** | Snapshot components on the order |
| G-PRICE-1 | Client-side totals in legacy web | sessionStorage | Server quote | **CORRECT** (already target direction) | Keep server money |
| G-PRICE-2 | No reprice at order create | Cart snapshot copied | Reprice or freeze quote id | **IMPROVE** | Snapshot a server quote |
| G-PRICE-3 | Decimal rupees vs minor units | `.toFixed(2)` | Integer minor units | **PRESERVE** target BigInt minor |
| G-PRICE-4 | Channel override exists in target as item-level, not per-variant | Legacy per-channel sizes | Per-variant×channel price | **IMPROVE** | Doc 47 already deferred per-variant channel price |
| G-TAX-1 | Tax classified by name token `"tax"` | `splitTaxes` | Tax class / rate table | **CORRECT** | Do not copy name-token GST |
| G-TAX-2 | Fees mixed into `tax_amount` | Order create | Separate tax and fee | **CORRECT** | |
| G-TAX-3 | `gstTaxes` = CGST/SGST/GST sum for settlement | Settlement subtract | Same breakdown customer saw | **IMPROVE** settlement to consume canonical tax snapshot |
| G-TAX-4 | Inclusive vs exclusive unused | Flags exist, calc ignores | Explicit policy | **OWNER DECISION** | |
| G-FEE-1 | Opaque `surcharges Json` on target channel | Stored, not calculated | Typed fee components | **IMPROVE** | Do not treat Json as an engine |
| G-FEE-2 | Packaging / convenience / payment fees incomplete | Packaging POS-only | Explicit fee types | **OWNER DECISION** / **FUTURE** | |
| G-PROMO-1 | Order-level %/fixed only | Offer entity | Item/BOGO/daypart engines exist in market | **PRESERVE** v1 scope; **FUTURE** richer actions |
| G-PROMO-2 | Phase 1 `evaluate(subtotal)` | Isolated kernel | Quote must see truthful merchandise subtotal | **PRESERVE** kernel; **do not** Phase 2 yet |
| G-PROMO-3 | Usage increment at apply | Legacy | Redeem at commit | **CORRECT** (already target) | |
| G-UPSELL-1 | No true upsell model | Absent | Upgrade relationship | **FUTURE** (define concept now) | |
| G-XSELL-1 | Category cross-sell exists | `cross_selling.category[]` | Merchant related-items | **PRESERVE** intent; **IMPROVE** to item-level relationships |
| G-PERS-1 | Prefs + favorites + scored sort | Deterministic | AI recommenders | **PRESERVE** foundation; AI **FUTURE** |
| G-AVAIL-1 | Multi-layer availability | Enum + schedule + channel + size | Same layers, typed | **PRESERVE** layers; **IMPROVE** enforcement |
| G-AVAIL-2 | Addon sold-out weak | Flags only | Modifier availability | **IMPROVE** | |
| G-GLOB-1 | Global catalog is real copy-flow | Docs 75–82 | Source library + lineage | **PRESERVE** | Do not revert to “no global catalog” |
| G-GLOB-2 | Temp-local / chain / full field copy / delete deferred | Target 82 | Complete materialization | **IMPROVE** later | Do not invent sync |
| G-SNAP-1 | Order lines snapshot names/prices/addons loosely | `order_items` | Typed modifier/combo/tax snapshot | **IMPROVE** | |
| G-UX-1 | Target web lacks customization/combo/menu switcher | Legacy has them | Parity after model | **IMPROVE** (Stage J) | |

---

## 9. L4 — Canonical Target Contract (design only)

This is the proposed contract. **It is not implemented by this task.**

### 9.1 Layers (do not force every product through every layer)

```
Product / Item
  → Variant                 (sellable SKU; size is the first axis)
  → Customization / Modifier (configuration of a variant)
  → Component               (inventory / recipe; optional)
  → Combo / Bundle          (composition of sellable selections)
  → Availability            (publication ⊥ stock ⊥ schedule ⊥ channel)
  → Pricing                 (server quote, minor units)
  → Promotion               (evaluate on a truthful quote)
  → Tax                     (classified, line-level)
  → Fee / Surcharge         (typed; never stored as tax)
  → Order Pricing Snapshot  (immutable commercial record)
```

A bottled water may be Item → Variant → Availability → Pricing → Tax.  
A pizza may use Item → Variant → Modifier (incl. size-specific prices) → Availability → Pricing → Tax → Fees.  
A meal deal may add Combo / Bundle.  
Apparel (if offered later) uses multi-axis Variant, not modifiers-as-sizes.

### 9.2 Menu contract

- **Merchant Catalog** is the operational sellable catalog (items, variants, modifiers, combos, availability, prices).
- **Standard / a-la-carte menu** is the **default published projection** of that catalog (not a stub Menu id).
- **Custom Menu** is a first-class named, publishable **selection** of categories/items (and later combos) for a restaurant. Membership is explicit. Items are **references** by default (OD-MENU-PRICE decides overrides).
- **Global Catalog** is a Super Admin **source library**. Materialization copies into Merchant Catalog with lineage. No automatic propagation.
- **Chain Catalog** remains a separate source (deferred completion, doc 82).
- Experience / package menus stay outside this contract.

Orderability requires **all** of: published, in a visible menu projection, in-stock, in-schedule, channel-enabled, variant available, modifiers valid.

### 9.3 Product-type layer map

| Product type | Variant | Modifier | Component | Combo | Typical tax/fee notes |
|---|---|---|---|---|---|
| Prepared Food | Size / portion | Yes (required groups common) | Recipe optional FUTURE | Often | GST class; packaging fee OD |
| Packaged Food | Size / pack; barcode FUTURE | Rare | BOM FUTURE | Rare | Often different GST class |
| Prepared Beverage | Size | Yes (ice, milk, shots) | Optional | Yes | |
| Packaged Beverage | Pack / volume | Rare | — | Yes as combo drink | |
| Hot Beverage | Size | Yes + sliders | — | Yes | |
| Cold Beverage | Size | Yes + sliders | — | Yes | |
| Alcoholic Beverage | Size / serve | Limited | — | Yes | Tax class + age **OWNER DECISION / FUTURE** |
| Non-Alcoholic Beverage | Size | Yes | — | Yes | |
| Non-Food Article | True variants | Rare | — | Rare | Different tax |
| Apparel | Color × size (true variants) | Personalization (print) | — | — | Legacy absent — **FUTURE** |
| Services | Duration / tier | Add-on services | — | Packages (not Celebrations here) | Not this catalog slice |

### 9.4 Pricing quote (authoritative)

```
Σ (variant price
   + priced modifiers, honoring free-then-paid if OD accepts it
   + combo policy)
  × quantity
  [menu/channel/service override]
→ merchandise subtotal
→ promotion (Phase 2 only after this subtotal is complete)
→ tax (exclusive or inclusive per OD)
→ typed fees / surcharges
→ delivery
= payable (tip/donation remain separate per docs 70–73)
```

Money remains **integer minor units**. Clients send configuration intent only.

### 9.5 Promotion contract (unchanged Phase 1)

- Keep `PromotionEvaluationService.evaluate(context)` as the quote kernel (`41ec1fb`).
- Do **not** wire it to checkout until Stage D makes `subtotal` include variants, modifiers, channel, and combos that the diner actually bought.
- v1 actions remain order-level percent/fixed/cap + delivery-fee discount as already designed in 101.
- Item / variant / category / BOGO / buy-X-get-Y / spend-X-get-Y / audience / daypart / stacking / funding / unique codes: classify in §12 / §14.

### 9.6 Merchandising relationships (define, do not implement)

- **Upsell** = merchant-defined upgrade from variant A → higher-value variant/item B (or premium modifier). Legacy: absent. Target concept: `MerchandisingRelation{type:UPSELL}`.
- **Cross-sell** = merchant-defined complementary item or category. Legacy: category list. Target: `MerchandisingRelation{type:CROSS_SELL}` at item or category, deterministic, not ML.
- **Personalization foundation** = prefs, favorites, dietary filters, explicit merchant tags. Intelligence remains FUTURE.

---

## 10. Existing target implementation assessment

### 10.1 Must change later (do not change in this task)

| Area | Current | Why it must change after GO |
|---|---|---|
| `CartService.price` | Variant catalog price × qty only; `addOns` stored opaque | Must reprice modifiers, channel, later combos |
| Modifier enforcement | `AddOnGroup.minSelect/maxSelect` stored, not cart-enforced | Server must reject invalid configs |
| Size-specific modifier price | No table | Needed for pizza/beverage POS parity |
| Combo | No model | Food combos are real legacy commerce |
| Tax | `taxTotalMinor` **passed into** `OrderService` | Must be computed from tax classes, not caller input |
| Fees | `feeTotalMinor` **passed into** `OrderService`; `surcharges Json` opaque | Must be typed and computed |
| Custom vs standard consumer contract | Target `Menu.type` exists; consumer web has no switcher and no virtual-standard projection | Must match L4 menu contract |
| Addon payload | Untyped JSON | Need `{groupId, optionId, quantity}` |
| Order snapshots | name/variant/unit/qty + opaque customization/addOns | Need typed modifier/combo/tax/fee snapshot |
| Materialization completeness | Discovery + copy + lineage; temp-local / chain / full field copy / delete deferred (82) | Complete the copy contract, not live sync |
| `apps/web` | No customization / combo / menu switcher / tax-fee / coupon | After model stages |

### 10.2 Should remain

- `Menu → MenuSection → MenuItem → ItemVariant` hierarchy
- Exact **BigInt minor-unit** money
- `ItemChannelConfig` **concept** (channel enable + override)
- `AddOnGroup` / `AddOn` as the **modifier layer concept**
- Publication (`Menu.visibility`, `MenuItem.isPublished`) ⊥ stock (`ItemAvailability`, `ItemVariant.available`)
- Platform catalog container + materialization lineage (copy, not live ref)
- Server-authoritative discount when `couponCode` present; `CouponRedemption` derived usage; prepaid defer-redemption
- Phase 1 `evaluate()` kernel — **do not delete or silently expand**
- `Offer` / `Coupon` split; `settlementType` stored not guessed
- `grandTotalMinor = subtotal − discount + tax + fee + delivery` **shape** (components must become server-computed)
- Tip/donation isolation from `grandTotalMinor` (docs 70–73)

### 10.3 ItemVariant / channel / grandTotal / checkout / Order after this reconciliation

**Yes, they will need to change** — but only after GO, and not by copying legacy GST/name-token behavior.

- `ItemVariant` stays the sellable size/SKU; it will need optional identity (SKU/barcode) and later multi-axis attributes if apparel is in scope.
- Channel override must eventually be **variant×channel**, not only item×channel (doc 47 already flagged this).
- `grandTotalMinor` formula stays; **inputs** (subtotal/tax/fee) must be produced by a server quote that knows modifiers/combos/tax classes.
- Checkout must stop accepting client `taxTotalMinor` / `feeTotalMinor` as authority.
- Order must snapshot the quote, not just a variant unit price.

`41ec1fb` does **not** need to change for Phase 1. Phase 2 must wait.

---

## 11. Dependencies between domains

```
Item / Variant / Modifier contract (A)
    → Menu / Merchant Catalog projections (B)
    → Availability enforcement (C)
    → Server quote: price + tax + fees (D)
        → Promotion evaluate integration (E)     [Phase 2]
    → Combo / bundle (F)        [may start after A; must be in quote before E if combos are sellable]
    → Upsell / Cross-sell (G)
    → Personalization foundation (H)   [prefs/favorites already exist]
    → Merchant + Super Admin Global Catalog UX (I)
    → Consumer UX (J)
```

Hard blockers:

- **E blocked on D** (and on A modifier line math). Evaluating a coupon against variant-only subtotal lies.
- **J blocked on A/B/C/D** for customization, menu switcher, and receipt honesty.
- **I** can proceed in parallel for Global Catalog completeness (temp-local/chain) but must not invent live sync.
- Celebrations / Experience packages remain a **separate** dependency tree (doc 48).
- Settlement GST (`gstTaxes`) depends on D’s tax snapshot (docs 63–64). Do not rebuild settlement on name-token GST.

---

## 12. Owner decisions

Do not guess these in implementation.

| ID | Decision | Why it is not automatic |
|---|---|---|
| OD-TAX-INCL | Inclusive vs exclusive GST; whether `price_include_tax` / `menu_price_includes_taxes` becomes real | Flags exist; cart ignores them; Indian POS practice varies |
| OD-TAX-CLASS | Tax classification source (item, category, HSN, subscription tax_code) | Legacy is name-token + unused codes |
| OD-FEE-WHO | Who receives each non-tax surcharge (merchant / platform / split) | Settlement mixes them today |
| OD-MENU-PRICE | Can a Custom Menu override item price / availability? | Legacy shares documents; industry often allows overrides |
| OD-COMBO-PRICE | Fixed `comboPrice` vs sum-of-components vs sum + premium upgrades | UI and backend disagree |
| OD-FREE-OPT | Persist and enforce `freeOptions` (N free then paid)? | UI-only today |
| OD-PROMO-1 | Auto + code stacking (already in 101) | Product/finance |
| OD-PROMO-DELIVERY | Delivery-fee promotions in v1 | Fields exist; not a full engine |
| OD-ALCOHOL | Alcohol as first-class type + age gate | Legacy weak; legal |
| OD-APPAREL | Multi-axis variants in this catalog | No legacy model |
| OD-UPSELL | Ship a true upsell engine vs variant merchandising only | No legacy engine |
| OD-PACKAGING | Customer-facing packaging fee | PetPooja only today |

---

## 13. Recommended implementation sequence

Adjusted from the suggested A–J only where forensic dependencies require it. **Celebration Packages are not in this sequence.**

| Stage | Scope | Notes |
|---|---|---|
| **A** | Canonical Product / Item / Variant / Customization | Typed groups/options; server min/max/required; `{groupId,optionId}`; size-specific option price. **No Phase 2.** |
| **B** | Menu + Merchant Catalog | Virtual standard projection + first-class Custom Menu membership; kill `_id:123456` semantics; same orderability rules on all menus |
| **C** | Availability | Item / variant / channel / schedule; addon availability; sold-out ops |
| **D** | Pricing / Tax / Fees / Surcharges | Server quote; unmix tax vs fee; stop caller-supplied tax/fee; snapshot. **This is the Phase 2 gate.** |
| **F** | Combo / Bundle | After A (needs item refs); include combo lines in the quote **before** E if combos are sellable. Placed before E when combos are in the first consumer cut. |
| **E** | Promotion evaluation integration (Phase 2) | Wire `evaluate()` + existing `couponCode` only after D (and F if combos sell) |
| **G** | Upsell / Cross-sell | Preserve category cross-sell; add item-level CROSS_SELL; UPSELL only if OD-UPSELL says yes |
| **H** | Personalization foundation | Prefs / favorites / dietary already exist; do not add AI |
| **I** | Merchant + Super Admin Global Catalog UX | Complete materialization (temp-local, field copy, chain) per 82; no live sync |
| **J** | Consumer UX | Menu switcher, customization, combo, honest tax/fee, coupon — last, against the stable contract |

If a thinner first consumer cut is required, **F can follow E only if combos are hidden from sale** until their quote math exists.

---

## 14. Deferred / future capabilities

| Capability | Class |
|---|---|
| Item / variant / category promotion targeting | FUTURE (engine 101 already reserved) |
| BOGO / buy-X-get-Y / spend-X-get-Y | FUTURE |
| Targeted customers / segments | FUTURE |
| Dayparts / campaign calendars beyond Offer.validFrom/To | FUTURE |
| Unique single-use codes | FUTURE |
| Promotion funding / SPLIT calculation | OWNER DECISION then FUTURE calc |
| Stacking beyond OD-PROMO-1 | OWNER DECISION |
| True upsell engine | FUTURE unless OD-UPSELL |
| AI / RAG / purchase-history recommendations | FUTURE |
| Live global→merchant sync / deletion cascade | FUTURE (do not invent) |
| Recipe / inventory BOM components | FUTURE |
| Apparel multi-axis variants | FUTURE / OD-APPAREL |
| Alcohol age enforcement | FUTURE / OD-ALCOHOL |
| Packaging / convenience / payment fees as customer lines | OD / FUTURE |
| Kitchen component expansion + combo inventory | IMPROVE in F, not now |
| ONDC menu | Out of scope |
| Celebration Packages | Excluded |

---

## 15. Risks if implemented in the wrong order

1. **Phase 2 now** — `evaluate(subtotal)` discounts a variant-only subtotal that omits addons, size-specific extras, combos, and (later) channel deltas. Customers and finance will see lying quotes.
2. **Copying `splitTaxes` / `gstTaxes`** — reproduces name-token GST and fee-in-tax; settlement then subtracts the wrong number (docs 63–64).
3. **Treating Combo as a modifier or as a MenuItem** — loses bundle price policy, component selection, and kitchen meaning.
4. **Treating modifiers as child items** — breaks inventory, tax, and availability.
5. **Treating size as a text option** — loses SKU price, availability, and size-specific toppings.
6. **Custom menu independent clones without OD-MENU-PRICE** — dual prices and stale copies; legacy was references.
7. **Assuming global live inheritance** — contradicts docs 75–82 and merchant overrides.
8. **Consumer UX before Stage A/D** — UI will re-teach the V2 payload bug and client-side money.
9. **Collapsing publication and stock** — already forbidden by docs 46/47.
10. **Building Celebrations onto this sequence** — different objects; will contaminate food combo and custom-menu meaning.

---

## Appendix A — Promotion capability classification (for 101/102)

| Capability | Classification |
|---|---|
| Order-level % / fixed / cap | Current target (Offer + kernel) |
| Coupon code + auto (code-less) evaluate | Current target (kernel); checkout wire = Phase 2 after D |
| Validity / merchant / restaurant / service type / min-max / usage | Current target |
| Redemption at commit + reverse on cancel | Current target |
| Delivery-fee discount | Improvement / OD-PROMO-DELIVERY |
| Item / variant / category targeting | FUTURE |
| BOGO / buy-X-get-Y / spend-X-get-Y | FUTURE |
| Targeted customers | FUTURE |
| Dayparts | FUTURE |
| Free/discounted delivery as first-class action | FUTURE / OD |
| Stacking | OWNER DECISION (OD-PROMO-1) |
| Promotion funding / SPLIT | OWNER DECISION then FUTURE |
| Unique codes | FUTURE |

**Phase 2 answer:** do **not** proceed. Keep `41ec1fb`. Integrate only after Stage D (and F if combos are sellable).

---

## Appendix B — Trace: Super Admin → Merchant → Consumer → Order

```
Super Admin Global Catalogue
  POST /catalogue, POST /global-catalogue
  is_global menuCategory + vendorItems + templates
        │  copy (not live)
        ▼
Merchant Catalog
  temp-local → localCategoryItems → activate (status, currentState=9)
  and/or native vendorItems
  Standard projection (virtual) and/or Custom Menu (Menu document)
        │
        ▼
Consumer
  GET /user/menu  [+ customMenuId]
  Item detail / V2 drawer / combo drawer
        │  intent (often incomplete addon ids)
        ▼
Cart (legacy server rebuild OR client sessionStorage)
  size + addons + comboPrice + discount + splitTaxes + fees + delivery
        │  snapshot copy, no reprice
        ▼
Order
  order_items + gstAmount + surCharges + tax_amount + gstTaxes
        │
        ▼
Settlement
  subtracts gstTaxes (CGST/SGST/GST keys only)
```

Target today jumps from ItemVariant unit price to `grandTotalMinor` with **caller-supplied** tax/fee and optional coupon on variant subtotal. That is why Stage D precedes Phase 2.

---

**End of forensic document. No implementation. No GO.**
