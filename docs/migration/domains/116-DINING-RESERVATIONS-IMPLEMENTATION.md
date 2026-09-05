# 116 — Dining / Reservations Runtime Slice 1 (implementation)

**Status:** IMPLEMENTED (Slice 1 only). Forensic contract unchanged.  
**Date:** 2026-09-05  
**Starting HEAD:** `1d969d89e195a2a421a8161ebc3d510e61eda59c`  
**Implementation commits:** `2a7b1ea` (API/UI), `fa08766` (e2e), plus the merchant active-lane + documentation commits on this branch.  
**Governing contract:** [116-DINING-RESERVATIONS-RECONCILIATION.md](./116-DINING-RESERVATIONS-RECONCILIATION.md)  
**Gap matrix:** [116-DINING-RESERVATIONS-GAP-MATRIX.json](./116-DINING-RESERVATIONS-GAP-MATRIX.json)  
**Foundation:** [45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md](./45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md)

This document records what Slice 1 shipped. It does **not** rewrite the Stage 116 forensic. Owner decisions OD-SEAT-1 through OD-SEAT-12 remain unresolved.

---

## 1. Scope implemented

Consumer (JWT, signed-in only):

1. Create a diner request through existing `SeatingService` / `SeatingRequest`.
2. List and get **own** requests (server-side ownership).
3. Cancel own request from `PENDING` or `NOT_SEATED`.

Merchant staff (`JwtStaffGuard` + `StaffAuthorizationGuard` + `MerchantScopeService`):

4. List diner requests for an in-scope restaurant.
5. Accept: `PENDING → NOT_SEATED`.
6. Seat: `NOT_SEATED → SEATED` and bind an available `RestaurantTable`.
7. Complete: `SEATED → COMPLETED`.

Consumer product label: **Book a Table**. Reservation remains a second intent on the same screen family. No second booking engine.

## 2. Existing foundation reused

| Piece | Reuse |
|---|---|
| `SeatingRequest` / `SeatingType` / `SeatingStatus` | Booking authority. Existing enum names preserved |
| `SeatingArea` → `RestaurantTable` | Inventory. `RestaurantTable.status` remains occupancy authority |
| `SeatingService.createSeatingRequest` / `updateSeatingRequest` | Unchanged staff foundation path (doc 45 tests still green) |
| `Subscription.config` + `SubscriptionConfigService.isSeatingEnabled` | Feature gate. No subscription redesign |
| `MerchantScopeService.assertRestaurantInScope` | Tenant isolation. Client `merchantId` is never authorization |
| `JwtConsumerGuard` / `JwtStaffGuard` / `StaffAuthorizationGuard` | Existing auth |

Experience / Event seating, Order, catalog, payments, and delivery were not touched.

## 3. API routes added / changed

Canonical Nest URI versioning (`/api/v1`). Create is **`POST /diner`**, not `POST /user/diner`, not a second `/seating/requests` alias.

### Consumer (`JwtConsumerGuard`)

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/v1/diner` | Create. Body: `restaurantId`, `intent` (`SEATING` \| `RESERVATION`), `partySize`, optional party fields / `reservationAt`. Server sets `userId`, `merchantId`, `type`, `status=PENDING`, `tableId=null` |
| `GET` | `/api/v1/diner` | List the authenticated user's requests |
| `GET` | `/api/v1/diner/:id` | Get own request. Other users receive 404 |
| `PATCH` | `/api/v1/diner/:id/cancel` | Cancel own `PENDING` / `NOT_SEATED`. Terminal states 400 |

Unknown fields (`type`, `status`, `merchantId`, `userId`, `tableId`) are rejected by the validation pipe.

### Merchant (`JwtStaffGuard` + `StaffAuthorizationGuard`, roles `MERCHANT_OWNER` \| `MERCHANT_STAFF`)

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/v1/merchant/diner?restaurantId=&status=` | Merchant-scoped list. `restaurantId` is a target, not a grant |
| `GET` | `/api/v1/merchant/diner/tables?restaurantId=` | Existing `listTables` |
| `GET` | `/api/v1/merchant/diner/:id` | Get if restaurant is in staff merchant scope |
| `PATCH` | `/api/v1/merchant/diner/:id/accept` | `PENDING → NOT_SEATED`, sets `confirmedAt` |
| `PATCH` | `/api/v1/merchant/diner/:id/seat` | Body `{ tableId }`. `NOT_SEATED → SEATED` |
| `PATCH` | `/api/v1/merchant/diner/:id/complete` | `SEATED → COMPLETED` |

No reject, timeout, notification, slot, or Super Admin host-stand routes.

## 4. Authorization model

**Consumer:** JWT only. `userId` from the access token. No guest / OTP. Cross-user get/cancel is 404 (same pattern as consumer orders). Consumer cannot accept, seat, or complete.

**Merchant:** Staff JWT + role guard. Scope from `StaffPrincipal.merchantId` via `MerchantScopeService`. Cross-merchant list/accept/seat/complete is 403. Unauthenticated merchant calls are 401. A consumer JWT on merchant routes is 401.

**SUPER_ADMIN:** Role guard still short-circuits (existing architecture; not changed). Isolation for merchant staff remains restaurant-owned. Slice 1 does **not** add a Super Admin host stand (OD-SEAT-8). Merchant UI is `RequireMerchant` only.

## 5. State transitions

Existing names, no parallel machine:

```
create → PENDING
merchant accept → NOT_SEATED
merchant seat (+ available table) → SEATED
merchant complete → COMPLETED
consumer cancel (PENDING or NOT_SEATED) → CANCELLED
```

Rejected by Slice 1 HTTP:

- `PENDING → SEATED` or `COMPLETED` (must accept first)
- `NOT_SEATED → COMPLETED`
- `SEATED / COMPLETED / CANCELLED → CANCELLED` (consumer)
- repeat accept / complete

Staff foundation `updateSeatingRequest` is unchanged and still does **not** enforce this graph (doc 45). Slice 1 operational routes do.

`REJECTED` and `INITIAL` are not written by this slice.

## 6. Table assignment / concurrency

No new allocator. No migration.

On seat, inside `SeatingRepository.seatRequestOnTable`:

1. `SELECT … FOR UPDATE` the `RestaurantTable` row (joined to `SeatingArea` for restaurant).
2. Require same restaurant, `isActive`, `deletedAt` null, `status = AVAILABLE`.
3. Lock any other non-terminal `SeatingRequest` already bound to that table; reject if present.
4. Lock the diner row; require `NOT_SEATED`.
5. Compare-and-set request `NOT_SEATED → SEATED` + `tableId`.
6. Compare-and-set table `AVAILABLE → OCCUPIED`. Either `updateMany` count ≠ 1 → 409.

Complete: `SEATED → COMPLETED`; bound table `OCCUPIED → DIRTY`.  
Consumer cancel of a bound `NOT_SEATED` request releases `ON_HOLD` / `OCCUPIED` → `AVAILABLE`. Accept does not bind a table.

Out-of-restaurant tables: 400. Occupied / inactive tables: 409. Concurrent double-seat: one 200, one 409 (covered by e2e).

## 7. UI flows

**Consumer `apps/web`**

- Restaurant page: **Book a Table** entry.
- `/restaurants/:restaurantId/book-a-table` — create (SEATING or RESERVATION).
- `/diner/:id` — status + cancel when `canCancel`.
- `/diner` — own list. Nav label: Tables.

**Merchant `apps/merchant`**

- `/diner` — pending/active queue with Accept / Seat / Complete.
- Seat offers only `AVAILABLE` tables from the scoped restaurant.
- Invalid actions are not rendered. Super Admin is redirected away (no host stand).

Existing design-system tokens and layout only.

## 8. Tests

`apps/api/test/stage-116-dining-reservations-runtime.e2e-spec.ts`

- Authenticated consumer create / list / get / cancel
- Unauthenticated create rejected; cross-user get/cancel 404
- Client cannot send `type` / `status` / `merchantId` / `userId` / `tableId`
- `PENDING → NOT_SEATED → SEATED → COMPLETED`; invalid transitions 400
- Merchant isolation and 401
- Out-of-scope table 400; unavailable table 409; sequential double-seat 409
- Concurrent double-seat: exactly one occupant

Regressions run green: seating-foundation, staff-authorization, consumer-auth, Stage 115, Stages A–G, I, J, merchant-order-management.

## 9. Browser validation

Recorded against local `apps/web` (5173), `apps/merchant` (5174), and `apps/api` (3000) on seeded `amealio_dev`. The Cursor `computerUse` subagent was unavailable (monthly spend limit). Validation used headed Chrome against the live Vite apps.

Consumer (`+91` `9000000000` / `ConsumerSecret123!`):

1. DEV Test Kitchen still shows catalog items and a **Book a Table** entry.
2. Submit Book a Table (party 2) → status `PENDING` + Cancel.
3. Cancel → `CANCELLED`; Cancel is no longer offered.
4. Create a second request (party 3) and leave it `PENDING`.

Merchant (`dev.owner@example.test` / `MerchantSecret123!`):

1. Diners → Active shows the pending request.
2. Accept → `NOT_SEATED` (Accept hidden, Seat shown).
3. Seat available `T1` → `SEATED` + table code (Seat hidden, Complete shown).
4. Complete → row leaves Active; History shows `COMPLETED` with no Accept/Seat/Complete.
5. Catalog still loads for DEV Test Kitchen.

Cross-merchant list/accept is 403 in `stage-116-dining-reservations-runtime.e2e-spec.ts` (live second-merchant login also requires the existing owner-activation gate).

## 10. Database / migration status

**Migration: NO.**

Existing `SeatingRequest` + `RestaurantTable` + `Subscription.config` are sufficient. Seed only: consumer password, seating `Subscription.config` gates, and Main Hall `T1`/`T2` inventory for local smoke.

## 11. Explicitly deferred (still out of scope)

PENDING timeout / cron, no-show / NOTSEATED automation, reservation-block enforcement, geo hard-gating, maps, guest OTP, QR, Quick Seat, Super Admin host stand, notifications, sockets, ETA / `wait_time` schema, Order / Experience / Event linkage, payments, food ordering, delivery, advanced waitlist, table reflow / AI allocation, Stage H, Stage K, J remainder, catalog changes, subscription redesign, media/upload.

## 12. Owner decisions (still unresolved)

Slice 1 followed already-stated defaults only. Do not treat these as closed:

| ID | Slice 1 default used |
|---|---|
| OD-SEAT-1 | No geo hard-gate |
| OD-SEAT-2 | No NOTSEATED no-show cron |
| OD-SEAT-3 | No `ReservationBlock` enforcement |
| OD-SEAT-4 | Signed-in only |
| OD-SEAT-5 | No `INITIAL` |
| OD-SEAT-6 | No `seat[]` |
| OD-SEAT-7 | No `orderId` |
| OD-SEAT-8 | No Super Admin host stand |
| OD-SEAT-9 | No notifications / sockets |
| OD-SEAT-10 | Server derives type: `walkin_waitlist.value === true` → `WAITLIST`, else `WALK_IN` (no restaurant wait-time column; no migration) |
| OD-SEAT-11 | No `wait_time` column |
| OD-SEAT-12 | One consumer **Book a Table** entry; type from OD-SEAT-10 |

Catalog ODs remain unrelated.

## 13. Blockers / discoveries

None that stopped Slice 1. Noted only:

- Restaurant has no `seatingWaitingTime` column; OD-SEAT-10 cannot read a restaurant wait-time field without a migration (not applied).
- Staff foundation `updateSeatingRequest` still skips the Slice 1 state machine (intentional; keeps doc 45 tests).
- `StaffAuthorizationGuard` SUPER_ADMIN role bypass is unchanged (known 115 limitation).
