# 43 — Merchant Owner Provisioning & Activation Foundation (P1.7.14)

> **Type:** IMPLEMENTATION (bounded slice) — makes a P1.7.10-provisioned merchant able to become an **authenticated, activated operational merchant**, over the EXISTING identity (P1.7.1D/E/F) and merchant/subscription models. **No schema change, no migration.**
> **Governing gate:** [42-SUPERADMIN-MERCHANT-CONFIGURATION-RECONCILIATION.md](./42-SUPERADMIN-MERCHANT-CONFIGURATION-RECONCILIATION.md) (DEC-1: owner-provisioning contract).
> **Authority:** legacy source (`amealio-vendordashboard`, `amealiodashboardmvp-`) + target `prisma/schema.prisma` + P1.7.1D/E/F. Baseline **220/220 → 230/230**.

---

## 1. Scope

Implemented the minimum merchant **operating** foundation:

1. **Owner provisioning** — a merchant owner as `StaffMember(MERCHANT_OWNER)` + PASSWORD `StaffCredential`.
2. **Activation/approval** — owner status gate (BLOCKED = pending, ACTIVE = approved), enforced by the EXISTING staff auth.
3. **Restaurant-profile update** — the minimal, evidenced onboarding profile fields.
4. **Subscription-config update** — non-destructive JSON merge + status.

**Not** in scope (unchanged): seating, `table_setup` normalization (DEC-2), menu/item write, offers, experiences, cart, ordering, payment, delivery, POS, realtime, public self-signup, act-as/switching, RBAC permission-catalogue, geography/media. No second auth system was created.

---

## 2. Legacy source evidence (Phase 1 reverification)

| Question | Legacy answer | Evidence |
|---|---|---|
| Which record is the owner? | `VendorUser` (the operating principal; not a separate staff entity) | `vendor-user.model.ts:11–67` (`role`, `password`, `email`, `mobile_number`) |
| Owner ↔ merchant association | `restaurant.vendor_id → VendorUser`; one vendor owns 1..N restaurants | `restaurant.model.ts:16–19` |
| Role | string `role` ("vendor") | `vendor-user.model.ts:13` |
| Credentials | `VendorUser.password`, bcrypt-hashed | `vendor-user.model.ts:12`; baseline bcryptjs |
| One owner or many? | One `VendorUser` per signup = the owner; additional staff is a later, optional feature (`manage_staff_licence`, `/role-management`) | `authAction.js:44–72`; `subscription.model.ts:769` |
| Incomplete creation | partial onboarding allowed (multi-step; not atomic) | `restaurant.class.ts:135–197` |
| Approval absent | dashboard blocked; not discoverable to consumers | `PrivateRoute.js:21–24`; `listRestaurantCard.class.ts:328–329` |
| Exact operate condition | admin approval: `has_admin_approved` (+ `have_vendor_submitted_details`) | `admin-restaurant.class.ts:1397–1407` |
| Is `has_admin_approved` authoritative? | **Yes** — set by SUPER_ADMIN `approve`; default false | `vendor-user.model.ts:25`; `admin-restaurant.class.ts:1400–1401` |
| Additional activation conditions | consumer discovery also needs `softOnboarding=false` (onboarding state, separate) | `listRestaurantCard.class.ts:328–329` |
| Owner if onboarding abandoned | `VendorUser` persists unapproved (resumable) | model default flags false |
| Owner provisioning timing/atomicity | owner (+password) created together at signup; restaurant/subscription created in later steps (not atomic with owner) | `authAction.js:44–72` |

---

## 3. DEC-1 resolution (owner-provisioning contract) — **RESOLVED**

The legacy evidence is unambiguous, so DEC-1 is resolved (not blocked). Target contract, over EXISTING models (no schema change):

- **Owner** = exactly **one** `StaffMember{ staffRole: MERCHANT_OWNER, merchantId }` + **one** `StaffCredential{ type: PASSWORD, secretHash: bcrypt(password) }`. (Legacy: one `VendorUser` role="vendor" with bcrypt password.)
- **Cardinality:** one `MERCHANT_OWNER` per merchant at provisioning; a second owner is rejected (`409`). Additional staff is out of scope.
- **Merchant association:** always **server-derived**; SUPER_ADMIN supplies an explicit `merchantId`; the merchant must exist and not be soft-deleted.
- **Credentials:** hashed with the shared `PasswordHasher` (bcrypt) and stored as the PASSWORD `StaffCredential` consumed by the EXISTING staff login (`StaffMemberRepository.findAuthByEmail/Phone`). No new/second auth.
- **Timing/atomicity:** owner `StaffMember` + its credential are created in **one transaction** (never a StaffMember without its credential). Provisioning is a **separate step after merchant creation** (not atomic with P1.7.10 `createMerchant`), matching legacy partial-onboarding tolerance.
- **Initial status:** **BLOCKED** = pending activation (mirrors `has_admin_approved=false`).

Provisioning is **SUPER_ADMIN-only**, mirroring the SUPER_ADMIN-driven merchant creation of P1.7.10 (public self-signup is deferred).

---

## 4. Activation / approval contract (Phase 4)

- **Authoritative gate** = SUPER_ADMIN approval, represented as the owner `StaffMember.status` transition **BLOCKED → ACTIVE**, and **enforced by the EXISTING staff auth** (`StaffAuthService.login` / `refresh` and `JwtStaffGuard` reject any non-`ACTIVE` status). No new enforcement code, no new field.
- **Level:** staff-level (the owner) — which is exactly where legacy `has_admin_approved` lives (on the `VendorUser`). Since the only principal after provisioning is the owner, gating the owner status prevents an unapproved merchant from authenticating/operating, matching legacy.
- **Deactivation/suspension:** ACTIVE → BLOCKED (revokes operation).
- **Onboarding vs activation kept distinct:** `onboardingStep` / `softOnboarding` / `onboardingSubmitted` (P1.7.8) are **not** touched by activation. Activation manages only the authoritative operate gate.
- **Representation note / limitation:** `StaffAccountStatus` has only `ACTIVE`/`BLOCKED`, so "pending approval" is represented by `BLOCKED` (the existing guard already rejects it). This collapses legacy's distinct *pending* vs *punitive-block* into one status; adding a `PENDING` status is a **deferred owner decision** (not required for correct behavior). Because current target onboarding is SUPER_ADMIN-driven (public self-onboarding deferred), the owner does not need to authenticate before activation, so provisioning BLOCKED-until-approved is consistent with the legacy "log in during onboarding, operate after approval" flow.

---

## 5. Restaurant profile write contract (Phase 5)

Merchant-scoped **partial** update of the evidenced onboarding/profile fields only: `name`, `city`, `state`, `pinCode`, `country`, `timezone`, `currencyCode`, `lat`, `lon` (legacy `RestaurantDetailsSettings` / map setup, persisted via `POST /restaurant`). Only provided fields change; unknown fields are ignored. **No** media/taxonomy/hours/KYC, **no** geography normalization. Soft-deleted/unknown restaurant → `404`; cross-merchant → `403` (via P1.7.2 `MerchantScopeService.assertRestaurantInScope`).

---

## 6. Subscription config write contract (Phase 6)

Merchant-scoped update of a subscription: optional `status` (string) + **non-destructive deep merge** of `config` into the existing JSON — plain objects merge key-by-key; arrays/primitives in the patch replace; `undefined` is ignored; **unrelated keys are preserved** (P1.7.3/P1.7.13 intent). `table_setup` is **not** normalized (DEC-2 deferred). The subscription must belong to the caller's merchant; if it is tied to a restaurant, that restaurant must also be in scope. Cross-merchant → `403`; unknown subscription → `404`. No billing/Product/Plan architecture; subscription cardinality unchanged.

---

## 7. Authorization model

- **Provisioning + activation/deactivation:** SUPER_ADMIN only (platform-scoped; explicit `merchantId`). Mirrors legacy admin-driven signup/approval.
- **Restaurant-profile + subscription-config update:** merchant-tenant-scoped — merchant staff operate only within their own merchant (server-derived `StaffPrincipal.merchantId`); SUPER_ADMIN operates with explicit target; cross-merchant rejected; no request-supplied merchant id is trusted. No act-as/switching. Reuses P1.7.1F + P1.7.2.

---

## 8. Atomicity behavior

- **Owner provisioning is atomic:** `StaffMember` + PASSWORD `StaffCredential` are written in one `prisma.$transaction`, so an owner is never left without its credential (task rule: don't leave credentials/owner invalid).
- **Not forced atomic across merchant creation:** merchant creation (P1.7.10) and owner provisioning are separate steps (legacy is multi-step; partial onboarding is valid).
- Profile/config updates are single-row updates. No generic transaction/workflow framework introduced.

---

## 9. Schema impact

**None.** `StaffMember` (with `MERCHANT_OWNER` role + `status ACTIVE|BLOCKED`), `StaffCredential` (PASSWORD), `Restaurant` (profile fields), and `Subscription` (`status` String, `config Json?`) already cover every requirement. `prisma validate` ✓; `migrate status` up to date (6 migrations, unchanged).

---

## 10. APIs / services / repositories

`apps/api/src/modules/onboarding/` (wired into `OnboardingModule`, which now also imports `IdentityModule` for the shared bcrypt hasher):

- `domain/owner-provisioning.types.ts` — `ProvisionOwnerInput`, `ProvisionedOwner`, `UpdateRestaurantProfileInput`, `RestaurantProfileRecord`, `UpdateSubscriptionConfigInput`.
- `infrastructure/merchant-owner.repository.ts` — `provisionOwner` (tx), `findOwner`, `setOwnerStatus`, `findMerchant`, `findRestaurant`, `updateRestaurantProfile`, `findSubscription`, `updateSubscription`.
- `application/merchant-owner.service.ts` — `provisionOwner`, `activateMerchant`, `deactivateMerchant`, `updateRestaurantProfile`, `updateSubscriptionConfig` (tenancy + hashing + non-destructive merge).

No controllers/endpoints (frontend deferred). Existing identity/auth code is unchanged.

---

## 11. Tests (10 new; 220 → 230)

`apps/api/test/merchant-owner-provisioning.e2e-spec.ts` (real TEST DB):

1. provisions a single `MERCHANT_OWNER` + bcrypt PASSWORD credential, merchant-associated, status BLOCKED.
2. rejects a second owner (cardinality).
3. rejects provisioning by non-SUPER_ADMIN, unknown merchant, weak/no-identifier input.
4. rejects provisioning for a soft-deleted merchant.
5. **activation gate via the EXISTING staff login:** BLOCKED owner login → `403`; after `activateMerchant` login succeeds with `staff.merchantId`/`MERCHANT_OWNER`; `deactivateMerchant` → login `403` again.
6. activation is SUPER_ADMIN-only and requires an existing owner.
7. restaurant profile update within scope; cross-merchant `403`; unknown/soft-deleted `404`.
8. subscription config non-destructive merge (unrelated keys preserved, requested paths merged/added) + status update + persistence.
9. cross-merchant subscription update `403`; unknown subscription `404`.
10. SUPER_ADMIN provisions/activates with explicit target and updates any merchant's config.

Existing suites unchanged and green.

---

## 12. Validation

- `npm test` → **230/230** (29 suites; 220 prior + 10 new).
- `npm run build` ✓ · `npm run lint` ✓ · `npm run format:check` ✓.
- `npx prisma validate` ✓; `npx prisma migrate status` up to date (6 migrations, unchanged).

---

## 13. Remaining UNKNOWNs / deferred owner decisions

- **Add `StaffAccountStatus.PENDING`?** Currently "pending approval" = `BLOCKED`. A dedicated `PENDING` value would separate pending vs punitive-block (additive enum change) — **deferred** (behavior is already correct).
- **Merchant-level activation for multi-staff merchants.** Today the gate is the owner's status; once additional staff exist, a merchant-level "approved" flag (or gating all staff) may be desired — **deferred** (single owner today).
- **Public self-onboarding signup** (owner logs in to self-onboard pre-approval) — **deferred** (P1.7.13); current onboarding is SUPER_ADMIN-driven.
- **Restaurant-level `vendorApproved` mirror + `onboardingSubmitted` coupling.** Legacy sets `vendorApproved`/`have_vendor_submitted_details` alongside approval; here activation stays owner-status-only to avoid conflating onboarding state — **deferred** (unify later if required).
- DEC-2 (`table_setup` normalization), DEC-3 (item availability/tax/combos), DEC-4/5/6 from doc 42 remain open for their own slices.

---

## 14. Explicitly deferred / not implemented

Seating, `table_setup` normalization, menu write, item write, item availability/tax/combo modeling, offers, coupons/promotions, celebrations, experiences, events, festivals, cart, ordering changes, payment, delivery, POS, Socket.IO, settlement, wallet, ONDC, geography normalization, media catalogue, Mood/Craving, discovery, billing, Product/Plan architecture, act-as, merchant switching, generic workflow engine, Mongo migration/import. **No frontend was migrated.**
