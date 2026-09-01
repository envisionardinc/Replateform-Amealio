# Decision Log

Architectural and process decisions for the Amealio replatforming. Append new entries; do not rewrite history. Each entry has a status:

- **Accepted** — agreed and in force.
- **Accepted (direction)** — agreed as the intended direction; detailed design still under review.
- **Proposed** — recorded for review; **not** yet approved. Do not implement against a Proposed decision.
- **Superseded** — replaced by a later decision (link it).

> Any change to database architecture, tenancy, localization, or the migration approach **must** be recorded here with rationale before implementation (see `../../AGENTS.md`).

---

## Process decisions

### D-001 — Controlled, incremental replatforming
- **Status:** Accepted
- **Context:** The platform is a large, live India system across multiple repositories. A big-bang rewrite is high-risk.
- **Decision:** Replatform incrementally: establish baseline → validate → introduce capabilities in small, reviewable increments. No big-bang rewrite; no wholesale copying of reference code.
- **Consequences:** Slower but safer; every increment must preserve business behavior or carry an approved change.

### D-002 — Reference repositories are read-only
- **Status:** Accepted
- **Context:** Reference repos represent current production behavior and must remain authoritative.
- **Decision:** `amealio-platform` (this repo) is the only writable target. Reference repos are analyzed, never modified. No reference functionality is deleted without explicit approval.
- **Consequences:** Migration is copy-forward-by-design, not in-place editing.

### D-003 — No production systems or credentials
- **Status:** Accepted
- **Decision:** Never touch production systems; never use production credentials. Use local/dev/test values only. Committed secrets found in reference repos must be rotated (security workstream, blocker B3), never reused.

### D-010 — Governance artifacts are the source of truth
- **Status:** Accepted
- **Decision:** `MIGRATION_STATUS.md` tracks phase/activity/blockers; `DECISIONS.md` records decisions. Both are updated as part of every increment that changes status or makes a decision.

---

## Architecture decisions (from Phase 0 design — see `docs/architecture/`)

### D-003a — PostgreSQL as system of record
- **Status:** Accepted (direction)
- **Context:** Current system of record is MongoDB (Mongoose) in the Feathers monolith; a single Postgres table exists in the Nest tracking service.
- **Decision:** Target system of record is **PostgreSQL**. The canonical domain is modeled deliberately, **not** by mechanically translating MongoDB collections to tables.
- **Rationale:** Strong relational integrity, transactional financial correctness, and normalized reporting; most core data is relational (see `docs/migration/04-database-inventory.md`).
- **Consequences:** JSONB reserved for genuinely document-shaped data. Detailed schema is **pending review** before any `prisma/schema.prisma` or migrations exist.

### D-004 — Prisma as the schema/ORM layer
- **Status:** Accepted (direction)
- **Decision:** Use **Prisma** for schema definition and data access.
- **Consequences:** Schema/migrations are created only after the domain-model design is reviewed and accepted.

### D-005 — India-first; market differences as configuration
- **Status:** Accepted (direction)
- **Decision:** Initial implementation supports **India (`IN`) only**. Market/locale variance is expressed as configuration/data, not branching code or per-market schemas. No US-specific behavior (e.g. Stripe) is introduced now.
- **Rationale:** Legacy shows multi-market intent but no working US implementation; scoping to India reduces risk. See `docs/architecture/localization-strategy.md`.

### D-006 — Separate `admin` and `merchant` target applications
- **Status:** Proposed
- **Context:** Today `amealiodashboardmvp-` serves both admin and merchant via hostname/portal header in one CRA app.
- **Decision (proposed):** Split into distinct `apps/admin` and `apps/merchant` in the target.
- **Open question:** Confirm the split is desired vs a single portal. **`UNKNOWN — REQUIRES REVIEW`.**

### D-007 — ONDC as a separate bounded context
- **Status:** Proposed
- **Context:** ONDC is a large, protocol-bound surface (15 models, 30+ endpoints, its own settlement/reconciliation).
- **Decision (proposed):** Model ONDC as a separate bounded context/service, integrated last.
- **Open question:** Confirm separation vs in-core module. **`UNKNOWN — REQUIRES REVIEW`.**

### D-008 — Monorepo (Turborepo) with NestJS API + Next.js apps
- **Status:** Proposed
- **Decision (proposed):** Target layout is a Turborepo monorepo: `apps/{api(NestJS),admin,merchant,web(Next.js)}` + shared `packages/*` + `prisma/`. See `docs/architecture/target-repository-structure.md`.
- **Open question:** Confirm framework/toolchain choices before scaffolding.

### D-009 — Scaffold monorepo skeleton as first Phase-2 increment
- **Status:** Proposed
- **Decision (proposed):** Once Phase 0 design is approved and the India baseline source is designated, scaffold the empty monorepo structure (no application logic) as the first controlled increment.
- **Depends on:** B1 (baseline source), B4 (design approval).

---

## Decisions still required (tracked, not yet made)

| Ref | Question |
|-----|----------|
| B1 | Which repository/repositories are the **designated India baseline source** for Phase 2? |
| B2 | Confirmed integer↔enum mappings (order/payment status/method, transaction types). |
| — | Whether RBAC permissions are relational rows or JSONB. |
| — | Experience vs Event vs Ticketing boundaries. |
| — | Whether the Nest delivery-tracking service folds into `apps/api` or remains a satellite. |
| — | Whether the target retains any denormalized read models (e.g. `restaurantCard`) as materialized views. |

New decisions should be appended below with the next available `D-0xx` id.
