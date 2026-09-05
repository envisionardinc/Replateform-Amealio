# 38 — Merchant & User Onboarding Workflow Reconciliation (P1.7.9)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration. Decides the next slice: onboarding **write workflow** vs a downstream domain.
> **Authority:** legacy source (`amealio-vendordashboard`, `amealiodashboardmvp-`, `amealio_web_app`) re-verified against docs 36/37 and P1.7.1D–P1.7.8. Baseline **199/199**.

---

## 1. Executive conclusion

Onboarding **progression/completion logic lives in the frontend**; the shared backend only **persists records + state via generic PATCH**. The dashboard onboarding screens set `page_completed_till` to the current page number (`n: 1..22`) as the merchant advances and set `have_vendor_submitted_details` at final submit; route guards read them to gate/resume. The user app computes `profile_percentage` client-side (e.g. `50` at location) and sets `have_submited_details_profile` at completion. **These fields are manually FE-persisted, not backend-calculated** — so there is **no substantial backend "onboarding workflow engine"** to migrate.

However, every slice to date is a **read foundation** (+ onboarding-state writes in P1.7.8). There is **no canonical backend write/create path** to bring a Merchant, Restaurant, or Subscription into existence — and **all downstream domains depend on those records existing**. That create path is the upstream-most, **unblocked** gap.

Downstream domains are each **still blocked** by their prior owner decisions: **Ordering** (OD-11 numeric→named status mapping), **Seating** (`table_setup` modeling), **Discovery** (Mood/Craving canonical source) — and additionally depend on merchant/restaurant records existing.

→ **SAFE NEXT SLICE: MERCHANT ONBOARDING WORKFLOW** — the backend **write/create foundation** for Merchant + Restaurant + Subscription plus onboarding-state transitions (reusing P1.7.2/P1.7.3/P1.7.8), with the FE step-sequencing/percentage/validation **deferred as frontend**. It is upstream of all downstream domains and carries no unresolved blocker.

## 2. Merchant onboarding complete source trace

`amealiodashboardmvp-/client/src/components/vendorOnboradingComponents/allScreens/*` drives a multi-page wizard; `store/utils/PrivateRoute.js` + `DetailsPrivateRoute.js` gate/resume via `have_vendor_submitted_details` + `page_completed_till`. Each screen PATCHes the `restaurant` (and `subscription`) with the next `page_completed_till` value (obfuscated payload alias `n:`):

```
Auth (VendorUser via /vendorauthentication)
 → RestaurantDetailsSettings (n:1/2)  → restaurant profile/address/geo(strings)
 → RestaurantChains                    → restaurant_chain
 → ServicesOffered (n:13)              → service types / business type
 → PetsAllowed / PointOfContacts / PointOfSale / logo+video → restaurant fields (URLs)
 → MainSubscription                    → subscription create/config
 → … → final submit sets have_vendor_submitted_details=true
```

Backend: generic Feathers CRUD (`/restaurant`, `/subscription`, `/vendor-user`) + hooks; no backend "workflow" object — progression is the FE incrementing `page_completed_till`.

## 3. User onboarding complete source trace

`amealio_web_app` — auth first (`/authentication`,`/otp-authentication`: `mobile_number`+OTP → `user_verified`); then profile setup (`screens/profileSetup/*`, `screens/userProfile/UserLocation.js`) PATCHes `/user-service`/`/user/profiles` with `profile_percentage` (FE-computed; `50` at location, `completion` at picture) and `have_submited_details_profile=true` at completion; preference screens store `dietary_preferences`/`selected_cuisine`/`celebration_subcategory`/`language`. Backend persists via generic CRUD.

## 4. Merchant workflow step inventory

| Step | Inputs | Persistence | Target entity | State write |
|---|---|---|---|---|
| Auth/owner | phone/email/pwd | VendorUser | StaffMember/Merchant | — |
| Restaurant details | name/address/geo(strings)/contact | restaurant | Restaurant | `page_completed_till` |
| Chain | chain name | restaurant_chain | RestaurantChain | step |
| Services/business type | service/business type, cuisine, features | restaurant + Sub Category refs | Restaurant/RestaurantFeature | step |
| Media | logo/photos (URLs) | restaurant | Restaurant (embedded URLs) | step |
| Subscription | product/business config | subscription | Subscription (config Json) | step |
| Submit | — | vendor-user | Merchant.onboardingSubmitted | `have_vendor_submitted_details` |

Steps are **conditional on subscription/business type** (which screens show) but the backend persists whatever the FE sends. Validation is per-screen (FE).

## 5. User workflow step inventory

| Step | Inputs | Persistence | Target | State write |
|---|---|---|---|---|
| Auth | mobile+OTP | User Service | User | `user_verified` |
| Profile basics | name/gender/photo(URL) | User Service | User/UserProfile | `profile_percentage` |
| Location | country/state/city(+ *_id strings)/address | User Service/address | UserProfile/Address | `profile_percentage=50` |
| Preferences | dietary/cuisine/celebration/language | User Service arrays | UserProfile.preferences | `profile_percentage` |
| Complete | — | User Service | UserProfile | `have_submited_details_profile` |

## 6. State semantics analysis

| Field | Writer | Reader | Calculated? | Meaning |
|---|---|---|---|---|
| `page_completed_till` / `Restaurant.onboardingStep` | **Frontend** (per screen) | route guards (resume/gate) | **No** — FE sets the step number | integer page/step reached |
| `have_vendor_submitted_details` / `Merchant.onboardingSubmitted` | **Frontend** (final submit) | `PrivateRoute` (dashboard access) | No | onboarding complete gate |
| `softOnboarding` / `Restaurant.softOnboarding` | FE/backend | menu/cart soft-onboarding checks | No | partial/soft onboarding path |
| `profile_percentage` / `UserProfile.completionPercentage` | **Frontend** (per step) | profile UI | **No** — FE-computed | completion % |
| `have_submited_details_profile` / `UserProfile.detailsSubmitted` | **Frontend** (completion) | profile/feature gates | No | profile complete gate |

**Progression/completion = FE-driven; backend/canonical foundation stores + reads.** No backend calculation of step or percentage.

## 7. Foundation-vs-workflow gap

**FOUNDATION ALREADY COMPLETE (P1.7.2/P1.7.3/P1.7.4/P1.7.6/P1.7.8):** Merchant/Restaurant/Chain/Org, Subscription(config), Category/Cuisine, Currency, User/UserProfile/Address/ReferralProgram, and onboarding/profile **state fields + read/update services** (`MerchantOnboardingService`, `UserProfileService`).

**WORKFLOW STILL MISSING (backend):** a canonical **create/write path** for Merchant, Restaurant, and Subscription (records currently only exist via test fixtures); write endpoints/use-cases that assemble a merchant+restaurant+subscription and transition onboarding state. **MISSING (frontend, deferred):** step sequencing, percentage calculation, per-screen validation, wizard UI.

## 8. Validation rules

Legacy validation is **per-screen in the FE** (required fields per page); backend enforces only model-level constraints. Canonical target invariants to preserve on write: merchant tenancy; restaurant belongs to merchant; `completionPercentage` 0..100 (P1.7.8 service invariant); required identity fields (merchant `legalName`; restaurant `name`+`merchantId`; user phone). No backend cross-step workflow validation exists to migrate.

## 9. Submission/completion rules

Merchant "complete" = `have_vendor_submitted_details=true` (FE at final submit) → dashboard unlocked. User "complete" = `have_submited_details_profile=true` (+ percentage). Both are single boolean gates set by the client; the canonical `Merchant.onboardingSubmitted`/`UserProfile.detailsSubmitted` already represent them (P1.7.8).

## 10. Abandonment / retry behavior

Abandonment = onboarding left incomplete; `page_completed_till`/`profile_percentage` persist so the FE **resumes** at the last page (route guards). No backend timeout/rollback found; records remain in a partial state (soft onboarding may allow limited operation). Retry = re-entering the wizard and re-PATCHing. **No backend abandonment logic to migrate.**

## 11. Downstream dependency analysis

All downstream domains require Merchant + Restaurant (and usually Subscription/Menu) records to **exist** — created by onboarding (or a future import). They do **not** require onboarding *completion flags* to be set (soft onboarding permits operation), but they **do** require the create path. Thus the merchant write/create foundation is **upstream** of ordering/seating/discovery.

## 12. Ordering assessment (OD-11 reassessed)

Legacy `orderEnums.ts` uses a mix of **named** statuses (`delivered:"DELIVERED"`, `return_delivered`) and **numeric** rider codes (self-delivery `5=on the way`, `6=delivered`). Target `OrderStatus` is a **named** enum (INITIAL…DELIVERED…RETURNED) — present. **OD-11 remains a blocker** for Ordering *migration*: the exact legacy numeric/named → target-named mapping is an owner decision. Ordering also needs merchant/restaurant/menu records (onboarding). → **defer.**

## 13. Seating assessment (`table_setup` reassessed)

`table_setup` remains **embedded in `Subscription.config`** (P1.7.3, kept as Json); the normalized target model + cron-driven table-status semantics are an **unresolved owner decision**. Target `SeatingRequest` is also incomplete (missing `INITIAL` + cross-links). **`table_setup` remains a blocker** for Seating. → **defer.**

## 14. Discovery assessment (Mood/Craving reassessed)

Discovery taxonomy has **competing canonical sources** (`Mood` vs `MoodManagement` vs `Sub Category`; `Craving`) — an unresolved P1.7.4 owner decision. **Mood/Craving remains a blocker** for Discovery. → **defer.**

## 15. Dependency graph

```
Merchant/Staff identity (P1.7.1D–F ✓)     User identity (P1.7.1B ✓, verified)
        │                                         │
        ▼                                         ▼
MERCHANT WRITE/CREATE (MISSING)            USER PROFILE WRITE (P1.7.8 ✓ state/prefs;
  create Merchant → Restaurant →            user-create via consumer auth ✓)
  Subscription(config) + onboarding-state
        │                                         │
        ▼ (HARD PREREQUISITE for all below)       ▼ (mostly complete)
Menu/Catalog (read ✓ P1.7.5) ── needs restaurant records
        │
        ▼
Ordering [BLOCKED: OD-11]  Seating [BLOCKED: table_setup]  Discovery [BLOCKED: Mood/Craving]
```

Classification: Merchant create = **HARD PREREQUISITE** (upstream of all). User profile write = mostly **COMPLETE** (P1.7.8 + consumer auth); remaining user-create/profile-write = small. Ordering/Seating/Discovery = **DOWNSTREAM ONLY** + blocked. Onboarding *frontend* workflow = **DOWNSTREAM/deferred**.

## 16. Candidate next-slice ranking

| Candidate | Upstream deps | Downstream value | Blockers | Foundation ready | Do now? |
|---|---|---|---|---|---|
| **A. Merchant onboarding write workflow** | identity ✓, taxonomy ✓, currency ✓ | **High** — unblocks all merchant-owned domains (create merchant/restaurant/subscription) | **None** | P1.7.2/3/4/6/8 ✓ | **YES (recommended)** |
| B. User onboarding write workflow | consumer auth ✓, UserProfile ✓ | Medium — user-create + profile write | None | mostly done (P1.7.8) | Small; parallel follow-on |
| C. Merchant + User both | as A+B | High | None | ✓ | Feasible; larger scope |
| D. Ordering | **Merchant/Restaurant/Menu create (A)** | High | **OD-11** | partial | No (blocked + needs A) |
| E. Seating | Restaurant create (A) + table_setup | High | **table_setup** | partial | No (blocked) |
| F. Discovery | taxonomy + Mood/Craving | Medium | **Mood/Craving** | partial | No (blocked) |

## 17. Recommended next migration slice

**Candidate A — Merchant onboarding write workflow (backend create/write foundation).** Implement canonical create/update for **Merchant → Restaurant → Subscription** plus onboarding-state transitions (reusing P1.7.2/P1.7.3/P1.7.8 + Category/Cuisine/Currency), merchant-tenant-scoped (P1.7.1F). It is the upstream-most **unblocked** gap and a hard prerequisite for every merchant-owned downstream domain. **Frontend wizard, percentage calculation, per-screen validation, geography normalization, media catalogue, and downstream domains remain deferred.** (User onboarding write is a small parallel follow-on — largely satisfied by consumer auth + P1.7.8.)

## 18. Owner decisions

1. **Merchant "submitted" granularity** — per-merchant (current P1.7.8) vs per-restaurant (legacy gate was per-vendor). Non-blocking; per-merchant is source-consistent.
2. **Onboarding-step representation** — keep integer `onboardingStep` (FE-driven, source-faithful) vs named stages. Non-blocking (integer matches source).
3. **`profile_percentage` calculation** — remain FE-computed/stored (source) vs backend-derived. Non-blocking (store as-is).
4. **Preferences** — keep `UserProfile.preferences Json` (sufficient) vs normalized. Non-blocking (Json now).
5. **Restaurant attribute mapping** (`Category` type vs `RestaurantFeature`) — P1.7.4 open; non-blocking for create (store selections).

None block Candidate A.

## 19. UNKNOWNs

- Exact per-screen required-field validation set (FE-embedded; migrate only if the write foundation needs server-side validation).
- `softOnboarding`'s exact operational effect on menu/cart (referenced in `usercart`/menu soft-onboarding checks; not required for the write foundation).
- Whether any backend hook mutates onboarding state (none found; appears FE-driven) — confirm during implementation.
- Legacy `country_id/state_id/city_id` source dataset (geography deferred).

## 20. Explicitly deferred items

Onboarding **frontend** wizard + percentage/validation logic; geography normalization; media catalogue; discovery taxonomy (Mood/Craving); FX; Ordering (OD-11); Seating (`table_setup`); Experiences/Events; Delivery; AI/RAG; ONDC; Mongo import/backfill; generic workflow engine; merchant act-as/switching.

## 21. Evidence index

- Merchant onboarding FE: `amealiodashboardmvp-/client/src/components/vendorOnboradingComponents/allScreens/*` (RestaurantDetailsSettings `n:1/2`, ServicesOffered `n:13`, MainSubscription, RestaurantChains, PointOfSale/Contacts, PetsAllowed, logo/video); `store/utils/{PrivateRoute,DetailsPrivateRoute}.js`.
- Merchant backend: `amealio-vendordashboard/src/models/{vendor-user,restaurant,subscription,restaurant-chain}.model.ts`; `restaurant.page_completed_till`/`softOnboarding`, `vendor-user.have_vendor_submitted_details`.
- User onboarding FE: `amealio_web_app/src/screens/profileSetup/ProfilePicture.js` (`n: completion`, `n: true`), `screens/userProfile/UserLocation.js` (`n:'50'`).
- User backend: `amealio-vendordashboard/src/models/user-service.model.ts` (`profile_percentage`, `have_submited_details_profile`, preference arrays).
- Downstream blockers: `orderEnums.ts` (OD-11); `subscription.model.ts` seating.table_setup (Seating); `Mood`/`MoodManagement`/`Craving` models (Discovery).
- Target: `prisma/schema.prisma`; docs 26–37; P1.7.8 services (`MerchantOnboardingService`, `UserProfileService`).

---

## Final conclusion

**SAFE NEXT SLICE: MERCHANT ONBOARDING WORKFLOW** (backend create/write foundation for Merchant + Restaurant + Subscription + onboarding-state transitions; frontend wizard, percentage/validation, geography/media, and downstream domains deferred). Source-backed: the write/create path is the only upstream-unblocked gap; the "workflow" progression itself is frontend-driven and out of scope. No hard-stop condition applies; no owner decision blocks implementation.

*Validation: discovery-only — `prisma/schema.prisma` and `apps/` untouched, no migrations created, baseline remains 199/199.*
