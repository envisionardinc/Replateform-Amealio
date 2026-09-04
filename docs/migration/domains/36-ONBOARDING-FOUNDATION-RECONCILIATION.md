# 36 — Merchant & User Onboarding Foundation Reconciliation (P1.7.7)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no owner decisions resolved. Determines which platform foundations must exist before Merchant onboarding and User onboarding/profile can be implemented in the target.
> **Authority order:** legacy source (`amealio-vendordashboard`, `amealiodashboardmvp-`, `amealio_web_app`) → forensic docs → target schema.
> **Completed baseline (do not modify):** P1.7.1D/E/F, P1.7.2, P1.7.3, P1.7.4, P1.7.5, P1.7.6A, P1.7.6. Tests **188/188**.

---

## 1. Executive conclusion

**All platform foundations required before Merchant and User onboarding already exist in the target.** Onboarding, in the legacy source, **creates** records (VendorUser/restaurant/subscription; User/profile/address) and **selects** platform reference data (Category/Sub Category/Cuisine, payment methods, service/food types) — all of which are present (P1.7.2 Merchant/Restaurant, P1.7.3 Subscription, P1.7.4 Category/Cuisine, P1.7.6 Currency, plus target `User`/`UserProfile`/`Address`/`ReferralProgram`).

Onboarding persists **geography as strings** (`country/state/city/pinCode`, plus `country_id/state_id/city_id` stored as **String**, not FKs), **media as direct URLs** (`logo_url`, `restaurant_pictures`, `profile_photo`), and **currency as a string** (`restaurant.currency`) — so normalized geography, a media catalogue, and FX are **NOT onboarding prerequisites**. Mood/Craving are **discovery-only**, not onboarding.

The only genuinely-missing target elements are **onboarding-state / profile-detail fields** (`have_vendor_submitted_details`/`page_completed_till`/`softOnboarding`; `have_submited_details_profile`/`profile_percentage`; structured profile prefs) — these belong to the **onboarding slice itself**, not to a prerequisite platform reference layer.

→ **SAFE NEXT FOUNDATION IDENTIFIED** (§21): no new platform reference foundation is required; the next slice is the **Onboarding / User-Profile foundation** built on existing models, with geography/media/discovery **explicitly deferred** for India-first.

## 2. Merchant onboarding source trace

`amealiodashboardmvp-` (merchant/superadmin FE) → `amealio-vendordashboard` services/models:

- **Creates:** `VendorUser` (`/vendorauthentication`, `vendor-user.model`), `restaurant` (`/restaurant`, `restaurant.model`), `subscription` (`/subscription`, `subscription.model`). Multi-step via `restaurant.page_completed_till` (Number) + `restaurant.softOnboarding` (bool); completion gate **`VendorUser.have_vendor_submitted_details`** (bool) → `PrivateRoute` in dashboard.
- **Selects (platform reference):** cuisine/type/dress/parking/accessibility/food-type/payment/seating-area via `restaurant.selected_* → "Sub Category"`; `Cusine`; service types; payment methods.
- **Reads config:** subscription business-type entitlements + seating/ordering/experience/event blocks (P1.7.3).
- **Geography:** `restaurant.country/city/state/pinCode` (strings) + GeoJSON `location`; source `countryStateCity` = flat `{text}`.
- **Media:** `restaurant.logo_url`, `restaurant_pictures[]`, `logo_url_thumbnails` = **direct URLs** (embedded); not `media-catalogue`.
- **Currency:** `restaurant.currency` (string).
- **Downstream assumes:** menu/items (P1.7.5), seating, experiences, orders reference the created restaurant/subscription.

## 3. User onboarding source trace

`amealio_web_app` → `amealio-vendordashboard` (`user-service.model`, `/authentication`, `/otp-authentication`):

- **Create prerequisite:** `mobile_number` (unique) + `country_code`, OTP `user_verified` — **identity only** (covered by P1.7.1B consumer auth). Email/social optional.
- **Profile enrichment (post-create, gated by `have_submited_details_profile`, `profile_percentage`):** `first_name`/`last_name`/`gender`/`profile_photo`; `dietary_preferences[]`, `selected_cuisine[]`/`cuisine[]`, `outing_preferences[]`, `experience_preference[]`, `celebration_subcategory[]` (→ Sub Category); `language`.
- **Location:** `country/state/city` (text) + `country_id/state_id/city_id` (**String**) + `location{}` GeoJSON; `addressLocations → address`.
- **Referral:** `referral_code`, `is_referral_user`.
- **Distinction:** *required to create a user* = phone identity; *optional enrichment* = name/prefs/location; *required later* = discovery (cuisine/mood) + ordering/experience.

## 4. Complete prerequisite inventory

| Item | Onboarding role | Legacy | Target | Status |
|---|---|---|---|---|
| Merchant/tenant | create (merchant) | `VendorUser`+restaurant | `Merchant` | COMPLETE (P1.7.2) |
| Restaurant/location | create (merchant) | `restaurant` | `Restaurant` (city/state/pinCode/country/currencyCode/lat/lon strings) | COMPLETE |
| Subscription/config | create (merchant) | `subscription` | `Subscription` (config Json) | COMPLETE (P1.7.3) |
| Category/Sub Category | select (merchant), select (user prefs) | `Category`/`Sub Category` | `Category` | COMPLETE (P1.7.4) |
| Cuisine | select (both) | `Cusine` | `Cuisine` | COMPLETE (P1.7.4) |
| Currency | store string (merchant) | `currency`/embedded | `Currency` + embedded `currencyCode` | COMPLETE (P1.7.6) |
| Payment methods | select (merchant) | `payment-methods` | `PaymentMethod` enum | COMPLETE (enum) |
| Units | item setup | `uom` | `UnitOfMeasure` | COMPLETE |
| Restaurant features/attributes | select (merchant) | Sub Category/lookups | `RestaurantFeature`/`Category` | PARTIAL (owner decision; selections storable) |
| User identity | create (user) | `User Service` (mobile/email) | `User` | COMPLETE (P1.7.1B) |
| User profile detail | enrich (user) | `User Service` fields | `UserProfile.preferences Json?` | **PARTIAL (Json placeholder)** |
| Address | user/merchant | `address` | `Address` | COMPLETE |
| Referral | user onboarding | `referral*` | `ReferralProgram` (config Json) | PARTIAL |
| Merchant onboarding state | gate (merchant) | `have_vendor_submitted_details`/`page_completed_till` | — | **MISSING (onboarding-slice field)** |
| User onboarding state | gate (user) | `have_submited_details_profile`/`profile_percentage` | — | **MISSING (onboarding-slice field)** |
| Geography (Country/State/City) | store strings/ids | `countryStateCity` `{text}` + embedded | embedded strings | PARTIAL (deferred; safe) |
| Media catalogue | not required (URLs used) | `media-catalogue` | — | DEFERRED |
| Mood/Craving | discovery, NOT onboarding | `Mood`/`Craving` | — | DEFERRED |

## 5. Ownership classification table

| Item | Ownership | Creates | Edits | Selects | Consumes |
|---|---|---|---|---|---|
| Restaurant/Merchant/Subscription | MERCHANT_DEFINED | Merchant | Merchant/Admin | — | all |
| Category/Sub Category/Cuisine | PLATFORM_DEFINED | Admin | Admin | Merchant/User | Merchant/User |
| Currency | PLATFORM_DEFINED | Admin | Admin | Merchant (string) | all |
| Payment methods/service/food type | PLATFORM_DEFINED | Admin | Admin | Merchant | Merchant/User |
| Geography (`countryStateCity`) | PLATFORM_DEFINED/SYSTEM (flat) | Admin/system | Admin | Merchant/User | onboarding/discovery |
| Media (logo/photos) | MERCHANT_DEFINED (uploads) / USER_DEFINED (avatar) | Merchant/User | Merchant/User | — | Merchant/User |
| `media-catalogue` | PLATFORM/MERCHANT (curated) | Admin/Vendor | Admin/Vendor | — | Merchant/User |
| User identity | USER_DEFINED (via auth) | User | User | — | platform |
| User profile prefs | USER_DEFINED (from PLATFORM_DEFINED option sets) | User | User | User (picks Category/Cuisine) | discovery |
| Onboarding state flags | SYSTEM_CONFIGURATION (progress) | system | system | — | gates |

## 6. Legacy model / API mapping

`vendor-user.model` (`/vendorauthentication`, `/admin/vendor-user`); `restaurant.model` (`/restaurant`, `/listRestaurant`); `subscription.model` (`/subscription`, `/subscription/table`); `Category`/`Sub Category`/`Cusine` (`/category`,`/subcategory`,`/cusine`); `currency.model` (`/currency`); `countryStateCity.model` (`/country-state-city`); `payment-methods`/`service-type`/`food-type` lookups; `user-service.model` (`/authentication`,`/user-service`,`/user/profiles`,`/otp-authentication`); `address.model` (`/address`); `referral-*` (`/referralprogram`).

## 7. Target model / status mapping

COMPLETE: `Merchant`, `Restaurant`, `RestaurantChain`, `Organization`, `Subscription`, `StaffMember`, `Category`, `Cuisine`, `Currency`, `Menu*`, `User`, `Address`, `UnitOfMeasure`, `PaymentMethod` enum. PARTIAL: `UserProfile` (Json placeholder), `RestaurantFeature` (attribute mapping owner decision), `ReferralProgram` (Json). MISSING (onboarding-slice, additive): merchant/user onboarding-state fields. DEFERRED: normalized geography, media catalogue, Mood/Craving.

## 8. Country / State / City finding

Re-verified against onboarding code: (1) Merchant onboarding stores `country/city/state/pinCode` **strings** (+ GeoJSON); (2) User onboarding stores `country/state/city` text **and** `country_id/state_id/city_id` as **String** (not FKs); (3) `countryStateCity` is a flat `{text}` lookup; (4) free-text/embedded entry is supported; (5) any cascade behavior is a **frontend** concern — the backend persists strings/ids as strings; (6) **IDs are persisted as strings**, not canonical relational identifiers; (7) no API requires a relational geography key to create merchant/user; (8) **India-first onboarding is safe without normalized geography**; (9) deferral blocks only future *normalized* geo-filtering/analytics; (10) **minimum foundation = none now** (target `Restaurant`/`Address` strings suffice; optional future nullable `*_id` string columns if import needs them). **Do not implement geography.**

## 9. Currency finding

Onboarding stores `restaurant.currency` (string); currency is effectively **inferred/defaulted** (INR, India-first) and embedded `currencyCode` (+ BigInt minor units) is sufficient. User onboarding does **not** depend on currency. The P1.7.6 `Currency` reference is available for later validation/metadata but is **not** a hard onboarding lookup. **No redesign, no Country FK, no FX.**

## 10. Media catalogue finding

(1) `media-catalogue` is **not required** to create a merchant; (2) not required to create a restaurant (logos/photos are direct URLs on `restaurant`); (3) not required for user onboarding (avatar = URL/`profile_photo` array); (4) onboarding safely uses **direct upload/external URL**; (5) reusable platform media is **not** an onboarding prerequisite; (6) deferral blocks only an admin **reusable media library** feature. **Do not implement media.**

## 11. Taxonomy / onboarding dependency finding

Onboarding **selects** Category/Sub Category/Cuisine (P1.7.4 ✓) + payment methods (enum) + service/food types. These are covered; the attribute→`Category`-type-vs-`RestaurantFeature` mapping (P1.7.4 owner decision) is **non-blocking** for onboarding because selections can be stored as references/strings. **Mood/Craving are discovery, not onboarding** → remain deferred. No new taxonomy foundation is required for onboarding.

## 12. Subscription / configuration dependency finding

Merchant onboarding **creates** the subscription and writes business-type + seating/ordering/experience config (P1.7.3 `config Json`). Feature gates (seating/ordering/experience/event/delivery) are **post-onboarding runtime** reads, not onboarding prerequisites. The P1.7.3 read foundation exists; onboarding **write** is part of the onboarding slice. **Do not normalize `Subscription.config`; do not implement feature gates.**

## 13. India-first safety assessment

**SAFE.** With Currency COMPLETE, and Country/State/City normalization + media catalogue + discovery taxonomy DEFERRED, India-first Merchant and User onboarding can be implemented: geography persists as strings (as legacy does), currency defaults to INR + embedded code, media uses URLs, and taxonomy selections use the completed Category/Cuisine. Nothing in the legacy onboarding create-path requires the deferred pieces. Later work consuming the deferred items: normalized geo-filtering/analytics (geography), admin reusable media library (media), home discovery (Mood/Craving).

## 14. Dependency graph

```
PLATFORM FOUNDATIONS (all COMPLETE for onboarding)
  Category/Sub Category ✓  Cuisine ✓  Currency ✓  PaymentMethod ✓  UnitOfMeasure ✓
  [DEFERRED, non-prereq: normalized Geography, media-catalogue, Mood/Craving]
        │
        ▼
MERCHANT ONBOARDING (hard prereqs met)
  StaffMember/Merchant ✓ → Restaurant ✓ → Subscription/config ✓
  + onboarding-STATE field (MISSING, additive — onboarding slice)
        │                                   ║ (parallel)
        ▼                                   ▼
MERCHANT/RESTAURANT FOUNDATION ✓      USER ONBOARDING/PROFILE
                                        User identity ✓ (P1.7.1B)
                                        + UserProfile detail (PARTIAL — Json)
                                        + onboarding-STATE field (MISSING, additive)
                                        Address ✓, Referral (Json)
        ▼
DOWNSTREAM CAPABILITIES (menu ✓; ordering/seating/experiences/discovery — later, own blockers)
```

Legend: **hard prereqs** = Merchant/Restaurant/Subscription/Category/Cuisine/Currency (all ✓); **soft** = RestaurantFeature attribute mapping; **downstream-only** = Mood/Craving, media catalogue, normalized geography; **UNKNOWN** = none blocking.

## 15. Hard blockers

**None.** No competing canonical source blocks onboarding *creation* (taxonomy dedup affects discovery, not create); ownership is established; no target schema conflict (onboarding-state fields are additive; profile prefs fit `UserProfile.preferences Json`); no dependency on an unimplemented platform foundation.

## 16. UNKNOWNs

- User profile modeling: structured columns vs `UserProfile.preferences Json` (design choice for the onboarding slice).
- Legacy `country_id/state_id/city_id` string values' source dataset (kept as strings if imported).
- `profile_percentage` computation rule (onboarding-slice detail).
- Referral onboarding depth (`ReferralProgram.config Json` shape).

## 17. Owner decisions

1. **User profile representation** — structured fields vs Json (recommend: minimal structured identity/prefs + Json for the long tail; does not block starting).
2. **Onboarding-state representation** — status field/enum vs booleans mirroring legacy (`have_*_submitted_details`, `page_completed_till`).
3. **Geography** — keep embedded strings (recommended, India-first) vs normalize later (deferred; non-blocking).
4. **Attribute taxonomy mapping** (`Category` type vs `RestaurantFeature`) — P1.7.4 open; non-blocking for onboarding.

None of these **block** starting the onboarding slice; (1)/(2) are decided within it.

## 18. Recommended next migration slice

**Onboarding / User-Profile foundation** — implement the read/write foundation for merchant onboarding state and the user profile, reusing existing models (`Merchant`/`Restaurant`/`Subscription`; `User`/`UserProfile`/`Address`). It is the closest slice to the completed identity/consumer-auth + merchant/subscription layers and requires **no new platform reference foundation**. Small additive schema (onboarding-state/profile fields) is likely; confirm at implementation.

## 19. Explicitly deferred items

Normalized geography (Country/State/City); media/asset catalogue; discovery taxonomy (Mood/Craving/occasion/festival); FX; feature-gate enforcement; ordering/seating/experiences/events/delivery/AI; admin taxonomy/media CRUD + all frontend; Mongo import/backfill. ONDC remains DEFERRED — existing.

## 20. Evidence index

- Merchant: `amealio-vendordashboard/src/models/{vendor-user,restaurant,subscription,currency,country-state-city,category,sub-category,cusine,payment-methods,service-type}.model.ts`; `amealiodashboardmvp-/client/src/store/utils/Routes.js` (onboarding/superadmin routes); `restaurant.page_completed_till`/`softOnboarding`, `vendor-user.have_vendor_submitted_details`.
- User: `amealio-vendordashboard/src/models/{user-service,address,referral-service}.model.ts` (`have_submited_details_profile`, `profile_percentage`, `country_id/state_id/city_id` String, `dietary_preferences`, `selected_cuisine`, `celebration_subcategory`); `amealio_web_app` profile routes; `/authentication`,`/otp-authentication`,`/user/profiles`.
- Target: `prisma/schema.prisma` (`User`, `UserProfile.preferences Json`, `Address`, `Merchant`, `Restaurant`, `Subscription`, `Category`, `Cuisine`, `Currency`, `ReferralProgram`, `PaymentMethod`, `UnitOfMeasure`, `RestaurantFeature`).
- Prior: docs 26–35; P1.7.6A doc 34 (geography/currency/media findings).

## 21. Final recommendation

**SAFE NEXT FOUNDATION IDENTIFIED.**

- **Exact next foundation:** the **Onboarding / User-Profile foundation** (merchant onboarding-state + user profile), built on the existing `Merchant`/`Restaurant`/`Subscription` and `User`/`UserProfile`/`Address` models. **No new platform reference foundation is required before onboarding.**
- **Why upstream:** it sits directly on the completed identity/auth + merchant/subscription/taxonomy/currency layer and is the prerequisite for all consumer/merchant domain flows.
- **Source evidence:** onboarding creates VendorUser/restaurant/subscription and User/profile/address and selects existing platform taxonomy/currency; it persists geography/currency/media as strings/URLs (no normalized geo/media/FX needed) — §2/§3/§8–§12.
- **Implementation boundary (later):** additive onboarding-state fields + structured user-profile fields (or Json) reusing existing models; merchant tenancy via P1.7.1F/P1.7.2; **no** geography normalization, media catalogue, discovery taxonomy, feature-gate enforcement, or frontend.
- **Expected tests:** real-DB integration — merchant onboarding-state progression + gate; user profile create/update + preferences; address; tenancy (merchant staff scoped; consumer profile self-owned); embedded currency/geo strings preserved; existing 188 remain green.
- **Explicitly deferred:** normalized geography, media catalogue, discovery taxonomy, FX, feature gates, downstream domains, frontend, Mongo import.

**No hard stop; no owner decision blocks implementation.** No application/schema behavior was modified in this discovery task.
