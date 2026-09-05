# 115 — Merchant Catalog Authoring & Operations

**Status:** FORENSIC ONLY. No production behavior changed.  
**Date:** 2026-09-05  
**Starting HEAD:** `cf9746109cfdf9e485854faaa6eb2f46f6c68e36`  
**Final HEAD:** this documentation commit on `replatform/backend-consolidation` (reported after commit)  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Machine-readable matrix:** [115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-GAP-MATRIX.json](./115-MERCHANT-CATALOG-AUTHORING-OPERATIONS-GAP-MATRIX.json)

This document recovers how a merchant actually **creates, configures, maintains, publishes, and operates** a restaurant catalog, then defines the smallest justified target contract on the existing A–J authorities.

It is **not** a generic CRUD inventory. It is **not** an implementation slice.

Do **not** start this implementation without an explicit GO. Do **not** expand into seating, Book at Table, reservations, walk-ins, waitlist, timers, events, celebrations, packages, Stage H, Stage K, guest cart, maps, promotion stacking, inventory/BOM, recipe, alcohol, apparel, Global live sync, or Chain Catalog.

Do **not** redesign Stage C / D / E / F / G, `PaymentService`, `RefundService`, or `OrderStatus`.

---

## Vocabulary (do not collapse)

| Term | What the evidence says it is | What it is not |
|---|---|---|
| **Global Item Catalog** | Super Admin–owned reusable source (`catalogue` / `platform_catalogs`) | Not the merchant menu. Not consumer catalog |
| **Merchant operational catalog** | Restaurant-owned `MenuItem` graph (legacy: `menuCategory` + `vendorItems`) | Not a second product table. Not live inheritance from Global |
| **Standard Menu** | **Virtual** à-la-carte assembly of published merchant items | Not a persisted `Menu` row consumers read |
| **Custom Menu** | First-class `Menu` (`type=CUSTOM`) with sections | Not a second price book |
| **Chain Catalog** | Legacy chain-scoped source | **Deferred.** Not in this contract |
| **Temporary-local** | Legacy onboarding staging copy (`is_temp_local`) | Not required to preserve copy semantics (OD-I-TEMP) |
| **SIZE** | Sellable variant (`ItemVariant.size` / legacy `size[]`) | Not a modifier. Not apparel style |
| **Publication** | Legacy `status` / target `isPublished` | Not stock. Not wizard `currentState` |
| **Availability** | Legacy/target enum `AVAILABLE` / `SOLDOUT` / `NOTAVAILABLE` | Not numeric inventory |
| **Orderable** | Stage C derived gate | Not a merchant-authored field |
| **Materialization** | Copy Global → new merchant `MenuItem` + lineage row | Not live sync. Not required for every item |
| **Merchant-created item** | Item authored by the merchant without a Global source | Not a Global child. Not a second SKU model |

---

## 1. Starting HEAD

`cf9746109cfdf9e485854faaa6eb2f46f6c68e36` on `replatform/backend-consolidation`.

Accepted prior slices at that HEAD: Stages A–G implemented; Stage I Global → Merchant copy/materialization implemented; Stage J first slice (checkout address + `deliveryAddressSnapshot`) implemented; Stage H and Stage K forensic-only / deferred.

## 2. Final HEAD

Documentation-only commit on the same branch. No Prisma, API, React, seed, CSS, or contract change. Exact SHA is recorded after commit and in the gap-matrix JSON.

## 3. Repositories inspected

| Repo | Path | Role | Catalog-authoring evidence |
|---|---|---|---|
| Replateform-Amealio | `/agent/repos/replateform-amealio` | Canonical target | `apps/api` catalog + platform-catalog; `apps/merchant`; `apps/web`; Prisma schema + migrations; Stage A–J docs |
| Amealio-VendorDashboard | `/agent/repos/amealio-vendordashboard` | Legacy Feathers/Mongo **truth** | `vendor-items`, `menu`, `menu-category`, `catalogue`, `combo`, `user-menu`, `vendor-catalogue` |
| AmealioDashboardMVP- | `/agent/repos/amealiodashboardmvp-` | Legacy merchant + Super Admin UI | MenuSetup, AddItem wizard, CreateCustomMenu, ItemAvailability, CreateCombos, SuperAdmin GlobalCatalogue |
| amealio_web_app | `/agent/repos/amealio_web_app` | Legacy consumer | Reads merchant `/user/menu`. Never Global Catalog |
| amealio-nestjs-backend | `/agent/repos/amealio-nestjs-backend` | Legacy Nest | **No** catalogue / menu / vendor-items engine |
| amealio-self-delivery-app | `/agent/repos/amealio-self-delivery-app` | Rider | Order display only. **No** catalog authoring |

## 4. Repositories unavailable

| Repo | Status |
|---|---|
| Amealio-VendorApp | **Unavailable** under `/agent/repos` |
| Amealio-Homepage-V2-RAG-Server | **Unavailable** under `/agent/repos` (irrelevant to merchant catalog authoring) |

Absence does not block this forensic. VendorApp would be a second merchant surface; the recovered web merchant UI + Feathers APIs are sufficient to reconstruct authoring.

## 5. Documents inspected

`00` behavioral rule · `33` menu/catalog foundation · `36`/`38`/`39`/`43` onboarding / merchant creation · `46` menu-item write reconciliation · `47` menu-item write foundation · `75` platform catalog reality · `76` materialization map · `77` global item field map · `78` global catalog API trace · `79`/`80`/`81` staff RBAC · `82` global item catalogue validation · `83`–`86` experience catalogue / upload (media dependency only) · `103` core commerce · `104` Stage A · `105` Stage B · `106` Stage C · `107` Stage D · `108` Stage E Phase 2 · `109` Stage F · `110` Stage G · `111` Stage H (deferred) · `112` Stage I · `113` Stage K (deferred) · `114` Stage J.

---

## 6. L1 — Legacy Reality

Primary runtime: **`amealio-vendordashboard`**. Primary merchant UI: **`amealiodashboardmvp-`**. Consumer never authors catalog.

```
Onboarding / dashboard
  → Restaurant (vendor-scoped)
  → Optional Global / Chain import (temp-local then promote)  OR  merchant scratch
  → menuCategory (section)
  → vendorItems (item) 9-step wizard
  → size[] (SIZE = VARIANT)
  → addOns[] (modifier groups)
  → per-channel blocks
  → currentState = 9
  → status = true  (publication)
  → availability enum (stock-like)
  → GET /user/menu  (Standard virtual + Custom Menu docs)
```

### 6.1 Catalog creation

Legacy does **not** have one merchant `Catalog` table. Three parallel concepts exist:

| Concept | Model | Who creates | Merchant role |
|---|---|---|---|
| Global Catalog | `catalogue` + global `vendorItems` (`is_global: true`) | Super Admin (`POST /global-catalogue`) | Import / copy only |
| Chain Catalog | `chaincatalogue` | Super Admin | Import / copy only. **Deferred** |
| Operational merchant catalog | `menuCategory` + `vendorItems` under `vendor_id` | Merchant (onboarding or later) | **Owns and edits** |

**Onboarding:** `MenuSetup.js` loads Global + Chain catalogs and can import during Casual Dining (and parallel Fast Food / Multi-Service) setup. Import is an **accelerator**, not a prerequisite. Doc 46 already recorded this: Global is optional.

**Multiple catalogs:** many platform Global/Chain catalogs exist. A merchant has **one operational item graph** per vendor plus **many Custom `Menu` documents** per restaurant. There is no merchant-owned catalog container to rename/archive independently of menus/items.

**Standard vs Custom:**

- Standard Menu is **virtual**. `user-menu.class.ts` assembles `"Standard Menu"` / `menuType: "STANDARD"` from merchant categories/items. UI injects a fake stub `_id: "123456"` (Stage B already forbids this on target).
- Custom Menu is a real `Menu` (`POST /menu`, default `menuType: "CUSTOM"`).

**Temporary-local:** `GET /vendor/localCategoryItems/:id` clones Global/Chain items as `is_temp_local: true`. `POST /vendor/localCategoryItems` promotes selected rows (`is_local: true`, `status: false`) and deletes rejected temps. Target Stage I uses **direct materialize** instead (OD-I-TEMP still open).

**Ownership / rename / archive / visibility / ordering:**

| Entity | Ownership | Rename | Hide / delete | Order |
|---|---|---|---|---|
| Global `catalogue` | Platform | Super Admin | `status` bool; delete exists in legacy | N/A |
| Merchant category | `vendor_id` | `PATCH /menu-category` | `DELETE`; `status: false` | `sortOrder` + reorder API |
| Custom `Menu` | `restaurant` + `vendor_id` | `PATCH /menu` | `DELETE`; `visibility` | Via category/item sort |
| Item | `vendor_id` | `PATCH /vendor-items` | `DELETE` (hard); unpublished via `status: false` | `sortOrder` |

### 6.2 Menu / Menu Section

| Concern | Legacy reality |
|---|---|
| Menu create/edit | `POST/PATCH/DELETE /menu`. Visibility required on some patches |
| Section create | `POST /menu-category`. Optional `menuId` attaches to Custom Menu |
| Section order | `POST /menuCategory/order` |
| Category association | Item has **one** `category` FK. Section may optionally store platform taxonomy **labels**, not item identity |
| Move item | Change `category` on the item, or `copyItem: true` to clone into another category |
| Item in multiple menus | **Not item-level M:N.** If two Custom menus reference the **same category**, consumer custom-menu read loads items **by category**, so the same items appear in both. `Menu.categories.item[]` is written on import and **ignored on consumer read** |
| Item in multiple sections | **No.** One `category` FK |
| Menu-specific price / availability | **No.** Price and availability live on the item / channel / size |
| Channel-specific menus | **No.** Channel gates are on items (`{orderType}.value`) |
| Consumer exposure | `GET /user/menu` Standard virtual + Custom by id |

**Many-to-many menu membership — classification only (do not implement):**

| Pattern | Finding |
|---|---|
| Item ↔ Menu M:N | **NOT evidenced as an item-level join.** Appearance on two Custom menus is **category-sharing** |
| Item ↔ Section M:N | **No** |
| Menu ↔ Section | **Yes** (`Menu.categories[].category_id`) |
| Explicit Menu ↔ Item list | **Partial / unused at read time** |

**Stage B target `Menu → MenuSection → MenuItem` with one `menuSectionId` is compatible with recovered legacy.** Do not introduce a join table unless a later owner reverses this. Classify as **FUTURE / not required**.

### 6.3 Item authoring (merchant-created, independent of Global)

**Merchants can and do create their own products.** This is not optional color. The AddItem wizard is the primary operational path.

Workflow (Casual Dining exemplar; Fast Food / Multi-Service parallel):

1. Optional: `POST /menu-category` (`AddCategories.js`)
2. `POST /vendor-items` from `BasicDetails.js` (`create_new_item_menu_setup`) — name, category, media, basics
3. Sequential `PATCH /vendor-items/:id` steps 1–9: Availability, SizePricing, Tags, Nutrition, Allergy, Personalization, Customization (`addOns`), Services (channels + surcharges)
4. Services submit sets `currentState = 9`
5. ItemAvailability dashboard toggles `status: true` separately
6. Optional `menu_id` when authoring from a Custom Menu context
7. Duplicate guard on create: `name + vendor_id + category`

POS fetch (`GET /merchant/pos/fetchMenu`) is an optional import, not the required path.

#### Field authority (every recovered merchant-controlled field)

| Field | Authority class | Notes |
|---|---|---|
| `name` | **commercial** | Required; duplicate check per vendor+category |
| `description`, `ingredient_description` | **display-only** | Consumer copy |
| `images[]`, `image_thumbnails[]`, `videos[]` | **display-only** | `/upload-assets` → S3 URL strings |
| `category` | **operational** | Section placement + consumer grouping |
| `menu_id` | **operational** | Null = Standard path |
| `keywords[]`, `utterancesVoice[]` | **display-only** / **legacy** | Search/voice weakly used |
| `itemType` / `veg` / food / beverage / cuisine types | **display-only** | Consumer filters |
| `tags[]`, health tags | **display-only** | Merchandising labels, not Stage G relations |
| `allergy_information`, nutrition, calories | **display-only** | Consumer; Stage H safety is separate |
| `size[]` | **commercial** + **operational** | **SIZE = VARIANT** |
| `itemSize` SINGLE/MULTIPLE/CUSTOM | **operational** | Wizard UX only |
| Channel blocks (`take_away` … `catering_banquet`) | **commercial** | Enable + per-channel sizes/surcharges |
| `addOns[]`, `sameAddOn`, `diffrentAddon` | **commercial** | Cart customization |
| Taste sliders (`*_level`) | **operational** | Unpriced personalization (Stage H adjacent) |
| `customizable`, `personalization_*` | **operational** | Ordering UX; not Stage H engine |
| `prepTime`, `lead_time`, `cut_off_time` | **operational** | Display / fulfillment hints; weakly enforced |
| `date_of_availability`, weekday windows | **operational** | Menu-read overlay; **not** order-enforced (Stage C) |
| `availability` enum | **operational** | Sold out / unavailable |
| `status` bool | **operational** | Publication |
| `currentState` 1–9, `runingTrack` | **operational** | Wizard progress; consumer Standard required `currentState: 9` |
| `auto_accept` | **operational** | Order routing, not catalog price |
| `sortOrder` | **operational** | Display order |
| `is_global` / `is_local` / `is_temp_local` / `is_chain_catalogue` | **operational** | Lineage / staging flags |
| `catalogue_id`, chain ids | **operational** / **legacy** | Import lineage |
| `ext_id`, `pos_item_id` | **operational** | POS / integration |
| `upc_code`, `bar_code`, `qr_code` | **legacy / no runtime effect** | Stored; weak consumer use |
| `vendor_approved` | **unknown** | Not in consumer menu filters |
| `view_count`, `order_count`, `rating` | **display-only** | Analytics |
| `shareLink` | **display-only** | Firebase after-create |
| `counter_number` | **operational** | Kitchen routing |
| `type` Food/Non-Food | **operational** | Classification |
| Per-channel `sur_charges[]` | **commercial** | Stage D owns calculation; do not invent a second fee engine |

### 6.4 Variants / size

**SIZE = VARIANT. Do not replace.**

- Master list: `vendorItems.size[]` (`price`, `description`, `isDefault`, `available`, uom, pax, calories).
- Per-channel copies: `{channel}.sizes[]`, synced from top-level on price patch.
- Default size: `isDefault: true`; consumer picks default per `orderType`.
- Create/edit/delete: wizard `SizePricing.js`.
- Modifier interaction: `sameAddOn` vs `diffrentAddon` + template `sizeOption` / `multipleSize[]`.
- Consumer: selected size object in cart payload.

No evidence that size is a modifier group. Apparel color/style is **absent** (103 G-ITEM-2 FUTURE).

### 6.5 Modifier groups / add-ons

Embedded `addOns[]` on the item (schemaless). Template model (`templates.model.ts`) shows intended rules:

| Rule | Legacy | Stage A target |
|---|---|---|
| Required vs optional | `mandatory_item` | `minSelect >= 1` |
| Single vs multi | `single_select` / `allow_adding_multiple` | `maxSelect === 1` vs `>1` / null |
| Min/max counts | **Not first-class** | `minSelect` / `maxSelect` (**IMPROVE**) |
| Quantity | `allow_adding_multiple` | `allowQuantity` |
| Defaults | Weak / combo-slot only | `AddOn.isDefault` |
| Free options | Price `0` | `priceMinor = 0` |
| Size-specific price | `multipleSize[]` | `AddOnVariantPrice` |
| Availability | `active` / `available` on group | `available` on group and add-on |
| Channel | Inherits item channel | Inherits item `ItemChannelConfig` |
| Reusable templates | `templates` + `save_as_template` | **No shared template table** |

Remaining enforcement gaps vs Stage A are **merchant-UI exposure**, not a new modifier engine. Stage A already validates required/min/max/qty/availability on quote/cart/checkout.

### 6.6 Combos (merchant authoring only)

Separate `Combo` collection. UI: `CreateCombos.js` — BasicInformation → ItemSetup → AddCondiments → Availability → Pricing. `POST/PATCH /combo`, `copyCombo: true`.

Slots = `comboItems[]` with options referencing `vendorItems`, optional `default` and unused-on-food-path `additionalPrice`. `substitutable` toggles choose-one. Channel prices on `pricing.*`. `availability` + `activeStatus`. Optional `menu_id` / `category_id`.

**No Super Admin global combo templates.**

Target Stage F already models this as merchant-owned `Combo` + slots + options + `comboPriceMinor`. Do **not** redesign. Remaining gap is **authoring UI** + **no slot/option PATCH after create**.

### 6.7 Availability / publication

Two-axis model (docs 46/47/106), confirmed:

| Control | Legacy | Target |
|---|---|---|
| Wizard complete | `currentState === 9` | **Dropped.** `isPublished` is enough (CORRECT) |
| Published | `status === true` | `isPublished` |
| Sold out / unavailable | `availability` enum | Same enum |
| Variant | `size[].available` | `ItemVariant.available` |
| Modifier | group `available` | `AddOnGroup.available` / `AddOn.available` |
| Restaurant | session open + hours | `Restaurant.status=ACTIVE` (hours FUTURE) |
| Channel | `{orderType}.value` | `ItemChannelConfig.enabled` |
| Custom menu | `Menu.visibility` | Same |
| Schedule | date range + weekday windows | **FUTURE** (Stage C) |

Merchant ItemAvailability dashboard is the operational publish / sold-out surface. Bulk `reset_all_sold_out` exists. Target has the fields; merchant UI does not expose `availability`.

### 6.8 Global → Merchant

**Confirmed: COPY / MATERIALIZATION. Not live inheritance.** Matches Stage I.

| Action | Legacy | Target today |
|---|---|---|
| Add Global item | Temp-local promote **or** `POST /vendor/items?add=true` | `POST /platform-catalog/global-items/:id/materialize` |
| Edit copied item | Merchant `vendorItems` only | Merchant `PATCH /catalog/items` + child writes |
| Publish copy | Toggle `status` after wizard | `isPublished` (materialize forces `false`) |
| Duplicate / copy again | Name-dedupe on `add=true`; `copyItem` clones locally | Unique is `(source_item_id, menu_item_id)` — multiples allowed (OD-I-DUP) |
| Assign section | Category / optional `menu_id` | Optional `menuSectionId` |
| Change price / modifiers / variants | Yes, on the copy | Yes, via `/catalog` writes (UI mostly missing) |
| Detach | Unnecessary — already independent | Unnecessary |
| Delete copy | Hard `DELETE /vendor-items` | `deletedAt` on schema; **no item DELETE HTTP** |
| Later Global edit updates copies | **No** | **No** |
| Consumer reads Global | **No** | **No** |

### 6.9 Merchant-created items (critical)

**Yes — independent of Global Catalog.**

Target already allows this: `POST /catalog/items` creates a restaurant-scoped `MenuItem` with nested variants / channels / add-on groups. **No Global lineage row is required.**

Merchant UI today has **no Create item** path. Catalog home copy says “Use Add from Global”, which is **incorrect as the only path** and would regress legacy.

Both pipelines are required:

```
Global Catalog  →  materialize  →  unpublished MenuItem  →  merchant edit/publish
Merchant        →  POST /catalog/items  →  draft MenuItem     →  merchant edit/publish
```

### 6.10 Media

| Concern | Legacy |
|---|---|
| Upload | `POST /upload-assets` (S3 public URL) |
| Item persist | URLs in `images[]` / `image_thumbnails[]` / `videos[]` |
| Replace / delete | Array replace on PATCH |
| Order | Array order |
| Auth | Vendor JWT on most paths; some crop uploads omit JWT (doc 86 CORRECT) |
| Consumer | Projected on `/user/menu` |

Menu-item upload uses **`/upload-assets`**, not Experience folder upload. Experience media is a separate domain (docs 83–86). Target `MenuItem` has **no media columns**. Do not invent a catalog upload in this forensic. **Dependency:** a future media slice must either reuse the Experience upload contract (doc 86, still unresolved) or add a catalog-specific URL field after that decision. **Do not expand into Experience.**

### 6.11 Authorization (legacy)

Merchant catalog writes: vendor JWT. Super Admin may **impersonate** a vendor via `vendorAccess`. Super Admin global category writes require `superadmin`. Fine-grained staff permission trees (`vendorPermission`) are **not backend-enforced** (doc 81). Binary vendor token + impersonation.

---

## 7. L2 — Industry Benchmark

Industry practice is **evidence, not authority.** Do not replace amealio because Toast / Square / DoorDash / Uber Eats Manager do something else.

| Capability | Modern restaurant commerce / POS | amealio evidence | Use |
|---|---|---|---|
| Catalog vs menu | Reusable items; menus are presentations (Square Catalog objects, Toast menus) | Standard = virtual catalog listing; Custom = presentation menu | **PRESERVE** Stage B |
| Reusable product identity | One item on many menus | One category / one `menuSectionId`; category-sharing only | Do **not** force M:N; FUTURE if owner wants it |
| Variants | Size/style as variations, not separate products | SIZE = VARIANT | **PRESERVE** |
| Modifier groups | Required/optional, min/max, defaults; often **reusable lists** | Item-embedded groups; templates exist but are local | Keep item-owned groups (**PRESERVE**). Shared templates **FUTURE** |
| Pricing | Server / POS authoritative; channel or location overrides | Target Stage D + variant `priceMinor` + optional channel override | **PRESERVE**. No client money |
| Channel pricing | Online vs in-store common | Item channel enable + override | **PRESERVE** existing `ItemChannelConfig`. Per-variant×channel **FUTURE** (doc 47) |
| Availability vs publication | Hide vs 86 / sold out vs inventory | Two-axis already | **PRESERVE** Stage C |
| Publication / draft | Draft menus or unpublished items | `isPublished` default false | **PRESERVE**. Do not rebuild 9-step `currentState` |
| Item merchandising | Cross-sell, featured flags | Stage G item relations + legacy tags | Cross-sell API exists; UI **FUTURE**. Tags **FUTURE** |
| Combo authoring | Bundle of existing items + bundle price | Stage F | **PRESERVE** model; UI later |
| Auditability | Actor + version | `createdAt`/`updatedAt`; Global has `created_by` | Actor on merchant writes **IMPROVE** later |
| Draft/publish workflow | Explicit publish | Target publish flag; legacy also wizard complete | One flag (**CORRECT**) |
| Bulk ops | CSV / multi-select sold-out | Legacy reset-sold-out | **FUTURE** |
| Duplicate / copy | Common | `copyItem` / `copyCombo`; materialize | Duplicate-item API **FUTURE**; materialize **PRESERVE** |
| Concurrency | Version / If-Match (Toast, Square) | Catalog writes last-write-wins; orders use `expectedStatus` | **IMPROVE** later; not blocking first UI slice |
| Authorization | Role + location | Coarse `MERCHANT_OWNER`/`STAFF` + restaurant scope | **PRESERVE**. Fine catalog RBAC **FUTURE** |
| Tenant isolation | Hard | Server `StaffPrincipal.merchantId` | **PRESERVE** / already **CORRECT** |

Industry does **not** authorize inventing live Global inheritance, a second price engine, or M:N membership without amealio evidence.

---

## 8. L3 — Gap Analysis

Capability | Legacy Reality | Target Reality | Gap | Classification | Action
---|---|---|---|---|---
Independent merchant item create | AddItem wizard `POST /vendor-items` | `POST /catalog/items` exists; **no UI** | Merchants cannot operate without Global | **IMPROVE** | First slice UI
Add from Global | Temp-local and/or `add=true` | Materialize + Add-from-Global UI | Path exists | **PRESERVE** | Keep
Edit name/description/publish | Wizard + ItemAvailability | Item detail UI | Partial UI | **PRESERVE** | Keep; extend
Edit availability enum | ItemAvailability | API yes; UI no | Sold-out control missing in UI | **IMPROVE** | First slice
Variant authoring | SizePricing | API yes; UI read-only | Cannot price/size in UI | **IMPROVE** | First slice
Modifier authoring | Customization.js | API yes; UI read-only | Cannot configure rules in UI | **IMPROVE** | First slice
Channel config | Services.js | API yes; UI read-only | Cannot enable channels in UI | **IMPROVE** | First slice
Menu / section CRUD + reorder | MenuSetup / CreateCustomMenu | API yes; UI no | Custom menus unmanageable | **IMPROVE** | First slice (Custom)
Assign item to section | Change category / menu_id | `PATCH menuSectionId` | UI missing | **IMPROVE** | First slice
Item in multiple menus | Category-sharing, not M:N | One `menuSectionId` | No true M:N | **FUTURE** | Do not implement |
Menu-specific price | None | None | None unless owner wants it | **OWNER DECISION** (103 G-MENU-4) | Default: shared item
SIZE = VARIANT | `size[]` | `ItemVariant` | Aligned | **PRESERVE** | Do not replace
Modifier min/max | Flags only | `minSelect`/`maxSelect` | Target stricter (good) | **IMPROVE** (already) | UI must author min/max
Reusable modifier templates | `templates` | None | Shared lists | **FUTURE** | OD-MCA-8
Combo create | CreateCombos.js | `POST /catalog/combos` | No UI; no slot PATCH | **IMPROVE** | Defer UI; optional later API
Cross-sell authoring | Category complementary | `MerchandisingRelation` API | No UI | **FUTURE** | Do not expand G
Publish vs available | Two axes | Stage C four layers | Aligned | **PRESERVE** | UI must not collapse them
Schedule / weekly windows | Display-only | No fields | Not order-enforced historically | **FUTURE** | Stage C already deferred
Restaurant hours | Order-create gate | `ACTIVE` only | Hours unused | **FUTURE** | Out of this slice
Media | `/upload-assets` + URL arrays | No `MenuItem` media | Consumer photos missing | **FUTURE** | Blocked on doc 86
Dietary / tags / allergy columns | On `vendorItems` | No MenuItem columns | Display fields | **FUTURE** | Also Stage H adjacent
Item `sortOrder` | Yes | **No column** | Standard list order undefined | **OWNER DECISION** | OD-MCA-2
Item / variant / group DELETE | Hard delete | `deletedAt` unused over HTTP | No archive API | **OWNER DECISION** | OD-MCA-1; first slice uses unpublish
Duplicate name policy | Block name+vendor+category | No unique | Collision | **OWNER DECISION** | OD-MCA-3
Duplicate materialize | Name skip | Multiples allowed | Policy | **OWNER DECISION** | OD-I-DUP (open)
Temp-local | Onboarding preview | Direct materialize | Workflow | **OWNER DECISION** / **FUTURE** | OD-I-TEMP
Chain Catalog | Import path | None | Out of scope | **FUTURE** | Do not start
`currentState` wizard | Required for Standard consumer | Dropped | Safer | **CORRECT** | Do not recreate
Client money | Sometimes assembled client-side | Rejected / ignored | Already CORRECT | **PRESERVE** | Keep
Client merchantId auth | Weak / impersonation holes | Server principal | Already CORRECT | **PRESERVE** | Keep
Concurrency | Last write wins | Last write wins | Stale overwrite | **IMPROVE** | FUTURE (OD-MCA-6)
Staff vs owner catalog rights | Same vendor token | Same two roles | No fine RBAC | **PRESERVE** | FUTURE finer keys
SUPER_ADMIN on `/catalog` | Impersonation | Excluded | Safer | **CORRECT** | Keep
Global source mutation by merchant | Hooks keep global rows distinct | Materialize copies only | Aligned | **PRESERVE** | Keep
Historical snapshots | Weak (live address was J) | Order line `unitPriceMinor` + `merchandise.v1` | Menu edits must not rewrite orders | **PRESERVE** | No schema change
Combo slot edit after create | PATCH full combo | Metadata only | Authoring gap | **IMPROVE** | After first slice
Item reorder API | Yes | Sections only | Item order | Tied to OD-MCA-2 | FUTURE unless OD says now

### Gap kinds (explicit)

| Kind | Examples |
|---|---|
| Backend gaps | Item/variant/group DELETE HTTP; combo slot PATCH; item reorder; concurrency token; media; dietary columns; item `sortOrder` |
| Merchant UI gaps | Create item; variants; modifiers; channels; availability; menus/sections; section assign; combo; cross-sell; preview |
| Super Admin gaps | Global item PATCH/DELETE (Stage I FUTURE); no Super Admin merchant-catalog impersonation (CORRECT) |
| Consumer dependency gaps | Photos; dietary/allergy display; item sort on Standard |
| Data-model gaps | No Catalog model (intentional); 1:1 section FK; no media; no item sort; Global tables outside Prisma |
| Authorization gaps | Coarse roles only; no catalog permission keys (doc 81) |
| Concurrency / integrity | Last-write-wins catalog; no If-Match |
| Validation gaps | Publish with zero variants still allowed (Stage C makes it non-orderable); no name unique |
| Migration / compatibility | First slice needs **no** migration if UI uses existing writes |

---

## 9. L4 — Target Contract

One operational graph. One authority per behavior.

```
Merchant / restaurant (StaffPrincipal scope)
  → Menu (CUSTOM only is consumer-real; STANDARD rows are staff/experience leftovers)
  → MenuSection
  → MenuItem          ← merchant-created OR materialized copy
       → ItemVariant           SIZE = VARIANT; priceMinor BigInt
       → AddOnGroup / AddOn    Stage A rules
       → AddOnVariantPrice
       → ItemChannelConfig     channel enable + optional override
  → Combo             Stage F (existing items only)
  → MerchandisingRelation  Stage G
  → Stage C orderability
  → Stage D commercial quote
  → Stage E promotion
  → Consumer discover / cart / checkout
```

There is **no** merchant `Catalog` entity to create. “Catalog home” is the restaurant’s item list + Custom menus.

### 9.1 Authorities (do not duplicate)

| Behavior | Sole authority |
|---|---|
| Variant / modifier merchandise | Stage A `MerchandiseQuoteService` |
| Menu membership / Standard virtual | Stage B |
| PUBLISHED / VISIBLE / AVAILABLE / ORDERABLE | Stage C `orderability.ts` |
| Tax / fees / totals | Stage D `composeCommercialQuote` |
| Promotions | Stage E kernel + redemption |
| Combo identity / combo price | Stage F `ComboService` |
| Cross-sell | Stage G `MerchandisingRelation` |
| Global source | Stage I `platform-catalog` |
| Payment / refund / status | existing services |
| Catalog **authoring** | `CatalogWriteService` + `ComboService` + merchandising writes |

Clients send identities, quantities, booleans, and text. **No client-supplied money is trusted. No client-supplied `merchantId` grants scope.**

### 9.2 Invariants this contract must preserve

1. BigInt / minor-unit money  
2. Server-authoritative pricing  
3. Stage C orderability  
4. Stage D commercial quote  
5. Stage E promotion engine  
6. Stage F combo model  
7. Stage G cross-sell  
8. Global → Merchant copy/materialization  
9. Merchant-owned independent catalog content  
10. Published ≠ available  
11. Channel-aware orderability  
12. Merchant tenant isolation  
13. Historical order snapshots immutable  
14. No client-supplied money  
15. No client-supplied merchant authorization  

### 9.3 Lifecycle

```
Create draft item (merchant scratch OR materialize)
  → at least one variant before it can become ORDERABLE
  → optional modifiers / channels / section
  → isPublished = true
  → Stage C + channel → consumer
  → unpublish or SOLDOUT / NOTAVAILABLE for ops
```

Materialized copies start `isPublished=false`, `availability=AVAILABLE`. Merchant-created items should default the same (`CreateItemInput.isPublished` optional; default false). Do not auto-publish.

### 9.4 What a merchant may do

- Create menus (`CUSTOM`), sections, items, variants, add-on groups, add-ons, channel rows, combos, cross-sell relations — all restaurant-scoped.
- Edit those records through existing write APIs.
- Publish / unpublish items and combos.
- Set availability enum and child `available` flags.
- Add from Global (copy).
- Edit copies without writing Global source.
- Soft-hide Custom menus via `visibility`.

### 9.5 What a merchant may not do

- Mutate `platform_catalog_*` source rows.
- Supply prices that bypass Stage D (UI may display server quotes only).
- Author seating, events, packages, Stage H personalization, promotions stacking, inventory, alcohol rules, Chain Catalog, or live Global sync in this domain.
- Impersonate another merchant via body fields.

---

## 10. Backend API matrix

Base: `/api/v1`. Guard: `JwtStaffGuard` + `StaffAuthorizationGuard`. Roles on `/catalog/*`: `MERCHANT_OWNER`, `MERCHANT_STAFF` only.

| Method | Path | Today | First-slice need | Later |
|---|---|---|---|---|
| GET | `/catalog/restaurants` | Yes | Keep | |
| GET | `/catalog/restaurants/:id/menus` | Yes | Keep | |
| GET | `/catalog/menus/:id/sections` | Yes | Keep | |
| GET | `/catalog/restaurants/:id/items` | Yes | Keep | |
| GET | `/catalog/items/:id` | Yes | Keep | |
| POST | `/catalog/menus` | Yes | Wire UI | |
| PATCH | `/catalog/menus/:id` | Yes | Wire UI | |
| POST | `/catalog/sections` | Yes | Wire UI | |
| PATCH | `/catalog/sections/:id` | Yes | Wire UI | |
| POST | `/catalog/menus/:id/sections/reorder` | Yes | Wire UI | |
| POST | `/catalog/items` | Yes | **Wire Create item UI** | |
| PATCH | `/catalog/items/:id` | Yes (incl. availability, section, publish) | Wire availability + section | |
| POST | `/catalog/items/:id/variants` | Yes | Wire UI | |
| PATCH | `/catalog/variants/:id` | Yes | Wire UI | |
| PATCH | `/catalog/items/:id/channel-config` | Yes | Wire UI | |
| POST/PATCH | add-on-groups / add-ons / variant-prices | Yes | Wire UI | |
| GET/POST/PATCH | combos | Yes; PATCH metadata only | Defer UI | Slot PATCH **IMPROVE** |
| CRUD | merchandising-relations | Yes | Defer UI | |
| POST | `/platform-catalog/global-items/:id/materialize` | Yes | Keep UI | OD-I-DUP/TEMP |
| DELETE | menus / sections / items / variants / groups | **No HTTP** | Unpublish instead | OD-MCA-1 |
| * | item reorder | **No** | Defer | OD-MCA-2 |
| * | catalog media | **No** | Defer | Doc 86 |
| * | expectedUpdatedAt | **No** | Defer | OD-MCA-6 |

`apps/merchant` `merchantCatalogApi` currently wires restaurants, items, menus, sections, getItem, and `updateItem({name, description, isPublished})` only.

---

## 11. Data-model matrix

| Model | Supports first-slice contract? | Gap |
|---|---|---|
| *(no Catalog)* | Yes — intentional | Do not add a Catalog table |
| `Menu` | Yes | Soft-delete HTTP unused |
| `MenuSection` | Yes | `sortOrder` present |
| `MenuItem` | Yes for identity / publish / availability / section | No media, no sortOrder, no dietary/tags, one section FK |
| `ItemVariant` | Yes | SIZE = VARIANT |
| `ItemChannelConfig` | Yes | Per-variant×channel FUTURE |
| `AddOnGroup` / `AddOn` / `AddOnVariantPrice` | Yes | No reusable template table |
| `Combo` / slots / options / `ComboSection` | Yes | Slot mutation after create missing |
| `MerchandisingRelation` | Yes | UI later |
| `platform_catalog_*` | Yes for Stage I | Raw SQL; no Prisma models |
| `platform_catalog_item_materializations` | Yes | Audit only; no detach needed |
| Order / `OrderItem` snapshots | Yes | Do not add live catalog FKs into history |

**Migration required for first slice?** **No.**  
**Backfill required?** **No.**  
**Stage I materializations remain valid?** **Yes.**  
**Existing orders unaffected?** **Yes** — snapshots stay immutable.  
**Legacy records that cannot be represented?** Media, dietary/tags/allergy, schedules, `currentState`, barcodes, taste sliders, temp-local flags, Chain Catalog, category-sharing-as-multi-menu. Those stay FUTURE / DO NOT COPY, consistent with docs 77 / 112.

---

## 12. Merchant UI matrix

Current routes (`apps/merchant`): `/catalog`, `/catalog/add-from-global`, `/catalog/items/:itemId`. Shell: Inter + `--ame-*` + existing `Layout` / design-system components. **Do not redesign the shell.**

| Capability | Legacy UI | Target UI today | Proposed | Class |
|---|---|---|---|---|
| Catalog home (item list + restaurant picker) | MenuSetup / dashboards | `MerchantCatalogScreen` | Keep; add Create item CTA | **IMPROVED** |
| Add from Global | MenuSetup + ItemAvailability picker | `AddFromGlobalScreen` | Keep | **LEGACY** (safer copy) |
| Item create (scratch) | AddItem 9-step | **Missing** | Single form: name, description, section, first variant price, channels, publish later | **CORRECTED** (no `currentState`) |
| Item edit | Wizard + dashboard | Name/description/publish | Add availability, section, POS id optional | **IMPROVED** |
| Variant management | SizePricing | Read-only | Create/edit size, SKU, priceMinor, default, available | **IMPROVED** |
| Modifier management | Customization | Read-only | Groups min/max/qty/defaults + add-ons + variant prices | **IMPROVED** |
| Menu management | CreateCustomMenu | **Missing** | Create/rename/visibility Custom menus | **IMPROVED** |
| Menu sections | AddCategories + drag-drop | **Missing** | Create/rename/reorder; optional `categoryId` | **IMPROVED** |
| Categories (platform taxonomy) | Label pickers | Optional `categoryId` on section | Keep optional; do not rebuild taxonomy admin | **DEFERRED** (platform Category already exists) |
| Channel configuration | Services.js | Read-only | Enable/disable + optional overrideMinor | **IMPROVED** |
| Availability controls | ItemAvailability | **Missing** | Enum + variant/group available | **IMPROVED** |
| Publish / unpublish | `status` toggle | Select on item | Keep; do not merge with availability | **LEGACY** / **CORRECTED** naming |
| Pricing management | SizePricing + channel sizes | None (server quote elsewhere) | Variant `priceMinor` inputs only; no client quote engine | **CORRECTED** |
| Combo management | CreateCombos | **Missing** | After first slice | **DEFERRED** |
| Global import | Yes | Yes | Keep | **LEGACY** |
| Merchant-created item workflow | Yes | **Missing** | Required | **CORRECTED** (must exist) |
| Cross-sell authoring | Category complementary | **Missing** | After first slice; use Stage G item relations | **DEFERRED** |
| Preview | Soft-onboarding / share links | **Missing** | Consumer URL later | **DEFERRED** |
| Ordering / sorting | Drag-drop | Section reorder API unused in UI | Sections now; items OD-MCA-2 | **IMPROVED** / **DEFERRED** |
| Duplication | `copyItem` / `copyCombo` | **Missing** | FUTURE | **DEFERRED** |
| Media | Crop + upload-assets | **Missing** | Doc 86 | **DEFERRED** |
| 9-step wizard chrome | Yes | — | Do not clone | **CORRECTED** |

---

## 13. Super Admin dependencies

| Dependency | Status | This contract |
|---|---|---|
| Global Catalog container / category / item create | Implemented (Stage I UI) | Unchanged |
| Global item PATCH/DELETE | Missing | **FUTURE** (112) — not required for merchant authoring |
| Merchant impersonation onto `/catalog` | Intentionally forbidden | **PRESERVE** CORRECT |
| Chain Catalog | Missing | **DEFERRED** |
| Upload / S3 | Doc 86 unresolved | Blocks **media only** |
| Fine Super Admin catalog RBAC | Foundation keys only | Out of slice |

Merchants must be able to operate if Super Admin never publishes a Global item.

---

## 14. Consumer dependencies

| Consumer surface | Depends on merchant authoring? | Notes |
|---|---|---|
| `GET /discover/restaurants/:id/menu` Standard | Published items + Stage C | Works today with seed / materialized items |
| Custom menus | Visible CUSTOM + `menuSectionId` | Needs menu/section UI to be operable |
| Item detail + quote | Variants + modifiers | Authoring UI must produce valid Stage A data |
| Cart / checkout / Stage J address | Published orderable items | No authoring change to J |
| Combos | Published combos | Defer combo UI; consumer already supports Stage F |
| `pairsWellWith` | Stage G relations | Defer authoring UI |
| Photos / dietary chips | No target fields | FUTURE; consumer already functions without them |

Do not add consumer routes in the authoring slice. Do not make consumer read Global Catalog.

---

## 15. Security / tenant matrix

| Threat | Legacy | Target | Class |
|---|---|---|---|
| Cross-merchant catalog read/write | Vendor JWT; Super Admin impersonation | `MerchantScopeService.assertRestaurantInScope`; SUPER_ADMIN 403 on `/catalog/restaurants` | **CORRECT** / keep |
| Client `merchantId` | Sometimes sent | Ignored for scope; merchandising rejects body merchantId | **CORRECT** |
| Client `restaurantId` | Query/body | Must belong to principal merchant | **PRESERVE** |
| Cross-restaurant item access | Same vendor can see all vendor items | Item restaurant checked via scope | **PRESERVE** |
| Cross-merchant item as combo component | Weak | `assertItemsInRestaurant` | **PRESERVE** |
| Staff role split | Unenforced permission trees | OWNER and STAFF identical catalog writes | **PRESERVE**; finer RBAC FUTURE |
| SUPER_ADMIN boundaries | Impersonation | Platform Global only; cannot materialize | **PRESERVE** |
| Duplicate creation | Name+vendor+category block | No unique | **OWNER DECISION** OD-MCA-3 |
| Concurrent edits | Last write wins | Same | **IMPROVE** later |
| Stale updates | Possible | Possible | OD-MCA-6 |
| Deleted records | Hard delete | `deletedAt` unused over HTTP | OD-MCA-1 |
| Unpublished records | Consumer requires `status` | Consumer requires `isPublished` | **PRESERVE** |
| Global source mutation | Merchant hooks skip global | Writes go to `MenuItem` only | **PRESERVE** |
| Merchant copy integrity | Independent document | Independent row + lineage | **PRESERVE** |
| Materialization integrity | Flags + catalogue_id | Lineage table UNIQUE (source, menu_item) | **PRESERVE**; OD-I-DUP for policy |
| Client money | Sometimes trusted | `normalizeMoney` + quote ignore | **PRESERVE** |

---

## 16. Migration / data compatibility matrix

| Question | Answer |
|---|---|
| Does current Prisma support the first-slice contract? | **Yes** |
| Migration required for first slice? | **No** |
| Backfill required? | **No** |
| Stage I materializations remain valid? | **Yes** — copies stay independent |
| Existing orders remain unaffected? | **Yes** |
| Historical snapshots remain immutable? | **Yes** — do not rewrite `OrderItem` on catalog edit |
| Legacy records that cannot be represented? | Media, tags/dietary/allergy, schedules, wizard state, barcodes, Chain, temp-local, unused `Menu.categories.item[]` |
| Soft-deleted items | Schema ready; no authoring API yet |
| Global tables outside Prisma | Acceptable; do not migrate in this slice |

**Do not write migrations in the implementation slice unless an accepted owner decision requires `sortOrder` or media columns.**

---

## 17. PRESERVE / IMPROVE / CORRECT / OWNER DECISION / FUTURE

### PRESERVE

- SIZE = VARIANT  
- Stage A–G and Stage I copy semantics  
- Standard virtual / Custom real  
- One `menuSectionId` (no M:N now)  
- Published ⊥ available ⊥ orderable  
- Merchant-created **and** materialized items on the same `MenuItem` table  
- BigInt money; no client money; no client merchant auth  
- SUPER_ADMIN excluded from merchant `/catalog`  
- Historical order snapshots  
- Add-from-Global unpublished copy  

### IMPROVE

- Merchant UI for scratch create, variants, modifiers, channels, availability, menus/sections  
- Modifier min/max already in API — expose in UI  
- Combo slot PATCH (after first slice)  
- Optional later: concurrency token, audit actor  

### CORRECT

- Do not recreate `currentState` 1–9 as a consumer gate  
- Do not treat Add-from-Global as the only create path  
- Do not use fake Standard `_id=123456`  
- Do not impersonate merchants via SUPER_ADMIN `/catalog`  
- Do not copy live Global inheritance  
- Do not collapse publish into availability  

### OWNER DECISION

See §18.

### FUTURE

- Media / upload (doc 86)  
- Dietary / tags / allergy / nutrition columns  
- Schedules / restaurant hours engine  
- Item M:N membership  
- Chain Catalog / temp-local  
- Combo + cross-sell UI  
- Duplicate item/combo  
- Bulk sold-out  
- Shared modifier templates  
- Global item PATCH/DELETE  
- Fine-grained catalog RBAC  
- Per-variant×channel price  
- Preview / share links  
- Inventory / alcohol / apparel / Stage H / Stage K  

---

## 18. Exact owner decisions

### 18.1 Resolved from evidence (do not re-open)

| ID | Resolution |
|---|---|
| SIZE = VARIANT | **Keep** |
| Item-level menu M:N | **Not required** by legacy. Stay 1:1 `menuSectionId` |
| Merchant scratch create | **Required** if Global import exists |
| Global = copy | **Keep.** No propagation |
| Publish vs available | **Keep two axes.** Drop `currentState` |
| Menu-specific price | Default **shared item** (103 G-MENU-4 recommendation) unless owner later reverses |
| Channel menus | **No.** Channel on items |
| SUPER_ADMIN `/catalog` | **Forbidden** |
| Experience upload in this slice | **Out.** Dependency noted only |
| Combo / Stage F redesign | **Forbidden** |
| Live Global sync / Chain Catalog | **Forbidden / deferred** |

### 18.2 Still unresolved (do not guess in implementation)

| ID | Question | Default if forced to ship without answer |
|---|---|---|
| **OD-I-DUP** | Duplicate materialize key: name-per-restaurant vs source+restaurant unique vs allow multiples | Keep current allow-multiples (already shipped). Do not silently unique |
| **OD-I-TEMP** | Recreate temp-local two-phase import? | **No** for first authoring slice. Direct materialize stays |
| **OD-MCA-1** | Item/variant/group delete: hard vs `deletedAt` HTTP vs unpublish-only | First slice: **unpublish / available flags only**. No DELETE |
| **OD-MCA-2** | Item `sortOrder` on Standard virtual list | **No column now.** Consumer order remains unspecified / createdAt. Do not migrate |
| **OD-MCA-3** | Unique name per restaurant/section? | **No unique** until decided. UI may warn |
| **OD-MCA-5** | Distinct OWNER vs STAFF catalog writes? | **Same writes** (legacy + current roles) |
| **OD-MCA-6** | Catalog If-Match / expectedUpdatedAt? | **No** in first slice |
| **OD-MCA-8** | Reusable modifier templates? | **No** — item-owned groups only |
| **OD-MCA-9** | Catalog media: wait for Experience upload vs catalog-only URL field | **Wait** — no media in first slice |
| **OD-MCA-11** | May merchant create item with zero variants? | **Yes as draft**; Stage C keeps it non-orderable. UI should warn before publish |
| **OD-MCA-12** | Combo / cross-sell in first authoring GO? | **No** — Standard item path first |

G-MENU-4 (independent Custom-menu price) remains the older open product question; this document does not reverse Stage B/D.

---

## 19. Smallest justified implementation slice

**Name:** Merchant Catalog Authoring Slice 1 — scratch item + structural edit + publish.

**Why this is the smallest production-grade step:** a merchant cannot operate an amealio restaurant from Global copies alone. Legacy evidence proves an independent create path. The **write APIs and schema already exist.** The blocking gap is merchant UI (plus exposing `availability` / variants / modifiers / channels / Custom menus that the API already performs).

### Include (after explicit GO — not this task)

1. Catalog home: Create item CTA beside Add from Global.  
2. Create item screen: `POST /catalog/items` with `restaurantId`, name, optional description, optional `menuSectionId`, **one variant** (`priceMinor` integer string → server BigInt), optional channel enables. Default `isPublished=false`.  
3. Item detail: keep name/description/publish; add `availability`; add section assign; add variant create/edit; add add-on group/add-on/variant-price; add channel config.  
4. Custom menu + section create/edit/visibility/reorder using existing endpoints.  
5. Existing design system only.  
6. Keep Stage I Add from Global and lineage banner.  
7. Money inputs as integer minor units (or a display helper that still submits minor units). No client quote calculator.

### Exclude

- Prisma/migrations  
- Media / upload-assets  
- Combo UI and combo slot PATCH  
- Cross-sell UI  
- Dietary/tags/allergy  
- Schedules  
- M:N membership  
- DELETE endpoints  
- Item sortOrder column  
- Temp-local / Chain Catalog  
- Global item PATCH  
- 9-step wizard recreation  
- Super Admin impersonation  
- Stage H / J expansion / K  
- New price / availability / promotion engines  

---

## 20. IMPLEMENT NOW vs DEFER

| Item | When |
|---|---|
| This forensic document | **DONE** (docs only) |
| Merchant scratch create UI + structural edit UI + availability + Custom menu/section UI | **IMPLEMENT NOW after GO** |
| Add-from-Global (already shipped) | Keep |
| Combo authoring UI | **DEFER** |
| Cross-sell authoring UI | **DEFER** |
| Media | **DEFER** (doc 86) |
| OD-I-DUP / OD-I-TEMP product choices | **DEFER** (do not assume) |
| Chain Catalog | **DEFER** |
| M:N membership | **DEFER** |
| Delete / archive HTTP | **DEFER** (OD-MCA-1) |
| Concurrency tokens | **DEFER** |
| Modifier templates | **DEFER** |
| Bulk ops / duplicate | **DEFER** |
| Preview | **DEFER** |
| Super Admin Global item PATCH | **DEFER** (112) |
| Stage H / K / seating / guest cart / maps | **DEFER** |

---

## 21. Explicit dependencies / blockers

| Blocker | Blocks | Severity |
|---|---|---|
| Explicit implementation GO | Any code | Hard stop — this task must not implement |
| Existing `/catalog` write APIs | None for first slice | Ready |
| Stage C/D/E/F/G/I | Must remain untouched | Constraint |
| OD-I-DUP / OD-I-TEMP | Import-complete claims only | Not a first-slice blocker |
| Doc 86 upload contract | Item photos | Media only |
| Item `sortOrder` column | Deterministic Standard order | Not required to publish/order |
| Combo slot PATCH | Editing combo structure | Combo UI only |
| Amealio-VendorApp missing | Native merchant parity check | Residual unknown; web merchant UI is sufficient |
| Fine RBAC catalog keys | Split owner/staff | Not evidenced |

---

## Confirmation (this task)

- Prisma schema **not** modified  
- No migrations  
- No controllers / services / React / routes / API contracts / seeds / CSS  
- Stages A–J behavior **not** altered  
- Stage H / K **not** started  
- No merge. No new branch. Branch remains `replatform/backend-consolidation`  
- HARD STOP after these documents  
