# 34 — Super Admin Platform Foundation Reconciliation (P1.7.6A)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no owner decisions resolved. Determines what Super Admin/platform reference data must exist before Merchant/User domains can safely depend on it.
> **Authority order:** `amealio-vendordashboard` source → `amealiodashboardmvp-` (admin/merchant FE) → `amealio_web_app` → other repos → forensic docs → target schema. Source is authoritative over docs.
> **Completed:** P1.7.1D/E/F (staff identity/auth/authz), P1.7.2 (Merchant/Location), P1.7.3 (Subscription/config), P1.7.4 (Category/Sub Category/Cuisine taxonomy), P1.7.5 (Menu & Catalog). Baseline **182/182**.

---

## 1. Executive finding

P1.7.4 is a **PARTIAL** platform-reference foundation (answer **B** to the critical question, §17) — it correctly covered the *taxonomy* (Category/Sub Category/Cuisine) but the broader Super Admin layer additionally includes **Currency** (a real platform reference table, missing in target), **geography** (a flat `{text}` lookup + embedded strings), a **`media-catalogue` reusable image repository** (missing in target), attribute lookups (service/food-type/payment — partial), and the deferred discovery (Mood/Craving) and experience/event (`exp-events`) taxonomies.

**Crucially, none of these missing pieces BLOCK the completed downstream (Menu/Catalog) or the immediate next domains for India-first**, because currency and geography are already carried as embedded values (`currencyCode String @default("INR")` + BigInt minor units; `country @default("IN")`, `city/state/pinCode` strings) — mirroring how the legacy platform itself stores them.

**Two decisive negatives, proven from source:**
- **No platform "Item Catalog" exists.** `catalogue`/`chaincatalogue` are groupings of **merchant** `vendorItems` (they *reference* merchant items), not upstream platform item templates. `MenuItem` (P1.7.5) is the correct canonical level. The `SuperAdmin → ItemCatalog → Merchant → MenuItem` chain does **not** exist.
- **No platform "Experience Catalog" exists.** `Experience` is a **merchant** record (`vendorId`, filtered by `subCategory`); the platform layer is the admin `exp-events`/`ExpEventManagement` taxonomy + `Sub Category`. No separate template catalog; do **not** create one (and no `Celebration` entity).

**No HARD STOP condition applies** (§ below). **Recommended next platform slice:** a small **Currency (+ lightweight Geography) reference read foundation** (P1.7.6) — clearly platform-defined, dedicated legacy models, missing in target — **but it is NON-BLOCKING**; the `media-catalogue` asset repo and discovery/experience taxonomies remain deferred to their domains. No foundational layer must be retro-inserted before the completed slices.

## 2. Complete Super Admin foundation inventory

| Foundation | Legacy model(s) | Nature | Target |
|---|---|---|---|
| Category / Sub Category | `Category`, `Sub Category` | admin hierarchical taxonomy | `Category` (P1.7.4) ✓ |
| Cuisine | `Cusine` | admin lookup | `Cuisine` (P1.7.4) ✓ |
| Currency | `currency` (`currency_iso`, `currency_symbol`, `country_name`, `status`) | admin reference table | **embedded `currencyCode` string only — table MISSING** |
| Geography | `countryStateCity` (`{text}` flat) + embedded `restaurant.country/city/state/pinCode`, `Address` | flat text lookup + embedded | embedded strings ✓ (no normalized hierarchy either side) |
| Media / images | `media-catalogue` (images[]{url,tags,archival,isUsed,uploadedBy}, → Category/SubCategory), `experience_media`, `upload-assets` ({text}) | reusable image repository (admin/vendor) | **MISSING** (embedded `icon` strings only) |
| Discovery taxonomy | `Mood`, `MoodManagement`, `Craving` | admin discovery reference | **MISSING** (deferred) |
| Experience/Event taxonomy | `exp-events`/`ExpEventManagement` (category, subCategory, type, `icon`) | admin platform taxonomy | **MISSING** (deferred) |
| Attribute lookups | `service-type`, `services-offered`, `food-type`, `food-category`, `payment-methods`, `dress-code`, `parking-type`, `accessibility` | admin lookups | PARTIAL (`RestaurantFeature`, `Category` type, `PaymentMethod` enum, `UnitOfMeasure`) |
| Item catalogue (merchant) | `catalogue`, `chaincatalogue` (→ `vendorItems`) | **merchant/chain** item grouping (NOT platform) | not modeled (merchant-domain, deferred) |
| Restaurant chain / org | `Restaurant Chain`, `organization` | grouping | `RestaurantChain`, `Organization` (P1.7.2) ✓ |
| Units | `uom`, `uom-ratio` | admin lookup | `UnitOfMeasure` ✓ |

## 3. Ownership matrix

| Structure | Class | Created_By | Edited_By | Selected_By | Consumed_By |
|---|---|---|---|---|---|
| Category / Sub Category | PLATFORM_DEFINED | Admin | Admin | Merchant | Merchant, User, RAG |
| Cuisine | PLATFORM_DEFINED | Admin | Admin | Merchant | Merchant, User |
| Currency | PLATFORM_DEFINED | Admin | Admin | Merchant (onboarding)/system | Merchant, User, payments |
| Geography (`countryStateCity`) | PLATFORM_DEFINED / SYSTEM (flat reference) | Admin/system | Admin | Merchant, User | discovery, onboarding |
| `media-catalogue` | PLATFORM_DEFINED (curated) / MERCHANT-uploaded (mixed) | Admin/Vendor (`uploadedBy`) | Admin/Vendor | Merchant | Merchant, User |
| Mood / MoodManagement / Craving | PLATFORM_DEFINED (discovery) | Admin | Admin | — | User (discovery) |
| `exp-events` | PLATFORM_DEFINED | Admin | Admin | Merchant/User | User (discovery) |
| service/food-type/payment/dress/parking/accessibility | PLATFORM_DEFINED lookups | Admin | Admin | Merchant | Merchant, User |
| `catalogue`/`chaincatalogue` | MERCHANT_DEFINED (chain grouping) | Merchant | Merchant | Merchant | Merchant, User |
| `Experience` | MERCHANT_DEFINED | Merchant (`vendorId`) | Merchant | — | User |
| Subscription product/business type | derived from Subscription config (P1.7.3) | Admin/Merchant | Merchant | Merchant | platform gates |

*"Admin UI displays it" ≠ "Admin owns it"*: `media-catalogue`/`catalogue` are uploaded/owned by `VendorUser` (merchant-side), even though admins curate some.

## 4. Dependency matrix

| Platform Foundation | Admin Controls | Merchant Uses | User Uses | Req. Onboarding | Req. Subscription | Req. Item Setup | Req. Experience | Req. Profile/Discovery | Legacy Source | Target Model | Status | Blocking? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Category/Sub Category | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | `Category`/`Sub Category` | `Category` | COMPLETE | No |
| Cuisine | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | `Cusine` | `Cuisine` | COMPLETE | No |
| Currency | ✓ | ✓ | ✓ | ✓ | — | ✓ (pricing) | ✓ (pricing) | ✓ | `currency` | embedded `currencyCode` | **PARTIAL/MISSING (table)** | No (INR-first) |
| Geography | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | `countryStateCity`/embedded | embedded strings | PARTIAL | No (INR/IN-first) |
| Media/images | ✓/merchant | ✓ | ✓ | ✓ (logos/photos) | — | ✓ (item images) | ✓ (exp media) | ✓ | `media-catalogue`/embedded | embedded `icon` only | **PARTIAL/MISSING (repo)** | No |
| Attribute lookups (service/food-type/payment/…) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | dedicated lookups + `Sub Category` | `RestaurantFeature`/`Category`/`PaymentMethod`/`UnitOfMeasure` | PARTIAL (owner decision) | No |
| Discovery taxonomy (Mood/Craving) | ✓ | — | — | — | — | — | — | ✓ | `Mood`/`MoodManagement`/`Craving` | MISSING | Deferred | Blocks Discovery only |
| Experience/Event taxonomy | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | `exp-events` | MISSING | Deferred | Blocks Experience/Event only |
| Item Catalog (platform) | — | — | — | — | — | — | — | — | **does not exist** (catalogue=merchant grouping) | n/a | N/A | No |
| Experience Catalog (platform) | — | — | — | — | — | — | — | — | **does not exist** (Experience=merchant) | n/a | N/A | No |

## 5. Geographic foundation findings

`countryStateCity` is a **single free-text field** (`{ text: String }`) — a flat lookup, **not** a normalized Country→State→City hierarchy. Geography is otherwise **embedded** on `restaurant` (`country`, `city`, `state`, `pinCode`, GeoJSON `location`), `Address`, and `currency.country_name`. Target mirrors this (embedded `city/state/pinCode`, `country @default("IN")`, `lat/lon`). **Single, consistent source** (no incompatible sources → no hard stop). A normalized geographic reference does not exist in legacy and is **not required** for India-first; a lightweight platform Country/City reference is optional (see §22).

## 6. Currency findings

`currency` is a **platform reference table**: `country_name`, `name`, `currency_iso`, `currency_symbol`, `description`, `status` (bool), `is_deleted`. **PLATFORM_DEFINED**, admin-managed, soft-deleted. Target has **no Currency model** — money is `currencyCode String @default("INR")` + **exact BigInt minor units** (correct, no floats), which is **functionally sufficient for India-first**. **No FX/exchange-rate** logic exists in source (do not invent). Currency semantics are **clear** (ISO + symbol + minor units) → not a hard stop; the missing piece is only the reference/metadata table.

## 7. Category-family findings

Distinct families (do not merge/split): **Category/Sub Category** (unified hierarchy, P1.7.4 ✓); **Cuisine** (`Cusine` — overlaps cuisine-as-Sub-Category, owner decision); **Food Type/Food Category** (lookups); **Mood/MoodManagement/Craving** (discovery, deferred, competing — owner decision); **Occasion/Festival** (`exp-events` + Sub Category, deferred); **Restaurant/Business type** (restaurant flags + subscription booleans); **Service Type** (`service-type` lookup); **Item category** (`menuCategory` = `MenuSection`, P1.7.5); **Experience/Event category** (`exp-events`/Sub Category). Competing canonical sources (cuisine, mood) are **existing P1.7.4 owner decisions**, not newly introduced.

## 8. Icon / image / asset findings

**MIXED architecture (by domain), not contradictory:**
1. **Embedded strings** — `icon`, `icon_code`, `photo`, `hexColor` on taxonomy (`Sub Category`/`Category`/`Cusine`/`Mood`/`exp-events`) — handled by P1.7.4 (stored as columns).
2. **Reusable image repository** — `media-catalogue`: `images[]{ url, name, isArchived, isUsed, date, uploadedBy → VendorUser }` (+ videos), linked to `Category`/`SubCategory`, with `tags`/`userBenefits`/`termsAndConditions` — a curated marketing/experience asset store. **MISSING in target.**
3. `experience_media` (experience images), `upload-assets` (trivial `{text}` placeholder).
4. **External storage** — URLs/keys point at S3/CDN; asset binaries live outside Mongo.

**Do not create a generic Icon/Media entity now.** Embedded icons are already columns (P1.7.4); the `media-catalogue` repository is a **deferred asset foundation** (marketing/experience media), not required by core domains. Architecture is mixed-but-consistent → **no hard stop**.

## 9. Item Catalog findings

**No Super Admin Item Catalog exists.** `catalogue` (`name`, `cuisin_type → Cusine`, `items[] → vendorItems`, `status`) and `chaincatalogue` (`restaurant_chain_id`, `category → Sub Category`, `items[] → vendorItems`) are **groupings of merchant items** (they reference `vendorItems`), i.e., **MERCHANT/chain-owned** collections — not platform templates. The chain `SuperAdmin → ItemCatalog → Merchant → MenuItem` is **absent**. `MenuItem` (P1.7.5) is the correct canonical item level; catalogues are a merchant-domain grouping to migrate later. **No conflict with `MenuItem` → no hard stop (#3 clear).**

## 10. Experience Catalog findings

**No platform Experience Catalog exists.** `Experience` (`vendorId`, `restaurantId`, `subCategory`, `packages[]`) is a **merchant** record; the platform layer is `exp-events`/`ExpEventManagement` (admin taxonomy: `category`, `subCategory`, `type`, `icon`) + `Sub Category`. Customer "Celebrations" = `Experience` filtered by subcategory (per baseline). **Do not create `Celebration` or an Experience-template catalog.** Experience taxonomy (`exp-events`) is deferred with the experience domain. **No conflict → no hard stop (#4 clear).**

## 11. Merchant onboarding dependency findings

| Onboarding field | Platform source | Target | Status |
|---|---|---|---|
| Business type | restaurant business-type flags + subscription booleans (P1.7.3) | Subscription config Json | Covered |
| Country / City | embedded ← `countryStateCity` (flat) | embedded strings | Covered (India-first) |
| Currency | `currency` reference | embedded `currencyCode` | Covered (INR default); table missing |
| Cuisine | `Cusine`/Sub Category | `Cuisine`/`Category` | Covered (P1.7.4) |
| Restaurant/service/food type | `service-type`/`food-type`/Sub Category | `RestaurantFeature`/`Category` | PARTIAL (owner decision) |
| Payment methods | `payment-methods` | `PaymentMethod` enum | Covered |
| Seating / capabilities | subscription config | Subscription config (P1.7.3) | Covered |
| Categories | `Category`/`Sub Category` | `Category` | Covered (P1.7.4) |
| Logos / photos | embedded + `media-catalogue` | embedded | PARTIAL (media repo missing) |

Onboarding can proceed on embedded values; gaps = Currency table + attribute-lookup canonical home (owner decision) + media repo.

## 12. Subscription dependency findings

Subscription **product/business type** is expressed as **embedded booleans** in the Subscription config (P1.7.3), keyed by `vendor_id`; `status` is a numeric flag. **No separate platform "subscription product/plan/package" catalog exists** upstream (no plan/price/product table found). So P1.7.3 is not missing an upstream product-definition foundation. Feature gates derive from the config (P1.7.3).

## 13. Item setup dependency findings

| Value | Platform source | Target | Status |
|---|---|---|---|
| Item category | `menuCategory` | `MenuSection` | Covered (P1.7.5) |
| Cuisine | `Cusine`/Sub Category | `Cuisine`/`Category` | Covered |
| Food type / dietary | `food-type`, `veg` bool, Sub Category | `Category` type / (dietary UNKNOWN) | PARTIAL (owner decision) |
| Units | `uom`/`uom-ratio` | `UnitOfMeasure` | Covered |
| Taxes | `menuCategory` tax config / `experienceTaxesAndCharges` | Subscription config | PARTIAL (deferred) |
| Modifiers / variants | `vendorItems.size[]`/addons | `ItemVariant`/`AddOn` | Covered (P1.7.5) |
| Images | embedded + `media-catalogue` | embedded | PARTIAL |
| Availability / channels | `status`/`ItemChannelConfig` | `ItemAvailability`/`ItemChannelConfig` | Covered (P1.7.5) |

## 14. User profile / discovery dependency findings

Profile preferences (dietary/cuisine/mood/craving/occasion) reference **Sub Category** + **Mood/Craving** (discovery taxonomy); location/currency embedded; **language/locale not modeled (UNKNOWN)**. Discovery/search/filter/recommendation are powered by Category/Sub Category/Cuisine (✓) + Mood/Craving/Occasion/Festival (deferred, competing — owner decision) + RAG (reads Mongo). **Discovery is blocked by the Mood/Craving canonical UNKNOWN**, but discovery is itself a **deferred domain**, so this does not block nearer foundations. `USER_DEFINED` values (the user's chosen preferences) are distinct from the `PLATFORM_DEFINED` option sets.

## 15. Canonicality conflicts

| Family | Canonical | Competing / aliases | Risk |
|---|---|---|---|
| Cuisine | (owner decision) | `Cusine` collection vs cuisine-as-`Sub Category` | dedup at import |
| Mood | (owner decision) | `Mood` vs `MoodManagement` vs `Sub Category` mood | discovery source |
| Category vs RestaurantFeature | (owner decision) | attribute as `Category` type vs `RestaurantFeature` | mapping rule |
| Menu category vs platform Category | resolved (P1.7.4/P1.7.5) | `menuCategory` = `MenuSection` (not `Category`) | none |
| Item Catalog vs MenuItem | resolved | catalogue = merchant grouping (not platform) | none |
| Experience Catalog vs Experience | resolved | no platform catalog; `exp-events`=taxonomy | none |
| Country/City source | consistent | `countryStateCity` flat + embedded | none (India-first) |
| Currency source | consistent | `currency` table + embedded `currencyCode` | reference-table dedup |
| Icon/image source | mixed (by domain) | embedded strings + `media-catalogue` repo | asset foundation later |

## 16. Target schema reconciliation

| Foundation | Target status |
|---|---|
| Category/Sub Category (`Category`), Cuisine (`Cuisine`) | **COMPLETE** (P1.7.4) |
| Merchant/Restaurant/Chain/Organization | **COMPLETE** (P1.7.2) |
| Subscription/config | **COMPLETE** (P1.7.3) |
| Menu/MenuSection/MenuItem/Variant/Channel/AddOns | **COMPLETE** (P1.7.5) |
| Units (`UnitOfMeasure`), Payment methods (`PaymentMethod` enum), Restaurant features (`RestaurantFeature`) | **PARTIAL** |
| **Currency** reference table | **MISSING** (embedded `currencyCode` only) |
| **Geography** (Country/State/City) | **PARTIAL** (embedded strings; no hierarchy — legacy is flat too) |
| **Media/asset repository** (`media-catalogue`) | **MISSING** (embedded icons only) |
| Discovery taxonomy (Mood/Craving) | **MISSING** (deferred) |
| Experience/Event taxonomy (`exp-events`) | **MISSING** (deferred) |
| Item Catalog / Experience Catalog (platform) | **N/A** (do not exist) |

No target model **CONFLICTS** materially with source semantics (no hard stop #9).

## 17. P1.7.4 completeness assessment

**Answer B — PARTIAL taxonomy foundation requiring a further platform-foundation slice.** P1.7.4 was correctly scoped to the Category/Sub Category/Cuisine taxonomy and explicitly deferred the rest; it is **partial by design, not materially incomplete** (so not answer C / not hard-stop #8). The remaining platform reference data (Currency table, geography reference, media-catalogue, service/food-type mapping, discovery + experience/event taxonomy) is either **functionally covered by embedded values** (currency/geo, India-first) or **deferred to its domain**. It is **complete enough for the completed downstream (Menu/Catalog)** and for near-term Merchant/User foundations (partial answer D applies for downstream sufficiency).

## 18. Foundation dependency graph

```
SUPER ADMIN
  ├─ Category / Sub Category ✓ (P1.7.4)      ├─ Cuisine ✓ (P1.7.4)
  ├─ Currency  (MISSING table; embedded ok)  ├─ Geography (flat/embedded)
  ├─ media-catalogue (MISSING; embedded icons ✓)
  ├─ Attribute lookups (service/food-type/payment/units) — PARTIAL
  ├─ Discovery taxonomy (Mood/Craving) — DEFERRED
  └─ exp-events taxonomy — DEFERRED
        ↓
MERCHANT ONBOARDING  ← business type, country/city(embedded), currency(embedded),
        ↓               cuisine✓, restaurant/service/food type(partial), payment✓
MERCHANT CONFIGURATION  ← Subscription/config ✓ (P1.7.3)  [Merchant/Restaurant ✓ P1.7.2]
        ↓
ITEM / MENU / EXPERIENCE  ← Menu/Catalog ✓ (P1.7.5);  Experience = merchant record (deferred)
        ↓
USER PROFILE / DISCOVERY  ← Category/Cuisine✓; Mood/Craving/Occasion (deferred); location/currency(embedded)
        ↓
ORDERING / SEATING / OTHER OPERATIONS  (blocked by OD-11 / table_setup — separate slices)
```

Every completed foundation (P1.7.2–P1.7.5) is correctly placed; the only genuinely-missing *platform* nodes (Currency table, geography reference, media-catalogue) are non-blocking for India-first and/or deferred.

## 19. Blocking UNKNOWNs

- **None block the next platform slice or the completed downstream for India-first.** (Currency/geo are functionally covered by embedded values + BigInt minor units.)
- Domain-scoped blockers (for their *own* future slices, not now): Mood/Craving canonical source (Discovery), `table_setup` modeling (Seating), OD-11 numeric status (Ordering/Payments), experience/event architecture (Experiences/Events).

## 20. Non-blocking UNKNOWNs

Legacy `status` vocabularies (currency/taxonomy); language/locale (not modeled); `media-catalogue` vs embedded-icon reconciliation; attribute→`Category`-type-vs-`RestaurantFeature` mapping; dietary classification canonical home; currency reference-table dedup vs embedded code; combos/chain-catalogue placement.

## 21. Owner decisions

1. Add a **Currency reference table** now, or keep embedded `currencyCode` (INR-first)? (recommended: small table; non-blocking)
2. Normalize **geography** (Country/City reference) or keep embedded strings? (recommended: defer; legacy is flat text)
3. **media-catalogue** asset repository target model + timing (recommended: defer to marketing/experience domain).
4. Attribute lookups → `Category` type vs `RestaurantFeature` vs dedicated (P1.7.4 open).
5. Cuisine / Mood / Craving canonical source (P1.7.4 open).
6. Language/locale support (not in current source scope).

## 22. Recommended next implementation slice

**Recommended (safest, evidence-backed): P1.7.6 — Platform Reference: Currency (+ lightweight Country/City) read foundation.** It is the clearest remaining **platform-defined** reference data with a dedicated legacy model (`currency`) and is missing in target; adding it improves onboarding + monetary integrity ahead of any multi-region/multi-currency work. **It is NON-BLOCKING** (embedded `currencyCode`/`country` defaults + BigInt minor units already suffice for India-first), so if the owner prefers, the platform layer may be considered *complete enough* and work can continue on other foundations.

**Reuse (do not rebuild):** Category/Sub Category/Cuisine (P1.7.4), Merchant/Restaurant/Chain/Org (P1.7.2), Subscription/config (P1.7.3), Menu/Catalog (P1.7.5), `UnitOfMeasure`/`PaymentMethod`/`RestaurantFeature`, embedded `currencyCode`/geo strings + BigInt minor units.

**Do NOT implement yet:** platform Item Catalog / Experience Catalog (don't exist), `Celebration` entity (doesn't exist), normalized geography hierarchy, generic Media/Icon platform, discovery taxonomy (Mood/Craving — owner decision), experience/event taxonomy, FX/exchange rates, attribute-lookup normalization (owner decision).

**Menu/Catalog** was correctly placed and is complete (P1.7.5); **no foundational layer must be inserted before it.** No re-baselining is required.

## 23. Proposed IN / OUT scope (for P1.7.6, if approved — NOT implemented here)

**IN SCOPE (proposed):**
- `Currency` reference read foundation over a minimal platform table (`isoCode`, `symbol`, `name`, `countryName?`, `status`, `legacyId`) — schema addition would be a **small additive** change; confirm at implementation.
- Optional lightweight platform geography reference (Country/City) **only if** the owner elects to normalize; otherwise keep embedded.
- Read repository/service + real-DB integration tests; documentation.
- Reuse embedded `currencyCode` on money-bearing models (no change to monetary representation).

**OUT OF SCOPE:**
- FX/exchange rates; currency conversion; multi-currency pricing behavior; media/asset repository; discovery/Mood/Craving; experience/event taxonomy; attribute-lookup normalization; item/experience catalog; onboarding/subscription/menu CRUD or UI; Mongo import/backfill; any change to P1.7.1D–P1.7.5; resolving P1.7.4 owner decisions.

## 24. Documentation impact (after any implementation)

New `docs/migration/domains/35-*.md` for the chosen slice; update `MIGRATION_STATUS.md` + hub `README.md`. Fold currency/geography/media-catalogue findings into the forensic `DATA-MODEL-INVENTORY.md` (PR #21) when integrated.

---

### Hard-stop check
No hard-stop applies: (1) competing taxonomy systems are pre-existing P1.7.4 owner decisions, not blockers for the recommendation; (2) Super Admin ownership established; (3) Item Catalog does not exist → no MenuItem conflict; (4) Experience Catalog does not exist → no Experience conflict; (5) geography has a single consistent (flat/embedded) source; (6) currency semantics are clear (ISO+symbol+minor units, no FX); (7) asset architecture is mixed-but-consistent (embedded + media-catalogue by domain); (8) P1.7.4 partial-by-design, not materially incomplete; (9) no target/source schema conflict; (10) no owner decision required to *start* the recommended (non-blocking) slice; (11) no previously-skipped BLOCKING foundation for India-first; (12) implementation (not re-baselining) is the correct path.

**No implementation performed. Recommendation: P1.7.6 = Currency (+ optional lightweight Geography) platform reference read foundation — non-blocking; downstream may otherwise proceed.**
