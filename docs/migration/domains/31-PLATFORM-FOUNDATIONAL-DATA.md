# 31 — Platform Foundational Data Reconciliation & Foundation (P1.7.4)

> **Status:** IMPLEMENTED — reconciliation + minimal read foundation for the admin-defined platform **taxonomy**. **Small additive schema change** (columns on existing `Category` + `Cuisine`; no new tables). No admin CRUD, no controllers, no frontend, no discovery/search, no Mood/Craving/Icon/MasterData tables, no speculative normalization. Auth (P1.7.1E/F), Merchant (P1.7.2), Subscription (P1.7.3) unchanged.
> **Grounding:** the shared legacy backend `amealio-vendordashboard` (primary authority), the combined admin/merchant frontend `amealiodashboardmvp-`, the user app `amealio_web_app`, and the forensic current-state audit (`docs/current-state/`, on PR #21 — not on this branch; findings recorded here).

---

## 1. Discovered foundational-data inventory

The shared backend registers admin-managed reference services (`src/services/index.ts`): `category`, `subcategory` (**"Sub Category"**), `cusine`, `mood`, `cravings`, `food-category`, `liquor-category`, `menu-category`, plus attribute lookups (dress-code, parking-type, accessibility, payment-methods, food-type, seating-area, restaurant-features, restaurant-tag).

**Canonical foundational taxonomy (this slice):**

- **`Category`** (legacy `category.model.ts`): `category_name`/`title`, `icon`, `code`, `type`, `description`, `status` — the top-level admin taxonomy.
- **`Sub Category`** (legacy `sub-category.model.ts`): `selected_category` → `Category` (parent), `icon`, `title`, `photo`, `description`, `type`, `status`, `code`, `hexColor`, `icon_code`, **`createdBy: "admin"`** — the **unified child taxonomy** that `restaurant.*` selects for cuisine/mood/dress-code/parking/accessibility/food-type/payment-methods/seating-area (see `restaurant.model.ts` `ref: "Sub Category"`).
- **`Cuisine`** (legacy `cusine.model.ts`, note spelling "Cusine"): `icon`, `title`, `description`, `status` — a dedicated cuisine lookup (also referenced as `Sub Category` on restaurants — overlap; see §16).

**Discovery overlays (NOT built here — deferred discovery domain):** `Mood` (`mood.model.ts`), `MoodManagement` (refs `Sub Category` + `priority` + `active`), `Craving` (refs `Sub Category` + `priority` + `active`). These curate discovery and overlap with `Sub Category`.

## 2. Ownership classification

| Category | Class | Evidence |
|---|---|---|
| `Category` / `Sub Category` | **PLATFORM_DEFINED** (created/edited/deactivated by Admin) → **MERCHANT_SELECTED** (`restaurant.selected_* → Sub Category`) → **USER-consumed** (discovery) | `createdBy: "admin"`; backend `category`/`subcategory` services; superadmin frontend taxonomy screens; restaurant refs |
| `Cuisine` | **PLATFORM_DEFINED** → **MERCHANT_SELECTED** (SuperAdminVendorCuisineSetup/Offered) → **USER-consumed** | `cusine` service; dashboard cuisine setup |
| `Mood`/`MoodManagement`/`Craving` | **PLATFORM_DEFINED** (discovery) | `mood`/`cravings` services; `MoodManagement.active`/`priority` |
| Menu category (`menuCategory`) | **MERCHANT_DEFINED** (per-menu) — **not** platform taxonomy | `menu-category.model.ts` (`ref: Menu`, `status`); → target `MenuSection` |
| `REACT_APP_COUNTRY`/`REACT_APP_ENV` | **SYSTEM_CONFIGURATION** | build-time env |

The PLATFORM→MERCHANT-selects→USER distinction is preserved: merchants **select** platform categories (they do not create them).

## 3. Shared backend source

`amealio-vendordashboard` (Feathers + MongoDB) is the single business backend for User/Merchant/Admin/Delivery. Taxonomy lives in the `Category`, `Sub Category`, `Cusine`, `Mood`, `Craving` collections, exposed by admin-configured services and consumed platform-wide.

## 4. Admin frontend usage (`amealiodashboardmvp-`)

Superadmin screens create/edit taxonomy (category, cuisine setup, mood/"in" management). Admin is an **actor/interface** within the shared backend (no separate admin backend).

## 5. Merchant frontend usage (`amealiodashboardmvp-`)

Merchant onboarding **selects** platform taxonomy: `SuperAdminVendorCuisineSetup`/`Offered`, `MoodComponent`, category selection — writing `Sub Category`/`Cuisine` ObjectIds onto the restaurant. Merchants do not own the definitions.

## 6. User frontend usage (`amealio_web_app`)

Home discovery (moods/cravings/curations), search, and restaurant detail render the selected taxonomy + its icons. The RAG server (`amealio-homepage-v2-rag-server`) reads the `subcategories` collection for cuisine lookup (AI-DISCOVERY-DEEP-DIVE). Users consume; they do not define.

## 7. Backend services / APIs

`/category`, `/subcategory` (Sub Category), `/cusine`, `/mood`, `/cravings`, `/food-category`, `/menu-category`, plus attribute lookups. Admin CRUD via these services; merchant selects; discovery reads `/user/moods`, `/user/cravings`, `/user-curation`.

## 8. Legacy Mongo models

`category`, `sub-category` (**"Sub Category"**), `cusine` (**"Cusine"**), `mood`, `mood-management`, `cravings`, `menu-category`, `food-category`, `restaurant-features`, `restaurant-tag`, `seating-area`, `dress-code`, `parking-type`, `accessibility`, `payment-methods`, `food-type`.

## 9. Icon / media semantics

**Icons/media are EMBEDDED string fields**, not entities: `Sub Category` has `icon` (URL/key), `icon_code`, `photo`, `hexColor`; `Category`/`Cusine`/`Mood` have `icon`. Admin sets them; merchant + user consume them. The URL/key is the canonical value the admin manages. **Decision:** store icons as embedded string columns on the taxonomy row (faithful to source) — **no Icon table, no media platform, no normalization** (per prompt guidance and evidence).

## 10. Taxonomy relationships

- `Category` (parent) → `Sub Category` (child) via `selected_category` — a **1→N hierarchy**, kind discriminated by `type`.
- `restaurant.selected_*` → `Sub Category` (merchant selection of platform values).
- `MoodManagement`/`Craving` → `Sub Category` (discovery overlays; deferred).
- `Cuisine` overlaps with cuisine-as-`Sub Category` (owner decision §16/§17).

## 11. Target PostgreSQL representation

| Legacy | Target | Status |
|---|---|---|
| `Category` + `Sub Category` (unified hierarchy) | **`Category`** (self-referential `parentId`, `type`, `code`) | already present; **extended** this slice with `legacyId`, `icon`, `iconCode`, `hexColor`, `description`, `status` (+`@@index([type])`) |
| `Cusine` | **`Cuisine`** (dedicated lookup, `name @unique`) | already present; **extended** with `legacyId`, `icon`, `description`, `status` |
| `menuCategory` | `MenuSection` | already present (P1.4) — merchant menu concept, not platform taxonomy |
| `Mood`/`MoodManagement`/`Craving` | — | **MISSING**; deferred to discovery domain (§18) |
| dress-code/parking/accessibility/etc. | represented as `Category` rows (`type`) or `RestaurantFeature` | represented; exact mapping deferred |

`Category` = the legacy unified taxonomy home (P1.4 intended categories/cuisines as admin lookup tables — `database/05-ENUM-STATUS-STRATEGY.md`). `MenuSection` (≠ `Category`) is the per-menu category, so there is **no conflation**.

## 12. Legacy IDs

Added `legacyId String? @unique` to `Category` and `Cuisine` (all other foundational entities already carry it) — the anchor for a future controlled import from the legacy Mongo taxonomy. **No import pipeline / no backfill built.**

## 13. Merchant dependencies

Merchant configuration **selects** platform taxonomy (cuisine, seating areas, dress code, moods) by reference — it does not duplicate definitions. Merchant-owned config (Subscription/`table_setup`) stays in the Merchant/Subscription boundary (P1.7.2/P1.7.3); platform taxonomy stays global here. The two are kept separate.

## 14. User dependencies

User discovery/detail/search consume platform taxonomy + icons (read-only). Only the data contract is traced; no user UI or discovery/search behavior is built.

## 15. Migration risks

- **Cuisine duplication** — canonical source (dedicated `Cuisine` vs cuisine-as-`Sub Category`) must be reconciled at import (owner decision).
- **Discovery overlays** — `Mood`/`MoodManagement`/`Craving` vs `Sub Category` mood: which is canonical for discovery (deferred).
- **`type`/`code` vocabulary** — legacy `type`/`status` are free strings; the canonical target vocabulary is not yet fixed (kept raw).
- **Attribute mapping** — dress-code/parking/accessibility as `Category` `type` rows vs `RestaurantFeature` needs a consistent rule at import.
- **Icon storage** — URLs/keys point at legacy asset storage (S3/CDN); asset migration is a separate concern.

## 16. UNKNOWNs

- Exact legacy `status` values/semantics (active/inactive vocabulary) — kept raw.
- Whether `Cusine` collection or `Sub Category` cuisine is the live canonical cuisine source.
- Whether discovery moods/cravings are `MoodManagement`/`Craving` (Sub Category overlays) or the standalone `Mood` collection.
- Ordering/sort semantics for `Category`/`Sub Category` (legacy has no explicit order field on Sub Category; `MoodManagement`/`Craving` use `priority`).
- Whether every `restaurant.selected_*` attribute (parking/accessibility/etc.) should be a `Category` `type` or a `RestaurantFeature`.

## 17. Owner decisions required

1. **Cuisine canonical source** (dedicated `Cuisine` vs `Category`/`Sub Category` cuisine type).
2. **Discovery taxonomy** home (Mood/Craving/MoodManagement) — target model + relationship to `Category`.
3. **`type`/`status` vocabulary** canonicalization for `Category`/`Cuisine`.
4. **Attribute taxonomy mapping** (which restaurant attributes are `Category` types vs `RestaurantFeature`).
5. **Legacy→target import** rules for taxonomy (dedup, parent linkage, icon/asset migration).

## 18. Deferred domains

Discovery/search + Mood/Craving/curation; Experience/Celebration + Event/Festival taxonomy (no `Celebration` entity — Experiences filtered by subcategory; distinct from exp-events/Events — investigate in the experience/event slices); menu/ordering/seating/delivery/AI/wallet/settlements; ONDC (DEFERRED — existing); admin taxonomy CRUD + frontend; MongoDB/data import.

---

## Owner / Source matrix

| Data Type | Owner | Created By | Selected By | Consumed By | Legacy Model | Backend API | Target Model | Status | Migration Concern |
|---|---|---|---|---|---|---|---|---|---|
| Category (parent taxonomy) | PLATFORM_DEFINED | Admin | Merchant | Merchant, User, RAG | `Category` | `/category` | `Category` (root) | present + **extended** (legacyId/icon/status) | type/status vocab |
| Sub Category (child taxonomy) | PLATFORM_DEFINED → MERCHANT_SELECTED | Admin (`createdBy:"admin"`) | Merchant (`restaurant.selected_*`) | Merchant, User, RAG | `Sub Category` | `/subcategory` | `Category` (child via `parentId`/`type`) | present + **extended** | icon/hexColor/code mapping |
| Cuisine | PLATFORM_DEFINED → MERCHANT_SELECTED | Admin | Merchant (cuisine setup/offered) | Merchant, User, RAG | `Cusine` | `/cusine` | `Cuisine` | present + **extended** | dedup vs Sub Category cuisine |
| Mood | PLATFORM_DEFINED | Admin | — | User (discovery) | `Mood`/`MoodManagement` | `/mood`,`/user/moods` | — (missing) | **DEFERRED** | discovery canonical source |
| Craving | PLATFORM_DEFINED | Admin | — | User (discovery) | `Craving` | `/cravings`,`/user/cravings` | — (missing) | **DEFERRED** | discovery canonical source |
| Menu category | MERCHANT_DEFINED | Merchant | — | Merchant, User | `menuCategory` | `/menu-category` | `MenuSection` (P1.4) | present | not platform taxonomy |
| Icon/media | PLATFORM_DEFINED (embedded) | Admin | — | Merchant, User | embedded on taxonomy | via taxonomy | embedded string cols | present + **added** | asset/CDN migration |
| Restaurant attributes (dress/parking/accessibility/food-type/payment/seating-area) | PLATFORM_DEFINED → MERCHANT_SELECTED | Admin | Merchant | Merchant, User | `Sub Category` + dedicated lookups | attribute services | `Category`(type) / `RestaurantFeature` | partial | mapping rule (owner decision) |
| Country/env flags | SYSTEM_CONFIGURATION | — | — | apps | env | — | env | n/a | not business data |
| Experience/Event/Festival taxonomy | PLATFORM_DEFINED | Admin | Merchant | User | `exp-events`/`Sub Category`/`Events` | `/exp-events` etc. | — | **DEFERRED** | Festival vs exp-events vs Events (UNKNOWN) |

---

## Schema / migration / validation

- **Schema change (additive):** `Category` +`legacyId @unique`,`icon`,`iconCode`,`hexColor`,`description`,`status`,`@@index([type])`; `Cuisine` +`legacyId @unique`,`icon`,`description`,`status`. No new tables/enums. Migration `20260902035959_p1_7_4_platform_foundational_data` (applied dev + test; historical migrations unmodified).
- **Application:** new `apps/api/src/modules/reference-data/` — `CategoryRepository` (findById/findByLegacyId/findByCode/listRoots/listChildren/listByType; active = non-deleted) + `CuisineRepository` (findById/findByLegacyId/findByName/listAll); `ReferenceDataModule` registered in `AppModule`. Read-only; no CRUD/controllers.
- **Tests:** 6 new integration (suite 166 → **172**): admin category identity + embedded icon/media + legacyId/code lookup; parent→child (Sub Category) relationship (soft-deleted excluded); roots + by-type listing (active only); legacyId/code uniqueness; missing/unknown-ref safe; Cuisine lookup + legacyId/name uniqueness + icon. P1.7.1E/F/2/3 suites green.
- **Baseline evolution:** `docs/current-state/` lives on the forensic-audit branch (PR #21), not on this branch; the findings above (icons embedded; Category/Sub Category = unified taxonomy; cuisine duplication; Mood/Craving overlays; menuCategory≠platform taxonomy) should fold into `DATA-MODEL-INVENTORY.md` / `UNKNOWN-AND-GAPS.md` when that branch is integrated.
- **Validation:** `npm run build` ✓ · `npm run lint` ✓ · `npm run format:check` ✓ · `npm test` → **172/172** (23 suites) · `prisma validate` ✓ · `prisma migrate status` up to date.
