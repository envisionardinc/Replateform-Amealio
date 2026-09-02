# 42 — Super Admin Platform Setup & Merchant Configuration Reconciliation (P1.7.13)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no tests. Establishes the **configuration/setup dependency chain** that must be satisfied before the replatform proceeds into transactional commerce.
> **Authority:** legacy source (`amealio-vendordashboard` Feathers/Mongo backend, `amealiodashboardmvp-` Merchant+Admin SPA, `amealio_web_app` consumer, `amealio-self-delivery-app`) + target `replateform-amealio` (Prisma schema + `apps/api` modules + docs 29–41). Baseline **220/220**, unchanged.
> **Method:** frontend → API → service → persistence tracing, with file:line citations. Every dependency is classified with source evidence; unproven links are marked UNKNOWN.

---

## 1. Executive Summary

The strategic hypothesis — **SuperAdmin definitions → Onboarding → Subscription/config → Seating → Menu → Items → Celebrations/Experiences → Offers → (Cart/Ordering/Payment/Delivery)** — is **largely sound as a product/operational rollout order, but only a subset of its arrows are HARD technical dependencies.** The rest are SOFT (product sequencing) or NO-dependency (parallelizable). Source evidence:

- **SuperAdmin platform definitions are a HARD prerequisite for onboarding**, but the India-first minimum is **already satisfied**: the `Category`/`Cuisine` taxonomy (P1.7.4, doc 31) and `Currency` (P1.7.6, doc 35) exist; onboarding picklists resolve through the `Category` tree. Remaining reference items (Mood/Craving/exp-events taxonomy, media catalogues) are **discovery/experience-only and do not block merchant setup**.
- **The real gap in the configuration chain is the merchant _operating_ foundation, not more reference data.** P1.7.10 creates a `Merchant`/`Restaurant`/`Subscription`, but it does **not** provision an **owner `StaffMember` + `StaffCredential`** and there is **no activation/approval gate** and **no restaurant-profile / subscription-config _update_ path**. In legacy the operating principal is the `VendorUser` created at signup; in the target auth model (P1.7.1D/E) a merchant can only authenticate/operate through a `StaffMember`. **A provisioned target merchant currently cannot log in or operate.**
- **Seating configuration lives INSIDE the subscription document** (`table_setup` is embedded), so Subscription-config → Seating is a HARD dependency and Seating carries an **owner decision** (normalize `table_setup` to relational vs keep JSON + status sidecar).
- **Menu → Items is HARD**; **Seating → Menu is NOT a technical dependency** (independent). **Offers and Experiences are independent/parallelizable** and do **not** block Ordering.
- P1.7.5 catalog is **read-only**; the entire merchant **menu/item WRITE** foundation is missing. The "no platform Item Catalog" finding (doc 34) is **re-confirmed** by source.

**Recommended next slice:** **Merchant Owner Provisioning & Onboarding Activation** — complete P1.7.10 by provisioning the owner `StaffMember`/`StaffCredential` at merchant creation and implementing the activation gate (`onboardingSubmitted` + admin-approval → operational) plus the restaurant-profile / subscription-config **update** writes. This makes a created merchant actually operable and is HARD-required upstream of every merchant-scoped setup slice (seating/menu/items/experiences/offers). No schema change is expected; it reuses P1.7.1D/E identity + P1.7.10 provisioning.

**Hard blockers:** none that stop the recommended slice. **Owner decisions** are required before Seating (`table_setup` target) and before Item write (availability schedule / category tax / combos), and to confirm the owner-provisioning contract.

---

## 2. Source Repositories Inspected

| Repo | Role | Inspected for |
|---|---|---|
| `amealio-vendordashboard` | Legacy Feathers/Mongo backend (business-logic source of truth; 171 models, ~180 services) | all Parts A–H (models, services, hooks, crons, enums) |
| `amealiodashboardmvp-` | Combined Merchant + Admin React SPA (no separate admin backend) | onboarding wizard, subscription/seating/menu/offer setup screens, routes, redux actions |
| `amealio_web_app` | Consumer React frontend | seating request, celebration/experience discovery, offer consumption |
| `amealio-self-delivery-app` | Rider PWA | (delivery — out of scope; noted only) |
| `amealio-nestjs-backend` | Narrow GPS/location backend | (out of scope) |
| `replateform-amealio` | Target canonical Prisma+NestJS backend | current schema + modules + docs 29–41 coverage |

No additional repositories were invented; no Admin backend repo exists (Admin is served by `amealio-vendordashboard` and rendered by `amealiodashboardmvp-`).

---

## 3. Super Admin Platform Definitions

**Architecture (cross-cutting).** Legacy platform reference follows a **dual pattern**: (1) a canonical **`Category` (parent) → `Sub Category` (child)** hierarchy that merchants **select** onto `restaurant.selected_*` fields during onboarding, plus (2) legacy **parallel dedicated collections** (`Dress Code`, `Food Type`, `Cuisine`, …) that still exist/registered but whose live consumption path is the `Sub Category` tree. Onboarding lookups load through `/filterData` + hard-coded parent-category IDs (`amealiodashboardmvp-/client/src/store/actions/categoryActions.js:100–138`; refs on `amealio-vendordashboard/src/models/restaurant.model.ts:65–357`).

### 3.1 Classification & target coverage

| Concept | Legacy model / service | Admin UI | Classification | Target foundation | Status | Blocks onboarding? | Discovery-only? |
|---|---|---|---|---|---|---|---|
| Category (parent) | `category.model.ts` `/category` | `/superadminiconlist` | PLATFORM_DEFINED | `Category` (roots) / `ReferenceDataModule` | complete (doc 31) | **Yes** (satisfied) | No |
| Sub Category (child) | `sub-category.model.ts` `/subcategory` (superadmin write) | `/superadminiconlist` | PLATFORM_DEFINED → merchant-selected | `Category` (child via `parentId` + embedded icon) | complete | **Yes** (satisfied) | No |
| Cuisine | `cusine.model.ts` `/cusine` (+ SubCategory `CUISINES`) | icon list | PLATFORM_DEFINED → merchant-selected | `Cuisine` + `Category` | complete; **canonical source UNKNOWN** (overlap) | **Yes** (satisfied) | No |
| Attribute lookups: food type/category, payment methods, restaurant features/type/tags, services offered, dress code, parking, located-inside, accessibility, pet, liquor, health/sanitization (×5) | dedicated `*.model.ts` + live `Sub Category` keys (`categoryActions.js:100–134`) | `/superadminiconlist` + per-attribute onboarding screens | PLATFORM_DEFINED → merchant-selected | `Category.type` and/or `RestaurantFeature` + `PaymentMethod` enum | **partial** — mapping is an **owner decision** (doc 34 §21) | Partially (values needed for a full wizard; not for India-first minimum) | No |
| Units (uom, uom-ratio) | `uom.model.ts`, `uom-ratio.model.ts` `/uom` `/uom-ratio` | `/superadmin/management-services/*` | PLATFORM_DEFINED | `UnitOfMeasure` (no ratio) | partial | No (needed for **item** setup) | No |
| Business types | subscription booleans (`casual_dining`, …), no separate model | subscription screens | MIXED (merchant config, not admin reference) | `Subscription.config` Json (P1.7.3) | complete (as config) | **Yes** (satisfied) | No |
| Geography (country-state-city) | `country-state-city.model.ts` `/country-state-city` (flat `{text}`) | map/KYC flows | PLATFORM_DEFINED + embedded | embedded `Restaurant.city/state/pinCode/country` | partial | No (India-first embedded) | Yes (multi-region) |
| Currency | `currency.model.ts` `/currency` | (derived from country) | PLATFORM_DEFINED | `Currency` table + embedded `currencyCode` | complete (doc 35) | No (INR default) | No |
| Mood / MoodManagement | `mood.model.ts`, `mood-management.model.ts` | `/superadmin/home/mood` | PLATFORM_DEFINED | none | deferred | No | **Yes** |
| Craving | `cravings.model.ts` | `/superadmin/home/craving` | PLATFORM_DEFINED | none | deferred | No | **Yes** |
| Experience/Event taxonomy (`ExpEventManagement`) | `exp-events.model.ts` `/admin/exp-events` | `/superadmin/experience/events/*` | PLATFORM_DEFINED | none | deferred | No | **Yes** |
| Festival / occasion | `Sub Category` parents `OCCASION_TYPE`/`EVENT_TYPE` | icon list | PLATFORM_DEFINED → merchant-selected | `Category` (partial) | partial | No | **Yes** |
| Sections / Section_Experience (home curation) | `sections.model.ts`, `sections-experience.model.ts` | superadmin home curation | PLATFORM_DEFINED | none | deferred | No | **Yes** |
| Icons (embedded) | fields on Category/SubCategory/Cuisine/Mood/exp-events | `/superadminiconlist` | PLATFORM_DEFINED (metadata) | embedded `Category.icon/iconCode/hexColor`, `Cuisine.icon` | complete | No | No |
| `servicetype` | `service-type.model.ts` (**orphan — not registered in `index.ts`**) | none | UNKNOWN | none | missing | No | Unknown |

**Conclusion.** The **HARD onboarding prerequisites** (Category/SubCategory tree, Cuisine, business-type gating, currency, functional geography) are **already covered for India-first**. The attribute-lookup **canonical mapping** (`Category.type` vs `RestaurantFeature`) is an outstanding **owner decision** but is non-blocking at import time. Everything else (Mood/Craving/exp-events/Sections/media catalogues) is **discovery/experience-scoped and deferred**.

---

## 4. Icons & Media

| Mechanism | Legacy | What it is | Migrate before merchant setup? |
|---|---|---|---|
| Embedded icon fields (`icon`, `icon_code`, `hexColor`, `photo`) on taxonomy | `sub-category.model.ts:13–21` | **(1) platform reference metadata** | No — already embedded in target `Category`/`Cuisine` |
| `media-catalogues` `/media-catalogue` | `media-catalogues.model.ts:11–63` (superadmin write; merchant read) | **(2) reusable platform media** library | No — optional marketing assets; **missing** in target, deferred |
| `experience_media` (`experience_catalog`) `/experience-media` | `experience_media.model.ts:5–79` | **(4) experience-owned platform media** library | No — experience domain; **missing**, deferred |
| `upload-assets` / `upload-assets-video` `/upload-assets` | `upload-assets.class.ts:36–59` (S3, `public-read`) | infrastructure upload → returns URL; used by taxonomy icons (platform), restaurant logos (merchant), experience videos | **Partial** — the upload _pipeline_ is operationally needed for logos/photos during onboarding, but is **not schema-blocking** (target stores media as URL fields) |
| `icon-generator` `/icon-generator` | `icon-generator.class.ts:19–97` | platform icon generation aid (→ upload-assets) | No |
| Restaurant logo/photos | `restaurant.model.ts:53–56` (embedded URLs) | **(3) merchant-owned media** (URL strings) | No — URL fields; no separate media entity required |

**Media conclusion.** No separate media platform entity is required for merchant setup to function. Only the **S3 upload pipeline** is operationally required (logos/photos/icons); taxonomy icons are embedded strings and restaurant media are URL fields in the target. `media-catalogues`, `experience_media`, and promotional video catalogs are **reusable/discovery libraries** — defer. Do not conflate the three mechanisms (infrastructure vs curated library vs embedded reference metadata).

---

## 5. Merchant Onboarding

**Legacy flow (traced FE→API→service→persistence).**
- **Signup** creates the operating principal `VendorUser` (`role: "vendor"`) via `POST /vendor-user` (`amealiodashboardmvp-/client/src/store/actions/authAction.js:44–72`), then bootstraps a `restaurant` (`restaurant.class.ts:135–197`) and a `subscription` (`subscription.hooks.ts:203–216, 358–371`, linked back onto the restaurant).
- **Wizard steps 0–22** (`NewLogin.js:75–98` pageMap) all persist via `POST /restaurant` with an `id` (patch-in-create), covering geo, contacts, logo/video, chains, business type, features/hours/KYC, and `page_completed_till`. Step 22 configures the subscription via `PUT /subscription/:id`.
- **Two distinct gates:** (a) merchant self-declares completion (`have_submited_details_yourself`, T&C) from the FE; (b) **SUPER_ADMIN approval** sets `has_admin_approved` + `have_vendor_submitted_details` **server-side** (`admin-restaurant.class.ts:1397–1407`; UI `ApprovedModelPopup.js:54–56`). Dashboard access and consumer discovery are gated on these approval flags (`PrivateRoute.js:21–24`; `listRestaurantCard.class.ts:328–329`), with `softOnboarding` allowing partial (KYC-skipped) onboarding.

> **Refinement of doc 38.** Doc 38 stated onboarding progression is "frontend-driven." That holds for `page_completed_till` + `have_submited_details_yourself`, but the **operating gate** `have_vendor_submitted_details`/`has_admin_approved` is **admin-approval-driven server-side** — the merchant SPA only reads it. This admin-approval activation step has **no target equivalent yet**.

**Owner / staff provisioning (critical).** Legacy has **no separate staff/owner entity at onboarding** — the `VendorUser` itself is the operating principal; additional staff is a post-dashboard optional product feature (`manage_staff_licence` toggle; `/staffmanagement`). So in **legacy**, owner-`StaffMember` provisioning is not required to operate. **But the target maps a merchant owner to `Merchant` + `StaffMember`/`StaffCredential` (P1.7.1D/E), and P1.7.10 `createMerchant` creates only the `Merchant` row (`merchant-provisioning.service.ts:61–73`).** Therefore, in the **target auth model, a provisioned merchant currently has no principal and cannot authenticate/operate** — this is the key onboarding gap.

**Coverage vs gaps.**

| Legacy | Target coverage | Status |
|---|---|---|
| `have_vendor_submitted_details` / `page_completed_till` / `softOnboarding` | `Merchant.onboardingSubmitted`, `Restaurant.onboardingStep`, `Restaurant.softOnboarding` (P1.7.8) | present (state fields + service) |
| Merchant/Restaurant/Subscription create | `createMerchant`/`createRestaurant`/`createSubscription` (P1.7.10) | present (create only) |
| **Owner `StaffMember` + `StaffCredential`** at provisioning | — | **MISSING (blocking for target operability)** |
| **Restaurant-profile update** (wizard fields: taxonomy refs, hours, KYC, media) | only create + step/soft flags | **MISSING** |
| **Subscription-config update** (`PUT /subscription/:id` full merge) | only create + JSON store | **MISSING** |
| **Admin-approval activation** (`approve` → `has_admin_approved`) | — | **MISSING** |
| Public self-service signup | SUPER_ADMIN-only create | deferred |
| FE wizard, Razorpay contacts, chain approval, default RBAC seed, act-as | — | deferred |

---

## 6. Merchant Subscription & Configuration

Legacy subscription is a **single embedded document per `vendor_id`** (`subscription.model.ts:14–18`) with four business-type booleans and deep nested `<type>_status` config, plus top-level `deliveryMethods`/`deliveryConfig`/`experienceTaxesAndCharges`/`orderSteps`. The target preserves it as opaque `Subscription.config Json?` with a minimal accessor (`SubscriptionConfigService`: business types, seating gate, `getTableSetup()`) (P1.7.3, doc 30).

| Config block | Class | Setup vs Txn | Evidence |
|---|---|---|---|
| business-type booleans, `listing`, feature toggles | CONFIRMED | **Setup** | `subscription.model.ts:23–26`; accessor `subscription-config.service.ts:36–39` |
| `seating.*` incl. `table_management.table_setup` | CONFIRMED | Setup + Txn | `subscription.model.ts:348–461` |
| `ordering.*` (per channel) + `order_general` tax defaults | CONFIRMED | Setup + Txn | `subscription.model.ts:467–705`; `subscription.hooks.ts:251–328` |
| `event_management`, `experience_management`, `live_streaming` | PARTIAL | Setup structure; Txn lifecycle | `subscription.model.ts:54–347` |
| `offer_management`, `scan_and_pay`, bank accounts | PARTIAL | Setup (+bank KYC) | `subscription.model.ts:29–53` |
| `deliveryMethods`/`deliveryConfig`/`experienceTaxesAndCharges` | PARTIAL | Setup defaults; Txn pricing | `subscription.model.ts:2241–2305` |
| numeric `status` (default 1) | PARTIAL | Setup | mapping to target string **UNKNOWN** (doc 30 §4) |
| `massCompletion`, `join_community` | UNKNOWN | Txn/unknown | `subscription.model.ts:760–770` |

**Merchant-setup prerequisites:** business-type selection, feature toggles, initial `table_setup`/menu/tax/bank blocks. **Deferred transactional:** runtime timers, mass completion, delivery-charge application, table-status cron, and relational normalization of `table_setup`/taxes/delivery. **Gap:** the target has **create only** — no subscription-config **update** path.

---

## 7. Seating Setup

**`table_setup` is embedded in the subscription document** (verified): `casual_dining_status.seating.table_management.table_setup = { standard, floors[], seat[], table[] }` with a table `status` enum `AVAILABLE|OCCUPIED|DIRTY|ON_HOLD|UNAVAILABLE` (`subscription.model.ts:408–461`), **duplicated** for multi-service (`1699–1750`) and for dine-in ordering (`enable_table_number.table_setup`, `527–578`). Runtime seating lives in the `Diner` collection (`diner.model.ts`), and a **minute cron** (`cron.ts:63–64`) syncs table status back into the subscription embed **non-transactionally** (`diner-cron.class.ts:56–86`). Merchant configures via `PUT /subscription/:id` (`TableManagementScreen.js:204–226`, `TableSeatManagement.js:603–617`); consumer requests via `POST /diner` (`amealio_web_app/.../NewSeatingResquest.jsx:202–223`).

| Dimension | Finding |
|---|---|
| Merchant configures | floors/areas/tables/seats (shape, pax, status), walk-in/reservation rules, hours overrides, reservation blocks, QR (client-generated) |
| Customer consumes | seating/reservation request against `seat_capacity` + subscription seating config |
| Legacy persistence | subscription embed (`table_setup`) + `Diner` runtime + `manageReservationBlock`/`manageHoursOfOperation` |
| Target schema | `SeatingArea`/`RestaurantTable`/`SeatingRequest`/`ReservationBlock`/`OperatingHours` **exist but thin**; config stays JSON (P1.7.3) |
| Missing | seating **write module**, table **status** model, **cron parity**, QR persistence, `Waiter` (no tenant key), rich `Diner` field mapping, `INITIAL` status |
| Owner decision | normalize `table_setup` → relational (`SeatingArea`/`RestaurantTable`) **vs** keep JSON + status sidecar; hours-model shape; seating-area taxonomy vs `RestaurantFeature` |
| UNKNOWN | whether the `seatingarea` collection is still actively written; QR URL persistence; waiter↔table binding |

**Prerequisites to migrate seating:** P1.7.3 accessor (done) + **owner decision on `table_setup` target** + cron-parity design + seating write APIs + `Diner`→`SeatingRequest` field-mapping spec.

---

## 8. Menu & Item Setup

**Ownership confirmed merchant/restaurant-scoped:** `Menu` (`restaurant`+`vendor_id`) → `menuCategory` (sections) → `vendorItems` (`vendor_id`). `catalogue`/`chaincatalogue` are **groupings that reference `vendorItems` by id** (import assigns `vendor_id`), i.e. **not** platform templates (`catalogue.model.ts:14–26`, `chain-catalogue.model.ts:14–29`, `vendor-catalogue.class.ts:30–58`). → The doc 34 "**no platform Item Catalog**; `Menu`/`MenuItem` is the correct level" finding is **RE-CONFIRMED**; the platform-template hypothesis is **refuted**.

P1.7.5 delivered a **read-only** catalog (doc 33). The **entire WRITE/config layer is missing**, including: Menu/Section/Item create-update-delete; `ItemVariant`/`ItemChannelConfig`/`AddOnGroup`/`AddOn` writes; availability **schedules** (weekly timings/`date_of_availability`); **category-level tax/charges** (`menu-category.model.ts:31–44`, not modeled on `MenuSection`); **combos** (`combo.model.ts` — no Prisma model); catalogue import; **POS** item sync (`pos_item_id`/`pos_category_id`); item media; publishing/activation (`Menu.visibility`, `vendorItems.status`); nutrition/allergy fields. Legacy `vendorItems` is richer than the target `MenuItem` read map in these areas.

**Item creation depends on a Menu + Section** (items attach to `menuCategory`), so **Menu → Items is a HARD dependency** within the catalog write slice.

---

## 9. Celebrations / Experiences / Events

**There is no `Celebration` entity/collection/service in legacy.** "Celebrations" is a **combination**:

1. **UI/taxonomy label** — `ExpEventManagement` entries with `type=EXPERIENCE` + `Sub Category`, served to the consumer home as celebration cards (`/user-exp-events?type=EXPERIENCE`; `MainHomeScreen.jsx:956–1007`).
2. **Merchant `Experience` use case** — customer celebrations are **merchant-owned `Experience` records** (`vendorId` + required `restaurantId`, `experience.model.ts:80–111`) filtered by that `subCategory` (`user-experience.class.ts:574–578`; `amealio_web_app/.../Celebrations.jsx:38–69`). Bookings flow `experience_cart` → `/user/exp-checkout` → `expRequest` (with optional `diner_id` seating + `order_id` food linkage).
3. **Separate merchant `Events`** (ticketing/RSVP, `events.model.ts`) and **scraped `exp_events`** listings (no vendor/restaurant) power the home "Events" strip — distinct families that must **not** be merged.

Platform `experience_catalog` (`/experience-media`) is a **media/template library** by category/subcategory (more than pure taxonomy icons, less than a full experience template catalog). Target coverage: **all deferred** (only `UserProfile.preferences` Json holds celebration prefs). Validates doc 34. **A merchant `Experience` setup is a prerequisite for bookable celebration inventory** (taxonomy alone is insufficient).

---

## 10. Offers

Legacy canonical offer = **`Offers`** with an embedded unique **`coupon_code`** (there is **no** separate `Coupon` collection); scoping via `vendor_id`/`restaurant_id`/`restaurants[]`/`isGlobal`, date window, `service_type[]`, order-amount gates, `settlementType VENDOR|ADMIN|SPLIT` (`offers.model.ts:13–74`). Redemption tracked via `offerUsed`/`offerUsedBy[]`. `merchant-permotion` (curation workflow), `referral_program`, `SignupReward`, `promotional-event` are **distinct** systems.

- **Applied at cart/checkout time and OPTIONAL** — order creation does not require an offer; an absent/invalid offer is simply removed and the order proceeds (`user-ordering.class.ts:2043–2051`). No item-level FK (applies to order/cart totals).
- **Subscription `offer_management` gates the merchant UI only**, not backend offer CRUD (`offers.hooks.ts:199–290` has no subscription check).
- **Target:** `Offer` + `Coupon` + `CouponRedemption` schema **exist** (normalized from the single legacy model; `CouponRedemption` links `Order`+`User`; `OfferSettlementType MERCHANT|ADMIN|SPLIT`); the promotions **API module is not started**, and several legacy fields have no columns yet.

**→ Offers can be migrated INDEPENDENTLY of Ordering** (no HARD dependency in either direction); redemption wiring integrates with the order module later.

---

## 11. Cross-Domain Dependency Matrix

Arrows from the strategic hypothesis, classified with evidence:

| Arrow | Type | Evidence / reason |
|---|---|---|
| SuperAdmin definitions → Merchant onboarding | **HARD** (but **satisfied** for India-first) | onboarding picklists resolve via `Category`/`Sub Category` tree (`categoryActions.js:100–138`; `restaurant.model.ts:65–357`); target has Category/Cuisine/Currency (docs 31/35) |
| Merchant onboarding ↔ Subscription creation | **HARD (same slice)** | subscription is bootstrapped during signup and linked to the restaurant (`subscription.hooks.ts:203–216, 358–371`); business type gates the wizard |
| Subscription/config → Seating | **HARD** | seating config incl. `table_setup` is embedded in the subscription (`subscription.model.ts:348–461`); seating is a subscription toggle |
| Seating → Menu | **NO DEPENDENCY** | menu setup is gated by `menu_setup`, independent of seating; no seating references in menu/vendorItems |
| Menu → Items | **HARD** | items attach to a menu section (`menu.model.ts:17–31`; `vendor-items.hooks.ts:120–145`) |
| Items → Celebrations/Experiences | **SOFT** | experiences may include food items (`experience.model.ts:125–169`) but can be event-only (`type food|event`) |
| Celebrations/Experiences → Offers | **NO DEPENDENCY** | offers are independent of experiences |
| Offers → Cart/Ordering | **SOFT (optional)** | ordering does not require an offer; applied optionally at cart/order time (`user-ordering.class.ts:2043–2051`) |
| Menu/Items → Cart/Ordering | **HARD** | orders reference menu items (target `OrderService.createOrder` validates `menuItemId`↔restaurant, P1.7.12) |
| Merchant onboarding (owner principal + activation) → all merchant-scoped setup (seating/menu/items/experiences/offers) | **HARD** | every setup write is merchant-tenant-scoped (P1.7.1F/P1.7.2) and needs an authenticated, activated merchant principal; target merchant currently has no `StaffMember` (`merchant-provisioning.service.ts:61–73`) |

**Net technical chain (HARD only):** SuperAdmin defs → Onboarding(+owner provisioning+subscription create) → Subscription config → Seating; and Menu → Items → (meaningful) Ordering. Offers and Experiences are **parallelizable**; Seating→Menu is a **product** ordering choice, not a technical one.

---

## 12. Current Target-State Coverage

| Layer | Target artifact | Status |
|---|---|---|
| Identity/auth (consumer + staff/admin + RBAC) | P1.7.1B/E/F | complete (local/dev) |
| Merchant/Location read + tenancy | P1.7.2 | complete |
| Subscription read + config accessor | P1.7.3 | complete (JSON preserved) |
| Platform taxonomy (Category/Cuisine + icons) | P1.7.4 (doc 31) | complete |
| Menu/Catalog **read** | P1.7.5 (doc 33) | complete (read only) |
| Currency reference | P1.7.6 (doc 35) | complete |
| Onboarding/profile **state** fields | P1.7.8 | complete |
| Merchant/Restaurant/Subscription **create** | P1.7.10 | complete (create only) |
| Ordering foundation (create + status lifecycle) | P1.7.12 (doc 41) | complete |
| Owner `StaffMember` provisioning + activation | — | **missing** |
| Restaurant-profile / subscription **update** writes | — | **missing** |
| Seating write (+ `table_setup` normalization) | — | **missing (owner decision)** |
| Menu/Item **write** | — | **missing** |
| Experiences/Events, Offers API, Mood/Craving, media libraries | — | **deferred** |

---

## 13. Remaining Gaps

1. **Owner `StaffMember` + `StaffCredential` provisioning** at merchant creation — blocking target operability. *(no schema change; reuses P1.7.1D/E)*
2. **Onboarding activation gate** — map legacy admin-approval (`has_admin_approved`/`have_vendor_submitted_details`) to an operational-status transition on the target merchant/restaurant.
3. **Restaurant-profile update** path (wizard fields beyond create + step/soft flags).
4. **Subscription-config update** path (`PUT /subscription` merge).
5. **Menu/Item write foundation** (~20 capabilities; §8).
6. **Seating write foundation** + `table_setup` target decision + cron parity.
7. **Offers API module** (schema exists; wire creation/redemption).
8. **Experiences/Events** domain (merchant Experience + platform exp-events taxonomy) — deferred.
9. **Discovery reference** (Mood/Craving/Sections) + **media libraries** (media-catalogue/experience_media) — deferred.
10. **Attribute-lookup canonical mapping** (`Category.type` vs `RestaurantFeature`) — owner decision.

---

## 14. UNKNOWN / Owner Decisions

**Owner decisions required:**
- **DEC-1 (before recommended slice):** owner-provisioning contract — create the owner `StaffMember`(`MERCHANT_OWNER`)+`StaffCredential` at `createMerchant`, and define the activation/approval transition semantics.
- **DEC-2 (before Seating):** `table_setup` target — normalize to `SeatingArea`/`RestaurantTable` (+ a table-status model) vs keep `config` JSON + status sidecar; plus cron-parity approach.
- **DEC-3 (before Item write):** availability-schedule model, category-level tax/charges, and combos representation.
- **DEC-4:** subscription numeric `status` → target string mapping; one embedded doc vs multi-row `productType`.
- **DEC-5:** attribute lookups → `Category.type` vs `RestaurantFeature` canonical rule.
- **DEC-6:** cuisine canonical source (`Sub Category CUISINES` vs dedicated `Cusine`).

**UNKNOWN (unproven; do not decide by assumption):** active use of the `seatingarea` Mongo collection; QR URL persistence; waiter↔table binding; exact `vendorItems.status` → `ItemAvailability` rule; whether `menu-category.charges[]` roll up into order totals; the orphan `servicetype` service.

---

## 15. Recommended Migration Sequence

**Next slice — Merchant Owner Provisioning & Onboarding Activation.**
- **Why next:** it is the only missing **HARD** upstream of every merchant-scoped configuration slice. A target merchant created by P1.7.10 cannot authenticate/operate (no `StaffMember`), and there is no activation gate. Seating/Menu/Item/Experience/Offer setup are all merchant-scoped writes that require an authenticated, activated merchant, so this must land first.
- **Prerequisites:** all present — P1.7.1D/E identity + `StaffCredential`, P1.7.2 tenancy, P1.7.10 provisioning, P1.7.8 onboarding-state fields. DEC-1 needed.
- **Already complete:** Merchant/Restaurant/Subscription create; onboarding-state fields; staff auth/RBAC.
- **Missing (this slice):** owner `StaffMember`+`StaffCredential` creation tied to merchant creation; activation transition (approval → operational); (optionally) restaurant-profile + subscription-config update writes.
- **Defer:** public self-service signup, FE wizard, Razorpay contacts, act-as, RBAC catalogue seed.
- **Expected schema change:** none anticipated (reuses existing identity/merchant models).

**Proposed subsequent sequence (evidence-optimized for an operational merchant platform):**
1. **Merchant Owner Provisioning & Activation** *(recommended next)*
2. **Subscription Configuration Write** (config update/merge; entitlement gates) — HARD before seating
3. **Seating Setup** (after DEC-2; `table_setup` + reservation/hours + status/cron parity)
4. **Menu Write Foundation** (Menu/Section CRUD + publishing)
5. **Item Write Foundation** (items/variants/channel/add-ons/availability; after DEC-3) — HARD before meaningful Ordering
6. **Experiences/Celebrations** (merchant Experience + platform exp-events taxonomy) — parallelizable
7. **Offers** (wire existing `Offer`/`Coupon`/`CouponRedemption`) — parallelizable, independent of Ordering
8. **Transactional commerce:** Cart → Ordering (P1.7.12 done) → Payment → Delivery → Settlement

Note: **Seating → Menu is not a technical dependency**; steps 3–4 order is a product choice. **Offers/Experiences may run in parallel** with the seating/menu/item track.

---

## 16. Explicitly Deferred Domains

Cart write; Payment integration (Razorpay/wallet/UPI/pay-later/refunds/settlement); Delivery providers (Dunzo/Porter/own-rider), rider assignment, live tracking; POS/PetPooja; Socket.IO realtime; notifications; ONDC; frontend migration; Mongo data import/backfill; tax-engine redesign; billing/Product/Plan architecture; generic workflow/state-machine engine; Mood/Craving/Sections discovery taxonomy; media-catalogue/experience_media libraries; GPS scope expansion.

---

## 17. Evidence / Source References

**Super Admin / reference (Part A/B):** `category.model.ts`, `sub-category.model.ts:4–22`, `cusine.model.ts`, `currency.model.ts:9–19`, `mood-management.model.ts:10–34`, `cravings.model.ts:10–38`, `exp-events.model.ts:5–44`; `amealiodashboardmvp-/client/src/store/actions/categoryActions.js:100–138`; media: `media-catalogues.model.ts:11–63`, `experience_media.model.ts:5–79`, `upload-assets.class.ts:36–59`. Target: `prisma/schema.prisma` (`Category` 591–613, `Cuisine` 636–643, `Currency` 620–632); docs 31, 34, 35.

**Onboarding / subscription (Part C/D):** `vendor-user.model.ts:18–30`, `restaurant.model.ts:58, 546–550, 645`, `subscription.model.ts:14–26, 2241–2306`; `authAction.js:44–72, 574–590`; `NewLogin.js:75–98`; `admin-restaurant.class.ts:1397–1407`; `PrivateRoute.js:21–24`; `listRestaurantCard.class.ts:328–329`. Target: `merchant-provisioning.service.ts:61–89`; `subscription-config.service.ts:26–76`; docs 30, 37, 38, 39.

**Seating (Part E):** `subscription.model.ts:348–461, 527–578, 1699–1750`; `diner.model.ts`, `diner-cron.class.ts:56–86`, `cron.ts:63–64`; `TableManagementScreen.js:204–226`, `TableSeatManagement.js:603–617`; `amealio_web_app/.../NewSeatingResquest.jsx:202–223`. Target: `prisma/schema.prisma` (`SeatingArea`/`RestaurantTable` 559–580, `SeatingRequest` 1080–1106, enums 146–159); doc 30 §10.

**Menu/Item (Part F):** `menu.model.ts:17–48`, `menu-category.model.ts:31–44`, `vendor-items.model.ts:9–36, 594–596`, `catalogue.model.ts:14–26`, `chain-catalogue.model.ts:14–29`, `vendor-catalogue.class.ts:30–58`, `combo.model.ts`, `pos.model.ts`; `AddItem/BasicDetails.js:1220–1234`; `vendorSubscriptionGetAction.js:124–174`. Target: `catalog.service.ts:25–62`; docs 33, 34.

**Experiences/Offers (Part G/H):** `experience.model.ts:80–169`, `expRequests.model.ts:16–80`, `exp-events.model.ts:5–42`, `exp_events.model.ts:7–30`, `events.model.ts:20–151`, `experience_media.model.ts:5–79`; `MainHomeScreen.jsx:956–1007`, `Celebrations.jsx:38–69`; `offers.model.ts:13–74`, `offers.hooks.ts:199–290`, `user-offer.class.ts:39–139`, `user-ordering.class.ts:2043–2051`. Target: `prisma/schema.prisma` (`Offer` 1180–1202, `Coupon` 1204–1215, `CouponRedemption` 1217–1227, `UserProfile.preferences` 275–276); docs 31, 34.
