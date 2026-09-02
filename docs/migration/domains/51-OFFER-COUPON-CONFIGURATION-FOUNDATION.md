# 51 — Merchant Offer & Coupon Configuration Foundation (P1.7.22)

> **Type:** IMPLEMENTATION (bounded slice) — merchant/admin **Offer + coupon-code CONFIGURATION** over the EXISTING `Offer`(+`Coupon`) models. One additive migration.
> **Governing gate:** [50-OFFERS-PROMOTIONS-RECONCILIATION.md](./50-OFFERS-PROMOTIONS-RECONCILIATION.md).
> **Authority:** legacy `amealio-vendordashboard` `offers.model.ts` + target `prisma/schema.prisma`. Baseline **260/260 → 268/268**.

---

## 1. Scope

A merchant-tenant-scoped `OfferService` + `OfferRepository` to **configure** an Offer definition and its coupon code in canonical PostgreSQL: create/get/list/update/activate-deactivate/soft-delete. **Configuration only** — NOT a discount engine, redemption engine, checkout, or payment. `CouponRedemption` is **untouched/unused**; no usage counters, no discount calculation, no order/payment integration, no SPLIT calculation, no cron, no controllers/UI.

## 2. Legacy source evidence

Legacy `Offers` (`offers.model.ts:6-115`) is a single collection with `coupon_code` (unique) — **no separate Coupon/CouponRedemption** (doc 50 §4). Config fields: `name`, `description`, `terms_and_condition`, `discount`+`isPercentage`, `maximum_discount_applied`, `minimum_order_applied`, `maximum_order_applied`, `service_type[]` (free strings, e.g. Takeaway/Delivery/Dine-In — `usercart.class.ts:35-44`), `start_date`/`end_date`, `active`, `maximum_usage_limit`/`useLimit`/`useFrequency`(DAILY|WEEKLY|MONTHLY|YEARLY)/`maxUsage`, `settlementType`(VENDOR|ADMIN|SPLIT), `isGlobal`, `restaurant_id`. Redemption counters (`offerUsed`/`offerUsedBy[]`) are **out of scope**.

## 3. Existing target Offer/Coupon/CouponRedemption assessment

Target already had `Offer{merchantId?,restaurantId?,title,isGlobal,settlementType,discountMinor?,discountPercent?,serviceTypes Json?,validFrom/To,deletedAt}` → `Coupon{offerId,code @unique,useFrequency?}` → `CouponRedemption{couponId,userId?,orderId?}`; enum `OfferSettlementType {MERCHANT,ADMIN,SPLIT}`. **Assessment:** `Offer` is reusable but was **incomplete** (missing discount cap, order gates, usage-limit config, active, description/terms, legacyId). `Coupon` safely holds the code (no redemption semantics on the row itself). `CouponRedemption` correctly **left unused**. Enum reused (`VENDOR`→`MERCHANT` rename).

## 4. Offer model (implemented)

Extended `Offer` additively (§17). Create/update via `OfferService`; one **Coupon** row holds the optional `coupon_code`.

## 5. Coupon representation

**The existing `Coupon` table holds the code** (one Coupon per Offer at configuration; `code @unique`). Chosen over adding `couponCode` to `Offer` because the target `Coupon` model already exists with the exact unique-code shape and using it introduces **no redemption semantics** — redemption lives only in the separate `CouponRedemption`, which this slice never writes. Coupon code is **optional** (legacy allows code-less offers). Update can replace or clear the code. `Coupon.useFrequency` is left as-is/unused (usage config lives on `Offer`, matching legacy).

## 6. Discount types

Source-confirmed only: **percentage** (`discountPercent` 1..100) and **fixed** (`discountMinor` BigInt > 0), **mutually exclusive** (exactly one required on create). **`maxDiscountMinor`** cap preserved. No BOGO/free-item/item/category/experience/payment-method discounts; no rules engine.

## 7. Order amount gates

`minOrderMinor`/`maxOrderMinor` (BigInt minor units; `max ≥ min`). **Configuration only — NOT enforced at order time** (Order untouched; no discount calculation).

## 8. Usage configuration

Config fields only: `maxUsageLimit` (total), `perUserLimit` (legacy `maxUsage`), `useLimit` (per-period), `useFrequency` (DAILY|WEEKLY|MONTHLY|YEARLY). **No counters, no `offerUsed`/`offerUsedBy`, no increment/decrement** (redemption slice). Overlapping legacy limit fields are preserved as distinct config values, not normalized.

## 9. Validity

`validFrom`/`validTo` (`validTo > validFrom`) + `active Boolean @default(false)` (activate/deactivate via `setActive`). **No automatic expiry / cron** (legacy cron is commented out; not reproduced).

## 10. Service types

`serviceTypes Json?` — a free-form string array (legacy `service_type[]` values are not a stable enum and do not map cleanly to `OrderType`). Validated as an array of non-empty strings; stored verbatim. No enum invented.

## 11. Settlement type

`settlementType` (`OfferSettlementType {MERCHANT,ADMIN,SPLIT}`; legacy `VENDOR`→`MERCHANT`). **Configuration only** — `SPLIT` may be stored but **no SPLIT/settlement calculation** is implemented (unresolved in legacy). Payment/settlement untouched.

## 12. Global / merchant scope

`isGlobal` = platform-wide, **SUPER_ADMIN only** (merchant staff creating a global offer → `403`); global offers are merchant/restaurant-less and cannot target a restaurant (`400`). Non-global offers: `merchantId` **server-derived** (staff's own; SUPER_ADMIN must pass explicit `merchantId`); request-body `merchantId` is never authoritative for staff. Access to a global offer requires SUPER_ADMIN.

## 13. Restaurant scope

Single optional `restaurantId` (reuses the existing `Offer.restaurantId`), validated to belong to the offer's merchant and be non-deleted. **Multi-restaurant targeting (legacy `restaurants[]`) is NOT implemented** — no speculative junction (doc 50 UNKNOWN preserved).

## 14. Field mapping

| Legacy | Target | Meaning | Type |
|---|---|---|---|
| `name` | `title` | offer title | String |
| `description` | `description` (NEW) | text | String? |
| `terms_and_condition` | `termsAndConditions` (NEW) | text terms (no media) | String? |
| `coupon_code` | `Coupon.code` | redeemable code (optional) | String @unique |
| `isPercentage`+`discount` | `discountPercent` / `discountMinor` | one discount type | Int / BigInt |
| `maximum_discount_applied` | `maxDiscountMinor` (NEW) | % cap | BigInt |
| `minimum_order_applied`/`maximum_order_applied` | `minOrderMinor`/`maxOrderMinor` (NEW) | order gates | BigInt |
| `service_type[]` | `serviceTypes Json?` | channel strings | Json |
| `start_date`/`end_date` | `validFrom`/`validTo` | validity | DateTime? |
| `active` | `active` (NEW) | publication | Boolean |
| `maximum_usage_limit` | `maxUsageLimit` (NEW) | total cap (config) | Int? |
| `maxUsage` | `perUserLimit` (NEW) | per-user cap (config) | Int? |
| `useLimit`/`useFrequency` | `useLimit` (NEW)/`useFrequency` (NEW) | per-period config | Int?/String? |
| `settlementType VENDOR\|ADMIN\|SPLIT` | `settlementType MERCHANT\|ADMIN\|SPLIT` | settlement (config) | enum |
| `isGlobal` | `isGlobal` | platform-wide | Boolean |
| `restaurant_id` | `restaurantId` | single-restaurant scope | uuid? |
| `_id` | `legacyId` (NEW) | import id | String? @unique |
| `offerUsed`/`offerUsedBy[]`/`restaurants[]`/media/geo/carousel | — | **DEFERRED** | — |

## 15. API / service surface

Service/repository foundation only — **no HTTP controllers** (consistent with P1.7.18/P1.7.20; no customer/redemption/checkout/payment endpoints). `OfferService`: `createOffer`, `getOffer`, `listMerchantOffers`, `listGlobalOffers`, `updateOffer`, `setActive`, `deleteOffer`.

## 16. Tenancy / authorization

Merchant-tenant-scoped via `StaffPrincipal` + `isSuperAdmin` (P1.7.1F patterns) + `RestaurantRepository` (P1.7.2) for restaurant validation: merchant staff confined to their merchant; cross-merchant → `403`; global offers SUPER_ADMIN-only; deleted restaurant → `404`; SUPER_ADMIN explicit merchant target for non-global; no act-as. The P1.7.14 activation gate is upstream (BLOCKED owner cannot obtain a session — verified via real staff login).

## 17. Schema changes (additive)

`Offer` += `legacyId String? @unique`, `description String?`, `termsAndConditions String?`, `active Boolean @default(false)`, `maxDiscountMinor BigInt?`, `minOrderMinor BigInt?`, `maxOrderMinor BigInt?`, `maxUsageLimit Int?`, `perUserLimit Int?`, `useLimit Int?`, `useFrequency String?`. `Coupon`/`CouponRedemption` **unchanged**. No existing column altered/dropped; historical migrations untouched.

## 18. Migration

`prisma/migrations/20260902153700_p1_7_22_offer_configuration/migration.sql` — applied to **dev** + **test**; `migrate status` up to date (10 migrations).

## 19. Tests (8 new; 260 → 268)

`apps/api/test/offer-configuration.e2e-spec.ts` (real TEST DB): percentage offer (cap/gates/service-types/validity/usage/coupon; **0 redemption rows**); fixed offer without code; validation matrix (discount XOR/required/range, order range, date range, service types, usage ints, frequency, settlement); coupon-code uniqueness; get/list/update/activate/deactivate/soft-delete; tenancy (cross-merchant `403`, SUPER_ADMIN explicit target, foreign/deleted restaurant); global-scope authorization (SUPER_ADMIN-only, staff `403`, global-can't-target-restaurant, `listGlobalOffers` gating); activation gate via real staff login.

## 20. Deferred functionality

Coupon redemption + `CouponRedemption`; discount calculation/application; order/cart/checkout/payment integration; usage counters (`offerUsed`/`offerUsedBy`); SPLIT settlement calculation; automatic expiry/cron; multi-restaurant targeting (`restaurants[]`); media/photos/carousel/geo targeting; item/category/experience/BOGO/free-item discounts; referral/signup/wallet/curation/video systems; subscription server-side gate enforcement; customer/merchant UI; HTTP controllers.

## 21. UNKNOWNs

Discount calculation source-of-truth (legacy client-computed; recommend server-side — redemption slice); authoritative redemption timing; whether subscription `offer_management` should be server-enforced; SPLIT semantics; whether `restaurants[]`/geo targeting are still used.

## 22. Owner decisions still outstanding

DEC-OFF-1 discount source-of-truth; DEC-OFF-3 redemption timing / `CouponRedemption` creation; DEC-OFF-4 SPLIT; DEC-OFF-5 referral/curation/video as separate domains; DEC-OFF-6 subscription gate enforcement; multi-restaurant targeting representation.

## 23. Recommended P1.7.23

**Offer redemption + discount-application foundation** (the transactional counterpart): validate a coupon against an order/cart, compute the discount **server-side**, and create a `CouponRedemption` at the authoritative point (with usage-limit enforcement) — gated by DEC-OFF-1/DEC-OFF-3 and requiring the cart/order runtime. Alternatively continue merchant-config completion (referral/curation as separate deferred domains). Redemption/payment remain the larger deferred track.

---

### Confirmations
- **P1.7.18 untouched**; **P1.7.20 (Experience) untouched**; Ordering/Payment/Seating unchanged.
- **No redemption/order/payment behavior implemented**; `CouponRedemption` unused; no discount calculation; no SPLIT calculation.
- Validation: **268/268**, build/lint/format ✓, `prisma validate` ✓, `migrate status` up to date (10 migrations; applied dev+test). **No frontend.**
