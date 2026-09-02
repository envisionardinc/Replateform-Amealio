# Amealio Migration Hub

Home for the controlled replatforming of Amealio: discovery inventory, target-design references, and the live governance artifacts (**status** and **decisions**).

> Guardrails (see [`../../AGENTS.md`](../../AGENTS.md)): controlled and incremental; no big-bang rewrites; reference repositories are read-only; preserve business behavior unless a change is approved; document decisions. Where source was ambiguous, discovery items are marked **`UNKNOWN — REQUIRES REVIEW`**.

## Governance (live)

| Document | Purpose |
|----------|---------|
| [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) | Single source of truth: current phase, activities, blockers, sources, target, migrated capabilities |
| [DECISIONS.md](./DECISIONS.md) | Architectural & process decision log |
| [REPOSITORY_LANDSCAPE.md](./REPOSITORY_LANDSCAPE.md) | P0.2: inventory & classification of all repositories + India-baseline comparison |
| [SOURCE_REPOSITORIES.md](./SOURCE_REPOSITORIES.md) | Read-only source repositories reference |
| [india-baseline/BASELINE_SOURCE_DECISION.md](./india-baseline/BASELINE_SOURCE_DECISION.md) | P0.3: India baseline source set (APPROVED, D-011) |
| [india-baseline/](./india-baseline/) (`01`–`13`) | P1.1: deep India baseline system analysis (overview, relationships, frontend, API, data model, domains, rules, integrations, realtime, auth, workflows, gaps, migration implications) |
| [india-baseline/](./india-baseline/) (`14`–`16`) | P1.2: capability matrix, baseline acceptance criteria + Definition of Done, end-to-end baseline journeys |
| [india-baseline/17-TARGET-MIGRATION-MAP.md](./india-baseline/17-TARGET-MIGRATION-MAP.md) + [target-architecture/](./target-architecture/) (`01`–`12`) | P1.3: target migration map — architecture options, domain boundaries, source→target/data/API/frontend/auth/integration/realtime maps, migration sequence, owner-decisions, risks |
| [database/](./database/) (`01`–`18`) | P1.4: target PostgreSQL **data model design** — domain model, entity mapping, identifiers, relationships, enum/OD-11 strategy, money, order/payment/reservation/notification models, audit/soft-delete, ownership, indexing, migration complexity, integrity rules, extension seams, ERD, decisions (design only, no schema) |
| [database/19-DEVELOPMENT-DATABASE.md](./database/19-DEVELOPMENT-DATABASE.md) + [database/20-SCHEMA-IMPLEMENTATION.md](./database/20-SCHEMA-IMPLEMENTATION.md) | P1.5: **PostgreSQL development foundation** — local DB (Docker/local), Prisma migrations implementing the P1.4 baseline model, seed, and validation suite (implementation; no data migration) |
| [application/21-NESTJS-FOUNDATION.md](./application/21-NESTJS-FOUNDATION.md) | P1.6: **NestJS application foundation** — `apps/api` modular monolith on the P1.5 DB (config, Prisma integration, health, logging, error handling, request-id, domain-event + provider-port conventions, security seams, Jest tests). No business domains/integrations/auth. |
| [domains/22-IDENTITY-ANALYSIS.md](./domains/22-IDENTITY-ANALYSIS.md) | P1.7.1: **Identity** — baseline auth analysis (consumer/merchant/admin, file-cited) + minimal evidence-backed foundation (consumer user management, bcrypt hasher, role-based authorization infra). No token/OTP/social auth, no data migration, no schema change. |
| [architecture/23-TURBOREPO-MONOREPO.md](./architecture/23-TURBOREPO-MONOREPO.md) | P1.6.1: **TurboRepo monorepo foundation** — Turbo + npm workspaces orchestrating `apps/api`; Prisma kept at root; root↔app commands, task pipeline, caching, future-frontend placement. Workspace/architecture only (no domain/data/schema change). |
| [domains/24-AUTHENTICATION-ARCHITECTURE.md](./domains/24-AUTHENTICATION-ARCHITECTURE.md) | P1.7.1A: **Authentication architecture & migration decision** — behavior matrix (consumer/merchant/admin), legacy-quirk classification, recommended target (Option C: unified identity, distinct principals), token/session + authorization design, merchant/admin boundary, user-migration + cutover strategy, PG impact, owner-decision register. Decision only — no auth implemented. |
| [domains/25-CONSUMER-AUTHENTICATION.md](./domains/25-CONSUMER-AUTHENTICATION.md) | P1.7.1B: **Consumer authentication (implemented, local/dev only)** — register/login/refresh/logout/me on `User`+`Session`; Bearer access JWT + rotating hashed refresh sessions with replay detection + revocation; JWT guard; blocked-status enforcement. No schema change; OTP/social/staff-auth deferred; no cutover. |
| [domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md](./domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md) | P1.7.1C: **Staff/admin authentication & identity schema design (design/analysis only)** — resolves **AUTH-D8**: legacy vendor/admin evidence + classification; target `StaffMember` (nullable `merchantId` ⇒ SUPER_ADMIN), separate `StaffCredential` + `StaffSession`, `StaffAccountStatus`, RBAC on existing `Role`/`RolePermission`, audited act-as (deferred); password/JWT migration strategy; conceptual PostgreSQL schema + precise Prisma impact; implementation sequence + test strategy. **Nothing implemented — Prisma schema/migrations unchanged.** |

## Phase model

| Phase | Description | State |
|-------|-------------|-------|
| 0 | Discovery & architecture design | Completed (in review) |
| 1 | Target repository baseline & governance | **Current** |
| 2 | Restore India baseline | Next |
| 3 | Baseline validation | Pending |
| 4 | Progressive capability introduction | Pending |

Details and the recommended sequence live in [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) and [10-migration-risks.md](./10-migration-risks.md).

## Discovery inventory (Phase 0)

| # | Document | Contents |
|---|----------|----------|
| 01 | [reference-inventory](./01-reference-inventory.md) | Reference repositories, roles, stacks, interaction map |
| 02 | [domain-inventory](./02-domain-inventory.md) | The 17 business domains and their entities/features |
| 03 | [api-inventory](./03-api-inventory.md) | REST + Socket.IO surface (services, methods, realtime events) |
| 04 | [database-inventory](./04-database-inventory.md) | MongoDB usage today; business entities and relationships (no PostgreSQL conversion) |
| 05 | [business-rules](./05-business-rules.md) | Business rules and validation encoded in the backend |
| 06 | [integrations](./06-integrations.md) | External services, payments, delivery, notifications, storage |
| 07 | [authentication-authorization](./07-authentication-authorization.md) | Identity, auth strategies, roles, permissions |
| 08 | [workflows](./08-workflows.md) | Ordering, seating, experience, settlement, delivery lifecycles |
| 09 | [design-system-inventory](./09-design-system-inventory.md) | UI stacks, tokens, shared components across the frontends |
| 10 | [migration-risks](./10-migration-risks.md) | Risks, unknowns, and the recommended migration order |

## Target design references (Phase 0 output — pending review)

| Document | Purpose |
|----------|---------|
| [../architecture/target-repository-structure.md](../architecture/target-repository-structure.md) | Approved monorepo + API module layout |
| [../architecture/postgresql-domain-model.md](../architecture/postgresql-domain-model.md) | Canonical PostgreSQL/Prisma domain model |
| [../architecture/entity-relationship-model.md](../architecture/entity-relationship-model.md) | ERD, cardinalities, referential integrity |
| [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) | Merchant/restaurant tenancy model |
| [../architecture/localization-strategy.md](../architecture/localization-strategy.md) | India-first market/localization strategy |

## How discovery was produced

Static, read-only analysis of the reference repositories only. No production databases or credentials were accessed. Env-driven enum values, deployment URL prefixes, and unseen external services could not be resolved from source and are flagged for review.
