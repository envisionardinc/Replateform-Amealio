# 29 — Merchant & Location Foundation (P1.7.2)

> **Status:** IMPLEMENTED — application foundation only. **No Prisma schema change** (the tenant/location tables already exist from P1.4/P1.5 and are sufficient). No merchant/onboarding CRUD, no controllers, no frontend, no subscription redesign, no other domain behavior.
> **Grounding:** current-state forensic audit + reconciliation (`../../current-state/`), the legacy `amealio-vendordashboard` Mongoose models (read-only), and the existing target `prisma/schema.prisma`.
> **Auth unchanged:** P1.7.1E authentication and P1.7.1F authorization are intact; `StaffPrincipal`/JWT claims/consumer auth untouched.

---

## 1. What was implemented

A minimal, grounded **Merchant & Location application module** (`apps/api/src/modules/merchant/`) over the **existing** P1.5 `Merchant` and `Restaurant` tables:

- `MerchantRepository` — read access to the `Merchant` tenant (by id, by `legacyId`, `existsActive`).
- `RestaurantRepository` — read access to the `Restaurant` location (by id, by `legacyId`, `listByMerchant`, `belongsToMerchant`).
- `MerchantScopeService` — **data-aware** merchant tenancy: given a server-derived `StaffPrincipal`, confirms a target restaurant actually belongs to the staff's merchant (the check that P1.7.1F's string-only merchant-id comparison cannot perform). SUPER_ADMIN is platform-scoped (not confined).
- `MerchantModule` (providers + exports) registered in `AppModule`.
- Domain read-model types (`MerchantRecord`, `RestaurantRecord`).

**No schema/migration change.** The IN-SCOPE foundation (merchant identity, location identity, merchant↔location relationship, staff tenancy, legacy ids) already exists in the target schema; this slice grounds it in source, makes it usable/testable, and documents the reality.

## 2. Source evidence used

Legacy (`amealio-vendordashboard/src/models/`, read-only):

- **`restaurant.model.ts`** — the central business unit. Owned by **`vendor_id → VendorUser`**; groups via **`restaurant_chain_id → Restaurant Chain`**; links a per-restaurant **`subscription`** (ObjectId ref); carries GeoJSON `location`, `restaurant_address`/`city`/`state`/`pinCode`, `timezone`, `currency`, `is_deleted`, and a large embedded feature-config block (`casual_dining`, `fast_food`, `hospitality_and_hotel`, `sessionSettings`, `orderSessionSettings`, seating fields, …).
- **`vendor-user.model.ts`** — the owner/operator identity (role vendor/superadmin), `is_deleted`. No `restaurant_id` on the user; ownership is `restaurant.vendor_id`.
- **`subscription.model.ts`** — keyed by **`vendor_id`**; contains the master embedded config (`casual_dining_status`, `seating.general_seating`, `seating.table_setup`, auto-cancel timers, event/experience gates).
- **`role-management.model.ts`** — scoped by **`vendor_id` + `restaurant_id`**.
- **`organization.model.ts`** (org/donation/contact) and **`restaurant-chain.model.ts`** (`name`) — grouping concepts.

**There is NO legacy `Merchant` entity.** The legacy tenancy graph is:

```
VendorUser (owner; vendor/superadmin)
   ▲ restaurant.vendor_id
restaurant ── restaurant.subscription ──▶ subscription (vendor_id-keyed; embeds table_setup + feature gates)
   │ restaurant.restaurant_chain_id ──▶ Restaurant Chain
role-management: scoped by (vendor_id, restaurant_id)
```

## 3. Merchant identity semantics (target)

`Merchant` (existing P1.5 table) is the **approved tenant abstraction** that groups a vendor's restaurants and employs staff — a P1.4 ADAPT of the legacy `VendorUser`-owner + `organization`/`chain` concepts (legacy has no single Merchant record). Fields: `id`, `legacyId?` (unique), `organizationId?`, `legalName`, `email?` (unique), `phone?` (unique), `isBlocked`, `createdAt/updatedAt`, `deletedAt` (soft-delete). Owns `restaurants`, `staff`, `roles`, `subscriptions`, and (for later domains) menus/orders/offers/settlements/etc. **No fields added** — only those already supported are carried.

## 4. Location semantics (target)

`Restaurant` (existing P1.5 table) is the **location**. Fields used by the foundation: `id`, `legacyId?` (unique), `merchantId` (**NOT NULL** → owning Merchant), `chainId?`, `name`, `city/state/pinCode/country/timezone/currencyCode`, `lat/lon`, `status` (default `ACTIVE`), timestamps, `deletedAt`. This maps legacy `restaurant` (address/geo/timezone/currency/`is_deleted`) with the vendor-embedded config deliberately left to the Subscription boundary (§8).

## 5. Merchant ↔ Location relationship

**Merchant 1 → N Restaurant** (a merchant owns many locations). Evidence: legacy allows a `VendorUser` (one owner) to own multiple `restaurant` records, optionally grouped by `restaurant_chain_id`; the target expresses this as `Restaurant.merchantId` (NOT NULL) with `Merchant.restaurants[]`, plus `RestaurantChain.merchantId` and `Organization → Merchant`. It is **not** one-to-one, and **Merchant ≠ Restaurant** (distinct concepts). Enforced by DB FK and verified by tests (`listByMerchant`, `belongsToMerchant`, FK rejection).

## 6. StaffMember tenancy relationship

`StaffMember.merchantId` (nullable) → `Merchant`: populated ⇒ merchant-scoped staff; `NULL` ⇒ platform-scoped SUPER_ADMIN (P1.7.1D/E/F). Unchanged. `MerchantScopeService` builds on P1.7.1F's server-derived scope (`StaffPrincipal.merchantId`) to add a restaurant-ownership check; request-supplied ids are never an authorization source. SUPER_ADMIN remains platform-scoped; act-as/impersonation remains deferred.

## 7. Legacy identifiers preserved

`Merchant.legacyId` and `Restaurant.legacyId` (both `@unique`, already present) are the mapping anchors for a future controlled import from legacy Mongo. **No import/backfill pipeline is built here**; no legacy data is copied.

## 8. Subscription / configuration boundary

Left intentionally intact. The existing `Subscription{ merchantId, restaurantId?, productType, status, config Json? }` is a **thin placeholder**: `merchantId` (+ optional `restaurantId`) reproduces the legacy per-vendor/per-restaurant subscription link, and `config Json?` holds the large embedded legacy configuration (`casual_dining_status`, `seating.table_setup`, auto-cancel timers, event/experience gates) **without flattening or loss**. This slice does **not** model, normalize, or redesign that configuration — that remains an unresolved architectural concern (see reconciliation §12 and §9 below).

## 9. Known UNKNOWN items

1. **Legacy → Merchant grouping rule (import-time).** Legacy has no Merchant key; which restaurants collapse into one target `Merchant` (by `vendor_id` owner? by `organization`? by `restaurant_chain_id`?) is **UNKNOWN** and is a data-migration owner decision — not required for the foundation.
2. **Subscription config normalization.** The shape of `Subscription.config` (normalize vs JSON vs hybrid; where `table_setup` lands) is unresolved (reconciliation §12/§18).
3. **`organization` semantics.** Legacy `organization` mixes donation/contact concerns; whether the target `Organization` should carry those is UNKNOWN.
4. **Restaurant `status` vocabulary.** Target `status` is a free string (`ACTIVE` default); the legacy equivalent is spread across `is_deleted`, `restaurant_open_or_close`, `vendorApproved`, `softOnboarding` — the canonical target status set is not yet decided (kept as-is; not invented).

## 10. Deferred items

Merchant/onboarding CRUD, subscription modeling/redesign, table-setup modeling, restaurant discovery/menu/ordering/seating/experiences/events/delivery, admin, frontend, legacy data import, ONDC (DEFERRED — existing), act-as/impersonation, merchant switching, multi-merchant staff.

## 11. Schema / migration details

**None.** `prisma/schema.prisma` and all migrations are unchanged (`git status -- prisma/` empty; `prisma validate` ✓; `migrate status` up to date). The foundation reuses the P1.5 `Merchant`, `Restaurant`, `RestaurantChain`, `Organization`, `Subscription`, and `StaffMember` tables.

## 12. Test / build / lint / format evidence

New tests (12; suite 139 → **151**, all green):

- **Unit** — `merchant-scope.service.spec.ts` (5): scope resolution; restaurant-in-scope allow; cross-merchant 403; no-scope 403; SUPER_ADMIN not confined.
- **Integration** (test DB, real repositories + Prisma relationships) — `merchant-location.e2e-spec.ts` (7): merchant identity + `legacyId` lookup + `existsActive`; location identity owned by merchant; **Merchant 1→N Restaurant** (listing + FK rejection); merchant uniqueness (email, legacyId); location soft-delete; **StaffMember→Merchant tenancy** (+ SUPER_ADMIN `merchantId` NULL); data-aware scope (own allow / cross-merchant 403 / SUPER_ADMIN unconfined).

Maps to required cases: (1) merchant representable, (2) location representable, (3) relationship enforced, (4) uniqueness, (5) lifecycle/deletion, (6) staff relationship valid, (7) P1.7.1E green, (8) P1.7.1F green, (9) SUPER_ADMIN platform-scoped, (10) merchant staff cannot escape boundary.

Validation: `npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓ · `npm test` → **151/151** (19 suites) · `prisma validate` ✓ · `prisma migrate status` up to date.
