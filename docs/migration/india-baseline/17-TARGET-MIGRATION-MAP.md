# 17 — Target Migration Map (India Baseline)

**Task:** P1.3 — how the approved India baseline (`amealio-vendordashboard`, `amealio_web_app`, `amealiodashboardmvp-`) is replatformed. **Design / mapping only** — no code, no PostgreSQL schema, no data migration, no production/source changes, no deferred repos, no owner-decisions resolved.

This is the index/summary; the full map lives in [`docs/migration/target-architecture/`](../target-architecture/).

## Documents

| Doc | Contents |
|-----|----------|
| [01-TARGET-ARCHITECTURE-OPTIONS](../target-architecture/01-TARGET-ARCHITECTURE-OPTIONS.md) | 3 options; **recommend Option C** (modular monolith + service-extraction seams) |
| [02-DOMAIN-BOUNDARIES](../target-architecture/02-DOMAIN-BOUNDARIES.md) | Target domains classified CORE/OPTIONAL/PARTIAL/DEFERRED/UNKNOWN/NOT-BASELINE |
| [03-SOURCE-TARGET-MAPPING](../target-architecture/03-SOURCE-TARGET-MAPPING.md) | Per-REQUIRED-capability mapping + approach (REUSE/ADAPT/REFACTOR/REIMPLEMENT/REPLACE/DEPRECATE) |
| [04-DATA-MIGRATION-MAP](../target-architecture/04-DATA-MIGRATION-MAP.md) | Conceptual legacy→business→domain→persistence (no schema) |
| [05-API-MIGRATION-MAP](../target-architecture/05-API-MIGRATION-MAP.md) | Legacy→target APIs; retain-temp/adapt/replace/deprecate |
| [06-FRONTEND-MIGRATION-MAP](../target-architecture/06-FRONTEND-MIGRATION-MAP.md) | Consumer refactor→Next.js; admin/merchant reimplement + split |
| [07-AUTH-MIGRATION-MAP](../target-architecture/07-AUTH-MIGRATION-MAP.md) | Unified identity + claims (no auth change now) |
| [08-INTEGRATION-MIGRATION-MAP](../target-architecture/08-INTEGRATION-MIGRATION-MAP.md) | Baseline vs deferred integrations; provider ports |
| [09-REALTIME-ASYNC-MIGRATION-MAP](../target-architecture/09-REALTIME-ASYNC-MIGRATION-MAP.md) | Gateway, jobs, webhooks, queue |
| [10-MIGRATION-SEQUENCE](../target-architecture/10-MIGRATION-SEQUENCE.md) | Domain-by-domain phases A–I + extension points |
| [11-OWNER-DECISIONS](../target-architecture/11-OWNER-DECISIONS.md) | Unknowns carried forward (not resolved) |
| [12-MIGRATION-RISKS](../target-architecture/12-MIGRATION-RISKS.md) | P0/P1/P2 risks |

## Executive summary

- **Architecture:** recommend a **modular monolith (NestJS `apps/api`) with clean service-extraction seams**, PostgreSQL/Prisma, Next.js `web`/`admin`/`merchant`, shared `packages/*` — restores the single-backend baseline fastest with lowest risk while allowing deferred/feature repos to attach later without restructuring.
- **Approach:** stack change (Feathers/Mongo → NestJS/Postgres) means backend REQUIRED capabilities are **REIMPLEMENT** (behavior-preserving), integrations **ADAPT** (provider ports), consumer FE **REFACTOR→Next.js**, admin/merchant FE **REIMPLEMENT + split**, legacy duplicates **DEPRECATE**.
- **Data:** conceptual mapping only; resolve shared collections, duplicates, broken refs, missing FKs, and drop legacy/env-driven fields — **no schema** until reviewed.
- **APIs:** anti-corruption **shim** keeps existing clients working during incremental cutover; preserve realtime event + `AmealioError` contracts.
- **Sequence:** Identity → Merchant/Location → Catalog/Menu → Orders → Payments → Reservations/Notifications → Delivery/Admin → optional (owner-gated) → frontend cutover; ONDC + deferred delivery last / out of baseline.
- **Risks:** P0 cluster = payments, settlement, enum mapping, order lifecycle, data integrity, auth parity, realtime contracts.
- **Owner-decisions:** carried forward, not resolved; only **enum mapping (OD-11)** hard-blocks a step (Orders/Payments data).
- **Feature-repo protection:** deferred repos (`amealio-nestjs-backend`, `amealio-self-delivery-app`) are **not** in the baseline design; extension seams (Delivery `TrackingProvider`, `RecommendationProvider`, ONDC bounded context, domain events) let them be added progressively.

**Nothing is implemented.** This map is for review and to guide later, separately-authorized phases.
