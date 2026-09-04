# 10 — Migration Sequence

Recommended **domain-by-domain** sequence (not repository order) that minimizes risk and respects dependencies. Design only — no migration is executed. Aligns with the recommended modular monolith ([01](./01-TARGET-ARCHITECTURE-OPTIONS.md)) and prior order ([`10-migration-risks.md#4`](../10-migration-risks.md#4-recommended-migration-order)).

**Global prerequisites (before any domain migration):**
- Owner decisions that gate scope resolved or explicitly deferred ([11](./11-OWNER-DECISIONS.md)).
- **Enum mapping** confirmed (blocks Orders/Payments data) — **UNKNOWN**.
- Target repo skeleton scaffolded (monorepo + `packages/*` + Prisma bootstrap) — separate, review-gated increment (D-009).
- Secret-rotation workstream running in parallel.
- Compatibility shim/anti-corruption layer available so existing clients keep working during cutover ([05](./05-API-MIGRATION-MAP.md)).

## Phases

### Phase A — Foundations & Identity
- **Prerequisites:** global prereqs; `packages/{types,validation,auth,config}` bootstrapped.
- **Domains:** Identity & Access, Users.
- **Dependencies:** none (foundational).
- **Expected output:** unified auth (consumer/merchant/admin) with claims; users/profiles/addresses.
- **Validation:** AC-C1/C2, AC-M1, AC-A1; login methods parity; token lifecycle.
- **Rollback:** keep legacy auth authoritative; shim routes to legacy until parity signed off; feature-flag cutover per client.

### Phase B — Merchant & Location
- **Prerequisites:** Phase A.
- **Domains:** Merchant (vendor/staff/RBAC/subscriptions), Restaurants/Location (+ operating hours), Catalog (taxonomy).
- **Dependencies:** Identity.
- **Expected output:** merchant + restaurant + taxonomy manageable; discovery data source ready.
- **Validation:** AC-M2, AC-M6; restaurant becomes discoverable per baseline.
- **Rollback:** dual-write/parity check vs legacy restaurant data; revert to legacy reads via shim.

### Phase C — Menus & Discovery
- **Prerequisites:** Phase B.
- **Domains:** Menus (items/variants/add-ons/channel pricing/availability), Discovery/Search.
- **Dependencies:** Restaurants, Catalog.
- **Expected output:** consumer can browse menus; merchant manages menus/items.
- **Validation:** AC-C4, AC-M3; menu parity.
- **Rollback:** shim consumer menu reads to legacy until parity.

### Phase D — Orders (incl. Cart)
- **Prerequisites:** Phase C; enum mapping confirmed.
- **Domains:** Cart (unified), Orders (lifecycle/status/history), Merchant order management.
- **Dependencies:** Menus; (Payments in Phase E).
- **Expected output:** end-to-end order placement + merchant management with realtime.
- **Validation:** AC-C5/C7, AC-M4, AC-B3/B4; **journeys J4, J5, J6**.
- **Rollback:** highest care — run new orders behind flag for a cohort; keep legacy order path live; reconcile.

### Phase E — Payments & Settlement
- **Prerequisites:** Phase D.
- **Domains:** Payments (initiation/confirmation/failure/webhook/ledger), Settlement/Payout/Withdrawal.
- **Dependencies:** Orders.
- **Expected output:** payments + ledger + merchant settlement working (test creds).
- **Validation:** AC-C6, AC-B4, AC-I1, AC-D3; **journeys J11, J14**; financial reconciliation.
- **Rollback:** **P0** — never dual-charge; idempotent webhooks; keep legacy settlement authoritative until reconciled; staged rollout.

### Phase F — Reservations & Notifications
- **Prerequisites:** Phases B–D.
- **Domains:** Dining/Reservations (unified Diner), Notifications.
- **Dependencies:** Restaurants, Orders, Identity.
- **Expected output:** reservation lifecycle + multi-channel notifications at baseline triggers.
- **Validation:** AC-C8/C9, AC-M5, AC-I2; **journeys J8, J12**.
- **Rollback:** shim notifications/reservations to legacy; parity check.

### Phase G — Delivery (orchestration only) & Admin/Reporting
- **Prerequisites:** Phase E.
- **Domains:** Delivery orchestration (self/Dunzo/Porter), Administration, Reporting (read models).
- **Dependencies:** Orders, Payments.
- **Expected output:** delivery assignment/status; admin operations; reports.
- **Validation:** AC-A1..A6, AC-M7; **journey J13**; delivery status parity.
- **Rollback:** keep legacy admin/delivery live; **live GPS tracking + driver app remain deferred** (not in this phase).

### Phase H — Optional / owner-gated
- **Prerequisites:** owner decisions ([11](./11-OWNER-DECISIONS.md)).
- **Domains (only if scoped in):** Promotions, Celebrations/Experiences, Events/Ticketing, ONDC (as separate bounded context), Personalization.
- **Validation:** journeys J9/J10 and ONDC flows if included.
- **Rollback:** feature-flagged; excluded by default.

### Phase I — Frontend cutover & legacy retirement
- **Prerequisites:** corresponding backend domains stable.
- **Work:** `apps/web` (refactor), `apps/admin` + `apps/merchant` (reimplement/split); retire shim; deprecate legacy flows/models.
- **Validation:** all CRITICAL journeys via new frontends; regression suite green.
- **Rollback:** run legacy frontends against shim until new apps reach parity.

## Sequencing rationale
Identity → Merchant/Location → Catalog/Menu → Orders → Payments → Reservations/Notifications → Delivery/Admin → optional → frontend cutover. Tenancy must precede catalog; catalog precedes orders; orders precede payments; financial and realtime areas carry the most risk and are surrounded by the most stability. ONDC and deferred delivery come last / out of baseline.

## Feature-repository extension points
The baseline is **not** designed around the deferred repos (`amealio-nestjs-backend`, `amealio-self-delivery-app`). Clean seams allow adding them later without restructuring:
- **Delivery module port:** a `TrackingProvider` seam where a future tracking service (or the deferred Nest tracker) plugs in; the driver app consumes Delivery module APIs.
- **Recommendation port:** `RecommendationProvider` for the external engine.
- **ONDC bounded context:** isolated module/service attached via domain events + APIs.
- **Domain events / internal bus:** any module (Delivery, Notifications, ONDC) can be extracted into its own service (Option C) without changing callers.

No code, schema, or data migration is performed in this task.
