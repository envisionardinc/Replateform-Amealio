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
