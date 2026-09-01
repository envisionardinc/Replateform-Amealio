# Amealio Migration Discovery

Forensic, **read-only** discovery of the existing Amealio India platform, produced from static analysis of the reference repositories. These documents are an **inventory of current behavior**, not a design or an implementation.

> Scope guardrails for this phase: no application code, no database schema, no NestJS modules, no Next.js apps. Where the reference code is ambiguous, items are marked **`UNKNOWN — REQUIRES REVIEW`**.

## Documents

| # | Document | Contents |
|---|----------|----------|
| 01 | [reference-inventory](./01-reference-inventory.md) | The reference repositories, their roles, stacks, and how they connect |
| 02 | [domain-inventory](./02-domain-inventory.md) | The 17 business domains and the entities/features in each |
| 03 | [api-inventory](./03-api-inventory.md) | REST + Socket.IO surface (services, methods, realtime events) |
| 04 | [database-inventory](./04-database-inventory.md) | How MongoDB is used today; business entities and relationships (no PostgreSQL conversion) |
| 05 | [business-rules](./05-business-rules.md) | Business rules and validation encoded in the backend |
| 06 | [integrations](./06-integrations.md) | External services, payments, delivery, notifications, storage |
| 07 | [authentication-authorization](./07-authentication-authorization.md) | Identity, auth strategies, roles, permissions |
| 08 | [workflows](./08-workflows.md) | Ordering, seating, experience, settlement, delivery lifecycles |
| 09 | [design-system-inventory](./09-design-system-inventory.md) | UI stacks, tokens, shared components across the frontends |
| 10 | [migration-risks](./10-migration-risks.md) | Risks, unknowns, and the **recommended migration order** |

## How this was produced

Static reading of the reference repositories only. No production databases or credentials were accessed. Enum numeric values, deployment URL prefixes, and any behavior driven by unset environment variables could not be resolved from source and are flagged for review.

## Reference ↔ repository mapping (summary)

| Provided label | Physical repository | Observed role |
|----------------|--------------------|----------------|
| `references/backend` | `amealio-vendordashboard` (pkg `envisionapp`) | **Primary platform backend** — FeathersJS + MongoDB |
| `references/user-web` | `amealio_web_app` | Consumer web app (CRA / React 18) |
| `references/admin` | `amealiodashboardmvp-` | Super-admin console (CRA / React 16) |
| `references/merchant` | `amealiodashboardmvp-` (same repo) | Merchant/vendor dashboard — portal chosen by hostname |
| *(not labeled, present)* | `amealio-nestjs-backend` | Delivery-tracking API (NestJS + PostgreSQL) |
| *(not labeled, present)* | `amealio-self-delivery-app` | Delivery-boy app (Next.js) |

See [01-reference-inventory](./01-reference-inventory.md) for details and the mapping caveats.
