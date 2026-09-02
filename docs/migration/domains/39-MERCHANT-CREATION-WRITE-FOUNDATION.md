# 39 — Merchant / Restaurant / Subscription Creation (Write) Foundation (P1.7.10)

> **Status:** IMPLEMENTED — bounded upstream write slice. **No Prisma schema change** (creation uses existing P1.7.2/P1.7.3/P1.7.8 fields). No onboarding workflow engine, no frontend, no downstream domains, no billing, no geography/media normalization. P1.7.1D–P1.7.9 unchanged.
> **Governing:** [38-ONBOARDING-WORKFLOW-RECONCILIATION.md](./38-ONBOARDING-WORKFLOW-RECONCILIATION.md) (P1.7.9). Legacy create-path re-verified before coding.

---

## 1. Source trace

Legacy onboarding (`amealiodashboardmvp-/vendorOnboradingComponents/*` → `amealio-vendordashboard`) creates, across FE-driven steps: **VendorUser** (owner, `/vendorauthentication` or admin `/admin/vendor-user`) → **restaurant** (`/restaurant`, with `vendor_id`) → **subscription** (`/subscription`, `vendor_id`-keyed). Records are created at **separate steps** (not one atomic transaction); progression/completion is FE-persisted (`page_completed_till`, `have_vendor_submitted_details`) — no backend workflow. Canonical mapping: **Merchant** (tenant) → **Restaurant** (location, `merchantId`) → **Subscription** (`merchantId` + optional `restaurantId`, `config` Json).

## 2. Merchant creation mapping

`createMerchant({ legalName, email?, phone?, organizationId?, legacyId? })` → `Merchant` (existing model). `legalName` required; `email`/`phone`/`legacyId` unique (duplicate identity rejected). `onboardingSubmitted` defaults false (creation does **not** submit). **Authorization: SUPER_ADMIN (platform) only** — a brand-new merchant has no tenant scope, so provisioning is a platform operation representable by P1.7.1F (no new auth model). Public self-service merchant signup = deferred (frontend + public-auth).

## 3. Restaurant creation mapping

`createRestaurant({ merchantId, name, city?, state?, pinCode?, country?, timezone?, currencyCode?, lat?, lon?, chainId?, legacyId? })` → `Restaurant`. `name`+`merchantId` required; geography **string-oriented** (no normalization/FKs — P1.7.7); `country`/`timezone`/`currencyCode` fall back to schema defaults (IN / Asia-Kolkata / INR); `onboardingStep=0`, `softOnboarding=false`, `status=ACTIVE` by default. **Merchant-tenant-scoped:** the merchant is resolved from the `StaffPrincipal` (merchant staff = own merchant; SUPER_ADMIN = explicit id); a request-supplied `merchantId` cannot override the server-resolved scope (cross-merchant → 403; unknown merchant → 404).

## 4. Subscription creation mapping

`createSubscription({ merchantId, restaurantId?, productType, status?, config? })` → `Subscription`. `productType` ∈ `ORDERING|SEATING|EVENT|SCAN_PAY` (validated); `status` default `ACTIVE`; `config` stored as JSON (P1.7.3 — **not normalized**). Merchant-tenant-scoped; if `restaurantId` is given it must be in the same merchant scope (`MerchantScopeService.assertRestaurantInScope`). Multiple subscriptions per merchant are allowed (no cardinality constraint — matches legacy business-type flexibility).

## 5. Transaction semantics

**No forced Merchant+Restaurant+Subscription atomic transaction.** Legacy creates them across separate onboarding steps; partial creation is valid (a merchant may exist with no restaurant/subscription yet — soft onboarding). Each creation is its own operation; DB-level FK + unique constraints enforce integrity. Imposing a single atomic transaction would change legacy business behavior, so it is intentionally not done.

## 6. Duplicate / idempotency semantics

No idempotency framework (none in source). Duplicate protection = DB unique constraints: `Merchant.email`/`phone`/`legacyId`, `Restaurant.legacyId`. Repeated merchant creation with the same email/legacyId → unique violation. Subscriptions have no natural key (repeats create new rows) — matches legacy. Retries/dedup beyond unique keys are a frontend concern (deferred).

## 7. Authorization model

Representable entirely by P1.7.1F (no new model): `createMerchant` → **SUPER_ADMIN only**; `createRestaurant`/`createSubscription` → merchant-scoped (own merchant for staff; explicit `merchantId` for SUPER_ADMIN; cross-merchant 403). Server-resolved scope always wins over request input. SUPER_ADMIN remains platform-scoped (no act-as/switching; tenant isolation preserved).

## 8. Onboarding state behavior

Creation establishes **schema defaults** (`onboardingSubmitted=false`, `onboardingStep=0`, `softOnboarding=false`) and does **not** auto-submit. Final submission remains a **separate, explicit** state transition via the P1.7.8 `MerchantOnboardingService.setMerchantSubmitted` (P1.7.9: progression is FE-driven). No workflow engine, no page/percentage calculation.

## 9. Target schema changes

**None.** `prisma/schema.prisma` and migrations unchanged (`git status -- prisma/` empty; `prisma validate` ✓; `migrate status` up to date). Creation reuses P1.7.2 `Merchant`/`Restaurant`, P1.7.3 `Subscription`, and P1.7.8 onboarding-state fields.

## 10. APIs / services / repositories

`apps/api/src/modules/onboarding/` (extended):
- `MerchantProvisioningRepository` — `createMerchant`, `createRestaurant`, `createSubscription`, `merchantExists` (write; existing read repos untouched).
- `MerchantProvisioningService` — authorization (SUPER_ADMIN for merchant; merchant-scope for restaurant/subscription via `MerchantScopeService`) + validation + server-resolved scope.
- Registered in `OnboardingModule` (alongside the P1.7.8 state services). **No controllers/endpoints** (foundation only, consistent with prior slices); frontend not migrated.

## 11. Tests

11 new real-DB integration (suite 199 → **210**, all green) — `test/merchant-provisioning.e2e-spec.ts`: merchant create (default state) + legalName/SUPER_ADMIN-only + email uniqueness; restaurant create (onboarding defaults) + cross-merchant 403 + unknown-merchant 404 + server-resolved scope; subscription create (default status/config) + invalid productType + cross-merchant + restaurant-in-scope + config JSON preserved; Merchant→Restaurant→Subscription integrity (non-atomic, partial-valid); creation-vs-submission separation. P1.7.1E/F/2/3/4/5/6/8 suites unchanged and green.

## 12. Known limitations / deferred

Public self-service merchant signup (needs frontend + public-auth); owner-`StaffMember` provisioning + credentials (reuse P1.7.1D/E separately); onboarding wizard/percentage/validation (FE); geography normalization; media catalogue; discovery (Mood/Craving); ordering (OD-11)/seating (`table_setup`)/experiences/events/delivery/AI/ONDC; Mongo import/backfill; billing/Product/Plan. No generic workflow/creation framework introduced.

## 13. Downstream readiness

A canonically-created `Merchant` + `Restaurant` + `Subscription` satisfies the ownership relationships the read foundations expect (verified: `Restaurant.merchant`, `Restaurant.subscriptions`, `Subscription.merchant/restaurant`). Downstream domains (Menu already read-capable; Ordering/Seating/Discovery) can now be built on canonically-created records — subject to their own unresolved blockers (OD-11, `table_setup`, Mood/Craving).

## 14. UNKNOWNs / owner decisions

- Whether merchant creation should also provision an owner `StaffMember` (+ credentials) atomically (kept separate; reuse P1.7.1D/E) — owner decision, non-blocking.
- Public self-service signup authorization model (deferred; not representable without a public-auth concept).
- Subscription cardinality policy (currently unconstrained per legacy) — owner decision if a "one active subscription" rule is later desired.

---

## Validation

`npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓ · `npm test` → **210/210** (27 suites) · `prisma validate` ✓ · `prisma migrate status` up to date (no migration created). **NO FRONTEND WAS MIGRATED.**
