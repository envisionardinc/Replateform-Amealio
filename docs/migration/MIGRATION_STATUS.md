# Migration Status

Single source of truth for the controlled replatforming. Update this file whenever a phase, activity, blocker, decision, or migrated capability changes.

- **Last updated:** 2026-09-02 (P1.7.1F — Staff/Admin RBAC/Authorization Foundation COMPLETE — local/dev only)
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

- **P1.5 — Build the PostgreSQL Development Foundation: COMPLETE.** First target-database implementation task. Established a reproducible local PostgreSQL 16 dev environment (Docker `docker-compose.yml` + local fallback), Prisma 5 (D-004) tooling, `.env.example` (dev/test only), and **Prisma migrations implementing the approved P1.4 baseline model** (CORE + OPTIONAL entities; deferred/owner-decision domains excluded). Added synthetic seed data and an automated validation suite (**11/11 passing**). Docs: [database/19-DEVELOPMENT-DATABASE.md](./database/19-DEVELOPMENT-DATABASE.md), [database/20-SCHEMA-IMPLEMENTATION.md](./database/20-SCHEMA-IMPLEMENTATION.md). **No production access, no MongoDB changes, no legacy data migrated; OD-11 and GST rates not guessed.**

- **P1.6 — Build the NestJS Application Foundation: COMPLETE.** Second implementation task. Established the `apps/api` NestJS 10 modular-monolith foundation on the P1.5 database (Prisma integration via a global `PrismaService`, typed/validated config, `/api/v1/health`, structured logging + request-id, global exception filter with a consistent error shape, `ValidationPipe`, URI versioning, CORS, graceful shutdown), plus **conventions** for module boundaries, domain events (in-process port), provider/integration ports, and security decorators (metadata only). Single test runner (Jest + ts-jest). **No business domains, integrations, or authentication implemented.** Docs: [application/21-NESTJS-FOUNDATION.md](./application/21-NESTJS-FOUNDATION.md).
  - Validation: `npm run build` ✓, `npm run lint` ✓, `npm run format:check` ✓, `npm test` → **19/19 passing** (config validation, DB schema 11/11, app bootstrap + health + error-shape), local `node dist/main.js` startup + `/api/v1/health` = `{status:ok, db:up}` ✓. P1.5 migrations/schema unchanged and intact.

- **P1.7.1 — Identity (analyze + minimal foundation): COMPLETE.** First business-domain migration. Read-only analysis of baseline auth across all three repos (file-cited; consumer vs merchant vs admin differences documented) → [domains/22-IDENTITY-ANALYSIS.md](./domains/22-IDENTITY-ANALYSIS.md). Implemented a minimal, evidence-backed Identity foundation in `apps/api/src/modules/identity/`: consumer user management (register/get; duplicate→409; unverified default), `PasswordHasher` port + bcrypt adapter (baseline algorithm), `UserRepository` port + Prisma adapter, and role-based authorization infra (`RolesGuard` + `Principal` + `CurrentUser`). **No schema change** (P1.5 intact); **no token/OTP/social auth, no permission-tree evaluator, no HTTP endpoints, no data migration.** Validation: build ✓, lint ✓, format ✓, **54/54 tests passing** (32 Identity + app/config/DB). OD-11 untouched.

- **P1.6.1 — TurboRepo Monorepo Foundation: COMPLETE.** Introduced Turbo (`turbo@2.10.12`) + npm workspaces as the orchestration layer, promoting the existing NestJS API to the `@amealio/api` workspace (`apps/api`). **Prisma kept at root** (no move); P1.5 schema/migrations **unchanged**. Root commands delegate to Turbo (`build`/`test`/`lint`) with a repo-wide `format:check`; test task is uncached (DB-dependent). Docs: [architecture/23-TURBOREPO-MONOREPO.md](./architecture/23-TURBOREPO-MONOREPO.md). Validation: build ✓, lint ✓, format:check ✓, **54/54 tests**, API starts + `/api/v1/health` ok, `db:validate` 11/11, `migrate status` up to date — no regression to P1.5/P1.6/P1.7.1.

- **P1.7.1A — Authentication Architecture & Migration Decision: COMPLETE.** Decision/architecture only (no auth implemented). Re-confirmed consumer/merchant/admin auth from source; produced the authentication behavior matrix, legacy-quirk classification, and the recommended target (**Option C — unified canonical Identity with distinct principals**: consumer `User` + staff `StaffMember`), plus target token/session + authorization design, the **merchant/admin boundary**, future user-migration + cutover strategies, PostgreSQL impact, and an owner-decision register. Docs: [domains/24-AUTHENTICATION-ARCHITECTURE.md](./domains/24-AUTHENTICATION-ARCHITECTURE.md). **OD-11 confirmed irrelevant to auth.** Consumer auth is schema-sufficient; **staff/admin auth requires future schema additions (AUTH-D8, reviewed migration)**. Validation: build/lint/format ✓, 54/54 tests, Prisma schema/migrations unchanged.

- **P1.7.1B — Consumer Authentication: COMPLETE** (local/dev only; no cutover). Implemented consumer password authentication on the target platform (`apps/api/src/modules/identity/authentication/`): register/login/refresh/logout/me, **Bearer access JWT** + **rotating server-side refresh sessions** (sha256-hashed, revocable, **replay-detected**), a **JWT consumer guard**, and blocked-status enforcement — reusing the P1.5 `User`+`Session` (**no schema change**). Feature-flagged (`CONSUMER_AUTH_ENABLED`); legacy raw-header rejected; legacy apps untouched. Deferred: OTP/phone-only/social/WhatsApp/reset/verification and staff/admin/merchant auth. Docs: [domains/25-CONSUMER-AUTHENTICATION.md](./domains/25-CONSUMER-AUTHENTICATION.md). Validation: build/lint/format ✓, **75/75 tests** (54 prior + 21 new), live smoke ✓ (register→login→me→refresh-rotate→replay-401→logout→refresh-401), Prisma schema/migrations unchanged.

- **P1.7.1C — Staff/Admin Authentication & Identity Schema Design: COMPLETE** (design/analysis only — **nothing implemented**). Resolved **AUTH-D8** as an implementation-ready design and settled the remaining staff/admin identity questions. Re-inspected the legacy `VendorUser`/`role-management`/`admin-auth` (bcrypt; admin logs in via `userId`; admin token minted with the **consumer** `authentication` secret — a defect to drop; stateless JWT, no refresh rotation; deep boolean permission trees; act-as exists) and the target models. **Recommended target:** SUPER_ADMIN = `StaffMember` with **nullable `merchantId`**; **separate `StaffCredential`** (one `PASSWORD` row now; extensible) and **separate `StaffSession`** (rotating hashed refresh — leaves consumer `Session`/P1.7.1B untouched); `status StaffAccountStatus{ACTIVE,BLOCKED}` + `deletedAt`; RBAC on the **existing** `Role`/`RolePermission`; act-as-merchant deferred but modelled as explicit/audited (`StaffSession.actAsMerchantId` + existing `AuditLog`). Future Prisma delta (NOT applied): +2 models, +2 enums, 3 `StaffMember` modifications — all additive/reversible. Docs: [domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md](./domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md). **AUTH-D8 design-complete pending owner schema sign-off; AUTH-D4/D5/D6/D7/D9 remain owner decisions (recommendations recorded).** Validation: build/lint/format ✓, 75/75 tests, **`prisma/schema.prisma` + migrations unchanged**, no application/frontend/data changes.

- **P1.7.1D — Staff/Admin Identity PostgreSQL Schema: COMPLETE** (schema only — **no authentication implemented**). Implemented the AUTH-D8 schema foundation from doc 26 in one additive migration `20260902010630_p1_7_1d_staff_admin_identity`: **modified `StaffMember`** (`merchantId` → nullable so NULL = SUPER_ADMIN; added `status StaffAccountStatus{ACTIVE,BLOCKED}`, `legacyId @unique`, `@@index([status])`; FK → `Merchant` set to `onDelete: Restrict`), **added `StaffCredential`** (`secretHash`, `type StaffCredentialType{PASSWORD}`, unique `(staffMemberId,type)`) and **added `StaffSession`** (hashed `refreshTokenHash @unique`, `expiresAt`, indexes) — leaving the consumer `Session`/P1.7.1B **untouched**; reused existing `Role`/`RolePermission`. Login-identifier (email/phone) uniqueness intentionally **not** constrained (**O1 open**); act-as `actAsMerchantId` **not** added (deferred). No staff/admin login/JWT/refresh/logout/guards/RBAC/act-as, no data migration, no MongoDB/frontend/source changes. Docs: [domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md](./domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md) §24. Validation: build/lint/format ✓, **85/85 tests** (75 prior + 10 new schema tests), `prisma validate` ✓, `migrate status` up to date (dev + test), P1.5 migrations unmodified.

- **P1.7.1E — Staff/Admin Authentication: COMPLETE** (local/dev only; no cutover). Implemented password-based staff/admin authentication in `apps/api/src/modules/identity/staff-authentication/`: login/refresh/logout/`me`, **Bearer access JWT** (dedicated `STAFF_JWT_ACCESS_SECRET` + `aud=amealio-staff`, minimal claims incl. `actorType`/`staffRole`/server-derived `mid`) and **rotating server-side `StaffSession` refresh** (sha256-hashed, constant-time compare, **replay-detected + revocable**), a **`JwtStaffGuard`** that re-checks status per request, and **blocked (403)/deleted (401)** enforcement at login/refresh/guard. SUPER_ADMIN recognized as `StaffMember` with `merchantId=NULL`; merchant scope server-derived (never from request input). **Mandatory preflight:** `StaffSession` supports rotation/revocation/replay/logout via row-delete — **no schema change** (Prisma untouched). Feature-flagged (`STAFF_AUTH_ENABLED`); legacy raw-header/consumer-secret/stateless behavior rejected; consumer auth (P1.7.1B) untouched. **No** RBAC/permission enforcement, act-as, OTP/social/reset, or VendorUser/admin **data migration**. Docs: [domains/27-STAFF-ADMIN-AUTHENTICATION.md](./domains/27-STAFF-ADMIN-AUTHENTICATION.md). Validation: build/lint/format ✓, **119/119 tests** (85 prior + 34 new), live smoke ✓ (login→me→refresh-rotate→replay-401→logout→refresh-401, cross-guard 401), `prisma validate` ✓, `migrate status` up to date, **schema/migrations unchanged**.

- **P1.7.1F — Staff/Admin RBAC / Authorization Foundation: COMPLETE** (local/dev; foundation only). Implemented the reusable staff/admin **authorization** layer in `apps/api/src/modules/identity/staff-authentication/authorization/`: a **`StaffAuthorizationGuard`** that composes after `JwtStaffGuard`, plus decorators **`@RequireStaffRoles`** (ANY), **`@RequireStaffPermissions`** (ALL, enforced against the existing `Role`/`RolePermission` via `StaffPermissionRepository`, deny-by-default), **`@PlatformOnly`** (SUPER_ADMIN), and **`@MerchantScoped`** (merchant staff confined to server-derived `StaffPrincipal.merchantId`; request-supplied merchant id rejected, never trusted). **401** (no principal) vs **403** (authenticated-but-unauthorized); SUPER_ADMIN = platform superuser (bypasses gates, not merchant-restricted). **No token-claim change** (permissions read per-request from DB), **no Prisma change**, **no act-as**, **no legacy permission-catalogue migration** (AUTH-D6 pending), **no frontend/domain authorization**. Docs: [domains/28-STAFF-ADMIN-AUTHORIZATION.md](./domains/28-STAFF-ADMIN-AUTHORIZATION.md). Validation: build/lint/format ✓, **139/139 tests** (119 prior + 20 new: 12 unit + 8 e2e), `prisma validate` ✓, `migrate status` up to date, **schema/migrations unchanged**; P1.7.1E tests unchanged and green.

## Current activity

- **P1.7.1F complete.** Staff/admin authentication (P1.7.1E) + authorization foundation (P1.7.1F) are in place (local/dev, flagged). The reusable guard/decorators are ready for future domain controllers to enforce role/permission/merchant scope. **Overall migration is NOT complete** — the legacy permission catalogue (AUTH-D6), act-as/impersonation, staff registration/OTP/social/MFA/reset, and all business domains remain pending; **O1** and AUTH-D4/D6/D7 remain owner decisions. **No business-domain migration started.** Prior context: **P1.7.1E complete** — staff/admin password authentication works and is validated (local/dev, flagged). **Overall authentication migration is NOT complete** — **RBAC/permission enforcement (P1.7.1F)**, act-as-merchant, staff registration/OTP/social/MFA/reset, and cutover remain pending; **O1** (login-identifier uniqueness) and AUTH-D4/D6/D7 remain owner decisions. **No domain migration started.** Merchant/Location still awaits AUTH-D2 confirmation; OD-11 and owner-decision domains remain blocked.

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
