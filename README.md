# Amealio Platform (Target)

This repository is the **new target platform** for the controlled replatforming of Amealio. It will progressively become the canonical Amealio codebase and the home of its living architecture documentation.

> **Current status:** Baseline & governance phase. This repository currently contains **documentation only** — no application code, database schema, or scaffolded apps yet. Nothing here should be read as an implemented system.

## Objective

A **controlled, incremental** replatforming — not a rewrite from scratch, and not a wholesale copy of the existing systems:

1. Establish a clean, stable target repository.
2. Restore the India baseline from the designated India/reference source.
3. Validate that baseline.
4. Only then, progressively introduce selected capabilities from other repositories.
5. Preserve existing business behavior unless a change is explicitly approved.
6. Avoid big-bang rewrites.

See [`AGENTS.md`](./AGENTS.md) for the full engineering rules that govern all work here.

## Where we are

Track the live state in [`docs/migration/MIGRATION_STATUS.md`](./docs/migration/MIGRATION_STATUS.md).

| Phase | Description | State |
|-------|-------------|-------|
| 0 | Discovery & architecture design | Completed (in review) |
| 1 | **Target repository baseline & governance** | **Current** |
| 2 | Restore India baseline | Next |
| 3 | Baseline validation | Pending |
| 4 | Progressive capability introduction | Pending |

## Documentation

| Area | Location |
|------|----------|
| Migration hub (index) | [`docs/migration/README.md`](./docs/migration/README.md) |
| Migration status tracker | [`docs/migration/MIGRATION_STATUS.md`](./docs/migration/MIGRATION_STATUS.md) |
| Decision log | [`docs/migration/DECISIONS.md`](./docs/migration/DECISIONS.md) |
| Discovery inventory (01–10) | [`docs/migration/`](./docs/migration/) |
| Target architecture design | [`docs/architecture/`](./docs/architecture/) |
| Original replatforming scope | [`docs/discovery/REPLATFORMING_SCOPE.md`](./docs/discovery/REPLATFORMING_SCOPE.md) |

## Target architecture (planned — pending review)

- **Monorepo** (Turborepo): `apps/{api,admin,merchant,web}` + shared `packages/*` + `prisma/`.
- **Backend:** NestJS (`apps/api`), replacing the current Feathers monolith.
- **Frontends:** Next.js (consumer / admin / merchant).
- **Datastore:** PostgreSQL (system of record) with **Prisma**.
- **Market:** **India-first**; market differences handled as configuration, not code forks.

Details: [`docs/architecture/target-repository-structure.md`](./docs/architecture/target-repository-structure.md).

## Reference systems (read-only)

The existing India platform is analyzed — never modified — from these repositories: `amealio-vendordashboard` (backend), `amealio_web_app` (consumer), `amealiodashboardmvp-` (admin + merchant), `amealio-nestjs-backend` (delivery tracking), `amealio-self-delivery-app` (delivery-boy). See [`docs/migration/01-reference-inventory.md`](./docs/migration/01-reference-inventory.md).

## Contributing

All work follows the rules in [`AGENTS.md`](./AGENTS.md): analyze before implementing, work in small reviewable increments, preserve business behavior, document decisions, and never touch production systems or credentials.
