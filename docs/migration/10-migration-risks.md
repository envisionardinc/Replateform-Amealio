# 10 — Migration Risks & Recommended Order

Consolidated risks, open questions, and the recommended migration sequence. Risk severity is a discovery-stage estimate for prioritization, not a commitment.

## 1. Risk register

| ID | Risk | Impact | Severity |
|----|------|--------|----------|
| R1 | **Env-driven numeric enums** (`order_status`, `payment_status`, `order_type`, `payment_method`, `t_type`) — meanings not in source | Wrong status mapping corrupts orders/payments | High |
| R2 | **Shared collections / duplicate models** (`restaurants` shared by 2 models; `exp_events` shared; duplicate `refund` model) | Heterogeneous data; ETL ambiguity | High |
| R3 | **`strict: false` collections** (`restaurant`, `payment`) carry undeclared fields | Schema-only migration loses data | High |
| R4 | **No referential integrity** in Mongo + broken `ref`/`refPath` strings | Orphan records; population gaps | High |
| R5 | **Financial correctness** (wallet/ledger/settlement/refund/payout) | Money errors, compliance exposure | High |
| R6 | **Feathers monolith size** (171 models, ~419 mount paths, dual auth) | Large surface to replatform | High |
| R7 | **Committed secrets** in reference env files (Razorpay, Firebase, Google, MSG91, auth secrets) | Security exposure | High |
| R8 | **ONDC** protocol surface (15 models, 30+ endpoints, settlement/reconciliation) | High complexity; regulated | High |
| R9 | **Porter browser automation** (headless browser + Redis) | Brittle, infra-coupled | Medium |
| R10 | **In-process token revocation** (`RedisAuthService` unused) | Won't scale; security | Medium |
| R11 | **Inconsistent tenancy field naming** (`vendor_id`/`vendorId`, etc.) | Mapping errors | Medium |
| R12 | **Inconsistent soft-delete** (5 flag styles; some missing) | Data-loss/leak on migration | Medium |
| R13 | **Realtime contracts** (Socket.IO events) consumed by 3 clients | Breaking clients during cutover | Medium |
| R14 | **Denormalization duplication** (`restaurant` vs `restaurantCard`; embedded user snapshots) | Sync drift | Medium |
| R15 | **Dual/parallel implementations** (two carts; legacy+V2 consumer flows; two email + two SMS providers) | Ambiguous source of truth | Medium |
| R16 | **Nest `locations` PK = driverId** (upsert; possible no true history) + `synchronize: true` | History gaps; unsafe schema mgmt | Medium |
| R17 | **No shared design system** across frontends (MUI v4/v5, Bootstrap 4/5, Tailwind) | UI rebuild cost | Medium |
| R18 | **US-market artifacts** (Stripe referenced, no code; multi-country fields) | Scope creep if not deferred | Low (deferred) |
| R19 | **Deployment URL prefix** (`api/v1` config unused) unknown | Client routing assumptions | Low |
| R20 | **AI/recommendations & integration service** are external, unseen repos | Hidden dependencies | Medium |

## 2. Open questions — `UNKNOWN — REQUIRES REVIEW`

1. Numeric values behind every env-driven enum (orders, payments, wallet roles, transaction types).
2. Live MongoDB collection names, especially space-containing pluralizations, and true document shapes for `strict:false` collections.
3. Whether a separate **merchant** frontend is intended (currently admin+merchant share one repo).
4. Relationship between `INTEGRATION_SERVICE_BASE_URL`, the live-tracking socket host, and `amealio-nestjs-backend`.
5. Backing service for AI restaurant info and consumer recommendations.
6. Whether the Nest `locations` table stores real history in production (schema suggests one row per driver).
7. Full `AmealioError` code catalogue that clients depend on.
8. Guest/temp-user token issuance and expiry semantics.
9. Boundaries between Experiences, Events, and Ticketing within the "Celebration" domain.
10. Whether disputes are a distinct entity or a status of issues.
11. Canonical brand identity for a shared design system.
12. Which enum/status transitions are business-mandated vs operational defaults (auto-cancel, abandoned cart, settlement timing).
13. Production deployment topology, CI/CD, and observability per repo.
14. Data volumes per collection (for ETL sizing) — no production access in discovery.

## 3. Migration principles (proposed, for review)

- **Documentation- and contract-first**; no big-bang cutover.
- **Model the canonical domain**, don't translate Mongo collections 1:1 (see `docs/architecture/`).
- **PostgreSQL as system of record** with Prisma; JSONB only where data is genuinely document-shaped.
- **India-first**; keep core domain free of US-specific behavior (see `docs/architecture/localization-strategy.md`).
- **Resolve enum mappings and collection collisions before any ETL.**
- **Security workstream** to rotate committed secrets, run in parallel.
- **Preserve realtime + error contracts** or provide a compatibility layer during cutover.

## 4. Recommended migration order

A capability-sliced sequence that stabilizes the canonical core before expanding to satellite and channel concerns.

### Phase 0 — Foundations & de-risking
1. Resolve **enum mappings** (R1), **collection collisions** (R2), and sample `strict:false` documents (R3).
2. Stand up the **target monorepo** skeleton and the **canonical domain model** (Prisma) for review — no data yet.
3. Kick off the **secret-rotation** security workstream (R7).
4. Define **multi-tenancy** and **localization** strategy (India-first).

### Phase 1 — Identity & Merchant (tenancy spine)
5. **Identity** (users, sessions, auth) — unify the dual auth stacks behind one identity model with role/tenant claims.
6. **Merchant/Vendor** (vendors, staff, RBAC, organizations, subscriptions) — establishes tenancy boundaries.
7. **Location** (restaurants, chains, hours, reference/taxonomy) — the anchor entity.

### Phase 2 — Catalog & Menu
8. **Catalog** (categories, cuisines, UOM, templates) and **Menu** (menus, categories, items, combos, per-channel pricing) — normalize item pricing/availability.

### Phase 3 — Core transactions
9. **Order** (carts + orders lifecycle) — the highest-traffic flow; preserve realtime events.
10. **Payment** (Razorpay + wallet + ledger) then **Settlement/payout** (RazorpayX) — highest correctness bar; migrate ledger carefully.

### Phase 4 — Fulfilment & guest experience
11. **Delivery** (self + Dunzo + Porter) and consolidate tracking (rationalize Nest `locations`/integration service).
12. **Seating** and **Reservation** (the shared `Diner` spine).
13. **Celebration** (Experiences/Events) and **Ticketing**.
14. **Promotion** (offers, referrals, rewards).

### Phase 5 — Engagement & platform
15. **Notification** (consolidate providers; template system).
16. **Customer** content (community, reels, reviews, moods/cravings) and **Reporting**.
17. **Administration** consolidation (approvals, RBAC console, config, reference data).

### Phase 6 — Channels & satellites
18. **ONDC** as a bounded context (its own schema/service), integrated last due to protocol complexity (R8).
19. Retire legacy/duplicate implementations (dual carts, legacy consumer flows, duplicate email/SMS providers).

### Cross-cutting (parallel to all phases)
- Shared **design system** (`packages/ui`, `packages/design-system`) to replace the three divergent frontends.
- Shared **types/validation/auth/config/localization** packages.
- Observability, CI/CD, and parity test suites per capability.

> Sequencing rationale: tenancy (identity/merchant/location) must exist before catalog; catalog before orders; orders before payments/settlements; fulfilment and engagement build on the transactional core; ONDC and legacy retirement come last. Financial and ONDC domains carry the highest correctness/complexity risk and are deliberately handled with the most surrounding stability.
