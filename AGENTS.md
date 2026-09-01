# AGENTS.md — Engineering Rules for the Amealio Target Platform

This repository is the **new target platform** for the controlled replatforming of Amealio. This file is the operating manual for any human or AI agent working here. Read it before making changes.

> Current state: **documentation only.** There is no application code, database schema, or scaffolded monorepo yet. Do not assume any app, module, package, or Prisma schema exists.

## 1. Mission & guiding objectives

We are performing a **controlled, incremental replatforming** — not a rewrite from scratch and not a wholesale copy of the reference systems.

1. Establish a clean, stable target repository.
2. Restore the India baseline from the designated India/reference source.
3. Validate that baseline before extending it.
4. Only after the baseline is stable, progressively introduce selected capabilities from other repositories.
5. Preserve existing business behavior unless a change is explicitly approved and recorded in `docs/migration/DECISIONS.md`.
6. Avoid big-bang rewrites.

## 2. Hard rules (do not violate)

- **Never modify production systems.**
- **Never use production credentials.** Use local/dev/test values only.
- **Never delete or disable reference functionality without explicit approval.**
- **Never perform a large, uncontrolled rewrite.** Work in small, reviewable increments.
- **Never copy code wholesale** from a reference repository. Analyze intent, then adapt deliberately.
- **The reference repositories are READ-ONLY.** This repo (`amealio-platform`) is the only one you may modify.
- **Never change the database architecture without documenting why** in `docs/migration/DECISIONS.md`.
- **Do not introduce unnecessary dependencies.** Justify every new dependency; prefer the platform's chosen stack.
- **Do not proceed to application implementation** unless the current task explicitly authorizes it.

## 3. Working method

1. **Analyze before implementing.** Consult `docs/migration/` (discovery) and `docs/architecture/` (target design) first.
2. **Small, reviewable increments.** One logical change per commit; keep PRs focused.
3. **Preserve business behavior.** If a migration would change behavior, stop and record a decision for approval.
4. **Test after implementing.** Run the appropriate lint/type/test/build for whatever you changed (documentation changes require only sanity review). Prefer failing-but-honest results over skipping validation.
5. **Document decisions.** Any architectural or process decision goes in `docs/migration/DECISIONS.md`; update `docs/migration/MIGRATION_STATUS.md` as phases/activities change.
6. **Preserve Git history.** Do not force-push or rewrite shared history; make meaningful, descriptive commits.

## 4. Reference repositories (READ-ONLY sources)

The current Amealio India platform lives in these repositories. They are inputs for discovery and controlled migration — **never modified from here**.

| Logical role | Repository | Stack |
|--------------|------------|-------|
| Platform backend (India) | `amealio-vendordashboard` (pkg `envisionapp`) | FeathersJS + MongoDB |
| Consumer web | `amealio_web_app` | CRA / React 18 |
| Admin console | `amealiodashboardmvp-` | CRA / React 16 |
| Merchant dashboard | `amealiodashboardmvp-` (same repo, portal by hostname) | CRA / React 16 |
| Delivery tracking API | `amealio-nestjs-backend` | NestJS + PostgreSQL |
| Delivery-boy app | `amealio-self-delivery-app` | Next.js |

Full analysis: `docs/migration/01-reference-inventory.md`.

## 5. Target architecture (planned — see design docs)

The agreed target (for review; **not yet scaffolded**):

- **Monorepo** (Turborepo): `apps/{api,admin,merchant,web}`, `packages/{ui,design-system,types,validation,auth,config,localization,utils}`, `prisma/`, `docs/`.
- **Backend:** NestJS (`apps/api`) replacing the Feathers monolith.
- **Frontends:** Next.js for consumer/admin/merchant.
- **Datastore:** PostgreSQL as system of record, **Prisma** as the schema/ORM layer.
- **Market:** **India-first (`IN` only)**; market differences are configuration, not code forks. No US-specific behavior until approved.

Design detail: `docs/architecture/` (`target-repository-structure.md`, `postgresql-domain-model.md`, `entity-relationship-model.md`, `multi-tenancy.md`, `localization-strategy.md`). These are **proposals pending review** unless marked accepted in `DECISIONS.md`.

## 6. Database architecture policy

- Target system of record is **PostgreSQL** via **Prisma** (accepted direction; see `DECISIONS.md`).
- **Do not** mechanically translate MongoDB collections to tables — model the canonical domain (see `docs/architecture/postgresql-domain-model.md`).
- Any change to the datastore choice, schema strategy, or tenancy/localization model **must** be recorded as a decision with rationale before implementation.
- No `prisma/schema.prisma` or migrations until the domain model design is reviewed and accepted.

## 7. Git & PR conventions

- Branch from the current base; name branches `cursor/<short-description>-<suffix>`.
- Conventional, meaningful commit messages (e.g. `docs(migration): ...`, `chore: ...`); one logical change per commit.
- Open focused PRs; keep them draft until validated. Do not merge without review/approval.
- Never force-push shared branches or amend published commits.

## 8. Where things live

| Path | Purpose |
|------|---------|
| `docs/migration/` | Discovery inventory (01–10), migration hub, **status tracker**, **decision log** |
| `docs/architecture/` | Target design (PostgreSQL model, ERD, multi-tenancy, localization, repo structure) |
| `docs/discovery/` | Original replatforming scope |
| `README.md` | Project overview & current status |
| `docs/migration/MIGRATION_STATUS.md` | Single source of truth for phase/activity/blockers |
| `docs/migration/DECISIONS.md` | Architectural & process decisions |

## 9. Definition of done (per increment)

- Change is small and reviewable, and aligned with the current phase.
- Business behavior preserved (or a change is approved in `DECISIONS.md`).
- Appropriate validation run (lint/type/test/build for code; sanity review for docs).
- `MIGRATION_STATUS.md` updated if phase/activity/blockers changed; new decisions recorded.
- Clear commit(s) and a focused PR.
