# 45 — Merchant Seating Configuration & Seating Request Foundation (P1.7.16)

> **Type:** IMPLEMENTATION (bounded slice) — canonical merchant seating **inventory** + physical-table **runtime status** + **seating/booking request** foundation, over the EXISTING target seating models. One additive migration.
> **Governing gate:** [44-SEATING-TABLE-SETUP-RECONCILIATION.md](./44-SEATING-TABLE-SETUP-RECONCILIATION.md) (DEC-2 = HYBRID).
> **Authority:** legacy source (`amealio-vendordashboard` `subscription.model.ts`/`diner.model.ts`, `amealiodashboardmvp-`) + target `prisma/schema.prisma`. Baseline **230/230 → 242/242**.

---

## 1. Scope

Implemented (merchant-tenant-scoped, no controllers/UI):
1. **Seating inventory** — `SeatingArea` → `RestaurantTable` write foundation.
2. **`table_setup` translation** — canonical create path that maps confirmed legacy inventory fields onto normalized entities (NOT wholesale JSON copy).
3. **Physical table runtime status** — `TableStatus` enum + `RestaurantTable.status` (runtime), with an explicit merchant setter (legacy manual PATCH).
4. **Seating request foundation** — `SeatingRequest` create + minimal update preserving RESERVATION / WALK-IN / WAITLIST / physical-table-assignment distinctions.
5. **Subscription boundary** — feature gates/timers/rules stay in `Subscription.config` (reuses P1.7.14 non-destructive update); untouched here.

**Deferred (documented below):** booking-lifecycle → table-status auto-sync, auto-cancel cron, seats (`seat[]`), waiter, QR, experience/event seating, ordering cross-links, blackout enforcement, hours overrides, dual seating-vs-dine-in embed reconciliation.

---

## 2. Legacy source mapping

| Legacy (`subscription…table_setup`) | Target | Notes |
|---|---|---|
| `floors[].area` / `table[].area` | `SeatingArea.name` | normalized area |
| `table[].table_number` | `RestaurantTable.code` | `@@unique([seatingAreaId, code])` |
| `table[].pax_value` | `RestaurantTable.capacity` | default 2 |
| `table[].name` | `RestaurantTable.name` | optional |
| `table[].floor_number` | `RestaurantTable.floor` | optional string |
| `table[].shape` | `RestaurantTable.shape` | optional |
| `table[].active` | `RestaurantTable.isActive` | default true |
| `table[].status` (`AVAILABLE|OCCUPIED|DIRTY|ON_HOLD|UNAVAILABLE`) | `RestaurantTable.status` (`TableStatus`) | **RUNTIME** |
| `table[].number` / `.location` / `.temporay` / `.reserveDate`; `seat[]` | — | **NOT mapped** (no confirmed target consumer; `reserveDate` dead, seats deferred — doc 44 §5,§7) |
| `Diner` (`service_type`, `isWalkIn`, `diner_status`, `reservationTime`, party) | `SeatingRequest` (`type`, `status`, `reservationAt`, `partySize`, …) | see §4 |
| seating/reservation/walk-in enablement + timers/rules | `Subscription.config` (unchanged) | hybrid boundary |

---

## 3. Target seating entities & `table_setup` translation

`apps/api/src/modules/seating/` provides the write path. The legacy embedded `table_setup` JSON is **not** the operational target representation; the service creates normalized rows:

- `createSeatingArea(restaurantId, name, legacyId?)` → `SeatingArea` (unique per `(restaurantId, name)`).
- `createTable(seatingAreaId, code, name?, floor?, shape?, capacity?, isActive?, legacyId?)` → `RestaurantTable` (unique per `(seatingAreaId, code)`).

Legacy fields with no confirmed target equivalent are **documented, not invented** (§2). Unknown legacy keys are never silently promoted to target semantics.

---

## 4. SeatingRequest semantics & the reservation/walk-in/waitlist distinction

Legacy `Diner` maps to the existing `SeatingRequest`:
- `service_type = RESERVATION` → `type = RESERVATION`.
- `service_type = SEATING` + `isWalkIn = true` → `type = WALK_IN`.
- `service_type = SEATING` + `isWalkIn = false` → `type = WAITLIST`.

(Mapping is source-established, doc 44 §9; the target `SeatingType` accepts the three values directly.) `createSeatingRequest`:
- validates `type` and a positive `partySize`;
- requires `reservationAt` for `RESERVATION`;
- sets initial `status = PENDING`;
- binds **no physical table at creation** (`tableId = null`) — reservations/walk-ins begin at restaurant/capacity level.

`updateSeatingRequest` is a **minimal** write path (not a workflow engine): partial `status` transition and/or **physical-table binding** at accept/seat (`tableId`), plus `confirmedAt`/`cancelReason`. A bound table must belong to the **same restaurant**. The five concepts stay distinct: RESERVATION/WALK-IN/WAITLIST (`type`), physical-table assignment (`SeatingRequest.tableId`), and table occupancy (`RestaurantTable.status`) are separate.

---

## 5. Table runtime status (Phase 5)

**Placement is unambiguous** — legacy stores status on the table object (`table[].status`), so the target keeps it on `RestaurantTable.status` (`TableStatus` enum, 1:1 with legacy `TABLE_STATUS`). It is **RUNTIME state**, defaulting to `AVAILABLE`, changed via an explicit merchant-scoped `setTableStatus` (mirroring the legacy manual `change_table_status_table_management` PATCH). It is clearly separated from configuration (`Subscription.config`) and from booking state (`SeatingRequest.status`).

**Deferred:** the booking-lifecycle → table-status **auto-sync** (legacy `diner.hooks` + `updateTableStatusInSubscription`) is a runtime/cron concern and is **not** implemented here (§6).

---

## 6. Auto-cancel / cron parity (Phase 6) — DEFERRED

The canonical seating **configuration + request** foundation is semantically complete without auto-cancel: creating/representing requests, assigning tables, and setting table status do not depend on a scheduler. Legacy auto-cancel is a runtime SLA behavior (minute cron + `setTimeout` + `autoCancel.ts`), and this slice is explicitly forbidden from creating a generic scheduler. → **Deferred**, to be designed with the reservation/walk-in runtime slice. No scheduler/event/state-machine architecture was invented.

---

## 7. Subscription boundary (Phase 7)

Subscription is **not** redesigned and seating config is **not** normalized out of it. Seating **feature gates + timers + rules** remain in `Subscription.config`, read via the P1.7.3 `SubscriptionConfigService` and written via the P1.7.14 **non-destructive** `updateSubscriptionConfig` (unrelated keys preserved — covered by a test). No new configuration semantics were invented.

---

## 8. Authorization / tenancy (Phase 9)

All seating writes take a `StaffPrincipal` and are merchant-tenant-scoped via P1.7.2 `MerchantScopeService.assertRestaurantInScope` (which reuses P1.7.1F):
- merchant staff operate only within their own merchant; cross-merchant → `403`;
- `SUPER_ADMIN` (platform) targets a restaurant explicitly;
- unknown/soft-deleted restaurant → `404`; merchant scope is always server-derived (no client-supplied scope, no act-as).
- The **activation gate** (P1.7.14) is upstream: a BLOCKED owner cannot obtain a staff session (verified in tests via the real staff login), so it can never reach the seating service; `JwtStaffGuard` enforces non-`ACTIVE` rejection at the HTTP layer. No new RBAC concepts were added.

---

## 9. Schema changes (additive)

`prisma/schema.prisma`:
- **New enum** `TableStatus { AVAILABLE, OCCUPIED, DIRTY, ON_HOLD, UNAVAILABLE }`.
- **`SeatingArea`** += `legacyId String? @unique`, `deletedAt DateTime?`, `@@unique([restaurantId, name])`.
- **`RestaurantTable`** += `legacyId String? @unique`, `name String?`, `floor String?`, `shape String?`, `isActive Boolean @default(true)`, `status TableStatus @default(AVAILABLE)`, `createdAt`, `updatedAt`, `deletedAt`, `@@index([seatingAreaId])`.

All additive; no existing column altered/dropped; historical migrations untouched. `prisma validate` ✓.

## 10. Migration

`prisma/migrations/20260902093000_p1_7_16_seating_inventory/migration.sql` — creates the `TableStatus` enum, adds the columns/indexes above. Applied to **dev** (`amealio_dev`) and **test** (`amealio_test`); `migrate status` = up to date (7 migrations).

## 11. Tests (12 new; 230 → 242)

`apps/api/test/seating-foundation.e2e-spec.ts` (real TEST DB): area+table creation; area/table uniqueness; invalid-input rejection; cross-merchant rejection + SUPER_ADMIN explicit target; soft-deleted restaurant rejection; **activation gate** via real staff login (BLOCKED owner cannot operate); table runtime status set + invalid/cross-merchant rejection; RESERVATION/WALK_IN/WAITLIST creation with distinctions; `reservationAt`/type/partySize validation; physical-table binding at seat + same-restaurant enforcement; request ownership (cross-merchant/unknown); non-destructive `Subscription.config` seating-gate merge.

## 12. Remaining UNKNOWNs / owner decisions

- Booking-lifecycle → table-status **auto-sync** + **auto-cancel cron** parity (runtime slice).
- **Seats** (`seat[]`) — no target entity; deferred.
- **`SeatingStatus.INITIAL`** — only needed for the experience-checkout draft flow (out of scope); not added.
- Dual **seating-vs-dine-in** `table_setup` embeds → single `RestaurantTable` set (reconcile at import time).
- **`manageDateRange`** hours overrides + **blackout enforcement**; **QR** persistence; **waiter↔table** binding — all deferred (doc 44 confirmed none/unknown).
- **Order↔seating** cross-links (`cross_ref_id`/`diner_id`) — documented (doc 44 §13), not implemented (Seating→Ordering optional).

## 13. Explicitly deferred / not implemented

Customer/merchant seating UI; full reservation lifecycle/workflow engine; auto-cancel cron/scheduler; booking→table auto-sync; seats; waiter/waiter-table; QR generation/persistence; experience/event seating; menu/item/offer integration; cart; ordering changes; payment/delivery/POS/realtime/settlement; ONDC; geography/media; Mood/Craving; billing/Product-Plan; act-as/switching. **No frontend was migrated; no unrelated domain was modified.**
