# P1.7.15 — Seating & Table Setup Reconciliation

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no tests. Resolves **DEC-2** (canonical target representation of legacy `table_setup`) and scopes a subsequent bounded Seating implementation slice (P1.7.16).
> **Authority:** legacy source (`amealio-vendordashboard` Feathers/Mongo, `amealiodashboardmvp-` Merchant+Admin SPA, `amealio_web_app` consumer) + target `replateform-amealio` (Prisma schema + `apps/api`). Baseline **230/230**, unchanged.
> **Method:** frontend → API → service → persistence tracing with file:line evidence; configuration, runtime state and booking state are kept strictly separate.

---

## 1. Executive Summary

- **`table_setup` is embedded in the Subscription document at 10 paths** (`subscription.model.ts`), all sharing one logical shape `{ standard, floors[], seat[], table[] }` (two trivial schema variants). Seating table management lives under `casual_dining_status` and `multi_service_business_status`; fast-food has only ordering copies; hospitality has none. It is a **closed Mongoose subdocument** (`strict:true`, `subscription.model.ts:2308–2310`) — undeclared keys are dropped, not preserved.
- **`table_setup` is a MIXED document:** `standard`/`floors[]` + `table[]`/`seat[]` inventory (numbers, pax, shape, area, active) are **CONFIGURATION/INVENTORY**, while `table[].status` (`AVAILABLE|OCCUPIED|DIRTY|ON_HOLD|UNAVAILABLE`) is **RUNTIME STATE** mutated by the Diner lifecycle (`diner.hooks.ts`), a manual merchant PATCH, and the auto-cancel helper.
- **Booking runtime lives in a separate `Diner` collection.** `service_type ∈ {SEATING, RESERVATION}`; **walk-in vs waitlist is the `isWalkIn` boolean**, not a distinct type; `diner_status` uses `SEATING_STATUS {INITIAL,PENDING,NOTSEATED,SEATED,REJECTED,COMPLETED,CANCELLED}`. A reservation is **capacity/restaurant-level at booking** (`table_number:''`) and becomes **physical-table-bound only at accept/seat** (staff assigns `table_number`, which syncs the subscription table `status`).
- **Seating ↔ Ordering is a loose, optional coupling** via bidirectional `cross_ref_id` (+ experience `order_id`/`diner_id`); orders only denormalize `dine_in_details.table_number` (string). Table occupancy is derived from **Diner status**, never from order status. The target `Order` (P1.7.12) has no seating fields — correct.
- **Seating ↔ Experience/Event is SOFT/OPTIONAL** (expRequest/experience-cart carry seating fields and may spawn a Diner; Events run a parallel `event-handler` state machine). Not required by core seating.
- **Target today:** `SeatingArea{name}`, `RestaurantTable{code,capacity}`, `SeatingRequest` (thin), `ReservationBlock`, `OperatingHours`, and `SeatingType`/`SeatingStatus` enums exist, but there is **no seating module, no table-status enum/model, and `table_setup` still lives only in `Subscription.config` Json**.
- **UNKNOWNs resolved:** the legacy `seatingarea` collection is **marginal/bootstrap-only** (superseded by the `Sub Category` "Seating Area" taxonomy; not wired to `table_setup`); **QR table persistence is NOT FOUND** (QR is client-generated at print; only `restaurant.restaurant_qr` scan-pay image is persisted); **no waiter↔table binding exists** (`waiter.model.ts` has no tenant/table keys).

**DEC-2 = RESOLVED → Option C (Hybrid):** Subscription.config keeps the **feature/config gates + timers/rules** (seating enablement, walk-in/reservation rules, general-seating settings — unknown-preserving); dedicated target entities hold the **operational seating inventory + runtime state + bookings** (extend `SeatingArea`/`RestaurantTable`, add a table-status representation; use the existing `SeatingRequest`). Reservation/walk-in/table-runtime **cron parity** and the dual seating-vs-dine-in embed reconciliation are **deferred sub-decisions** that do not block the recommendation.

**Seating is READY for a bounded implementation** (P1.7.16), scoped below. It does **not** block Menu/Items, Offers, Experiences, or Ordering.

---

## 2. Source Repositories Inspected

| Repo | Role | Inspected |
|---|---|---|
| `amealio-vendordashboard` | Legacy Feathers/Mongo backend (truth) | `subscription.model.ts`, `diner.model.ts`, `diner-status.model.ts`, `waiter.model.ts`, `seating-area.model.ts`, `manage-reservation-block.model.ts`, `manage-hours-of-operation.model.ts`, `ordering.model.ts`, `experience*.model.ts`, `events.model.ts`, `event-handler.model.ts`; services `diner/*`, `subscription/*`, `seating-area`, `waiter`, `restaurant-availability`; `cron.ts`, `helpers/autoCancel.ts`, `common/constants.ts`, `config/default.js` |
| `amealiodashboardmvp-` | Merchant+Admin SPA | seating/table setup screens + redux (`TableManagementScreen.js`, `TableSeatManagement.js`, `GenralSeatingScreen.js`, `WalkinWaitlistScreen.js`, `ReservationSeatingScreen.js`, `PrintComponent.js`, `addingAction.js`, `authAction.js`) |
| `amealio_web_app` | Consumer web | `screens/seating/booking/SeatingRequest.jsx`, `screens/seating/track/*` |
| `replateform-amealio` | Target | `prisma/schema.prisma`, `apps/api/src/modules/*`, docs 40–43 |

`amealio-self-delivery-app`, `amealio-nestjs-backend` — out of scope (no seating surface).

---

## 3. Legacy Seating Architecture

Three separate layers, deliberately kept distinct here:

1. **Configuration + inventory** — embedded in the **Subscription** document: seating/reservation/walk-in enablement + rules + timers, and the `table_setup` `{ floors[], seat[], table[] }` inventory. Written by the merchant SPA via `PUT /subscription/:id`.
2. **Runtime table state** — `table_setup.table[].status` (5-value `TABLE_STATUS` enum), mutated by the Diner lifecycle (hooks), a manual merchant PATCH (`/subscription/table/:id?seating=true`), and the auto-cancel helper.
3. **Booking runtime** — the **`Diner`** collection (walk-in / waitlist / reservation requests), with its own lifecycle, timers, party details, optional order/experience links, and a `table_number` assigned at accept/seat time.

---

## 4. Merchant Seating Setup

Flow: SPA screen → redux (`update_new_subscription_for_vendor`) → `PUT /subscription/:id` → Feathers `subscription` service → embedded subscription doc (`authAction.js:581–583`, `TableManagementScreen.js:216–226`, `TableSeatManagement.js:605–617`). Runtime status is a separate path: `change_table_status_table_management` → `PATCH /subscription/table/:id?seating=true` (`addingAction.js:589–604`, `vendor-table-management.class.ts:179–195`).

Configurable-concept status (full matrix in evidence; summarized):

| Concept | Field | Status |
|---|---|---|
| Tables / identifiers / capacity (`pax_value`) / shape / area / floor / active / location | `table_setup.table[]` | **CONFIRMED** (FE); several fields **PARTIAL** in backend use (`name`, `shape`, `active`, `location`, `temporay` not read server-side) |
| Seats (non-table) | `table_setup.seat[]` | **CONFIRMED** |
| Floors / sections | `table_setup.floors[]` (`floor_number`, `area`) | **CONFIRMED** |
| Seating areas (taxonomy) | `general_seating.seating_areas[]` → `ref: Sub Category` | **CONFIRMED** |
| Table status | `table_setup.table[].status` | **CONFIRMED** (runtime) |
| Reservation enablement + rules/timers | `seating.reservation.*` | **CONFIRMED** |
| Walk-in/waitlist enablement + rules/timers | `seating.walkin_waitlist.*` | **CONFIRMED** |
| General seating (capacity, kids, highchair, turn-around) | `general_seating.*` | **CONFIRMED** |
| Availability windows tied to `table_setup` | — | **NOT FOUND** (availability derives from restaurant hours + subscription cutoffs) |
| QR configuration | client-generated at print | **CONFIRMED (client-only, not persisted)** |
| Waiter assignment to tables | — | **NOT FOUND** |

Ownership: **merchant** (per `vendor_id` subscription). Downstream consumers: `diner` hooks/cron, `table-dinner`, `user-restaurant` (seating-area resolution).

---

## 5. `table_setup` Shape and Usage

**Canonical logical shape** (`subscription.model.ts:410–460`):

```
table_setup: {
  standard: Boolean,
  floors: [{ floor_number: String, area: String }],
  seat:  [{ seat_number, floor_number, area, name, number, pax_value:Number, shape, temporay:Boolean, active:Boolean, location, status:String }],
  table: [{ table_number, floor_number, area, name, number, pax_value:Number, shape, temporay:Boolean, active:Boolean, location,
            reserveDate?:Date,   // ONLY on seating.table_management path
            status: enum AVAILABLE|OCCUPIED|DIRTY|ON_HOLD|UNAVAILABLE (default AVAILABLE) }]
}
```

- **10 embedded paths** (`subscription.model.ts` lines 410–460, 529–578, 954–1003, 1135–1183, 1187+, 1701–1750, 1819–1868, 2057–2107, 2121–2169, 2173–2221). Casual/multi-service have `seating.table_management.table_setup`; casual/fast-food/multi-service also have `ordering.*.enable_table_number.table_setup` (a **separate, independently-editable copy**); hospitality has none.
- **One logical shape, two trivial variants** (typed defaults + `reserveDate` on the seating path; bare Booleans on `my_seat`/`theater_room`).
- **Writers:** SPA `PUT /subscription/:id` (whole doc) + `PATCH /subscription/table/:id?seating=true` (status only); backend `subscription`/`admin/subscription` services do a **wholesale replace** with no `table_setup` transform.
- **Readers:** `table-dinner.class.ts` (casual path only, `83–99`), `diner-cron`, `diner.hooks`, `autoCancel.ts`, `subscription/table` create. Ordering services do **not** read `table_setup`.
- **`TABLE_STATUS`** enum values come from env (`config/default.js:880–886`).
- **Unknown keys are NOT preserved** (closed Mongoose subdocument).
- **`table[].status` is RUNTIME** (config default seeded at setup, then authoritatively mutated by diner lifecycle + manual PATCH + auto-cancel).

---

## 6. Tables / Seating Areas

| Mechanism | Purpose | Active? | Evidence |
|---|---|---|---|
| `table_setup.floors[].area` (string) | merchant physical layout sections | **Yes** | `subscription.model.ts:416–419` |
| `general_seating.seating_areas[]` (`ref: Sub Category`) | user-facing seating-preference options | **Yes** | `subscription.model.ts:352–356`; resolved `user-restaurant.class.ts:953–961` |
| `seatingarea` Mongo collection (`Seating Area` model) | onboarding dropdown taxonomy | **Marginal / bootstrap-only** | `seating-area.model.ts:6–11`; read at `restaurant.class.ts:239/264/621`; no meaningful write path; `userTrack.ts` usage is broken/dead |
| standalone `table`/`floor`/seating collections | — | **NOT FOUND** | tables exist only inside the subscription embed |
| `events.table_setup` | per-event seating map | separate | `events.model.ts:105–144` |

**Verdict:** the `seatingarea` collection is **not** the canonical seating-area source and **does not** duplicate `table_setup`; it duplicates the `Sub Category` "Seating Area" concept at the taxonomy layer.

---

## 7. Runtime Table State

- **Location:** `subscription.*_status.seating.table_management.table_setup.table[].status`.
- **Enum:** `AVAILABLE | OCCUPIED | DIRTY | ON_HOLD | UNAVAILABLE`. No separate `RESERVED`/`BLOCKED`/`CLEANING` (`ON_HOLD` = held for accepted guest; `UNAVAILABLE` = merchant-disabled/`active=false`; `DIRTY` = post-completion).
- **Writers:** Diner hooks (`diner.hooks.ts` — NOTSEATED→ON_HOLD `1756–1772`; SEATED→OCCUPIED `1827–1840`; COMPLETED→DIRTY `1900–1916`; reject/cancel→AVAILABLE; table swap), manual merchant PATCH (`vendor-table-management.class.ts:179–195`), and `updateTableStatusInSubscription` (`diner-cron.class.ts:56–102`, called from `autoCancel.ts:1425–1426`; the in-cron call is **commented out** at `diner-cron.class.ts:379–380`).
- **Derived availability:** `table-dinner.class.ts:123–168` computes free tables by subtracting active-diner `table_number`s (not from `status`).

Classification: `standard`/`floors[]`/`table[]`/`seat[]` metadata = **CONFIGURATION**; `table[].status` = **RUNTIME STATE**; `Diner` = **BOOKING STATE**; `table-dinner`/availability slots = **DERIVED**; `reserveDate` = **UNKNOWN/dead** (schema-only).

---

## 8. Reservations

- **Create:** consumer `POST /diner` with `service_type:"RESERVATION"` + `reservationTime` (`SeatingRequest.jsx:164–189`); hooks gate on session/future-activity flags and set PENDING or auto-accept→NOTSEATED (`diner.hooks.ts:1173–1208`, `996–1017`).
- **Config:** `subscription.seating.reservation.*` (`table_kept_for`, `cut_off_time`, `minimum_lead`, `reservation_time_slot`, `auto_cancel*`, `reservation_capacity`, …) (`subscription.model.ts:389–407`).
- **Table binding:** **capacity/restaurant-level at booking** (`table_number:''`), **physical table at accept/seat** (staff assigns → subscription status ON_HOLD/OCCUPIED, with a same-day double-booking guard `diner.hooks.ts:1661–1706`).
- **Slots:** derived from restaurant hours + subscription cutoffs (`restaurant-availability.class.ts:25–62`).
- **Blackouts / hours overrides:** `manageReservationBlock` (`manage-reservation-block.model.ts:12–28`) and `manageHoursOfOperation.manageDateRange[]` (`manage-hours-of-operation.model.ts:12–34`) are **persisted but NOT enforced** in the availability slot logic.

---

## 9. Walk-ins / Waitlist

- **Distinction:** `RESERVATION` = `service_type:"RESERVATION"`; **WAITLIST** = `service_type:"SEATING"` + `isWalkIn:false`; **WALK-IN** = `service_type:"SEATING"` + `isWalkIn:true` (`diner.model.ts:63–68,106`; report label logic `vendor-diner-report.class.ts:145–152`). `isWalkIn` is auto-set when the restaurant has no waiting time (`diner.hooks.ts:1361–1367`).
- **Config:** `subscription.seating.walkin_waitlist.*` (`table_kept_time`, `request_period`, `auto_cancel*`, `order_ahead`, …) (`subscription.model.ts:374–388`).
- **Queue:** no explicit queue-position field found; ETA/timers via `wait_time`/`wait_time_date`. No table availability check at create; table assigned by staff at accept/seat. Completion → table DIRTY.
- **TABLE OCCUPANCY** is a separate persisted subsystem (subscription table status), not stored on the Diner beyond the assigned `table_number`.

---

## 10. QR

- **Table/seat QR:** generated **client-side at print** (`PrintComponent.js:68–78`) with payload `{ restaurant_id, table_number|seat_number, type:"table_management"|"seat_management", vendor_id }`. **QR PERSISTENCE: NOT FOUND** — no model field stores the table QR payload.
- **Restaurant scan-pay QR:** `restaurant.restaurant_qr` (image URL, persisted) + `ordering.merchant_qr`; `diner.pointOfEntry === "QR_SCAN"` only drives reservation confirmation notifications (`diner.hooks.ts:4016–4027`).
- **Verdict:** QR is a print/label + scan-pay concern, **not** a seating persistence entity. Do not invent a QR entity.

---

## 11. Waiter / Table Relationships

- `waiter.model.ts:6–17` has `name`, `age`, `gender`, `shift`, `status` — **no `vendor_id`/`restaurant_id`/table/diner/order keys**. Service `/waiters` is global CRUD by name, empty hooks.
- **No persistent waiter↔table / waiter↔restaurant / waiter↔reservation / waiter↔order binding exists.** (RBAC has a `seating_assign_table` permission, but no assignment model.) Do not invent one.

---

## 12. Cron / Background Processing

| Process | Trigger | Reads | Writes | Reproduce in target? |
|---|---|---|---|---|
| `DinerCron.create` (minute cron, `cron.ts:63–70`) | every minute | PENDING diners (`diner-cron.class.ts:1224–1251`) | `diner_status:REJECTED` on accept timeout (`125–139`) | **Yes** (merchant SLA) |
| `dinerAutoCancel` (setTimeout, `diner.hooks.ts:3177–3193`) | scheduled on PENDING create/patch | timers | REJECTED/CANCELLED; calls table sync (`autoCancel.ts:1425–1426`) | **Yes** |
| NOTSEATED no-show (`autoCancel.ts:1096–1119`) | via autoCancel | `table_kept_time`/`table_kept_for` | `CANCELLED` | **Yes** (fix scheduling gap — minute cron only queries PENDING) |
| `updateTableStatusInSubscription` | diner terminal states | diner status | subscription table `status` | **Yes** (occupancy sync) |
| `newSessionStart` bulk table reset / `seatingOrderCancell` | session open / diner cancel | — | — | **Evaluate / conditionally** (currently commented out) |
| Reminder SMS/push (5/0 min) | cron | timers | notifications | **Optional** (mostly commented) |
| `manageReservationBlock` enforcement | — | — | — | **Yes if product needs blackouts** (data exists, not enforced) |

---

## 13. Seating ↔ Ordering

- Order → seating: `ordering.diner_id` (`ordering.model.ts:44–48`), `ordering.cross_ref_id` (`445–449`), `dine_in_details.table_number` string (`98–100`). Seating → order: `Diner.order_id`/`cross_ref_id` (`diner.model.ts:36–40,154–158`).
- **Optional, not automatic:** order-ahead passes `cross_ref_id`; order writes back to the Diner (`ordering.class.ts:2034–2037`); diner cancel can cancel the linked order (`user-diner.class.ts:993–999`; cron `diner-cron.class.ts:1043–1067`).
- **Occupancy is Diner-driven, not order-driven.** Scan/pay does **not** change table state.
- **Boundary (one sentence):** seating and ordering are separate contexts joined only by optional bidirectional `cross_ref_id`/`diner_id` + a denormalized dine-in table string, with table occupancy owned by the Diner lifecycle. Target `Order` (P1.7.12) has no seating fields — correct.

---

## 14. Seating ↔ Experiences / Events

- `expRequests` has `diner_id`, `order_id`, `tableNumber`, `seatingPreference[]` (`expRequests.model.ts:39–64`); checkout creates a linked Diner+Order (`userExpRequest.class.ts:1747–1765`), and diner status syncs back (`diner.hooks.ts:236–300`).
- `experience-cart` carries seating counts + `service_type SEATING|RESERVATION` (`experience-cart.model.ts:42–70`).
- `Events.table_setup` mirrors the shape (`events.model.ts:105–144`); event bookings use a **parallel** `event-handler` status machine without `Diner` (`event-handler.model.ts:41–60`).
- **Classification: SOFT / OPTIONAL LINK** — experiences may spawn/sync a Diner; events run a parallel machine; neither is required by core seating.

---

## 15. Target-State Coverage

| Legacy concept | Target existing | Gap | Deferred | Unknown |
|---|---|---|---|---|
| `table_setup` inventory (floors/seats/tables) | `Subscription.config` Json + `getTableSetup()`; `SeatingArea{name}` + `RestaurantTable{code,capacity}` skeletons | `RestaurantTable` lacks `status/floor/area/shape/active/location/pax`; `SeatingArea` lacks floor/capacity; no seat entity | DEC-2 normalization | dual seating-vs-dine-in embeds → one target? |
| Table runtime status | — | **new `TableStatus` enum + column** + sync | cron parity | — |
| general_seating / walk-in / reservation rules + timers | partial in `Subscription.config` | no typed accessors beyond `getTableSetup` | keep in config JSON | — |
| Diner (booking runtime) | `SeatingRequest` (thin) | missing `INITIAL` status, `isWalkIn` semantics, adult/handicap counts, `seatingPreference[]`, wait-time/timer fields, `preOrder`, `pointOfEntry`, order/exp links, audit | seating module + field-mapping | `WAITLIST` vs `SEATING`+`isWalkIn` mapping |
| Reservation blocks / hours | `ReservationBlock`, `OperatingHours` | `description`; date-range hour overrides (`manageDateRange`) | hours-shape decision | — |
| Seating-area taxonomy | `RestaurantFeature{SEATING_AREA}` + reference taxonomy | platform catalog vs merchant feature | — | `seatingarea` collection activity (**RESOLVED: marginal**) |
| Waiter | — | new model (if ever) | entire feature | waiter↔table binding (**RESOLVED: none**) |
| QR | — | none needed | client QR + scan-pay | QR persistence (**RESOLVED: not found**) |
| Order↔seating link | `Order` (no seating fields) | optional `seatingRequestId`/table string / Json | after seating lands | FK vs Json |
| Experience/Event seating | — | entire Experience/Event stack | those domains | — |
| No target **seating module/service** | only `SubscriptionConfigService.getTableSetup()` | full seating module | P1.7.16 | — |

---

## 16. DEC-2 Recommendation

**DEC-2 = RESOLVED → Option C (Hybrid).**

- **A. Keep everything in Subscription** — rejected: `table_setup` is a mixed config+inventory+**runtime** document mutated cross-request by the Diner lifecycle + cron; positional array updates (`table.$.status`) are fragile, un-indexable, and can't enforce per-table uniqueness or tenancy cleanly.
- **B. Normalize everything (incl. rules/timers)** — rejected (for now): the reservation/walk-in **rules/timers** have no target runtime consumer yet, unknown keys must be preserved (P1.7.3/P1.7.13), and normalizing them now would be speculative.
- **C. Hybrid — RECOMMENDED:**
  - **Subscription.config** retains the **feature/config GATES + rules/timers** (seating/walk-in/reservation enablement, `table_kept_for`, `auto_cancel*`, `reservation_time_slot`, `general_seating.*`), read via `SubscriptionConfigService` — unknown-preserving, no normalization.
  - **Dedicated seating entities** own the **operational inventory + runtime + bookings**: `SeatingArea` (from `floors[]/area`) → `RestaurantTable` (from `table[]`: `code`←`table_number`, `capacity`←`pax_value`, plus new `floor/area/shape/active/location`) → a new **`TableStatus`** representation (`AVAILABLE|OCCUPIED|DIRTY|ON_HOLD|UNAVAILABLE`); reservations/walk-ins use the existing **`SeatingRequest`** (extended) with `SeatingType`/`SeatingStatus`.

**Justification by dimension:**
- **Source/operational:** table inventory + status are queried/mutated per-request (hooks, PATCH, cron) and per-table — relational rows fit far better than positional subdocument updates.
- **Ownership/tenancy:** tables belong to a `Restaurant` (→ `Merchant`); relational rows get proper FKs + `@@unique([seatingAreaId, code])` + tenancy, unlike an embedded array on a merchant-level subscription.
- **Runtime:** table status must be reproduced (Diner lifecycle + cron); a status column/enum is the natural home. Rules/timers stay JSON because they are pure configuration.
- **Reservation/ordering:** `SeatingRequest` already exists; adding an optional `SeatingRequest↔Order` link later matches the loose `cross_ref_id` coupling without changing Ordering now.
- **Migration:** legacy `table_setup.table[]` → `RestaurantTable` grouped by `SeatingArea` (from `floors[]/area`); status → `TableStatus`; rules/timers copied as-is into `Subscription.config`. Import is additive and one-directional.
- **Backward compatibility:** during transition, `Subscription.config` remains readable (P1.7.14 non-destructive merge intact); the new entities are the write path going forward. The **dual seating-vs-dine-in `table_setup` embeds** are reconciled to a single `RestaurantTable` set (a sub-decision for P1.7.16).

**Residual sub-decisions (do not block DEC-2):** (i) exact `TableStatus` home (column on `RestaurantTable` vs a small status side-table) and cron-sync design; (ii) reconciling the dual seating/dine-in embeds; (iii) `manageDateRange` hours-override shape.

---

## 17. Remaining UNKNOWNs / Owner Decisions

- **Resolved to facts:** `seatingarea` collection = marginal/bootstrap (not canonical); QR table persistence = **not found**; waiter↔table binding = **none**.
- **Owner decisions for P1.7.16:** DEC-2 sub-decisions above (TableStatus placement + cron parity; dual-embed reconciliation; hours-override shape); `SeatingType` mapping (`WALK_IN`/`WAITLIST` ← `SEATING`+`isWalkIn`); whether to add `SeatingStatus.INITIAL`; whether reservation blackout enforcement (`manageReservationBlock`) ships now (legacy stores but doesn't enforce).
- **Open UNKNOWNs:** whether the `seatingarea` collection is still written in any live path (evidence: no meaningful writer); exact `reserveDate` intent (schema-only, unused).

---

## 18. P1.7.16 Proposed Implementation Boundary

- **MUST — merchant setup:** `SeatingArea` + `RestaurantTable` write (import/create from `table_setup` inventory: code, capacity, floor/area, shape, active); read seating feature/config gates from `Subscription.config`; merchant-tenant-scoped (P1.7.1F/P1.7.2), owner-activated (P1.7.14).
- **MUST — customer seating:** `SeatingRequest` create (WALK_IN/WAITLIST/RESERVATION), party size + capacity, capacity check.
- **MUST — reservations:** `SeatingRequest{RESERVATION, reservationAt}`; read reservation rules/timers from config; read `ReservationBlock`/`OperatingHours`.
- **MUST — walk-in:** `SeatingRequest{WALK_IN|WAITLIST}` (map legacy `SEATING`+`isWalkIn`); walk-in timers from config.
- **MUST — ordering integration:** only the **boundary** — an optional `SeatingRequest↔Order` link (no ordering changes); table occupancy stays seating-owned.
- **SHOULD (evaluate):** table runtime status (`TableStatus`) + status transitions from `SeatingRequest` lifecycle; minimal auto-cancel/no-show timer parity.
- **FUTURE:** cron/notification parity depth, waiter, QR persistence, experience/event seating, `manageDateRange` hours overrides, blackout enforcement, dine-in dual-embed table pick.
- **UNKNOWN:** live `seatingarea` writes; `reserveDate`.

---

## 19. Dependency Graph

| Relationship | Class | Evidence |
|---|---|---|
| Merchant → Restaurant → Subscription | HARD | tenancy (P1.7.2/P1.7.10) |
| Subscription.config → Seating (enablement + table_setup) | **HARD** | `table_setup` embedded in subscription (`subscription.model.ts:410–460`) |
| Seating (SeatingArea) → Tables (RestaurantTable) | HARD | tables grouped by floor/area; target FK |
| Restaurant → Seating Areas / Tables | HARD | tables belong to a location |
| Seating → Reservations | HARD | reservations are a seating request type (`Diner.service_type`) |
| Seating → Walk-ins | HARD | walk-in/waitlist are seating request types (`isWalkIn`) |
| Reservations/Walk-ins → Diner (SeatingRequest) | HARD | all are `Diner` rows |
| Diner → Tables (occupancy) | SOFT | `table_number` assigned at accept/seat; syncs status |
| Seating/Diner → Orders | OPTIONAL | `cross_ref_id`/`diner_id` (`ordering.model.ts:44–48,445–449`) |
| Orders → Tables | OPTIONAL | denormalized `dine_in_details.table_number` string only |
| Seating → Experiences | SOFT/OPTIONAL | `expRequest.diner_id`/`tableNumber` |
| Seating → Events | SOFT/OPTIONAL | parallel `event-handler`; `events.table_setup` |
| Seating → Menu/Items | NO DEPENDENCY | independent (P1.7.13) |
| Seating → Offers | NO DEPENDENCY | offers apply at cart/order (P1.7.13) |
| Seating → Ordering (blocking?) | NO DEPENDENCY | ordering works without seating (P1.7.12) |
| `seatingarea` collection → Seating | UNKNOWN/none | marginal/bootstrap only |

---

## 20. Explicitly Deferred

Seating implementation itself (P1.7.16); `table_setup` normalization mechanics + cron/table-status parity; waiter model; QR persistence; experience/event seating; `manageDateRange` hours overrides; blackout enforcement; dine-in dual-embed table pick; Menu/Item write; Offers; Experiences/Events; Ordering changes; Payment/Delivery/POS/Realtime; scan-pay; ONDC; Mongo data import; geography/media. **Nothing was implemented in this slice.**

---

## 21. Evidence / Source References

**`table_setup` / setup:** `subscription.model.ts:348–461, 527–578, 954–1003, 1135–1231, 1639–1750, 1819–2221, 2308–2310`; `config/default.js:880–886`; `amealiodashboardmvp-` `TableManagementScreen.js:205–226`, `TableSeatManagement.js:547–617`, `PrintComponent.js:68–78`, `addingAction.js:589–604`, `authAction.js:581–583`; `vendor-table-management.class.ts:179–195`.

**Runtime/booking/cron:** `common/constants.ts:4–12`; `diner.model.ts:36–40,46–68,91,96,106,154–158`; `diner.hooks.ts:236–300,996–1017,1173–1208,1361–1367,1661–1706,1756–1916,3177–3193`; `diner-cron.class.ts:56–102,379–380,1043–1067,1224–1251`; `helpers/autoCancel.ts:1096–1119,1425–1426`; `table-dinner.class.ts:83–99,123–168`; `restaurant-availability.class.ts:25–62`; `manage-reservation-block.model.ts:12–28`; `manage-hours-of-operation.model.ts:12–34`; `SeatingRequest.jsx:127–189`.

**Collections/QR/waiter:** `seating-area.model.ts:6–11`; `restaurant.class.ts:239,264,621`; `restaurant.model.ts:92`; `waiter.model.ts:6–17`, `waiter.class.ts:50–57`.

**Ordering/experience/event:** `ordering.model.ts:44–48,98–100,445–449`; `ordering.class.ts:2034–2037`; `user-ordering.class.ts:538–546`; `user-diner.class.ts:993–999`; `expRequests.model.ts:39–64`; `userExpRequest.class.ts:1747–1765`; `experience-cart.model.ts:42–70`; `events.model.ts:105–144`; `event-handler.model.ts:41–60`.

**Target:** `prisma/schema.prisma:146–159,521–580,804–850,1080–1106`; `apps/api/src/modules/subscription/application/subscription-config.service.ts:66–76`; docs 40–43.
