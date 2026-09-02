# 37 — Onboarding / User-Profile Foundation (P1.7.8)

> **Status:** IMPLEMENTED — bounded foundation slice. **Small additive schema change** (onboarding/profile-state fields on existing `Merchant`/`Restaurant`/`UserProfile`; **no new entity**). No onboarding UI/workflow, no geography/media/discovery/FX, no controllers, no frontend. P1.7.1D–P1.7.6 unchanged.
> **Governing discovery:** [36-ONBOARDING-FOUNDATION-RECONCILIATION.md](./36-ONBOARDING-FOUNDATION-RECONCILIATION.md) (P1.7.7). Legacy source re-verified before coding.

---

## 1. Legacy fields examined (re-verified)

| Legacy field | Model | Type | Meaning |
|---|---|---|---|
| `have_vendor_submitted_details` | `vendor-user.model` | Boolean (default false) | merchant onboarding details submitted (dashboard gate) |
| `page_completed_till` | `restaurant.model` | **Number** (default 0) | onboarding progress — an **integer step/page counter** (not a named stage) |
| `softOnboarding` | `restaurant.model` | Boolean (default false) | soft-onboarding flag |
| `have_submited_details_profile` | `user-service.model` | Boolean (default false) | user profile details submitted |
| `profile_percentage` | `user-service.model` | **Number** (default 0) | profile completion percentage |
| `dietary_preferences` / `selected_cuisine` / `celebration_subcategory` / `outing_preferences` / `experience_preference` / `language` | `user-service.model` | Arrays / String | user preference option-set selections |

`page_completed_till`/`profile_percentage` are plain integers in Mongo with **no min/max constraint**.

## 2. Canonical target mapping

**Additive fields on existing models (no new entity):**

| Target | Field | Legacy source |
|---|---|---|
| `Merchant` | `onboardingSubmitted Boolean @default(false)` | `have_vendor_submitted_details` (business/tenant-level gate) |
| `Restaurant` | `onboardingStep Int @default(0)` | `page_completed_till` (integer step) |
| `Restaurant` | `softOnboarding Boolean @default(false)` | `softOnboarding` |
| `UserProfile` | `detailsSubmitted Boolean @default(false)` | `have_submited_details_profile` |
| `UserProfile` | `completionPercentage Int @default(0)` | `profile_percentage` |
| `UserProfile` | `preferences Json?` (existing) | preference arrays (dietary/cuisine/celebration_subcategory/…) |

**Ownership placement rationale:** merchant "submitted" is a **tenant/business** fact → `Merchant`; onboarding **progress** is per-location → `Restaurant` (matching legacy `page_completed_till` living on `restaurant`); profile state is **per-user** → `UserProfile`.

## 3. Ownership

- Merchant onboarding state: **MERCHANT_DEFINED**, merchant-tenant-scoped (staff of the merchant).
- User profile state: **USER_DEFINED**, user-owned (the authenticated consumer's own `userId`).

## 4. API / service boundary

No controllers/endpoints (foundation only; consistent with prior slices). Two logically separate modules:

- `apps/api/src/modules/onboarding/` — `MerchantOnboardingRepository` + **`MerchantOnboardingService`** (`getState`, `setMerchantSubmitted`, `setRestaurantProgress`); merchant tenancy via P1.7.2 `MerchantScopeService`.
- `apps/api/src/modules/user-profile/` — `UserProfileRepository` + **`UserProfileService`** (`getProfile`, `updateState`, `mergePreferences`); user-owned.

## 5. Data invariants

- Merchant onboarding writes are confined to the staff's server-derived merchant scope; cross-merchant → **403**; SUPER_ADMIN is platform-scoped and must pass an explicit `merchantId`.
- Restaurant progress writes require the restaurant to be **in the staff's merchant scope** (via `assertRestaurantInScope`); unknown/soft-deleted restaurants are rejected.
- User profile operations act **only** on the given `userId` (no cross-user writes); `UserProfile` is 1:1 with `User`.
- `completionPercentage` must be an integer **0..100** (service-layer target invariant; legacy had no DB constraint — enforced in the service, not the DB, to avoid inventing a schema constraint).
- Preference updates **shallow-merge**, preserving unrelated keys.
- Missing/malformed references return null / are rejected safely.

## 6. Preference representation

Reused the existing `UserProfile.preferences Json?` — verified sufficient for the legacy preference arrays (arrays of strings/ids). Updates merge key-by-key so unrelated preferences are preserved. **No taxonomy invented; no Mood/Craving/discovery/geography normalization** (values preserved as-is). Structured columns were **not** required for correctness.

## 7. Tenancy behavior

Merchant: `StaffPrincipal.merchantId` (P1.7.1F) → `MerchantScopeService` (P1.7.2). No request-supplied merchantId is trusted (only used to reject a mismatch). SUPER_ADMIN unchanged (platform scope, explicit target; no act-as/merchant switching). User profile: keyed by the authenticated consumer's `userId`. No auth/authorization mechanism changed.

## 8. Tests

11 new real-DB integration (suite 188 → **199**, all green) — `test/onboarding-profile.e2e-spec.ts`:
- Merchant: default state read (scoped); `setMerchantSubmitted`; restaurant progress (step+soft) incl. partial-update preservation; cross-merchant rejection (merchant + restaurant); SUPER_ADMIN platform-scoped (explicit target, not confined); missing merchant/restaurant safe.
- User: create/update completion state (preserving `detailsSubmitted`); out-of-range percentage rejected (0..100); preferences persist + **unrelated keys preserved on merge**; user ownership (userB independent of userA); missing profile read safe.

P1.7.1E/F/2/3/4/5/6 suites unchanged and green.

## 9. Intentionally deferred / migration limitations

Complete onboarding workflow + frontend; geography normalization (kept string/embedded); media catalogue; discovery taxonomy (Mood/Craving); FX; feature-gate enforcement; ordering/seating/experiences/events/delivery/AI; Mongo import/backfill; profile structured-column expansion (Json is sufficient now). ONDC remains DEFERRED — existing.

## 10. UNKNOWNs / owner decisions

- Exact `profile_percentage` computation rule (stored as-is; computation is an onboarding-workflow concern).
- Whether merchant "submitted" should also live per-restaurant (kept at Merchant level; legacy gate was per-vendor/owner).
- Whether some preferences should later be normalized (deferred; Json now).
- `country_id/state_id/city_id` string values (geography) remain deferred (P1.7.7).

---

## Schema / migration / validation

- **Schema change (additive):** `Merchant.onboardingSubmitted`; `Restaurant.onboardingStep` + `Restaurant.softOnboarding`; `UserProfile.detailsSubmitted` + `UserProfile.completionPercentage`. Migration `20260902053525_p1_7_8_onboarding_profile_state` (applied dev + test; historical migrations unmodified).
- **Application:** new `onboarding` + `user-profile` modules (repositories + services + domain types), registered in `AppModule`.
- **Validation:** `npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓ · `npm test` → **199/199** (26 suites) · `prisma validate` ✓ · `prisma migrate status` up to date.
- **NO FRONTEND WAS MIGRATED.**
