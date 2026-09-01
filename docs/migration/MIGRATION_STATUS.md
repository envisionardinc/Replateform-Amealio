# Migration Status

Single source of truth for the controlled replatforming. Update this file whenever a phase, activity, blocker, decision, or migrated capability changes.

- **Last updated:** 2026-09-01 (P1.4 — Target PostgreSQL Data Model design COMPLETE)
- **Current phase:** Phase 1 — Target Repository Baseline & Governance
- **Overall state:** Documentation & governance only. No application code, schema, or scaffolded apps yet.

## Phase model

| Phase | Description | State |
|-------|-------------|-------|
| 0 | Discovery & architecture design | ✅ Completed (in review) |
| 1 | Target repository baseline & governance | 🔵 **Current** |
| 2 | Restore India baseline (from designated source) | ⏳ Next |
| 3 | Baseline validation | ⏳ Pending |
| 4 | Progressive capability introduction | ⏳ Pending |

## Completed activities

- **Phase 0 — Discovery** (in review): forensic, read-only inventory of the India platform → `docs/migration/01–10`.
  - Reference inventory, 17-domain inventory, API surface (~419 Feathers mounts + Nest API), MongoDB usage & business entities/relationships, business rules, integrations, auth/authorization, workflows, design-system inventory, risks + recommended order.
- **Phase 0 — Target design** (in review): `docs/architecture/` — canonical PostgreSQL/Prisma domain model, ERD, multi-tenancy, India-first localization, and the approved target repository structure.
- **Phase 1 — Governance:** established engineering rules (`AGENTS.md`), project overview (`README.md`), migration hub (`docs/migration/README.md`), this status tracker, and the decision log (`DECISIONS.md`).
- **Phase 1 — P0.2 Repository landscape:** inventoried and classified all 6 available repositories (30-point each) and produced the India-baseline comparison → [REPOSITORY_LANDSCAPE.md](./REPOSITORY_LANDSCAPE.md) and [SOURCE_REPOSITORIES.md](./SOURCE_REPOSITORIES.md).
- **Phase 1 — P0.3 Baseline source decision (APPROVED):** owner-approved baseline source set → [india-baseline/BASELINE_SOURCE_DECISION.md](./india-baseline/BASELINE_SOURCE_DECISION.md) (D-011). Core = `amealio-vendordashboard` + `amealio_web_app` + `amealiodashboardmvp-`; deferred = `amealio-nestjs-backend`, `amealio-self-delivery-app`. **Blocker B1 resolved.**
- **P1.1 — Deep India Baseline System Analysis: COMPLETE.** Analyzed the three approved repos as one logical platform across all 13 required areas → [india-baseline/](./india-baseline/) (`01`–`13`). Analysis only.
- **P1.2 — Define the India Baseline Capability Matrix: COMPLETE.** Capability matrix + acceptance criteria + Definition of Done + critical journeys → [14](./india-baseline/14-CAPABILITY-MATRIX.md)–[16](./india-baseline/16-END-TO-END-BASELINE-JOURNEYS.md).
- **P1.3 — Create the Target Migration Map: COMPLETE.** Defined *how* the approved baseline is replatformed (design/mapping only) → [india-baseline/17-TARGET-MIGRATION-MAP.md](./india-baseline/17-TARGET-MIGRATION-MAP.md) + [target-architecture/](./target-architecture/) (`01`–`12`): architecture options (recommend modular monolith + service seams), domain boundaries, source→target mapping (REUSE/ADAPT/REFACTOR/REIMPLEMENT/REPLACE/DEPRECATE), conceptual data map (no schema), API/frontend/auth/integration/realtime maps, domain-by-domain sequence, carried-forward owner decisions, and P0/P1/P2 risks. No code, schema, data migration, or production changes; deferred repos not introduced; owner-decisions not resolved.

- **P1.4 — Design the Target PostgreSQL Data Model: COMPLETE.** Documented the conceptual target data model → [database/](./database/) (`01`–`18`): domain model, entity↔legacy mapping, identifier strategy, relationships/constraints, enum/status strategy (OD-11), money/pricing, order model, payment/settlement model, reservation model, notification model, audit/soft-delete, ownership, indexing, migration complexity, integrity rules, extension seams, ERD, and the decision register. **Design only — no schema, migrations, tables, data migration, or code.** Owner-decisions and OD-11 enum mappings are **not** resolved.
  - **Blocked data-model decisions (require owner/data input):** DR-02a..e (OD-11 numeric enum mappings — order/payment status, payment method, `t_type`, wallet role) — **gate Orders/Payments/Wallet data migration**; DR-03a (India GST components/rates); DR-14/15/16/17 (Celebrations/Events/Ticketing, ONDC, Loyalty, Wallet inclusion — owner-decision); DR-07a (enterprise Organization tenancy). See [database/18-DATA-MODEL-DECISIONS.md](./database/18-DATA-MODEL-DECISIONS.md).

## Current activity

- **P1.4 complete.** Target data model designed and internally consistent (conceptual). **No application functionality written; no PostgreSQL schema/migrations; no data migration.** Blocked on OD-11 (enum mappings) and owner-decision items before affected schema/migration can proceed.

## Next activity

- **Phase 2 — Restore India baseline** (scope now fixed to the three approved core repos). Order of operations: **restore → validate → freeze → introduce additional capabilities progressively.** Before implementation begins:
  1. Confirm remaining Phase-0 design approvals (B4) and enum mappings (B2); run the secret-rotation workstream (B3).
  2. Decide whether to scaffold the target monorepo skeleton (`apps/`, `packages/`, `prisma/`, `turbo.json`) as the first controlled increment (Decision D-009, pending).
  3. Restore the India baseline in small, reviewable increments, preserving business behavior. Do **not** include the two deferred repositories.

## Blockers

| ID | Blocker | Needed to proceed | Owner |
|----|---------|-------------------|-------|
| ~~B1~~ | **RESOLVED (2026-09-01).** India baseline source confirmed by owner — D-011 APPROVED ([BASELINE_SOURCE_DECISION.md](./india-baseline/BASELINE_SOURCE_DECISION.md)): core = backend + consumer + admin/merchant; the two 2026-era repos deferred. | — | — |
| B2 | **Env-driven enum values** (order/payment status/method, transaction types) are not resolvable from source. | Confirmed integer↔enum mappings before any data/behavior migration. | Backend owners |
| B3 | **Committed secrets** exist in reference env files. | Secret-rotation workstream must run before any baseline restore that touches config. | Security |
| B4 | Target design docs (Phase 0) are **proposals pending review**. | Review/approval of `docs/architecture/*` and open questions in `10-migration-risks.md`. | Architecture review |
| B5 | Unconfirmed: **admin vs merchant** as separate target apps; **ONDC** as a separate bounded context. | Product/architecture decision (see DECISIONS D-006, D-007). | Product + Architecture |

> No blocker is being worked around. Phase 2 does not start until B1 and B4 are resolved.

## Decisions

Recorded in [DECISIONS.md](./DECISIONS.md). Current headline decisions:

| ID | Decision | Status |
|----|----------|--------|
| D-001 | Controlled, incremental replatforming (no big-bang, no wholesale copy) | Accepted |
| D-002 | Reference repositories are read-only; this repo is the only writable target | Accepted |
| D-003 | PostgreSQL as system of record | Accepted (direction) |
| D-004 | Prisma as schema/ORM layer | Accepted (direction) |
| D-005 | India-first; market differences as configuration, not code forks | Accepted (direction) |
| D-006 | Separate `admin` and `merchant` target apps | Proposed |
| D-007 | ONDC as a separate bounded context/service | Proposed |
| D-008 | Monorepo (Turborepo) with NestJS API + Next.js apps | Proposed |
| D-009 | Scaffold monorepo skeleton as first Phase-2 increment | Proposed |
| D-011 | India baseline source set (core = backend + consumer + admin/merchant; 2026 repos = deferred satellites/feature sources) | **Approved** |

## Source repositories (read-only)

| Logical role | Repository | Stack | Notes |
|--------------|------------|-------|-------|
| Platform backend (India) | `amealio-vendordashboard` (`envisionapp`) | Feathers + MongoDB | System of record today; 171 models, ~419 service mounts |
| Consumer web | `amealio_web_app` | CRA / React 18 | Diner web app |
| Admin console | `amealiodashboardmvp-` | CRA / React 16 | Same repo as merchant |
| Merchant dashboard | `amealiodashboardmvp-` | CRA / React 16 | Portal chosen by hostname |
| Delivery tracking API | `amealio-nestjs-backend` | NestJS + PostgreSQL | **Deferred (D-011)** — not in initial baseline |
| Delivery-boy app | `amealio-self-delivery-app` | Next.js | **Deferred (D-011)** — not in initial baseline |

Approved India baseline (D-011): **core** = `amealio-vendordashboard`, `amealio_web_app`, `amealiodashboardmvp-`; **deferred** = `amealio-nestjs-backend`, `amealio-self-delivery-app`. Detail: [01-reference-inventory.md](./01-reference-inventory.md), [SOURCE_REPOSITORIES.md](./SOURCE_REPOSITORIES.md).

## Target architecture (planned — pending review)

- **Monorepo** (Turborepo): `apps/{api,admin,merchant,web}`, `packages/{ui,design-system,types,validation,auth,config,localization,utils}`, `prisma/`, `docs/`.
- **Backend:** NestJS (`apps/api`) replacing the Feathers monolith.
- **Frontends:** Next.js (consumer / admin / merchant).
- **Datastore:** PostgreSQL (system of record) via Prisma; canonical domain model (not a 1:1 collection translation).
- **Market:** India-first (`IN` only); no US-specific behavior yet.

Detail: [../architecture/target-repository-structure.md](../architecture/target-repository-structure.md) and the other `docs/architecture/` documents. Nothing here is scaffolded yet.

## Migrated capabilities

**None yet.** No capability has been migrated or implemented in the target platform.

| Capability | Source repo | Target module | Status |
|------------|-------------|---------------|--------|
| Identity / Auth | `amealio-vendordashboard` | `apps/api/modules/auth`,`users` | Not started |
| Merchant / RBAC | `amealio-vendordashboard` | `apps/api/modules/merchants` | Not started |
| Location / Restaurants | `amealio-vendordashboard` | `apps/api/modules/locations` | Not started |
| Catalog / Menu | `amealio-vendordashboard` | `apps/api/modules/catalog`,`menus` | Not started |
| Order | `amealio-vendordashboard` | `apps/api/modules/orders` | Not started |
| Payment / Settlement | `amealio-vendordashboard` | `apps/api/modules/payments` | Not started |
| Delivery / Tracking | `amealio-vendordashboard`, `amealio-nestjs-backend` | `apps/api/modules/delivery` | Not started |
| Seating / Reservation | `amealio-vendordashboard` | `apps/api/modules/reservations` | Not started |
| Celebration (Experiences/Events) | `amealio-vendordashboard` | `apps/api/modules/celebrations` | Not started |
| Promotion | `amealio-vendordashboard` | `apps/api/modules/promotions` | Not started |
| Notification | `amealio-vendordashboard` | `apps/api/modules/notifications` | Not started |
| Administration / Reporting | `amealio-vendordashboard`, `amealiodashboardmvp-` | `apps/api/modules/admin` | Not started |
| Consumer web UI | `amealio_web_app` | `apps/web` | Not started |
| Admin UI | `amealiodashboardmvp-` | `apps/admin` | Not started |
| Merchant UI | `amealiodashboardmvp-` | `apps/merchant` | Not started |
| Delivery-boy UI | `amealio-self-delivery-app` | (TBD) | Not started |
| ONDC | `amealio-vendordashboard` | separate bounded context | Not started |

Recommended migration order: [10-migration-risks.md](./10-migration-risks.md#4-recommended-migration-order).
