# India Baseline — Source-of-Truth Decision (P0.3)

> **Status: PROPOSED — AWAITING OWNER CONFIRMATION.**
> This is a proposal derived from already-documented evidence and Git history. It does **not** finalize the India baseline (blocker **B1**). No application code was written, copied, merged, or modified; no production systems were accessed.

- **Date:** 2026-09-01
- **Inputs reviewed:** [REPOSITORY_LANDSCAPE.md](../REPOSITORY_LANDSCAPE.md), [SOURCE_REPOSITORIES.md](../SOURCE_REPOSITORIES.md), [MIGRATION_STATUS.md](../MIGRATION_STATUS.md), [DECISIONS.md](../DECISIONS.md)
- **Method:** Reuse P0.2 findings + Git history (first/last commit dates, commit counts, branches, tags, dependency relationships). No historical facts were invented; where history is inconclusive it is marked for owner confirmation.

## Evidence at a glance (Git history)

| Repository | First commit | Last commit | Commits | Tags | Signal |
|------------|--------------|-------------|---------|------|--------|
| `amealiodashboardmvp-` | **2020-05-14** | 2026-08-31 | 9081 | — | Oldest; long-lived admin+merchant surface |
| `amealio_web_app` | **2023-01-18** | 2026-08-31 | 1909 | `v1.0`,`v1.1`,`webph1`,… | Long-lived consumer surface |
| `amealio-vendordashboard` | 2026-02-23 (*"Initial clean commit"*) | 2026-08-31 | 392 | — | History **reset**; age understated (foundational by dependency, see note) |
| `amealio-nestjs-backend` | **2026-04-29** | 2026-08-31 | **10** | — | New in 2026; narrow delivery-tracking |
| `amealio-self-delivery-app` | **2026-05-01** ("from Create Next App") | 2026-06-26 | **46** | — | New in 2026; `Beta.1.0.6` |

**Interpretation caveats (no invented facts):**
- `amealio-vendordashboard`'s first commit is literally *"Initial clean commit"* (2026-02-23), which indicates a **re-initialized Git history**, not the true creation date. Its foundational status is evidenced by the fact that the 2020 admin/merchant app and 2023 consumer app depend on it, **not** by commit age.
- Commit dates for the two supporting repos (Apr/May 2026) are consistent with **new** repositories created years after the core surfaces.

---

## INDIA BASELINE — PROPOSED SOURCE SET

### CORE BASELINE
- `amealio-vendordashboard`
- `amealio_web_app`
- `amealiodashboardmvp-`

### SUPPORTING / SATELLITE
- `amealio-nestjs-backend`
- `amealio-self-delivery-app`

> **Proposed treatment:** the two supporting/satellite repositories appear to be **later additions** and are proposed to be handled as **FEATURE SOURCES introduced progressively after the baseline is restored** — pending owner confirmation. They are **not** proposed as part of the historical India baseline. (This refines, and does not contradict, their P0.2 landscape label of "B — supporting (or C — feature)".)

### FEATURE SOURCES (introduce progressively, post-baseline)
- `amealio-nestjs-backend` (delivery tracking) — pending confirmation.
- `amealio-self-delivery-app` (delivery-boy app) — pending confirmation.
- External, **not present as repositories** in this workspace (cannot be classified; owner input needed): recommendations/AI engine (`REACT_APP_RECOMMENDATIONS_API_*`), integration service (delivery create/availability/public-track), ONDC micro-server.

---

## Per-repository rationale

### CORE — `amealio-vendordashboard` (platform backend)
- **Why this category:** system of record and domain API; every other client authenticates against and consumes it.
- **Business capability:** all 17 domains (identity, merchant, location, catalog/menu, order, payment/wallet/settlement, delivery orchestration, seating/reservation, celebration/events, promotion, notification, reporting, administration, ONDC).
- **Foundational or additive:** **Foundational.** Nothing else functions without it.
- **Dependencies:** external providers (Razorpay/RazorpayX, Twilio, MSG91, SendGrid/SES, FCM, Dunzo, Porter, Petpooja, ONDC micro-server, Google Maps, integration service).
- **Risk of excluding:** platform cannot exist; excluding is not viable.
- **Risk of including:** large monolith (171 models, ~419 mounts), high migration effort — but unavoidable.

### CORE — `amealio_web_app` (consumer web)
- **Why this category:** primary consumer/diner surface; long-lived (since 2023) with release tags.
- **Business capability:** discovery, restaurant/menu, ordering, seating/reservation, experiences/events, ONDC buyer, wallet, community/media.
- **Foundational or additive:** **Foundational** to the consumer experience of the India baseline.
- **Dependencies:** `amealio-vendordashboard` (auth/services/sockets); external recommendations API; live-tracking socket / integration service (for order tracking).
- **Risk of excluding:** no consumer channel; baseline would be backend-only.
- **Risk of including:** carries legacy+V2 duplication and mixed UI stacks (rebuild cost).

### CORE — `amealiodashboardmvp-` (admin + merchant)
- **Why this category:** the operator surface; oldest repo (since 2020); merchants and super-admins run the platform through it.
- **Business capability:** merchant onboarding/menu/seating/order ops/experiences/staff/subscriptions/settlements/reports; super-admin approvals/ONDC/delivery-partner/payouts/POS/content.
- **Foundational or additive:** **Foundational** to operating the India baseline.
- **Dependencies:** `amealio-vendordashboard` (`vendorauthentication`); Twilio voice; integration/Porter API URLs.
- **Risk of excluding:** no way to operate merchants/admin; baseline not operable.
- **Risk of including:** highest tech debt (React 16, ~9k commits, ~400+ routes, admin/merchant coupled).

### SUPPORTING — `amealio-nestjs-backend` (delivery tracking API)
- **Why this category:** depended on for **live GPS tracking**, but narrow and new (2026, 10 commits) and on a **separate datastore** (PostgreSQL) than the core (MongoDB).
- **Business capability:** driver location ingest (`/tracking` WS) + active/current/history queries. Nothing else.
- **Foundational or additive:** **Additive.** The core platform predates it by years and functions without live GPS.
- **Dependencies:** shares `JWT_SECRET` with `amealio-vendordashboard` (verifies its tokens); likely the target of the backend's `INTEGRATION_SERVICE_BASE_URL` calls (**unconfirmed**).
- **Risk of excluding from baseline:** loss of real-time delivery map/tracking during baseline restore (delivery still functions via partner webhooks/status). Low-to-medium.
- **Risk of including in baseline:** adds a second database and a satellite service to the "must-restore-first" scope, increasing baseline complexity for a non-foundational capability.

### SUPPORTING — `amealio-self-delivery-app` (delivery-boy app)
- **Why this category:** operator-facing **driver app**, but new (2026, 46 commits, `Beta.1.0.6`) and dependent on both the backend and the Nest tracker.
- **Business capability:** driver OTP login, accept assignment, ongoing/history orders, live location emit, online/offline, push.
- **Foundational or additive:** **Additive.** Beta; per documented discovery it references an older native "DeliveryBoy-App" (not in workspace) it appears to replace — suggesting self-delivery via app is an evolving capability rather than the historical baseline mechanism.
- **Dependencies:** `amealio-vendordashboard` (assignments/orders) **and** `amealio-nestjs-backend` (GPS). Coupled to the Nest tracker's inclusion.
- **Risk of excluding from baseline:** self-delivery drivers lack this specific web app during baseline restore (third-party delivery via Dunzo/Porter and any prior driver mechanism unaffected). Low-to-medium.
- **Risk of including in baseline:** pulls a beta app + the Nest tracker into foundational scope; couples baseline stability to a fast-moving, immature component.

---

## Supporting repositories — A/B/C/D determination

For the two supporting repos, is the functionality **(A)** required for the historical India baseline, **(B)** a later enhancement, **(C)** a separate satellite capability, or **(D)** unclear and requiring business confirmation?

### `amealio-nestjs-backend`
- **Determination: B + C** — a **later enhancement** delivered as a **separate satellite capability**. Not **A**.
- **Evidence:** first commit 2026-04-29 (years after the 2020/2023 core); only 10 commits; feature branches `feature/AR-1344-add-location-tracking-socket`, `feature/AR-1344-jwt-auth`; separate PostgreSQL datastore; issues no tokens (depends on the core's JWTs). It provides a capability (real-time GPS) the core platform operated without for years.
- **Residual D:** whether real-time tracking is considered part of the *current* production India baseline (even if added later) needs owner confirmation.

### `amealio-self-delivery-app`
- **Determination: B (leaning C), with D** — a **later enhancement** (and likely a **separate/evolving satellite** app). Not **A**.
- **Evidence:** first commit 2026-05-01 ("from Create Next App"); 46 commits ending 2026-06-26; version `Beta.1.0.6`; depends on the Nest tracker (itself additive). Documented discovery notes it references an older native "DeliveryBoy-App" not present in the workspace.
- **Residual D:** whether an older delivery-boy app was part of the historical baseline, and whether this beta app is now the production driver channel, needs owner confirmation.

---

## Overlaps, gaps, and dependencies (summary)

- **Delivery capability** is split across core (`amealio-vendordashboard`: assignment, Dunzo/Porter, self-delivery orchestration) and the two satellites (tracking API + driver app). The core already handles delivery orchestration and third-party partners **without** the satellites.
- **Two databases** exist today: MongoDB (core) and PostgreSQL (tracking satellite). Including the tracking satellite in the baseline pulls a second datastore into foundational scope.
- **External, non-repo dependencies** (recommendations, integration service, ONDC micro-server) are referenced by the baseline but are not present here and cannot be classified without owner input.

## Unresolved questions (owner confirmation required)

1. Is **real-time delivery tracking** (Nest API) considered part of the *current* production India baseline, or an enhancement layered on top?
2. Is `amealio-self-delivery-app` the **production** driver channel, or a beta pilot? Was an older DeliveryBoy-App part of the baseline?
3. Is the backend's `INTEGRATION_SERVICE_BASE_URL` the **same** deployment as `amealio-nestjs-backend`? If a separate integration-service repo exists, is it baseline?
4. Are recommendations/AI and the ONDC micro-server in baseline scope, and where are their repositories?
5. Confirm the authoritative branch per repo (all currently `main`).

## Proposed decision (for DECISIONS.md)

> **PROPOSED — AWAITING OWNER CONFIRMATION.** India baseline **core** = `amealio-vendordashboard` + `amealio_web_app` + `amealiodashboardmvp-`. The two 2026-era repositories (`amealio-nestjs-backend`, `amealio-self-delivery-app`) are proposed as **later-added satellite/feature sources** to be introduced **progressively after** the baseline is restored — **not** part of the historical baseline — pending owner confirmation of the questions above. Recorded as D-011 in [DECISIONS.md](../DECISIONS.md).

**Do not begin P1 migration until an owner confirms this decision (resolving B1).**
