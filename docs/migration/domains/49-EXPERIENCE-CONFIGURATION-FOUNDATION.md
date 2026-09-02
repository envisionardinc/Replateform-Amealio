# 49 — Merchant Experience Configuration Foundation (P1.7.20)

> **Type:** IMPLEMENTATION (bounded slice) — canonical merchant-owned **Experience configuration** over new additive target models. One additive migration.
> **Governing gate:** [48-CELEBRATIONS-EXPERIENCES-RECONCILIATION.md](./48-CELEBRATIONS-EXPERIENCES-RECONCILIATION.md).
> **Authority:** legacy `amealio-vendordashboard` `experience.model.ts` + target `prisma/schema.prisma` + P1.7.4/P1.7.6/P1.7.18. Baseline **251/251 → 260/260**.

---

## 1. Scope

Implemented a merchant-tenant-scoped `ExperienceService` + `ExperienceRepository` to create/read/update/publish/soft-delete a **merchant-owned `Experience`** and its **custom-menu references** (`ExperienceMenu`), over new additive models. Reuses P1.7.4 `Category`, P1.7.6 currency convention, P1.7.18 `Menu(type=CUSTOM)`, P1.7.2 tenancy, P1.7.14 activation. **No booking/payment/refund/Diner/Order, no media, no scheduling engine, no packages, no events/scraped-events, no controllers/UI.**

---

## 2. Legacy source evidence

Legacy `Experience` (`experience.model.ts:1-260`): `restaurantId` **required** + `vendorId`; `category`→Category, `subCategory`/`classification`→Sub Category; `type ∈ {food, event}` (default event); `expType` (free string; confirmed SPECIAL|CURATED, doc 48); capacity `totalSeats`/`minSeats`/`maxSeats` (config) + `seatsBooked`/`seatsLeft` (**runtime**); publication `active`/`isDraft`; `isDelete`; scalar prices `Listing_price`/`adultPrice`/`kidsPrice`/`Occasion_price` (+ `packages[]`, `packaging_charges`); food `is_food_included`/`serveFood`/`foodItems`/`isOccasionWithText`/`occasionWithText`; menu mode `isStandardMenu`/`isCustomMenu`/`isPackage`; `CustomMenu[]`→Menu + `defaultCustomId`; `startDate`/`endDate`/`timings`; media `photos[]`/`videos[]`.

---

## 3. Target Experience model

New `Experience` + `ExperienceMenu` (additive; `prisma/schema.prisma`). Merchant-owned (`merchantId` + `restaurantId` FKs), taxonomy FKs to `Category` (category + subCategory), enums for type/kind/food/menu mode, capacity ints, BigInt scalar prices + `currencyCode`, `startAt`/`endAt` + `scheduleConfig Json?`, `active`/`isDraft`, `deletedAt`, and `menus ExperienceMenu[]`.

## 4. Field mapping

| Legacy | Target | Type | Notes |
|---|---|---|---|
| `_id` | `id`/`legacyId` | uuid/String? | `legacyId @unique` |
| `restaurantId`/`vendorId` | `restaurantId`/`merchantId` | uuid FK | server-derived merchant |
| `category`/`subCategory` | `categoryId`/`subCategoryId` → `Category` | uuid FK? | reuse P1.7.4; `classification[]` **deferred** |
| `name`/`description` | `name`/`description` | String/String? | |
| `type` | `type` | `ExperienceType` | FOOD\|EVENT (default EVENT) |
| `expType` | `expType` | `ExperienceKind?` | SPECIAL\|CURATED |
| `is_food_included`/`serveFood`/`isOccasionWithText` | `foodMode` | `ExperienceFoodMode` | NONE\|INCLUDED\|SEPARATE\|OCCASION_TEXT |
| `isStandardMenu`/`isCustomMenu`/`isPackage` | `menuMode` | `ExperienceMenuMode` | NONE\|STANDARD\|CUSTOM\|PACKAGE |
| `foodItems` | `foodDescription` | String? | |
| `occasionWithText` | `occasionText` | String? | |
| `totalSeats`/`minSeats`/`maxSeats` | same | Int? | **config** |
| `seatsBooked`/`seatsLeft` | — | — | **runtime — DEFERRED** (see §6) |
| `Listing_price`/`adultPrice`/`kidsPrice`/`Occasion_price` | `listingPriceMinor`/`adultPriceMinor`/`kidsPriceMinor`/`occasionPriceMinor` | BigInt? | minor units (see §7) |
| — | `currencyCode` | String | default INR (see §9) |
| `startDate`/`endDate` | `startAt`/`endAt` | DateTime? | fixed window |
| `timings`/recurrence | `scheduleConfig` | Json? | preserved verbatim (no engine, §10) |
| `active`/`isDraft` | `active`/`isDraft` | Boolean | publication/draft |
| `isDelete` | `deletedAt` | DateTime? | soft delete |
| `CustomMenu[]`/`defaultCustomId` | `ExperienceMenu[]` (`isDefault`) | join | §11 |
| `photos[]`/`videos[]`, `packages[]`, `packaging_charges`, `menuList[]` | — | — | **DEFERRED** |

## 5. Enum mapping

`ExperienceType {FOOD, EVENT}` ← `type food|event`. `ExperienceKind {SPECIAL, CURATED}` ← `expType` (confirmed vocabulary, doc 48; nullable). `ExperienceFoodMode {NONE, INCLUDED, SEPARATE, OCCASION_TEXT}` ← the food booleans. `ExperienceMenuMode {NONE, STANDARD, CUSTOM, PACKAGE}` ← the mutually-exclusive menu-mode booleans. Legacy `orderType`/`menudisplay` etc. are UI/booking concerns — not modeled.

## 6. Capacity semantics

`totalSeats`/`minSeats`/`maxSeats` are **CONFIGURATION** (modeled). `seatsLeft`/`seatsBooked` are **runtime booking inventory** — **NOT modeled** here; inventory allocation belongs to the deferred booking slice. Validation: non-negative ints; `minSeats ≤ maxSeats ≤ totalSeats`.

## 7. Pricing semantics

Distinct source price concepts preserved as separate **BigInt minor-unit** fields: `listingPriceMinor` (headline), `adultPriceMinor`, `kidsPriceMinor`, `occasionPriceMinor`. No floats. `packages[]` nested pricing and `packaging_charges` are **DEFERRED**. No payment/tax/discount/refund.

## 8. Food configuration

`foodMode` distinguishes included / purchasable-separately / occasion-text-only / none; `foodDescription` (foodItems) and `occasionText` preserve the text. Creating a food-included experience does **not** create Order/Cart/menu items. `menuMode` captures the menu strategy; actual custom-menu selection is the `ExperienceMenu` reference (§11).

## 9. Currency

Experience has no legacy currency field (pricing inherits restaurant currency, India-first INR). `Experience.currencyCode` defaults to `INR` (or caller-supplied), reusing the P1.7.6 convention. **Restaurant-currency inheritance is a minor deferred enhancement** (the P1.7.2 read repo does not expose `currencyCode`; not modified here). No FX.

## 10. Schedule representation

Fixed `startAt`/`endAt` (legacy `startDate`/`endDate`) plus `scheduleConfig Json?` preserving richer `timings`/recurrence verbatim. **No scheduler/cron, no recurrence engine** in this slice.

## 11. Category / Sub Category relationship

Reuses the existing P1.7.4 self-referential `Category` (sub-category = a child `Category` row). `Experience.categoryId`/`subCategoryId` are optional FKs to `Category` (validated to exist). No Experience-specific taxonomy table; the `ExpEventManagement` overlay is **not** implemented (deferred).

## 12. Custom Menu relationship

`ExperienceMenu { experienceId, menuId, isDefault }` join. **Cardinality (source-backed):** one Experience → **many** custom menus (legacy `CustomMenu[]` array) with **at most one default** (legacy `defaultCustomId`) — `@@unique([experienceId, menuId])`. Each linked menu must be a **non-deleted `Menu(type=CUSTOM)` of the SAME restaurant** (validated); STANDARD/foreign-restaurant menus and >1 default are rejected. Reference, not snapshot. `setCustomMenus` replaces the link set atomically (`$transaction`).

## 13. Tenancy model

Merchant-tenant-scoped via P1.7.2 `MerchantScopeService.assertRestaurantInScope` (reuses P1.7.1F): server-derived merchant (never request-supplied); a menu/experience of another merchant → `403`; unknown/soft-deleted restaurant/experience → `404`; `SUPER_ADMIN` operates with an explicit restaurant target; no act-as. The P1.7.14 activation gate is upstream (BLOCKED owner cannot obtain a session — verified via real staff login).

## 14. API surface

Service/repository foundation only — **no HTTP controllers** (consistent with P1.7.16/P1.7.18 foundations; customer/booking/event/media APIs are out of scope). `ExperienceService`: `createExperience`, `getExperience`, `getByLegacyId`, `listExperiences`, `updateExperience`, `publishExperience`, `unpublishExperience`, `setCustomMenus`, `deleteExperience`.

## 15. Schema changes (additive)

New enums `ExperienceType`/`ExperienceKind`/`ExperienceFoodMode`/`ExperienceMenuMode`; new tables `Experience` + `ExperienceMenu`; virtual back-relations on `Merchant`/`Restaurant`/`Category`/`Menu` (no columns). No existing column altered/dropped; historical migrations untouched.

## 16. Migration

`prisma/migrations/20260902104500_p1_7_20_experience_configuration/migration.sql` — applied to **dev** (`amealio_dev`) and **test** (`amealio_test`); `migrate status` up to date (9 migrations).

## 17. Tests (9 new; 251 → 260)

`apps/api/test/experience-configuration.e2e-spec.ts` (real TEST DB): create with full config (type/expType/capacity/pricing/food, draft default); get by id/legacyId + list; update + publish/unpublish; custom-menu link/replace + foreign/non-custom/>1-default rejection; Category/Sub Category link + unknown-category rejection; enum/capacity/pricing validation; tenancy (cross-merchant `403`, SUPER_ADMIN explicit target, unknown/soft-deleted `404`); soft delete; activation gate via real staff login.

## 18. Deferred functionality

Booking (`expRequest`), payment/refund, Diner/Order materialization, capacity/inventory allocation (`seatsLeft`), scheduling engine/recurrence, packages + `packaging_charges`, media (photos/videos), `classification[]` tags, `ExpEventManagement` taxonomy overlay, scraped `exp_events`, merchant `Events`/`eventHandler`, customer discovery/UI, HTTP controllers, restaurant-currency inheritance.

## 19. Remaining UNKNOWNs

Custom-menu junction-vs-category read rule (doc 46/48); `Experience.menuList[]` (legacy) vs `CustomMenu[]` (active, modeled); media `usedBy` mismatch (doc 48) — none resolved here (out of scope).

## 20. Owner decisions still outstanding

Booking model (`expRequest` representation); `ExpEventManagement` taxonomy overlay modeling; scraped `exp_events` scope; merchant `Events` domain; media representation (embedded URLs vs catalogue); packages representation; whether Experience currency should inherit restaurant currency.

## 21. Validation

- `npm test` → **260/260** (32 suites; 251 prior + 9 new). `npm run build` ✓ · `npm run lint` ✓ · `npm run format:check` ✓. `npx prisma validate` ✓; `npx prisma migrate status` up to date (9 migrations).

## 22. Next recommended migration slice

Either the **Experience booking foundation** (`expRequest` create/lifecycle reusing SeatingRequest/Order patterns — the natural next step, gated by DEC-EXP-2) or continue merchant-config completion (offers/tax where owner decisions land). Booking/payment/customer UI remain the larger deferred track.
