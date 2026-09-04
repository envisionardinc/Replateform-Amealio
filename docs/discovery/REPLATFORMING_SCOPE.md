# Replatforming Scope — Discovery Phase

**Status:** Discovery only  
**Date:** 2026-09-01  
**Target repository:** [`envisionardinc/replateform-amealio`](https://github.com/envisionardinc/replateform-amealio)  
**Constraint:** No application implementation, no production data/credentials usage, no silent architecture decisions in this phase.

---

## 1. Target repository purpose

`replateform-amealio` is the **intentionally empty TARGET repository** for the Amealio platform replatforming initiative.

It will eventually hold the new platform codebase and the living documentation for:

- discovery of the current systems
- architecture proposals and decisions
- domain and database design
- migration and integration plans
- testing and parity validation

**Current state of the target repo:**

- Placeholder `README.md` stating architecture/discovery phase
- `.gitignore`
- No application source, no services, no infrastructure-as-code yet

**Out of scope for this document / phase:**

- Implementing application code
- Copying large amounts of code from reference repositories
- Connecting to production databases
- Using production credentials
- Migrating production data
- Big-bang cutover planning as an execution task
- Making architectural choices without explicit stakeholder approval

---

## 2. Reference repositories (as selected)

The Cloud Agent environment includes these GitHub repositories as **REFERENCE SYSTEMS** (read-only for discovery; do not modify):

| # | Selected label (from briefing) | GitHub repository | Local path |
|---|--------------------------------|-------------------|------------|
| 1 | User Web App | `envisionardinc/amealio_web_app` | `/agent/repos/amealio_web_app` |
| 2 | Admin App | `envisionardinc/amealiodashboardmvp-` | `/agent/repos/amealiodashboardmvp-` |
| 3 | Merchant Front | `envisionardinc/amealio-vendordashboard` | `/agent/repos/amealio-vendordashboard` |
| 4 | Amealio Backend | `envisionardinc/amealio-nestjs-backend` | `/agent/repos/amealio-nestjs-backend` |
| 5 | Self-Delivery App | `envisionardinc/amealio-self-delivery-app` | `/agent/repos/amealio-self-delivery-app` |
| 6 | Delivery Tracking App | *(not present as a separate repo in this environment)* | — |

> **Critical discovery finding:** Several briefing labels do **not** match the actual contents of the repositories. Corrected roles are documented in §3. These corrections are **observations**, not architecture decisions.

---

## 3. Role of each repository (observed)

### 3.1 `amealio_web_app` — User / Consumer Web App

| Attribute | Observation |
|-----------|-------------|
| **Actual role** | Consumer-facing diner web application |
| **Matches label?** | Yes — “User Web App” |
| **Stack** | Create React App, React 18, Redux Toolkit, MUI + Bootstrap + Tailwind, Feathers client + Socket.IO, axios |
| **Talks to** | Primary Feathers API (`REACT_APP_BASE_URL`); integration/live-tracking socket URL; recommendations API |
| **Auth** | Feathers path `authentication` (JWT); OTP, social, WhatsApp magic-link, guest flows |
| **Major capabilities** | Discovery/home, restaurant browsing, ordering/cart/checkout, seating/waitlist/reservation, experiences/events, ONDC buyer flows, profile, community, Bytes/reels, payments (Razorpay), maps, analytics (PostHog/GA4/Meta) |
| **Maturity** | Large production SPA (~1.9k commits); multi-env (`dev`/`qa`/`uat`/`stage`/`prod`/`prod-us`) |
| **Data ownership** | None — API/socket client only |

### 3.2 `amealiodashboardmvp-` — Merchant + Super-Admin Portal

| Attribute | Observation |
|-----------|-------------|
| **Actual role** | Combined **Vendor (Merchant) dashboard** and **Super-Admin console** in one CRA client |
| **Matches label?** | Partially — labeled “Admin App”, but it is also the primary merchant UI in this workspace |
| **Stack** | CRA `react-scripts` 3 / React 16, classic Redux + thunk, MUI v4, Feathers client + Socket.IO, Express static host |
| **Talks to** | Feathers API (`REACT_APP_API_URL`); portal header `ADMIN` \| `MERCHANT` by hostname |
| **Auth** | Feathers path `vendorauthentication`; roles `vendor` / `superadmin` |
| **Major capabilities** | Vendor onboarding, menu, seating ops, order ops, experiences, settlements, subscriptions, staff/roles, reports, ONDC admin, delivery-partner admin, Twilio voice, etc. |
| **Maturity** | Very large / long-lived MVP grown into production (~9k commits); significant tech-debt signals |
| **Data ownership** | None in the client — API-only. Root `.env.development` appears to contain **backend config leakage** (investigate further; do not use values) |

### 3.3 `amealio-vendordashboard` — Primary Platform Backend (Feathers)

| Attribute | Observation |
|-----------|-------------|
| **Actual role** | **Main Amealio domain API backend** (FeathersJS + Express + Socket.IO + Mongoose/MongoDB) |
| **Matches label?** | **No** — briefing called this “Merchant Front”; repository name is misleading |
| **Package name** | `envisionapp` (“food app”) |
| **Stack** | Feathers 4.5, TypeScript, Mongoose 5, MongoDB, Redis, migrate-mongo, Socket.IO |
| **Surface area** | ~156 Feathers services, ~171 Mongoose models; dual auth mounts (`/authentication`, `/vendorauthentication`) |
| **Major domains** | Users/vendors, restaurants/menus, ordering, seating/dining, experiences/events, wallets/payments/settlements, delivery (Dunzo/Porter/self), ONDC, notifications, chat, POS (Petpooja), media, roles, reporting |
| **Maturity** | Production monolith; large `.env.example` (~900+ keys); multi-env start scripts |
| **Data ownership** | **System of record** for most platform entities (MongoDB) |

### 3.4 `amealio-nestjs-backend` — Delivery Tracking API (NestJS)

| Attribute | Observation |
|-----------|-------------|
| **Actual role** | Narrow **Delivery Tracking API**: driver GPS ingest over Socket.IO (`/tracking`) + REST for active/current/history locations |
| **Matches label?** | **No** as “full Amealio Backend”; **partially** related to “Delivery Tracking” |
| **Stack** | NestJS 11, TypeORM, PostgreSQL, Socket.IO 2.x (EIO3), Passport JWT, Swagger |
| **Maturity** | Early (~10 commits, ~760 LOC under `src/`); README still Nest starter boilerplate |
| **Data ownership** | PostgreSQL `locations` (and related); **not** the platform domain database |
| **Notable** | No token-issuance endpoint visible — JWT assumed issued elsewhere; `synchronize: true` present |

### 3.5 `amealio-self-delivery-app` — Self-Delivery / Delivery Boy Web

| Attribute | Observation |
|-----------|-------------|
| **Actual role** | Merchant **self-delivery driver/courier** web app (“DeliveryBoy Web”) |
| **Matches label?** | Yes — “Self-Delivery App” |
| **Stack** | Next.js 15, React 19, TypeScript, Tailwind 4, Zustand, TanStack Query, Feathers + Socket.IO, Google Maps, Firebase FCM, PWA |
| **Talks to** | Main Feathers API (orders/OTP/delivery-persons); main socket for assignments; Nest location service via `NEXT_PUBLIC_LOCATION_TRACKING_URL` |
| **Major capabilities** | OTP login, accept assignments, ongoing/history orders, live map tracking, online status, push notifications |
| **Maturity** | Beta (`Beta.1.0.6`), ~46 commits; relatively modern stack |
| **Data ownership** | None — client of Feathers + Nest tracking |

### 3.6 Delivery Tracking App — **not found as a standalone frontend**

| Attribute | Observation |
|-----------|-------------|
| **Expected** | Sixth reference system: “Delivery Tracking App” |
| **Found** | No separate customer/ops tracking **application** repository in the environment |
| **Related pieces present** | (a) Nest Delivery Tracking **API** (`amealio-nestjs-backend`); (b) driver tracking UI inside Self-Delivery App; (c) customer order-track screens inside User Web App; (d) merchant/admin delivery ops inside Dashboard MVP |
| **Also referenced but absent** | Older native **DeliveryBoy-App** mentioned in Self-Delivery comments — not in workspace |

---

## 4. Corrected inventory map (label → observed reality)

| Briefing label | Repository | Observed reality |
|----------------|------------|------------------|
| User Web App | `amealio_web_app` | Consumer web app ✓ |
| Admin App | `amealiodashboardmvp-` | Admin **and** Merchant portal (combined) |
| Merchant Front | `amealio-vendordashboard` | **Feathers platform backend**, not a frontend |
| Amealio Backend | `amealio-nestjs-backend` | **Delivery tracking Nest service**, not full platform backend |
| Self-Delivery App | `amealio-self-delivery-app` | Delivery Boy web app ✓ |
| Delivery Tracking App | *(missing)* | Capability split across Nest API + embedded UIs |

**Implication for discovery:** The true platform backend to study for domain/API/database migration is primarily **`amealio-vendordashboard` (Feathers)**, with **`amealio-nestjs-backend`** as a satellite tracking service. Merchant UI discovery should focus on **`amealiodashboardmvp-`**, not `amealio-vendordashboard`.

---

## 5. What is known (high confidence)

1. **Amealio is a multi-surface food / dining platform**: consumer ordering & seating, merchant ops, super-admin, self-delivery drivers, ONDC marketplace participation, experiences/events, wallets/settlements.
2. **Primary system of record today is MongoDB**, accessed via Mongoose in the Feathers monolith (`amealio-vendordashboard`).
3. **Realtime is central**: Feathers Socket.IO for domain events; a separate Nest/Socket.IO channel for driver location.
4. **Auth is dual-stack**: consumer `authentication` vs vendor `vendorauthentication` (JWT/OTP/social/WhatsApp patterns).
5. **Frontends are heterogeneous and aging at different rates**:
   - User Web: React 18 / CRA 5
   - Dashboard MVP: React 16 / CRA 3 (high debt)
   - Self-Delivery: Next.js 15 (newest client)
6. **India-centric operations signals**: Asia/Kolkata timezone, Razorpay, ONDC, MSG91/Twilio; also `prod-us` / `REACT_APP_COUNTRY` for multi-market.
7. **External integrations are numerous** (non-exhaustive): Razorpay/RazorpayX, Twilio, MSG91, SendGrid, AWS SES/S3, Firebase/FCM, Google Maps, Dunzo, Porter, Petpooja POS, ONDC micro-server, PostHog/GA4/Meta.
8. **Target repo is empty and correctly positioned** for documentation-first replatforming.
9. **No production databases were connected** during this discovery pass; env *names* only were noted.

---

## 6. What must be investigated (next discovery work)

### 6.1 Scope & product

- [ ] Confirm product boundaries for v1 of the replatform (which surfaces: consumer, merchant, admin, delivery, ONDC?)
- [ ] Confirm whether “Merchant Front” was mislabeled or whether a **separate merchant frontend repo** exists outside this environment
- [ ] Confirm what “Delivery Tracking App” was intended to mean (Nest API vs customer tracking PWA vs ops map UI vs missing repo)
- [ ] Inventory native mobile apps (iOS/Android diner, DeliveryBoy-App) if they are in scope

### 6.2 Domain & API

- [ ] Produce a domain map / bounded contexts from Feathers services and Mongoose models
- [ ] Catalog public API surface used by each client (REST paths + socket events)
- [ ] Document order lifecycle, seating/waitlist lifecycle, experience booking lifecycle
- [ ] Clarify ONDC boundary: Feathers proxy vs `ONDC_MICRO_SERVER_URL` micro-server responsibilities

### 6.3 Data

- [ ] High-level MongoDB collection inventory and relationships (from models/migrations only; **no production reads**)
- [ ] Identify PII, payment, and regulatory-sensitive collections
- [ ] Clarify Nest PostgreSQL `locations` schema intent vs history API behavior
- [ ] Redis usage (token revocation, queues) and whether it is required in target design

### 6.4 Integrations

- [ ] Per-integration owner, env var names, failure modes, and which surfaces depend on them
- [ ] Porter browser-automation dependency risk
- [ ] Payment and settlement flows (Razorpay / RazorpayX / wallet)

### 6.5 Non-functional

- [ ] Current deployment topology (hosts, envs, CI/CD per repo)
- [ ] Observability, logging, and incident practices
- [ ] Security findings already visible (committed secrets/config, CORS `*`, SSL verify disabled) — for remediation planning only

---

## 7. Explicit assumptions

These are **working assumptions for documentation**, not approved architecture decisions:

| ID | Assumption | Status |
|----|------------|--------|
| A1 | `replateform-amealio` will become the home for the **new** platform (code + docs), not a mirror of any single legacy repo | Assumed |
| A2 | Reference repos remain **read-only** sources of truth for current behavior | Assumed (per briefing) |
| A3 | The Feathers repo (`amealio-vendordashboard`) is the **current domain backend** despite its name | Observed; treat as fact for discovery |
| A4 | `amealiodashboardmvp-` is the current **merchant + admin** UI (no separate merchant-front repo in workspace) | Observed |
| A5 | Nest delivery-tracking service remains a **satellite**, not a replacement for the domain API, until decided otherwise | Assumed for discovery framing |
| A6 | Replatform will proceed **incrementally** (no big-bang), with documented ADRs | Assumed (per briefing) |
| A7 | No production DB access or production credentials will be used during discovery | Required constraint |
| A8 | Multi-country (`IN`/`US`) support remains a product requirement unless stakeholders say otherwise | Unconfirmed assumption |
| A9 | ONDC remains in scope for the eventual platform | Unconfirmed assumption |
| A10 | Native mobile apps may exist but are **out of this environment’s reference set** unless added | Assumed |

---

## 8. Risks

| ID | Risk | Why it matters |
|----|------|----------------|
| R1 | **Mislabeling of repos** leads to wrong migration targets (e.g. treating Nest as “the backend”) | Could waste effort or omit the Feathers monolith |
| R2 | **Missing Delivery Tracking App** (and possibly native DeliveryBoy-App) leaves incomplete UX parity scope | Incomplete discovery / under-scoped migration |
| R3 | **Feathers monolith size** (~171 models, ~156 services) | High discovery cost; hard to replatform without slicing |
| R4 | **Dashboard MVP tech debt** (React 16, monolithic routes, secrets in client) | Merchant/admin replatform may be more invasive than consumer |
| R5 | **Committed secrets / env leakage** in multiple reference repos | Security exposure; must not copy into target; rotate as separate workstream |
| R6 | **Dual databases today** (Mongo domain + Postgres locations) | Target data architecture needs an explicit decision |
| R7 | **Dual realtime stacks** and socket.io v2 clients | Compatibility and cutover complexity |
| R8 | **ONDC + Porter automation + Petpooja** as brittle/external dependencies | High integration risk during migration |
| R9 | **Silent architecture decisions** if implementation starts before ADRs | Violates phase rules; hard to reverse |
| R10 | **Production data migration** without inventory and classification | Compliance and downtime risk — explicitly deferred |

---

## 9. Unknowns

1. Intended target architecture (modular monolith vs microservices; Nest vs other; monorepo layout).
2. Target database strategy (stay on Mongo, move to SQL, dual-write, etc.).
3. Which product surfaces are in **MVP replatform** vs later waves.
4. Whether a separate Merchant Front repository exists outside this environment.
5. What “Delivery Tracking App” refers to in the stakeholder’s mental model.
6. Full list of production hostnames and deploy pipelines (only partial clues from env *names* and Dockerfiles).
7. JWT trust relationship between Feathers-issued tokens and the Nest tracking service.
8. Whether recommendations / integration / ONDC micro-services are separate repos not attached to this environment.
9. Regulatory/compliance requirements (PCI, data residency IN/US, retention).
10. Success metrics for the replatform (parity checklist, performance, cost, developer velocity).
11. Ownership and availability of subject-matter experts per domain (ordering, ONDC, settlements, delivery).
12. Whether Self-Delivery Beta is considered production-critical for wave 1.

---

## 10. Documentation structure created

```
docs/
  discovery/        # this document and future inventory notes
  architecture/     # target architecture proposals (pending)
  domain/           # domain model / bounded contexts (pending)
  database/         # data model discovery & design notes (pending)
  migration/        # migration strategy (pending)
  integrations/     # external systems map (pending)
  testing/          # parity & test strategy (pending)
  decisions/        # ADRs requiring approval (pending)
```

---

## 11. Recommended next discovery step

**Produce a Domain & Service Inventory from the Feathers backend** (`amealio-vendordashboard`):

1. Enumerate Feathers services and Mongoose models into `docs/domain/` and `docs/database/`.
2. Map each major client surface (User Web, Dashboard MVP, Self-Delivery) to the services it calls.
3. Draft a first **bounded-context** proposal for stakeholder review — as a proposal only, in `docs/architecture/` + an ADR stub in `docs/decisions/`.

This should happen **before** any target stack or database choice.

---

## 12. Decisions that require stakeholder approval

No architecture has been selected. The following decisions need **explicit approval** before implementation:

| Decision | Options (illustrative, not recommended yet) | Needed because |
|----------|-----------------------------------------------|----------------|
| D1. Confirm corrected repo roles | Accept observed map in §4 vs provide missing repos | Prevents discovering the wrong systems |
| D2. Replatform wave 1 scope | Which of: consumer, merchant, admin, delivery, ONDC | Bounds all discovery depth |
| D3. Target application topology | Monorepo vs polyrepo; modular monolith vs services | Structures the empty target repo |
| D4. Target backend framework | Evolve from Feathers, rewrite on Nest, other | Affects hiring, reuse, timeline |
| D5. Target primary datastore | MongoDB stay / PostgreSQL / hybrid | Drives migration design |
| D6. Fate of Nest tracking service | Keep as satellite / merge into domain API / replace | Affects delivery realtime design |
| D7. Merchant UI source of truth | Treat Dashboard MVP as merchant front / wait for another repo | Affects UI migration planning |
| D8. Secret hygiene workstream | Rotate & scrub legacy secrets as parallel track? | Security risk already visible in references |

Until D1–D2 are answered, deeper discovery should prioritize **inventory and mapping**, not target implementation choices.
