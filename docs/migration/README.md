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
| [domains/27-STAFF-ADMIN-AUTHENTICATION.md](./domains/27-STAFF-ADMIN-AUTHENTICATION.md) | P1.7.1E: **Staff/admin authentication (implemented, local/dev only)** — login/refresh/logout/`me` on `StaffMember`+`StaffCredential`+`StaffSession`; dedicated-secret Bearer access JWT + rotating hashed refresh with replay detection + revocation; `JwtStaffGuard` (per-request status re-check); blocked/deleted enforcement; server-derived merchant scope; SUPER_ADMIN = `merchantId NULL`. No schema change; RBAC/act-as/OTP/social/reset and legacy data migration deferred; no cutover. |
| [domains/28-STAFF-ADMIN-AUTHORIZATION.md](./domains/28-STAFF-ADMIN-AUTHORIZATION.md) | P1.7.1F: **Staff/admin RBAC/authorization foundation (implemented, local/dev only)** — `StaffAuthorizationGuard` composing after `JwtStaffGuard`; decorators `@RequireStaffRoles`/`@RequireStaffPermissions`/`@PlatformOnly`/`@MerchantScoped`; permission enforcement on existing `Role`/`RolePermission` (deny-by-default); server-derived merchant tenant scope (request override rejected); SUPER_ADMIN platform superuser; 401 vs 403. No schema/token-claim change; legacy permission-catalogue migration + act-as deferred. |
| [domains/29-MERCHANT-LOCATION-FOUNDATION.md](./domains/29-MERCHANT-LOCATION-FOUNDATION.md) | P1.7.2: **Merchant & Location foundation (implemented; no schema change)** — grounds the existing `Merchant` (tenant) + `Restaurant` (location) tables in current-state source (legacy has no `Merchant`; owner=`VendorUser` via `restaurant.vendor_id`); **Merchant 1→N Restaurant**; adds `apps/api/src/modules/merchant/` (read repositories + `MerchantScopeService` data-aware tenancy). Subscription `config Json?` boundary preserved (not flattened); legacy→Merchant import grouping + subscription modeling deferred. |
| [domains/30-SUBSCRIPTION-CONFIGURATION-FOUNDATION.md](./domains/30-SUBSCRIPTION-CONFIGURATION-FOUNDATION.md) | P1.7.3: **Merchant subscription & configuration foundation (implemented; no schema change)** — reuses `Subscription{merchantId, config Json?}`; adds `apps/api/src/modules/subscription/` (read repository + safe **unknown-preserving** `SubscriptionConfigService` + `SubscriptionService` P1.7.1F merchant tenancy). Config classified CONFIRMED/PARTIAL/UNKNOWN/DEAD; **`table_setup` preserved + documented, NOT normalized**; no billing, no flattening, no feature-flag platform. |
| [domains/31-PLATFORM-FOUNDATIONAL-DATA.md](./domains/31-PLATFORM-FOUNDATIONAL-DATA.md) | P1.7.4: **Platform foundational data / taxonomy (implemented; minimal additive schema)** — admin-defined `Category` (hierarchical = legacy Category + Sub Category) + `Cuisine`, **merchant-selected, user-consumed**; **icons embedded** (no Icon table). Extended `Category`/`Cuisine` with `legacyId` + icon/media + `status`; adds read-only `apps/api/src/modules/reference-data/`. Owner/source matrix + Mood/Craving/cuisine-dedup/Experience-Event taxonomy deferred as owner decisions. |
| [domains/34-SUPERADMIN-PLATFORM-FOUNDATION-RECONCILIATION.md](./domains/34-SUPERADMIN-PLATFORM-FOUNDATION-RECONCILIATION.md) | P1.7.6A: **Super Admin platform foundation reconciliation (discovery only)** — audits geography/currency/category-families/assets/item-catalog/experience-catalog + onboarding/subscription/item/profile/discovery deps. Findings: `currency` table + `media-catalogue` MISSING; no platform Item/Experience Catalog; P1.7.4 PARTIAL-by-design; recommends non-blocking **Currency (+ optional Geography)** reference next. Ownership + dependency matrices, foundation graph. No code. |
| [domains/33-MENU-CATALOG-FOUNDATION.md](./domains/33-MENU-CATALOG-FOUNDATION.md) | P1.7.5: **Menu & Catalog read foundation (implemented; no schema change)** — merchant-owned `Menu → MenuSection(→optional Category) → MenuItem → ItemVariant` + `ItemChannelConfig`/`AddOns`; adds `apps/api/src/modules/catalog/` (`MenuRepository`/`MenuItemRepository` + `CatalogService` merchant tenancy). Exact BigInt money, availability + soft-delete filtering, legacyId lookup; no CRUD/ordering/POS/discovery. |
| [domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md](./domains/26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md) | P1.7.1C (design, §§1–23) + **P1.7.1D (schema implemented, §24)**: **Staff/admin identity**. Resolves **AUTH-D8** then implements the schema — `StaffMember` (nullable `merchantId` ⇒ SUPER_ADMIN, `StaffAccountStatus`, `legacyId`), new `StaffCredential` (`StaffCredentialType{PASSWORD}`) + `StaffSession` (hashed rotating-refresh boundary, separate from consumer `Session`), reusing existing `Role`/`RolePermission`. Migration `…_p1_7_1d_staff_admin_identity`; 10 schema tests; **authentication deferred** (no login/JWT/refresh/RBAC/act-as, no data migration). |

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
