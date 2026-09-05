# 12 — Migration Risks (P0/P1/P2)

Highest-risk areas for the India baseline replatforming, ranked **P0** (critical — can cause money/data loss or block baseline), **P1** (high — significant behavior/coupling risk), **P2** (moderate). Evidence: P1.1 [12-GAPS-RISKS](../india-baseline/12-GAPS-RISKS.md) and this mapping.

## P0 — Critical

| Risk | Why | Area | Mitigation (design-level) |
|------|-----|------|---------------------------|
| **Payments correctness** (double-charge, lost capture) | Razorpay init + async webhook; ledger; refunds | Payments | Idempotent, signed webhooks; ledger reconciliation; staged rollout; never dual-charge; keep legacy authoritative until reconciled |
| **Settlement/payout correctness** | RazorpayX payouts, withdrawals, wallet reversal | Payments | Reconciliation tests; legacy authoritative during parity; feature-flag |
| **Enum mapping unknown** | Order/payment status/method/`t_type` are env-driven; values absent | Data/Orders/Payments | **Block Orders/Payments data migration until OD-11 resolved** |
| **Order lifecycle parity** | Highest-traffic flow; realtime + status machine; embedded items | Orders/Realtime | Behavior-parity tests vs J4–J6; shim; cohort rollout |
| **Data integrity on migration** | No Mongo FKs; broken refs; shared collections; `strict:false` | Data | Sample real docs; reconcile by value; orphan detection; add explicit FKs |
| **Auth parity** | Dual stacks, raw header, multiple login methods, portal rules | Identity | Preserve login methods; shim; parity tests AC-C1/M1/A1 before cutover |
| **Realtime event-contract break** | Both clients depend on Socket.IO event names/payloads | Realtime | Emit identical event names/payloads (RETAIN contracts); parity tests AC-B3 |

## P1 — High

| Risk | Why | Area | Mitigation |
|------|-----|------|-----------|
| **Duplicate models / shared collections** | `restaurant`/`restaurantCard`, two carts, shared `restaurants`/`exp_events`, dup `refund` | Data | Split by type; unify; read models; ETL audit |
| **Legacy business rules loss** | rules embedded in hooks/crons/schema | All domains | Catalogue rules ([07](../india-baseline/07-BUSINESS-RULES.md)); parity tests |
| **Reservations lifecycle/geo** | geo-fenced arrival, auto-accept, blackout, crons | Reservations | Parity tests AC-C8/M5; job idempotency |
| **Integrations (webhooks/idempotency)** | Razorpay/Dunzo/Petpooja/ONDC inbound | Integrations | Signature verify + idempotency; provider ports |
| **Porter browser automation** | headless browser + Redis; brittle | Delivery/Integrations | Isolate; prefer API-only; treat as optional |
| **Frontend/backend coupling** | model-shaped payloads, role-variant APIs, raw header | API/Frontend | Anti-corruption shim; typed contracts; incremental cutover |
| **RBAC parity** | boolean permission trees → explicit policy | Identity/Merchant | Map flags to policies; authorization tests |
| **Background job parity** | in-process crons (auto-cancel, completion, settlement, wallet reset) | Async | External scheduler; idempotent jobs; effect parity AC-B5 |

## P2 — Moderate

| Risk | Why | Area | Mitigation |
|------|-----|------|-----------|
| **Discovery/search parity** | Mongo/geolib ranking | Discovery | Parity tests; search engine optional later |
| **Notification provider consolidation** | 2 email + 2 SMS providers | Notifications | Choose one per channel; ports |
| **Media/storage** | S3 prefixes, ffmpeg | Storage | Storage port; validate URLs |
| **Design-system consolidation** | 3 divergent UI stacks | Frontend | Shared `packages/ui`; phased |
| **Reporting** | reads operational store | Reporting | Read models/materialized views |
| **Deployment topology unknown** | no manifest in repos (OD-9) | Ops | Define before go-live |

## Highest-risk summary
The **P0 cluster is financial + order + auth + data-integrity + realtime**. Migration sequencing ([10](./10-MIGRATION-SEQUENCE.md)) deliberately surrounds Orders and Payments with the most stability, gates them on enum mapping (OD-11), and mandates parity tests + reconciliation + staged rollout + a compatibility shim so the baseline is never in a big-bang, unrecoverable state.

No remediation is implemented in this task.
