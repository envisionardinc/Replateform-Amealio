# 30 — Merchant Subscription & Configuration Foundation (P1.7.3)

> **Status:** IMPLEMENTED — application foundation only. **No Prisma schema change** (the `Subscription` table + `config Json?` already exist and are sufficient). No billing, no CRUD/controllers, no frontend, no `table_setup` normalization, no feature-flag platform. Auth (P1.7.1E/F) untouched.
> **Grounding:** current-state audit (`../../current-state/`) + the legacy `amealio-vendordashboard/src/models/subscription.model.ts` (2319 lines, read-only) + existing `prisma/schema.prisma`.

---

## 1. Current legacy subscription model

Legacy `subscription` (Mongoose) is a single, large embedded document keyed by **`vendor_id`** (→ `VendorUser`, the owner). Structure (source line refs):

- `vendor_id` (owner) [L14]; `status: Number, default 1` [L19] — a **numeric flag**, not a billing/plan/price lifecycle.
- **Business-type entitlement booleans** [L23-26]: `casual_dining`, `fast_food_dining`, `hospitality_hotels`, `multi_service_business`.
- Per-type config blocks: `casual_dining_status` [L27], `fast_food_dining_status` [L772], `hospitality_hotels_status` [L1304], `multi_service_business_status` [L1319]. Each embeds:
  - `listing`, `offer_management`, `scan_and_pay`
  - `event_management.offline_event` (+ `room_setup`, `banquet*`, `seat_management`)
  - `experience_management.offline_experience`
  - `seating` → `general_seating`, `walkin_waitlist`, `reservation`, `table_management.table_setup`, `catering_banquet`
  - `ordering` (take_away/curb_side/dine_in/skip_line/catering/home_delivery)
- Top-level: `deliveryMethods`, `delivery_partner`, `deliveryConfig`, `experienceTaxesAndCharges`, `orderSteps` (enum 3/5/7).

Also: `restaurant.subscription` (ObjectId ref) links each restaurant to its subscription.

## 2. Actual ownership semantics

- **Owner:** `vendor_id` (the owning `VendorUser`). One subscription per vendor, with business types as booleans inside it; restaurants reference their subscription.
- **Can a merchant have multiple subscriptions?** Historically **no** — one embedded subscription per vendor; multiple *business types* are booleans within the one document.
- **Lifecycle/status:** numeric `status` (default `1`); no plan/price/expiry/renewal → **not a billing system** (see §16 billing boundary).

## 3. Target PostgreSQL representation (reused; no change)

Existing P1.5 `Subscription`:

```
Subscription { id, merchantId (→ Merchant, Cascade), restaurantId? (→ Restaurant),
               productType String, status String @default("ACTIVE"), config Json?, timestamps }
```

Ownership maps legacy `vendor_id` → target `Merchant` (the P1.7.2 tenant abstraction of the vendor-owner). The large embedded legacy config is preserved verbatim in **`config Json?`** (not flattened). `config Json?` is retained deliberately — see §15.

**Modeling divergence (documented, not resolved here):** legacy = ONE embedded subscription per vendor with business-type booleans; target *permits* N `Subscription` rows per merchant discriminated by `productType`. The foundation treats "a merchant's subscriptions" as a list and does not enforce one-vs-many; the canonical shape (single embedded doc vs product-split rows) is an owner decision for the real subscription migration (§18).

## 4. Subscription lifecycle / status

- Legacy: numeric `status` (default `1`; full enum not established → PARTIALLY UNDERSTOOD).
- Target: `status String @default("ACTIVE")`. The foundation's `findActiveByMerchant` filters `status = "ACTIVE"`. Mapping the legacy numeric status → target string vocabulary is deferred (owner decision).

## 5. Configuration categories

Distinct concepts kept separate (not collapsed):

- **Subscription entitlement** — business-type booleans (`casual_dining`, …) and per-type capability `value` gates (e.g. `seating.value`).
- **Merchant operational configuration** — timers/limits (walkin/reservation `auto_cancel`, `distance`, `table_kept_time`, lead/cut-off), `table_turn_around_time`, `table_setup`.
- **Runtime/environment flags** — build-time (`REACT_APP_COUNTRY`, `REACT_APP_ENV`) — NOT subscription; out of scope.
- **Development flags** — no authoritative production remote flag system (audit) — NOT migrated into subscription.
- **UI-only config** — display toggles on restaurant/subscription — out of scope.

## 6. CONFIRMED configuration paths

| Path | Consumers | Behavior | Target repr | Risk |
|---|---|---|---|---|
| `casual_dining` / `fast_food_dining` / `hospitality_hotels` / `multi_service_business` (top-level bool) | onboarding, dashboard, feature gates | business-type entitlement | typed `BUSINESS_TYPE_KEYS` + `getEnabledBusinessTypes` | low |
| `<type>_status.seating.value` | seating UI/back-end | seating capability gate | `isSeatingEnabled` | low |
| `<type>_status.seating.walkin_waitlist.*` (distance 10000, auto_cancel 15, table_kept_time, min_person, auto_accept, auto_cancel_open/close_restaurant) | diner-cron, availability | walk-in rules | raw via `getPath` (documented) | medium |
| `<type>_status.seating.reservation.*` (minimum_person, table_kept_for, cut_off_time, minimum_lead, reservation_time_slot, auto_cancel*) | reservations, availability | reservation rules | raw via `getPath` | medium |
| `<type>_status.seating.table_management.table_setup` (floors/seat/table; table.status ∈ AVAILABLE/OCCUPIED/DIRTY/ON_HOLD/UNAVAILABLE) | diner-cron (status sync), dashboard, availability | table inventory + status | raw via `getTableSetup` (structure preserved) | **high** (§10) |
| `<type>_status.event_management.offline_event.*` | events | event capability + banquet/rooms | raw via `getPath` | medium |
| `<type>_status.experience_management.offline_experience.*` | experiences | experience capability + auto-cancel | raw via `getPath` | medium |
| `<type>_status.ordering.*` | ordering | order-type gates | raw via `getPath` | medium |

## 7. Partially understood paths

`status` (numeric; `1`=active assumed, full enum unknown); `deliveryConfig`, `delivery_partner`, `deliveryMethods`; `experienceTaxesAndCharges`; `orderSteps` (enum 3/5/7); `massCompletion`; `catering_banquet` / `banquet*` / `room_setup`; `offer_management`; `scan_and_pay` sub-fields.

## 8. Unknown paths

`seat_management.name_of_software`; `member_ship_no`; `multi_service_business_status` full usage; `auto_pax`; various `temporay` [sic] flags; `location_code`. Present but active behavior unclear — preserved as opaque JSON.

## 9. Dead / legacy paths

None confidently classified as dead. The audit (`UNKNOWN-AND-GAPS.md`) did not establish dead subscription fields, and dead-status cannot be asserted without runtime traffic analysis. Nothing removed.

## 10. `table_setup` findings (special handling — preserved, not normalized)

- **Path:** `config.<type>_status.seating.table_management.table_setup` = `{ standard, floors[], seat[], table[] }` (source L410-460). `seat`/`table` carry `pax_value`, `shape`, `active`, `location`, `status`; `table.status` enum = `AVAILABLE | OCCUPIED | DIRTY | ON_HOLD | UNAVAILABLE` (default `AVAILABLE`).
- **Consumers:** the diner cron (`diner-cron.class.ts` `updateTableStatusInSubscription`) flips `table.status` `OCCUPIED` on `SEATED` / `AVAILABLE` on terminal diner states; the merchant seating dashboard; `restaurant-availability`.
- **Relationship to Restaurant:** table_setup lives inside the vendor's subscription config, applied per restaurant (via `restaurant.subscription`).
- **Relationship to Seating/Diner:** `Diner.table_number` references a table in `table_setup`; table status is synced by cron (**not** transactional with the diner PATCH).
- **Event rooms/banquets:** `event_management.offline_event.room_setup` + `banquet*` mirror the table structure for offline events.
- **This phase:** preserves `table_setup` in `config Json`, exposes a raw `getTableSetup()` locator (shape NOT asserted), and documents it. **No normalization, no status-transition behavior** — deferred to the seating migration.

## 11. Merchant tenancy behavior

`SubscriptionService.resolveTargetMerchant(principal, requestedMerchantId?)` derives scope from the server-side `StaffPrincipal` (P1.7.1F): merchant staff are confined to `StaffPrincipal.merchantId`; a request-supplied merchant id can only **reject** a mismatch (403), never grant. SUPER_ADMIN (merchantId = null) is platform-scoped and may target a merchant only via an explicit id (act-as deferred). Consumer JWTs cannot reach these staff services. No JWT/claim/guard change.

## 12. Relationship to seating

Seating capability (`seating.value`), walk-in/reservation rules, and `table_setup` all live in subscription config — the seating migration will consume this foundation (config accessor + `getTableSetup`) rather than re-parsing JSON.

## 13. Relationship to experiences / events

Experience (`experience_management.offline_experience`) and event (`event_management.offline_event` + banquet/rooms) capability + config live here; those future migrations consume the same accessor.

## 14. Relationship to other future domains

Ordering (`ordering.*` order-type gates), delivery (`deliveryConfig`/`delivery_partner`), taxes (`experienceTaxesAndCharges`), scan-and-pay — all gated/configured via subscription; each future domain reads via the accessor.

## 15. What was deliberately NOT normalized

The embedded config (`table_setup`, seating/reservation/walkin timers, event/experience/ordering blocks, banquet/rooms, delivery/tax config) remains in `config Json?`. **Why JSON remains correct now:** (a) the config is large, deeply nested, and business-type-specific; (b) no target consumer exists yet; (c) normalization requires per-domain owner decisions (seating/table-setup modeling is explicitly unresolved — reconciliation §12/§18); (d) premature relational tables would be speculative. JSON preserves 100% of the data with zero loss while a safe accessor prevents ad-hoc parsing.

## 16. Migration implications

- Legacy `vendor_id` subscription → target `Merchant`-owned subscription (grouping rule = same owner decision as P1.7.2 §9).
- Numeric `status` → target `status` string mapping (owner decision).
- One-embedded-doc vs product-split rows (owner decision).
- `config` imports as JSON; per-domain normalization happens with each domain migration, consuming the accessor.

## 17. Known risks

- **table_setup** correctness under future normalization + cron status-sync semantics (high).
- Business-type-specific duplication (same seating block under `casual_dining_status` / `fast_food_dining_status` / …) — accessor takes a `businessType` arg to disambiguate.
- Numeric `status` semantics unproven (which numbers mean active/suspended).
- Divergent one-vs-many subscription cardinality between legacy and target.

## 18. Owner decisions still required

1. Legacy→Merchant subscription grouping rule (shared with P1.7.2).
2. Subscription cardinality (one embedded config vs `productType`-split rows).
3. `status` vocabulary mapping (numeric → string; which values are "active").
4. `table_setup` normalization target + how to preserve cron-driven table-status sync (seating phase).
5. Whether business-type config duplication is collapsed or kept per-type.
6. Delivery/tax config target modeling.

---

## Schema / migration / validation

- **Schema/migrations:** unchanged (`git status -- prisma/` empty; `prisma validate` ✓; `migrate status` up to date).
- **Application:** new `apps/api/src/modules/subscription/` — `SubscriptionRepository` (read-only: `findById`, `findByMerchant`, `findActiveByMerchant`, `existsForMerchant`), `SubscriptionConfigService` (safe, unknown-preserving accessor + confirmed entitlement reads + `getTableSetup` locator), `SubscriptionService` (P1.7.1F merchant tenancy); `SubscriptionModule` registered in `AppModule`.
- **Tests:** 15 new (suite 151 → **166**, all green): config accessor unit (4: null/shape-safe, confirmed entitlements, seating/table_setup locator, unknown-key preservation), tenancy unit (5), DB integration (6: resolve by merchant, missing-subscription safe, read config + confirmed values + unknown-key round-trip, merchant scope, cross-merchant denied, SUPER_ADMIN explicit-target). Maps required cases 1-10; P1.7.1E/F suites green.
- **Validation:** `npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓ · `npm test` → **166/166** (22 suites) · `prisma validate` ✓ · `prisma migrate status` up to date.
