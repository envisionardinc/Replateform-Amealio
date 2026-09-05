# 112 — Stage I: Global / Merchant Catalog + Global Experience Catalogue

**Status:** FORENSIC COMPLETE + smallest justified slice IMPLEMENTED.  
**Date:** 2026-09-05  
**Accepted HEAD at forensic start:** `a5645e0d6636e8d7067c764c0e2dc2d4cc7c3e1a`  
**Implementation start HEAD:** `6704b296e54e1ffb1fc738750e4bc87550cd5088`  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Authoritative prior forensics:** [75](./75-PLATFORM-CATALOG-REALITY-RECONCILIATION.md) (supersedes doc 34 “no Global Catalog”) · [76](./76-GLOBAL-CATALOG-MATERIALIZATION-FORENSIC-MAP.md) · [77](./77-GLOBAL-ITEM-FIELD-PRESERVATION-MAP.md) · [78](./78-GLOBAL-CATALOG-API-CONTRACT-FORENSIC-TRACE.md) · [82](./82-GLOBAL-ITEM-CATALOGUE-TARGET-VALIDATION.md) · [83](./83-GLOBAL-EXPERIENCE-CATALOGUE-FORENSIC-CONTRACT.md) · [84](./84-MERCHANT-EXPERIENCE-MEDIA-RECONCILIATION.md) · [85](./85-MERCHANT-EXPERIENCE-NEST-CUTOVER.md) · [86](./86-EXPERIENCE-UPLOAD-ASSETS-FORENSIC-CONTRACT.md)  
**Do not merge with:** Stage G merchandising · Stage H personalization (DEFERRED) · Celebration Packages  
**Machine-readable matrix:** [112-STAGE-I-GAP-MATRIX.json](./112-STAGE-I-GAP-MATRIX.json)

**Implementation slice:** Super Admin Global Item Catalog UI and merchant Add from Global, hosted as role-gated routes on the existing staff app (`apps/merchant`). No new frontend application. No Chain Catalog, temp-local, Global Item PATCH/DELETE, Experience, Celebration, Stage H, or Stage J.

---

## Vocabulary (do not collapse)

| Contract | What it is | What it is not |
|---|---|---|
| **A — Global Item Catalog** | Super Admin–owned reusable item/category/catalogue source | Not the merchant menu. Not consumer catalog. Not Experience folders |
| **B — Merchant Item Catalog** | Merchant-owned operational `Menu` / `MenuSection` / `MenuItem` (+ variants, add-ons, channels) | Not a second product model. Not live inheritance from A |
| **C — Chain Catalog** | Legacy chain-scoped reusable source (`/chaincatalogue`, `is_chain_catalogue`) | Not Global. **Not in the target.** Deferred |
| **D — Global Experience Catalogue** | Platform-owned **media folder** + reusable copy text | Not a bookable Experience. Not Contract A |
| **E — Merchant Experience** | Restaurant-scoped operational Experience | Not a platform folder. Not a Celebration Package |
| **Menu** | Merchant publication surface attached to a restaurant | Not the global source |
| **Celebration Packages** | Separate future domain | **Out of this stage** |

These are related platform capabilities. They are **not** one generic “catalog” abstraction. Do not introduce `PlatformCatalogItem` for Experiences.

---

## Evidence sources

| Repo | Path | Finding |
|---|---|---|
| Amealio-VendorDashboard | `/agent/repos/amealio-vendordashboard` | `/global-catalogue`, `/catalogue`, `/vendor/localCategoryItems`, `POST /vendor/items?add=true`, `/chaincatalogue`, `/experience-media` |
| AmealioDashboardMVP- | `/agent/repos/amealiodashboardmvp-` | Super Admin GlobalCatalogue\* + ExperienceCatalog\*; merchant Global/Chain selection + CloneFolderPopup |
| amealio_web_app | `/agent/repos/amealio_web_app` | Consumer reads **merchant** menus/items. No Global Catalog API |
| amealio-nestjs-backend | `/agent/repos/amealio-nestjs-backend` | **No** catalogue / experience-media engine |
| amealio-self-delivery-app | `/agent/repos/amealio-self-delivery-app` | **No** catalogue engine |
| Amealio-VendorApp | — | **Unavailable** |
| Amealio-Homepage-V2-RAG-Server | — | **Unavailable** (irrelevant to this domain) |
| Replateform-Amealio | `/agent/repos/replateform-amealio` | `platform-catalog`, `platform-experience-catalogue`, merchant `catalog` write, `experience` + `mapPlatformFolderToExperienceMedia`. **No merchant/admin UI** for these APIs |

Doc 34 / 42 / 46 claims that “no Super Admin Item Catalog exists” are **superseded by doc 75** and by the source cited below.

---

## 1. L1 — Global Item Catalog Reality

### 1.1 Who / what

| Question | Legacy | Target today |
|---|---|---|
| Who creates | Super Admin (`POST /catalogue`, `POST /global-catalogue`) | `POST /platform-catalog/global*` + `@PlatformOnly` (SUPER_ADMIN, `merchantId === null`) |
| Who edits | Super Admin `PATCH /catalogue` | `PATCH /platform-catalog/global/:catalogId` Super Admin only. **No PATCH item/category** |
| Who deletes / deactivates | Super Admin `DELETE /catalogue/:id`; status toggle | **No DELETE.** Status on container only. Materialization FK is `ON DELETE RESTRICT` |
| Catalog fields | `name`, `cuisin_type`, `description`, `status`, `items[]` | `name`, `cuisineType`, `description`, `status`, `legacyId`, `sourcePayload`, audit |
| Who creates global categories | Super Admin via `/global-catalogue` (global `menu_category` `is_global=true`) | `POST …/global/:catalogId/categories` Super Admin |
| Who creates global items | Super Admin via `/global-catalogue` (`vendorItems` `is_global=true`); duplicate **global name** rejected | `POST …/global/:catalogId/items` Super Admin |
| What “assign” means | `assign_items` replaces/unions the catalogue’s item-id list. Warning in source: do not send casually | **Not implemented** as a separate assign API. Items are created under a catalog/category |
| What “add” means | Merchant `POST /vendor/items?add=true` copies selected source IDs into merchant `vendorItems` | `POST …/global-items/:sourceItemId/materialize` copies into `MenuItem` + lineage row |

### 1.2 Answers to the 37 forensic questions

1. **Create Global Catalog:** Super Admin only.  
2. **Edit:** Super Admin only (container metadata on target; legacy also Super Admin).  
3. **Delete/deactivate:** Legacy delete + status. Target: status on container; **delete deferred** because copies RESTRICT the source item.  
4. **Catalog fields:** name, cuisine, description, status (+ target lineage/audit).  
5. **Global categories:** Super Admin.  
6. **Global items:** Super Admin.  
7. **Global item fields (legacy):** the full `vendorItems` document (doc 77). Target first-class: name, description, category, `sourcePayload` JSON for product snapshot.  
8–16. **Variants / SKU / modifiers / rules / add-ons / variant prices / channels / availability / publication:** Legacy `add=true` copies `size`, `addOns`, per-channel blocks, weekly timings, `availability`, `currentState`, etc. Target copies **only** if `sourcePayload.product` contains `variants`, `addOnGroups`, `channelConfigs` (see §8). Publication on materialize is **forced unpublished** (`isPublished=false`). Availability defaults `AVAILABLE` unless encoded in payload (legacy copied source `availability`).  
17. **Categories / menu sections:** Legacy maps source category → merchant category (`cat_id` or temp-local category). Target attaches optional existing `menuSectionId` (must belong to the scoped restaurant).  
18. **Assign:** catalogue membership list, Super Admin.  
19. **Add:** merchant copy of selected items.  
20. **Temporary-local:** `GET /vendor/localCategoryItems` creates `is_temp_local=true` copies; commit promotes or deletes. **Absent on Nest.**  
21. **Merchant commit:** `POST /vendor/localCategoryItems` sets `is_temp_local=false`, `is_local=true`, optional menu attach. **Absent on Nest.** Direct `add=true` / `materialize` skips this phase.  
22. **Merchant edits copy:** edits the merchant document only.  
23. **Later global edits update copies?** **No evidence of propagation.**  
24. **Lineage:** Legacy: `catalogue_id`, `temp_parent_category_id`, flags. Target: `platform_catalog_item_materializations` (source item → `MenuItem`).  
25. **Inheritance:** **No** live inheritance.  
26. **Propagation:** **No.**  
27. **Versioning:** **No.**  
28. **Conflict resolution:** **No** merge engine. Legacy `add=true` skips create when `vendor_id + name` exists.  
29. **Detach:** copies are already independent; no detach API.  
30. **Global source deleted:** target **RESTRICT** — cannot delete a source item that has materializations. Copies keep their own rows.  
31. **Materialize more than once?** Target unique is `(source_item_id, menu_item_id)` only — **same source can create multiple MenuItems**. Legacy name-dedupes per vendor.  
32. **Duplicate prevention:** legacy name-per-vendor on `add=true`; global create rejects duplicate global name. Target: no name unique on materialize.  
33–35. **Chain Catalog:** separate source; same temp-local machinery with `chainCatalogue` query. Precedence: merchant **chooses** Global or Chain in UI — they coexist; **no automatic winner**.  
36–37. **Consumer discovery:** **merchant materialized / merchant-authored published + Stage C items only.** Consumer never reads `platform_catalogs`.

### 1.3 Critical materialization rule

```
Global Catalog  →  copy/materialize  →  Merchant-owned MenuItem
                                    →  Menu / section
                                    →  Consumer (Stage C)
```

**Preserve copy/materialization.** Do not invent live synchronization. Target already follows this: `parseMaterializationProduct` + insert `MenuItem` + lineage row. Subsequent merchant PATCH goes through `CatalogWriteService` and does not write the global source.

---

## 2. L1 — Merchant Catalog Reality

Target operational model is already the A–G foundation:

`Menu` → `MenuSection` → `MenuItem` → `ItemVariant` / `AddOnGroup` / `AddOn` / `AddOnVariantPrice` / `ItemChannelConfig`

HTTP: `apps/api/src/modules/catalog/catalog.controller.ts` — `MERCHANT_OWNER` / `MERCHANT_STAFF`. SUPER_ADMIN is **not** on these routes. Scope from `StaffPrincipal` + `MerchantScopeService`. Client `merchantId` is never trusted.

Merchant-created items coexist with materialized copies. Do **not** add a second product table.

`apps/merchant` today is **orders only** (`/`, `/orders/:id`, `/login`). No catalog UI.

---

## 3. L1 — Chain Catalog Reality

| Question | Finding |
|---|---|
| Exists in legacy? | **Yes** — model `chaincatalogue`, Super Admin CRUD `/chaincatalogue` + `/admin/chaincatalogue`, merchant `chainCatalogue` materialize branch, UI `AssignChainItem` + onboarding Global/Chain picker |
| Ownership | Chain (`restaurant_chain_id`), not platform-global |
| Target | **Absent** |
| Precedence vs Global | Alternate source the merchant selects. **No** documented automatic override |
| Implement now? | **No.** UI presence alone does not justify a second source layer before Global + merchant copy is exercised in the target UI |

Contract C is **documented and deferred**.

---

## 4. L1 — Global Experience Catalogue Reality

Authoritative depth: doc 83. Target module exists and matches that contract.

| Question | Verdict |
|---|---|
| Who creates / edits folders / media | Super Admin (`@PlatformOnly`) |
| Who reads | SUPER_ADMIN + MERCHANT_OWNER + MERCHANT_STAFF |
| What is reusable | Folder metadata + photo/video **URLs** |
| Merchant clone | Client maps `GET /platform-experience-catalogue/:id` via `mapPlatformFolderToExperienceMedia()` then `POST /experiences` |
| Copied | name, description, category/subcategory, tags, userBenefits, termsAndConditions, non-archived photo/video URLs (thumbnails = photos; promotionalVideos = `[]`) |
| Referenced | URL strings only — **no binary copy**, no asset lineage |
| Lineage / propagation / inheritance | **None.** Do not invent `sourceFolderId` |
| Source folder/media change | Does **not** update existing Experiences (shared URL may 404 if S3 object is removed — storage, not catalog) |
| Merchant may edit copied values | **Yes** — ordinary Experience PATCH |
| Template vs library | **Media library + metadata seed.** Not tickets/seating/packages/venue |
| “Folder” | Grouping of reusable content, **not** a full Experience template |
| Upload | Out of scope (doc 86). Store URLs only |

Secondary legacy `/media-catalogue` is a **different** system. Do not merge.

Merchant-to-merchant Experience clone (`ClonePopup`) is Contract E, not D.

---

## 5. L1 — Merchant Experience Reality

`Experience` is restaurant/merchant scoped. Media are string URL arrays (`photos`, `photoThumbnails`, `videos`, `promotionalVideos`) plus `userBenefits`, `termsAndConditions`, `tags` (doc 84). No platform-folder FK. No server `materialize`/`clone` route (controller tests assert this).

Celebration / occasion / festival / event / experience **packages** are **not** this domain.

---

## 6. L2 — Industry Benchmark

Smallest robust architecture for amealio — not enterprise PIM/MDM:

| Pattern | Fit |
|---|---|
| Global reusable catalog as **source**, merchant catalog as **operational** | **Required** — already the L1 model |
| Copy/materialize with optional lineage | **Required** — lineage exists for items; must not become sync |
| Live inheritance / push-to-all-franchisees | **Not justified** |
| Versioning / conflict merge | **Not justified** |
| Chain/franchise catalog | Common in industry; **amealio has it in legacy**; defer until Global path is productized |
| Detach/override | Unnecessary when copies are already independent |
| Publish state on the **merchant** item | **Required** — consumer never reads global source. Target unpublished-on-copy is safer than blindly copying `currentState` |
| Reusable **content/media library** for Experiences | **Required** and already present — distinct from item PIM |
| Audit (who created the source) | Present on both platform tables |

---

## 7. L3 — Gap Analysis

| ID | Gap | Class |
|---|---|---|
| I-A-1 | Distinct platform item source vs merchant menu | **PRESERVE** — already in target |
| I-A-2 | Copy, not live inheritance | **PRESERVE** |
| I-A-3 | Super Admin mutations / merchant discovery + materialize | **PRESERVE** |
| I-A-4 | Consumer never reads Global Catalog | **PRESERVE** |
| I-A-5 | No DELETE catalogue/item | **FUTURE** (RESTRICT + copies) |
| I-A-6 | No PATCH global item/category | **IMPROVE** later |
| I-A-7 | No assign_items membership API | **FUTURE** (create-under-catalog is enough) |
| I-A-8 | Full `vendorItems` field copy | **FUTURE** (doc 77) — `sourcePayload.product` is the sanctioned subset |
| I-A-9 | Duplicate materialize (name vs source+restaurant) | **OWNER DECISION** OD-I-DUP |
| I-A-10 | Temp-local + commit | **FUTURE** / **OD-I-TEMP** |
| I-B-1 | Merchant catalog write API | **PRESERVE** |
| I-B-2 | No merchant catalog UI | **IMPROVE** — next GO, not this pass |
| I-C-1 | Chain Catalog | **FUTURE** |
| I-D-1 | Experience folder API + URL media | **PRESERVE** |
| I-D-2 | No server Experience materialize | **PRESERVE** (parity with client clone) |
| I-D-3 | No Experience folder UI | **IMPROVE** later |
| I-E-1 | Merchant Experience + mapper | **PRESERVE** |
| I-UPL-1 | Upload/S3 | **FUTURE** (doc 86) — do not touch |
| I-CEL-1 | Celebration Packages | **FUTURE** — do not touch |
| I-H-1 | Stage H | **FUTURE** — do not touch |
| I-AUTH-1 | Client merchantId never grants scope | **CORRECT** (already) |
| I-PUB-1 | Materialize `isPublished=false` | **IMPROVE** vs legacy copy-of-state; safer |

---

## 8. L4 — Target Contracts

### Contract A — Global Item Catalog

- **Ownership:** platform / SUPER_ADMIN.  
- **Scope:** reusable catalogues → categories → items. Not restaurant-scoped.  
- **Lifecycle:** create / read / patch container; create category/item. Soft status on container. Delete **refused** while materializations exist (RESTRICT).  
- **Visibility:** staff discovery (Super Admin + merchant staff). **Never** consumer discovery.  
- **Materialization:** merchant-initiated copy into Contract B.  
- **Lineage:** `platform_catalog_item_materializations` audit only.  
- **Editing source:** does not write merchant copies.  
- **Propagation / versioning:** forbidden unless a future owner reverses this.  
- **Authorization:** `@PlatformOnly` mutations; staff roles for GET; `materialize` merchant roles + `assertRestaurantInScope`.

### Contract B — Merchant Item Catalog

- **Ownership:** merchant, restaurant-scoped.  
- **Scope:** existing Prisma catalog graph only.  
- **Lifecycle:** merchant create/edit/publish via `/catalog`. Materialized items start unpublished.  
- **Visibility:** merchant staff; consumer sees published + Stage C orderable only.  
- **Editing:** independent of source.  
- **Authorization:** `MERCHANT_OWNER` / `MERCHANT_STAFF`; server-derived merchant id.

### Contract C — Chain Catalog

**Deferred.** If implemented later: chain-owned source, same copy semantics, merchant chooses source. No automatic Global-vs-Chain winner.

### Contract D — Global Experience Catalogue

- **Ownership:** platform / SUPER_ADMIN.  
- **Scope:** folder + PHOTO/VIDEO URL children.  
- **Lifecycle:** create / patch metadata / append URLs / soft-archive media / soft-delete folder (`deletedAt`).  
- **Visibility:** Super Admin + merchant staff discovery.  
- **Materialization:** **none on the server.** Client mapper seeds Contract E.  
- **Lineage / propagation:** none.  
- **Authorization:** `@PlatformOnly` writes; staff roles for reads.  
- **Upload:** out of scope; URLs only.

### Contract E — Merchant Experience

- **Ownership:** merchant/restaurant.  
- **Scope:** operational Experience including URL media arrays.  
- **Clone from folder:** new Experience; source folder unchanged.  
- **Clone from Experience:** merchant-to-merchant copy; not platform catalog.  
- **Packages / celebrations:** out of scope.

### Pipeline (items)

```
Super Admin Global Item
        ↓ materialize (copy)
Merchant MenuItem (+ optional section)
        ↓ merchant publish + Stage C
Consumer
```

### Pipeline (experiences)

```
Super Admin Experience Folder + media URLs
        ↓ mapPlatformFolderToExperienceMedia
Merchant Experience (independent)
```

---

## 9. Field-by-field materialization mapping

### 9.1 Global Item → Merchant MenuItem

| Field | Classification | Notes |
|---|---|---|
| New merchant identity | **TRANSFORM** | New `MenuItem.id`; never reuse global id |
| name | **COPY** | Overridable (`nameOverride`) |
| description | **COPY** | Overridable |
| category / menu section | **TRANSFORM** | Target requires an existing merchant `menuSectionId` (optional). Legacy used `cat_id` or temp-local category |
| image / media | **DO NOT COPY** (first slice) | Legacy copies `images` / thumbs / videos. Target has no MenuItem media columns in this path. **FUTURE** |
| variants / size / price / SKU / default / available | **COPY** if in `sourcePayload.product.variants` | BigInt minor units |
| channel enabled / channel price override | **COPY** if `channelConfigs` present | Enum channels only |
| availability (stock enum) | **TRANSFORM** | Target default `AVAILABLE` |
| publication | **TRANSFORM** | Target `isPublished=false`. Legacy copied `currentState` / `status` |
| modifier groups min/max / allowQuantity / available / sort | **COPY** if `addOnGroups` | |
| add-ons + defaults | **COPY** if present | |
| variant modifier prices | **COPY** if `variantPrices` match size/sku | |
| tags / dietary / health / allergy | **DO NOT COPY** | Legacy copies; Nest MenuItem has no columns. **FUTURE** (also Stage H safety) |
| tax / fee metadata | **DO NOT COPY** | Stage D owns money; do not import opaque surcharges blindly |
| sort order | **NOT EVIDENCED** on target materialize | Legacy copies `sortOrder` |
| external ids | **DO NOT COPY** | `ext_id` copied in legacy; target `legacyId` is for migration, not this path |
| weekly timings / lead time | **DO NOT COPY** | Stage C schedule FUTURE |
| `is_global` / temp flags | **DO NOT COPY** | Flags stay off MenuItem (CORRECT) |
| audit | **TRANSFORM** | New timestamps; lineage row |
| live sync fields | **DO NOT COPY** | |

### 9.2 Platform folder → Merchant Experience

| Field | Classification |
|---|---|
| name, description, categoryId, subCategoryId, tags | **COPY** (mapper) |
| userBenefits, termsAndConditions | **COPY** |
| status / isAiGenerated | **DO NOT COPY** onto Experience |
| photos / videos (non-archived) | **REFERENCE** (URL strings) |
| photoThumbnails | **TRANSFORM** (same URLs as photos) |
| promotionalVideos | **DO NOT COPY** (`[]` — folder has no field) |
| sourceFolderId | **DO NOT COPY** (do not invent) |
| tickets / seating / packages / venue | **DO NOT COPY** (not on folder) |

---

## 10. Authorization model

| Action | Who |
|---|---|
| Mutate Global Item Catalog | SUPER_ADMIN only (`@PlatformOnly`) |
| Discover Global Item Catalog | SUPER_ADMIN + MERCHANT_OWNER + MERCHANT_STAFF |
| Materialize item | MERCHANT_OWNER + MERCHANT_STAFF + restaurant in `MerchantScopeService` |
| Merchant catalog CRUD | MERCHANT_OWNER + MERCHANT_STAFF |
| Mutate Experience folders/media | SUPER_ADMIN |
| Discover Experience folders | SUPER_ADMIN + merchant staff |
| Merchant Experience CRUD | MERCHANT_OWNER + MERCHANT_STAFF |

Never authorize from client `merchantId` / `restaurantId`. SUPER_ADMIN may not materialize (service forbids). SUPER_ADMIN is not on `/catalog` merchant routes.

Legacy `/catalogue` and `/experience-media` find/get were weakly authenticated. **CORRECT:** do not copy those holes.

---

## 11. UI scope

**Current target UI:** none for Contracts A/C/D. Merchant app is orders. Consumer never shows Global Catalog.

**Minimum justified UI (after GO, not this task):**

- Super Admin: list/create/open Global Catalog, list items, create item (name/description/`sourcePayload` optional).  
- Merchant: browse global items + “Add to my menu” → existing `materialize` + existing `/catalog` item view.  
- Experience: Super Admin folder list/detail; merchant clone remains mapper + existing Experience create.

Do not clone every legacy Super Admin screen. Inter + `--ame-*` only.

---

## 12. Owner decisions

### 12.1 Resolved from evidence (not blockers)

| ID | Resolution |
|---|---|
| OD-I-1 propagation after materialize | **No** |
| OD-I-2 detach/override | **Unnecessary** — copies are independent |
| OD-I-3 chain vs global winner | **Neither wins** — merchant selects a source |
| OD-I-4 chain now? | **FUTURE** |
| OD-I-5 versioning | **No** |
| OD-I-6 folder = template? | **Media library + metadata seed** |
| OD-I-7 Experience propagation | **No** |
| OD-I-8 Experience lineage field | **Do not invent** |
| OD-I-9 merchant may edit copies | **Yes** |
| OD-I-10 authoring boundary | Super Admin = source; merchant = operational |

### 12.2 Genuinely unresolved

#### OD-I-DUP — Duplicate materialization key

Legacy `add=true` skips when the merchant already has that **name**. Target allows many copies of one source. Pick before claiming import-complete: name-per-restaurant, source+restaurant unique, or allow multiples.

#### OD-I-TEMP — Two-phase temp-local

Legacy onboarding uses preview then commit. Target direct materialize is the other real path. Whether Nest must recreate temp-local is a product workflow choice, not required to preserve copy semantics.

---

## 13. Deferred

- Chain Catalog (Contract C)
- Temp-local + commit UI/API
- DELETE global catalog/item
- PATCH global item/category
- Full vendorItems field parity (media, nutrition, allergy, schedule, tax blobs)
- assign_items membership API
- Live sync / versioning / PIM
- Experience server-side clone
- `restaurants[]` usage tracking
- Secondary `/media-catalogue`
- Upload/S3 (doc 86)
- Celebration / occasion / festival / event / experience packages
- Stage H
- Stage J

---

## 14. Implementation recommendation

### Decision: **smallest justified slice implemented**

The forensic contract is unchanged. The following production slice is now live on the existing target:

1. Super Admin Global Catalog list / create / detail / create category / create item (existing POST/GET/PATCH catalog; no item PATCH; no delete). Hosted at `/global-catalog` on `apps/merchant` for `SUPER_ADMIN` only.  
2. Merchant Add from Global calling existing `materialize` (unpublished copy + `sourcePayload.product`).  
3. Merchant catalog list/detail via existing `/catalog` plus `GET /catalog/restaurants` (principal merchant only).  
4. Optional `catalogId` on materialize validates source ownership. Duplicate copies remain allowed (`source_item_id`, `menu_item_id`). No temp-local.  
5. **Still out:** chain, temp-local, delete, upload, Experience UI/clone, celebrations, Stage H/J, Global Item PATCH.

OD-I-DUP and OD-I-TEMP remain unresolved owner decisions and were not assumed.

---

## 15. Confirmation

- Schema unchanged (no migration). Existing `platform_catalog_*` tables reused.  
- Super Admin UI is role-gated on `apps/merchant` (`/global-catalog`). No `apps/admin`.  
- Merchant Add from Global uses existing `POST /platform-catalog/global-items/:id/materialize`.  
- `GET /catalog/restaurants` lists restaurants from the authenticated merchant principal only.  
- Optional materialize `catalogId` validates source ownership; it does not change OD-I-DUP.  
- No Chain Catalog, temp-local, Global delete, Global Item PATCH, Experience, Celebration, Stage H, or Stage J.  
- Stage J **not** started  
- Upload contract (86) **untouched**
