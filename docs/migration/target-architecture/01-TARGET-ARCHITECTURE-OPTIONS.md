# 01 — Target Architecture Options

**Task:** P1.3 — define **how** the approved India baseline is replatformed. **Design / mapping only** — no code, no PostgreSQL schema, no data migration, no production or source-repo changes, no deferred repos introduced, no owner-decisions resolved.

Functional source of truth: the P1.2 [Capability Matrix](../india-baseline/14-CAPABILITY-MATRIX.md) and [Acceptance Criteria](../india-baseline/15-BASELINE-ACCEPTANCE-CRITERIA.md). Target repo layout reference: [`docs/architecture/target-repository-structure.md`](../../architecture/target-repository-structure.md).

## Design principles (applied to all options)
- Organize by **logical business domain**, not by legacy repository/Feathers-service/Mongo-collection structure.
- Separate layers: **presentation → API/application → business/domain → persistence → integrations → async processing**.
- **Preserve baseline business behavior** (P1.2 acceptance criteria) while dropping legacy debt (duplicated models/logic, `strict:false`, broken refs, env-driven enums, dual auth stacks).
- **India-first**; market variance as configuration ([`localization-strategy.md`](../../architecture/localization-strategy.md)).
- Keep clean **extension points** so deferred repos (`amealio-nestjs-backend`, `amealio-self-delivery-app`) and later features attach without restructuring the baseline (see [12](../india-baseline/13-MIGRATION-IMPLICATIONS.md) and doc [10](./10-MIGRATION-SEQUENCE.md)).

---

## Option A — Modular Monolith (single NestJS app, one database)

**Structure:** One NestJS `apps/api` with a module per domain (auth, users, merchants, locations, catalog, menus, orders, payments, delivery, reservations, celebrations, promotions, notifications, admin), a single PostgreSQL via Prisma, Next.js apps (`web`, `admin`, `merchant`), shared `packages/*`. Async via an in-app job runner/queue; realtime via a gateway module.

| Aspect | Assessment |
|--------|-----------|
| Advantages | Simplest to build/operate; one deploy, one DB, atomic transactions across domains (orders↔payments↔settlement); fastest path to behavior parity; easy local dev |
| Disadvantages | Risk of recreating a monolith; module boundaries must be enforced by discipline; scaling is coarse-grained |
| Migration complexity | **Low–Medium** |
| Operational complexity | **Low** |
| Scalability | Vertical + horizontal (stateless API); coarse |
| Suitability for Amealio | High for baseline restore (mirrors current single-backend reality) |

## Option B — Microservices (service per domain/bounded context)

**Structure:** Independent services (identity, catalog/menu, orders, payments, delivery, notifications, admin, …), each with its own datastore; API gateway; async message bus; separate deploys.

| Aspect | Assessment |
|--------|-----------|
| Advantages | Independent scaling/deploy; strong isolation; natural home for ONDC/delivery satellites |
| Disadvantages | Distributed transactions (orders↔payments↔settlement) are hard; high infra/observability overhead; slows behavior-parity; big-bang risk for a baseline restore |
| Migration complexity | **High** |
| Operational complexity | **High** |
| Scalability | Fine-grained |
| Suitability for Amealio | Low for baseline restore (premature; contradicts incremental, no-big-bang mandate) |

## Option C — Modular Monolith with clean service-extraction seams (recommended)

**Structure:** Option A's modular monolith **plus** explicit, enforced module boundaries (domain interfaces/ports, no cross-module DB reads, events over an internal bus) so any module (e.g. Delivery, Notifications, ONDC) can later be **extracted into its own service without restructuring**. Deferred repos attach at these seams (Delivery module ⇄ future tracking service; a Recommendations port ⇄ external engine).

| Aspect | Assessment |
|--------|-----------|
| Advantages | All of Option A's speed/simplicity for the baseline **and** a clear path to selectively extract services later (delivery tracking, ONDC, driver app) — matches the progressive-introduction mandate |
| Disadvantages | Requires boundary discipline (lint/architecture rules, domain events) up front |
| Migration complexity | **Low–Medium** |
| Operational complexity | **Low** initially, grows only where services are extracted |
| Scalability | Coarse now, fine-grained where needed later |
| Suitability for Amealio | **Best** — restores the single-backend baseline quickly while protecting future feature repos |

---

## Recommendation

**Adopt Option C — modular monolith with clean service-extraction seams.**

Rationale (evidence-based): the India baseline is today a single Feathers/MongoDB backend with two clients ([01](../india-baseline/01-SYSTEM-OVERVIEW.md)); a modular monolith restores that reality fastest with the lowest risk and preserves cross-domain transactional integrity (critical for orders/payments/settlement — [12 P0 risks](./12-MIGRATION-RISKS.md)). Enforced seams satisfy the mandate to **progressively add deferred/feature capabilities** (delivery tracker, driver app, ONDC, recommendations) **without restructuring** the baseline (doc [12 of P1.1](../india-baseline/13-MIGRATION-IMPLICATIONS.md), and extension points in [10](./10-MIGRATION-SEQUENCE.md)). Microservices (Option B) are premature and conflict with the no-big-bang mandate.

This recommendation is **for review**; it does not authorize implementation. Domain boundaries: [02](./02-DOMAIN-BOUNDARIES.md). Sequence: [10](./10-MIGRATION-SEQUENCE.md).
