# 116 — Dining / Reservations (unified Diner / Book a Table)

**Status:** FORENSIC ONLY. No production behavior changed.  
**Date:** 2026-09-05  
**Starting HEAD:** `de573bb3e4a6f019ebdcf89ef6db91ccb1a2f9a0`  
**Final HEAD:** `5940cbc043c11875b81f354fa7f7f5a04c856a2d` (documentation-only; no production files).  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Machine-readable matrix:** [116-DINING-RESERVATIONS-GAP-MATRIX.json](./116-DINING-RESERVATIONS-GAP-MATRIX.json)

This document recovers how amealio actually runs **walk-in, waitlist, reservation, table assignment, timers, and consumer/merchant dining operations**, then states the L4 target contract on the existing P1.7.16 seating foundation.

It is **not** an implementation slice. It does **not** invent OpenTable-style auto-assignment.

Do **not** start this implementation without an explicit GO. Do **not** start Stage H or Stage K. Do **not** expand Stage J. Do **not** modify Stages A–G, I, 115, payments, or catalog authorities. Do **not** merge restaurant seating with Experience or Event seating (doc 113).

---

## Why this is the next official domain (roadmap evidence, not preference)

Stage 115 closed the last **Catalog / Menu** hole in the 103 A–J sequence (merchant scratch authoring). That sequence then ends: Stage H is already forensic and **DEFER**; Stage J remaining slices need a separate GO; Stage K is already forensic and **DEFER**.

The approved P1.3 map is then the governing sequence:

> Identity → Merchant/Location → Catalog/Menu → Orders → Payments → **Reservations/Notifications** → Delivery/Admin → optional → frontend cutover

Evidence:

| Source | What it says |
|---|---|
| [india-baseline/17-TARGET-MIGRATION-MAP.md](../india-baseline/17-TARGET-MIGRATION-MAP.md) | Official post-commerce next domain is **Reservations/Notifications** |
| [target-architecture/10-MIGRATION-SEQUENCE.md](../target-architecture/10-MIGRATION-SEQUENCE.md) **Phase F** | **Dining/Reservations (unified Diner)** after Phases B–D (and after payments already shipped) |
| [target-architecture/02-DOMAIN-BOUNDARIES.md](../target-architecture/02-DOMAIN-BOUNDARIES.md) | Dining / Reservations = **CORE**; reservation lifecycle **REQUIRED** |
| [india-baseline/14-CAPABILITY-MATRIX.md](../india-baseline/14-CAPABILITY-MATRIX.md) §4 | Reservations create / lifecycle / cancel / confirm = **REQUIRED** |
| [45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md](./45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md) §6, §13 | Foundation shipped; **reservation/walk-in runtime slice** and **customer/merchant UI** explicitly deferred |
| [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md) §13 | A–J core-commerce sequence; Celebration Packages excluded (that is Stage K, already parked) |
| D-011 / 17-TARGET-MIGRATION-MAP | `amealio-self-delivery-app` is **deferred from baseline**; Delivery is Phase G **after** Reservations |
| 111 / 113 / 00-rule | Stage H and Stage K remain **DEFER without GO** |

Docs **44** and **45** are the P1.7.15/16 hybrid foundation (DEC-2 resolved). They are **not** an 00-rule L1–L4 runtime contract. This document is that contract.

**Exact domain name:** Dining / Reservations  
**Product surface names recovered from evidence:** consumer **“Book a Table”** (walk-in/waitlist entry; **not** the string “Book at Table”), plus **Reservation**.  
**Existing stage/docs:** P1.3 Phase F; docs 44 + 45; this 116.

---

## Vocabulary (do not collapse)

| Term | What the evidence says it is | What it is not |
|---|---|---|
| **Diner / SeatingRequest** | One booking aggregate for walk-in, waitlist, and reservation | Not an Order. Not an Experience booking. Not an Event ticket |
| **Walk-in** | Legacy `service_type=SEATING` + `isWalkIn=true` (server-set when restaurant `seatingWaitingTime` is missing/`00-00`). Target `SeatingType.WALK_IN` | Not a separate status. Not “Book at Table” as a third type |
| **Waitlist** | Legacy `service_type=SEATING` + `isWalkIn=false`. Target `WAITLIST` | Not a separate Feathers collection |
| **Reservation** | Legacy `service_type=RESERVATION` + `reservationTime`. Target `RESERVATION` | Not a physical-table hold at create time |
| **Book a Table** | Consumer V2 **label** for the `WALK_IN` chip that opens `/seating/waitlist` | No screen or API named “Book at Table” exists |
| **User Tracker** | Super Admin **video-activity** tab + a broken `/userTrack` query against `seatingarea`. Row-level `TestMap` is a location popup | Not a live diner-tracking product |
| **Table assignment** | Merchant binds `table_number` / `SeatingRequest.tableId` at accept/seat | Not OpenTable auto-reflow. Not create-time inventory claim |
| **Table status** | Physical runtime `AVAILABLE\|ON_HOLD\|OCCUPIED\|DIRTY\|UNAVAILABLE` | Not `SeatingStatus`. Not publication. Not Stage C item availability |
| **SeatingStatus** | Booking lifecycle `PENDING → NOT_SEATED → SEATED → COMPLETED` plus `REJECTED` / `CANCELLED` | Not table occupancy |
| **Timers** | Subscription auto-accept / auto-cancel minutes + per-diner `wait_time`; merchant countdown UI | Not Stage C schedules. Not order ETA |
| **DEC-2 Hybrid** | Gates/timers/rules stay in `Subscription.config`; inventory + runtime + bookings are relational | Not flatten `table_setup` JSON as SoT |

---

## 1. Starting HEAD

`de573bb3e4a6f019ebdcf89ef6db91ccb1a2f9a0` on `replatform/backend-consolidation`.

Accepted prior slices at that HEAD: Stages A–G implemented; Stage I implemented; Stage J first slice implemented; Stage 115 merchant catalog authoring implemented; Stage H and Stage K forensic / deferred; P1.7.16 seating **foundation** implemented (no HTTP, no UI).

## 2. Final HEAD

`5940cbc043c11875b81f354fa7f7f5a04c856a2d` — documentation-only commit on the same branch. No Prisma, API, React, seed, CSS, or contract change. A follow-up stamp on this file does not change production behavior.

## 3. Repositories inspected

| Repo | Path | Role | Dining / Reservations evidence |
|---|---|---|---|
| Replateform-Amealio | `/agent/repos/replateform-amealio` | Canonical target | `SeatingModule` service-only; Prisma `SeatingArea` / `RestaurantTable` / `SeatingRequest` / `ReservationBlock` / `OperatingHours`; no consumer or merchant seating routes |
| Amealio-VendorDashboard | `/agent/repos/amealio-vendordashboard` | Legacy Feathers/Mongo **truth** | `diner.model.ts`, `diner.hooks.ts` (~4800 lines), `user-diner`, `vendor-diner`, `table-dinner`, `diner-cron`, `autoCancel.ts`, subscription `table_setup` + gates |
| AmealioDashboardMVP- | `/agent/repos/amealiodashboardmvp-` | Merchant + Super Admin UI | Seating / pending / reservation / history dashboards, Quick Seat, table setup, QR print, Super Admin vendor queues |
| amealio_web_app | `/agent/repos/amealio_web_app` | Consumer | `NewSeatingResquest.jsx`, V2 tracker, “Book a Table” chip, `POST /diner`, `PATCH /user/diner` |
| amealio-nestjs-backend | `/agent/repos/amealio-nestjs-backend` | Nest tracking/delivery | **No** diner / seating / reservation code |
| amealio-self-delivery-app | `/agent/repos/amealio-self-delivery-app` | Rider | **No** diner / seating / reservation code |

## 4. Repositories unavailable

| Repo | Status |
|---|---|
| Amealio-VendorApp | **Unavailable** under `/agent/repos` |
| Amealio-Homepage-V2-RAG-Server | **Unavailable** (irrelevant to dining runtime) |

Absence does not block this forensic. VendorApp would be a second merchant surface; web merchant + Feathers diner APIs reconstruct the domain.

## 5. Documents inspected

`00` behavioral rule · `02` domain inventory · `08` workflows · `10-migration-risks` Phase 4 · `14` capability matrix · `17` target migration map · `target-architecture/02` domain boundaries · `target-architecture/10` migration sequence · `database/09` reservation data model · `30` subscription config · `44` seating/`table_setup` reconciliation · `45` seating foundation · `48`/`49`/`113` Experience/Event seating split · `69`/`91` delivery (deferred from this domain) · `95` next consumer surface · `103`–`115` core commerce + authoring (do not modify).

---

## 6. L1 — Legacy Reality

Primary runtime: **`amealio-vendordashboard` `Diner` + `diner.hooks.ts`**. Primary merchant UI: **`amealiodashboardmvp-`**. Primary consumer UI: **`amealio_web_app`**.

```
Consumer “Book a Table” (/seating/waitlist)  → POST /diner  service_type=SEATING
Consumer Reservation (/seating/reservation) → POST /diner  service_type=RESERVATION + reservationTime
Merchant Add Diner / Quick Seat             → POST /diner  pointOfEntry=VENDOR
        │
        ▼
  PENDING  (or NOTSEATED if auto-accept)
        │  merchant PATCH /diner/:id
        ▼
  NOTSEATED  (+ optional table_number → table ON_HOLD)
        │  merchant PATCH + table_number
        ▼
  SEATED     (table OCCUPIED)
        │  merchant PATCH or PATCH /vendor/diner?markComplete
        ▼
  COMPLETED  (table DIRTY)
  REJECTED / CANCELLED (table AVAILABLE if bound)
```

### 6.1 Three request types, one aggregate

| Product type | Legacy fields | Who creates | Extra facts |
|---|---|---|---|
| Walk-in | `SEATING` + `isWalkIn=true` | Consumer `/seating/waitlist` or merchant Add/Quick Seat | Server sets `isWalkIn` when `seatingWaitingTime` is missing/`00-00`. Consumer V2 does **not** POST `isWalkIn` |
| Waitlist | `SEATING` + `isWalkIn=false` | Same waitlist route | Same POST `service_type=SEATING` |
| Reservation | `RESERVATION` + `reservationTime` | `/seating/reservation` or merchant Add Reservation | Slots from `GET /restaurant-availability/:id?date=` |

There is **no** `WAITLIST` service_type and **no** `WALKIN` status.

### 6.2 Authoritative booking state machine

`SEATING_STATUS`: `INITIAL | PENDING | NOTSEATED | SEATED | REJECTED | COMPLETED | CANCELLED` (`src/common/constants.ts`).

| Status | Writers | Notes |
|---|---|---|
| `INITIAL` | Schema default; experience-draft adjacent | Not used on the live consumer/merchant food-seating path |
| `PENDING` | Create when auto-accept fails | Consumer + merchant create |
| `NOTSEATED` | Auto-accept create, or merchant accept | Sets `dinerAcceptTime`, `wait_time`, `table_kept_time` |
| `SEATED` | **Merchant PATCH only** | Typically with `table_number` |
| `REJECTED` | Merchant, `dinerAutoCancel`, minute cron | PENDING timeout |
| `CANCELLED` | Merchant PATCH or consumer `PATCH /user/diner` | Consumer may cancel PENDING / NOTSEATED |
| `COMPLETED` | Merchant PATCH or bulk `PATCH /vendor/diner?markComplete` | Table → `DIRTY` |

Target already names these `PENDING | NOT_SEATED | SEATED | REJECTED | COMPLETED | CANCELLED` (`SeatingStatus`). `INITIAL` remains deferred (doc 45).

### 6.3 Table occupancy is a second machine

Physical status lives on subscription `table_setup.table[].status` (legacy) / `RestaurantTable.status` (target):

| Booking transition | Table status |
|---|---|
| NOTSEATED + table | `ON_HOLD` |
| SEATED | `OCCUPIED` |
| Table swap while SEATED | old `AVAILABLE`, new `OCCUPIED` |
| REJECTED / CANCELLED | `AVAILABLE` |
| COMPLETED | `DIRTY` |
| Merchant manual PATCH `/subscription/table/:id?seating=true` | Any `TABLE_STATUS` |

Reservations are **restaurant/capacity-level at create** (`table_number` empty). Physical bind happens at accept/seat. This matches docs 44/45 and must be preserved.

`GET /table/diner` subtracts tables that appear on **active diners**, and does **not** filter by the table status enum. `geolib` is imported there and unused.

### 6.4 Consumer runtime (`amealio_web_app`)

- V2 chip **“Book a Table”** key `WALK_IN` → `/restaurant/:id/seating/waitlist` → `NewSeatingResquest.jsx` with `service_type: "SEATING"`.
- **Reservation** → `/seating/reservation` + date/time slots.
- Guest path: OTP modal (`SeatingUserRegistration`) then `POST /diner` (`pointOfEntry: 'USER'`, `noLocationData: true`).
- `POST /user/diner` is **404 Method not allowed**. Create is `/diner`.
- Track: `/seating/track/:dinerId` → `V2SeatingTrackerScreen`; socket `diner_trigger`.
- Cancel / arrival confirm / ETA: `PATCH /user/diner/:id`. Arrival confirm is **time-based** (`userConfirmed`), not geofence. Walk-in-only is excluded from the arrival modal.
- Geo: consumer **does not send coordinates** on the new booking POST. Backend still has a geolib radius check for SEATING create when `walkin_waitlist.distance` is set and location is present.

### 6.5 Merchant + Super Admin runtime (`amealiodashboardmvp-`)

Operational queues (live diners):

| Route | Queue |
|---|---|
| `/pendingdashboard` | `PENDING` — accept / reject / countdown |
| `/seatingdashboard` | Active SEATING — seat, assign table, complete, QR scan diner |
| `/reservationdashboard` | `RESERVATION` — calendar, seat, timers |
| `/historydashboard` | HISTORY by date |
| `/seatingdashboard/quickseat` | Walk-in/waitlist ledger; `pointOfEntry: "VENDOR"`; **not reservations** |
| `/seatingdashboard/adddiner` | Walk-in/waitlist **or** reservation create |

Configuration (subscription JSON, not the live queue):

- `GenralSeatingScreen` → `general_seating.*`
- `WalkinWaitlistScreen` → `walkin_waitlist.*`
- `ReservationSeatingScreen` → `reservation.*`
- `TableManagementScreen` / `TableSeatManagement` → `table_setup` + client QR print `{restaurant_id, table_number, type, vendor_id}`

Super Admin mirrors config under `/admin-casual-dining/seatingmanagement/*` and operational queues under `/superadmin/vendorseating/*` (`PATCH /admin/diner/:id`).

**“Book at Table”:** **not found** as a screen or route. Analytics has `seating_table_book` only.

**User Tracker:** no live diner-tracking product. `UserTrackVideo` is video activity. `/userTracking` is commented out. Backend `/userTrack` queries `seatingarea` for `diner_status` fields that **do not exist** on that model.

### 6.6 Timers, auto-accept, auto-cancel

- Auto-accept: subscription `walkin_waitlist.auto_accept` / `reservation.auto_accept` **and** restaurant `autoAcceptSetting` **and** party ≥ `min_person`.
- PENDING timeout → `REJECTED` via `setTimeout` **and** minute cron `/cron/diner` (`diner_status: PENDING` only).
- **NOTSEATED no-show auto-cancel is dead code:** helpers exist (`table_kept_time`) but `dinerAutoCancel` and the cron query only enter for `PENDING`.
- `general_seating.table_turn_around_time` is **schema-only** in diner runtime (not applied).
- Merchant UI countdown: `wait_time_date + wait_time minutes`.
- Restaurant-level `seatingWaitingTime` (Set Wait Time) is a **restaurant field**, not per diner.

### 6.7 Hours, slots, blocks

- Slots: `get_time_cutoff()` from weekly hours + `reservation_time_slot` / `minimum_lead` / `cut_off_time`.
- `ReservationBlock` CRUD exists (`/manage-reservation-block`) and is **populated** on availability reads, but **`get_time_cutoff` never applies the blocks**.
- Walk-in session gate on create is **commented out**.

### 6.8 Notifications / sockets

Hooks emit `diner_creation`, `pending_notification`, `diner_request_count`, `diner_trigger`, `update_location` and send push/SMS/email/WhatsApp templates keyed by walk-in/waitlist/reservation × status. Dedicated `diner_trigger` publisher in `channels.ts` is **commented out**; generic `app.publish` still fans out.

### 6.9 Orders, Experience, Event

- Optional `cross_ref_id` ↔ Order; dine-in `table_number` string on checkout. Occupancy is **never** derived from order status. Target `Order` has no seating fields (correct).
- Experience may spawn a Diner (`exp_request_id`) — **soft**. Event `table_setup` is a **parallel** system (doc 113). Do not merge.
- Commented-out `seatingOrderCancell` cron is **not live**.

### 6.10 Authorization

| Call | Auth |
|---|---|
| `POST /diner` | Optional; if present, vendor JWT |
| `PATCH /diner/:id` | Vendor JWT (Alexa token bypass exists) |
| `PATCH /user/diner/:id` | Consumer JWT, scoped to token `user_id` |
| `/table/diner`, `/restaurantopen/diner` | Vendor JWT |
| `/Admin/diner` | Super Admin vendor JWT |
| `/cron/diner` | Unauthenticated class; invoked from server cron |

### 6.11 Concurrency / integrity (legacy defects)

- Active-SEATING same-day duplicate check is **not transactional** (TOCTOU).
- `diner_id` is a random 6-digit **without a unique index**.
- Same-table SEATED guard is **weak** (date comparison).
- Cron + `setTimeout` can double-fire PENDING reject (no idempotency key).
- Many table-status writes target **`casual_dining_status` only** — multi-service embeds can desync.

---

## 7. L2 — Industry Benchmark

Industry is **evidence, not authority**.

| Practice | Typical industry | Fit for amealio? |
|---|---|---|
| Reservation as **slot / cover inventory**, table assigned later or softly | OpenTable / Resy: book a time + party; table may be auto-placed or left unassigned | **Fits amealio create-time:** reservation is restaurant-level; table later. Do **not** copy OpenTable reflow / AI allocation |
| Waitlist as a **queue + quoted wait** | Yelp Waitlist / host stand apps | **Fits** waitlist + merchant `wait_time` |
| Walk-in as **host-created** more often than consumer geo-join | Host stand / POS | amealio also lets **consumers** join via “Book a Table”; preserve both entry points |
| Table FSM `available → held → occupied → dirty → available` | Toast / Square / host systems | **Fits** ON_HOLD / OCCUPIED / DIRTY |
| Unique confirmation codes, transactional capacity | Common | **IMPROVE** vs random `diner_id` |
| No-show windows after accept | Common | Legacy code exists but is **unwired** — do not silently activate (OD) |
| SMS/push confirm + reminder | Common | Legacy has templates — first slice may defer the notification platform |
| Geo-fence to join a waitlist | Uncommon as a hard gate; more common: “I’m here” button | Legacy backend can geo-check; **consumer currently bypasses** with `noLocationData: true` |
| Auto table assignment / combinable tables / adjacency | OpenTable reflow, Elyra, etc. | **Not amealio.** Merchant assigns. Do not invent |

Do not replace the unified Diner with separate Waitlist and Reservation products merely because some vendors ship them as two SKUs.

---

## 8. L3 — Gap Analysis

| ID | Gap | Legacy | Target today | Class | Notes |
|---|---|---|---|---|---|
| DR-1 | Unified Diner for three types | `SEATING`+`isWalkIn` / `RESERVATION` | `SeatingType` WALK_IN/WAITLIST/RESERVATION | **PRESERVE** | Keep one aggregate |
| DR-2 | Booking vs table machines | Two machines | `SeatingStatus` ⊥ `TableStatus` | **PRESERVE** | Already in 44/45 |
| DR-3 | Table bound at accept/seat | Empty at create | `tableId` null at create | **PRESERVE** | |
| DR-4 | Consumer Book a Table | `/seating/waitlist` + POST `/diner` | **No consumer API or UI** | **IMPROVE** | First slice |
| DR-5 | Merchant queues | Pending / seating / reservation / history | **No HTTP, no UI** | **IMPROVE** | First slice |
| DR-6 | Feature gates / timers in subscription | Confirmed | `Subscription.config` hybrid | **PRESERVE** | DEC-2 |
| DR-7 | Auto-accept | Live | Not evaluated | **IMPROVE** | After HTTP exists |
| DR-8 | PENDING auto-reject | Live (timeout + cron) | Deferred | **IMPROVE** | Runtime slice, not foundation |
| DR-9 | NOTSEATED no-show cancel | **Dead code** | Absent | **OWNER DECISION** | Do not copy as if live |
| DR-10 | Reservation block enforcement | CRUD, **not applied** to slots | Model exists, unused | **OWNER DECISION** | |
| DR-11 | Consumer geo on create | Backend can check; V2 sends `noLocationData: true` | Not modeled | **OWNER DECISION** | |
| DR-12 | `diner_id` uniqueness | Random 6-digit, no unique | UUID PK | **CORRECT** | Use UUID; optional display code later |
| DR-13 | Duplicate / double-seat | TOCTOU / weak guard | No list/create HTTP yet | **CORRECT** | Transactional unique active request |
| DR-14 | Booking→table auto-sync | Hooks write both | Manual `setTableStatus` only | **IMPROVE** | |
| DR-15 | Wait / party / occasion fields | Rich diner fields | Thin `SeatingRequest` | **IMPROVE** | First slice can use existing columns |
| DR-16 | Notifications / sockets | Templates + `diner_trigger` | None | **FUTURE** | Phase F mentions Notifications; do not block first booking writes |
| DR-17 | QR table print | Client-only | None | **FUTURE** | Doc 44: not persisted |
| DR-18 | Waiter↔table | **NOT FOUND** | None | **FUTURE** | Do not invent |
| DR-19 | User Tracker product | Broken / video tab | None | **CORRECT** | Do not build a tracker from `/userTrack` |
| DR-20 | Order cross-link | Optional `cross_ref_id` | No `orderId` | **OWNER DECISION** | Optional; occupancy stays diner-derived |
| DR-21 | Experience/Event seating | Soft / parallel | Separate (113) | **PRESERVE** | Out of this domain |
| DR-22 | Super Admin impersonation queues | `/admin/diner` | SUPER_ADMIN explicit restaurant target | **OWNER DECISION** | First slice: merchant staff + own consumer |
| DR-23 | Slot engine | Hours + cutoffs; blocks unused | `OperatingHours` unused by seating service | **IMPROVE** | Derive; do not invent a slot table (doc 09) |
| DR-24 | `seat[]` non-table inventory | Confirmed in `table_setup` | No entity | **OWNER DECISION** | 45 deferred |
| DR-25 | Alexa / voice bypass on PATCH | Exists | None | **FUTURE** | Do not copy the bypass |
| DR-26 | Turn-around time | Schema only | None | **FUTURE** | Not historically enforced |
| DR-27 | Delivery / rider | Separate | Phase G / 91 | **FUTURE** | Not this domain |

---

## 9. L4 — Target Contract

### 9.1 Authoritative objects

| Authority | Object | Forbidden duplicate |
|---|---|---|
| Booking | `SeatingRequest` | Second waitlist table, “BookAtTable” entity, Order-as-reservation |
| Inventory | `SeatingArea` → `RestaurantTable` | Operational `table_setup` JSON as SoT |
| Table occupancy | `RestaurantTable.status` | Deriving occupancy from `Order.status` |
| Gates / timers / rules | `Subscription.config` (DEC-2) | New `SeatingPolicy` table in the first slice |
| Hours | `OperatingHours` | Invented slot-inventory table |
| Blackouts | `ReservationBlock` | Enforce only if OD-SEAT-3 says yes |
| Food commerce | Stages A–G, I, J, 115 | Seating must not quote, discount, or publish menu items |
| Experience / Event | Docs 48/49/113 | Do not store Event seats on `SeatingRequest` |

### 9.2 Authoritative state machine (booking)

```
create → PENDING
auto-accept or merchant accept → NOT_SEATED
merchant seat (+ table) → SEATED
merchant complete → COMPLETED
merchant reject (from PENDING or NOT_SEATED) → REJECTED
consumer or merchant cancel (PENDING or NOT_SEATED) → CANCELLED
```

Terminal: `COMPLETED`, `REJECTED`, `CANCELLED`.  
Consumer cannot mark `SEATED` or `COMPLETED`.  
`INITIAL` is **not** in the food-seating contract.

### 9.3 Table occupancy rules

- Create never requires `tableId`.
- Bind table at accept/seat; table must belong to the same restaurant.
- When auto-sync is implemented: NOT_SEATED+table → `ON_HOLD`; SEATED → `OCCUPIED`; COMPLETED → `DIRTY`; REJECTED/CANCELLED → `AVAILABLE`.
- Until auto-sync ships, merchant `setTableStatus` remains the explicit setter (already implemented).
- Occupancy is **not** Stage C and **not** numeric inventory.

### 9.4 API boundaries (target)

No new bounded context. Extend `apps/api/src/modules/seating/` with HTTP:

**Consumer (JWT user)** — new, does not exist:

| Capability | Proposed |
|---|---|
| Create request | `POST /api/v1/seating/requests` (`WALK_IN` / `WAITLIST` / `RESERVATION`) |
| Get / list own | `GET /api/v1/seating/requests/:id`, `GET /api/v1/seating/me/requests` |
| Cancel / confirm arrival | `PATCH /api/v1/seating/requests/:id` (own rows only) |
| Reservation slots | `GET /api/v1/seating/restaurants/:id/availability?date=` (derive from `OperatingHours` + subscription cutoffs) |

**Merchant staff** (existing `JwtStaffGuard` + `MerchantScopeService`):

| Capability | Proposed |
|---|---|
| Inventory (already in service) | `GET/POST` areas and tables; `PATCH` table status |
| List queues | `GET` requests by restaurant + status/type |
| Accept / reject / seat / complete / assign table | `PATCH` request (existing `updateSeatingRequest` semantics) |

Do **not** expose unauthenticated `POST /diner`. Do **not** copy the Alexa PATCH bypass. Super Admin remains platform-scoped explicit restaurant target — not a silent merchant.

### 9.5 Authorization / tenant isolation

- Consumer: server derives `userId` from the user JWT. Never trust client `userId` / `merchantId`.
- Staff: `MerchantScopeService.assertRestaurantInScope`. Cross-merchant 403.
- Feature gate: evaluate `SubscriptionConfigService.isSeatingEnabled` (and reservation / walk-in flags) on create — **not** currently done in `SeatingService`.
- Activation gate (P1.7.14) already blocks BLOCKED owners.

### 9.6 Concurrency / idempotency / audit

- UUID primary key (already). Optional human display code **must be unique** if added.
- Create of a second **active** `WALK_IN`/`WAITLIST` for the same user+restaurant+local day must be rejected **inside a transaction**.
- Seat: reject if the table already has another non-terminal request bound (transactional).
- Status transitions: compare-and-set (`updateMany WHERE status=from`) like order cancel (doc 54).
- Auto-cancel, when enabled, must be idempotent (same request cannot REJECT twice with side effects).
- Audit: prefer `SeatingStatusEvent` (or reuse `AuditLog`) over copying embedded `auditLogs[]`. First slice may record `updatedAt` + actor only.

### 9.7 Historical snapshots

- `reservationAt`, party fields, and `tableId` at seat time are the historical facts.
- Do not rewrite `reservationAt` after SEATED.
- Consumer track must show the bound table code from the request, not a live floor-plan join that can change under them after complete.

### 9.8 Interaction with existing authorities

| Authority | Interaction |
|---|---|
| A–G / 115 catalog | None. Seating does not author items or prices |
| Stage C availability | Item orderability unchanged. Table DIRTY ≠ item SOLDOUT |
| Stage D quote / E promo | Unchanged. Optional later dine-in order uses existing quote |
| Stage I Global Catalog | None |
| Stage J checkout address | Delivery-only; dine-in orders remain without address |
| Stage H / K | Out. Experience/Event seating stay in 113 |
| Order | Optional future `orderId`; occupancy stays on `SeatingRequest` |
| Subscription | Gates/timers only (DEC-2) |
| Delivery / 91 | Out. Phase G / D-011 |

---

## 10. Backend / API matrix

| Capability | Legacy | Target now | First slice |
|---|---|---|---|
| Consumer create | `POST /diner` | Missing | Add consumer HTTP |
| Consumer cancel / arrival / ETA | `PATCH /user/diner` | Missing | Cancel (+ optional arrival) |
| Merchant status / table | `PATCH /diner/:id` | Service `updateSeatingRequest` / `setTableStatus` | HTTP wrap |
| Merchant list queues | `GET /diner?diner_status=` | Missing list API | Add list |
| Table availability | `GET /table/diner` | `listTables` (no occupancy subtract) | Derive from bound active requests |
| Slots | `GET /restaurant-availability` | Unused `OperatingHours` | Derive; no slot table |
| Blocks | `/manage-reservation-block` | Model only | OD-SEAT-3 |
| Cron auto-cancel | `/cron/diner` | None | After GO; PENDING only unless OD-SEAT-2 |
| Admin diner | `/Admin/diner` | SUPER_ADMIN scope | OD-SEAT-8 |
| Notifications | hook templates | None | FUTURE |

## 11. Data model matrix

| Concept | Legacy | Target | Action |
|---|---|---|---|
| Booking | `Diner` | `SeatingRequest` | **PRESERVE** |
| Type | `service_type` + `isWalkIn` | `SeatingType` | **IMPROVE** (typed) |
| Status | `diner_status` | `SeatingStatus` | **PRESERVE** (no INITIAL in v1) |
| Table inventory | `table_setup.table[]` | `RestaurantTable` | **PRESERVE** 45 |
| Table runtime | `table[].status` | `TableStatus` | **PRESERVE** |
| Hours | restaurant `multipleHours` | `OperatingHours` | **IMPROVE** (wire reads) |
| Blocks | `manageReservationBlock` | `ReservationBlock` | OD |
| Wait time | `wait_time` / dates | **not on model** | OD-SEAT-11 |
| Party | adults/kids/highchair/handicap | `partySize` / `kidsCount` / `highChairs` | **IMPROVE** later columns |
| Display id | `diner_id` 6-digit | UUID | **CORRECT** |
| Order link | `cross_ref_id` | none | OD-SEAT-7 |
| `seat[]` | present | none | OD-SEAT-6 |

## 12. UI / surface matrix

| Surface | Legacy | Target | First slice |
|---|---|---|---|
| Book a Table | V2 chip → waitlist form | Missing | Consumer create + track |
| Reservation form | Date/slot picker | Missing | Same screen family, `type=RESERVATION` |
| Track | V2 tracker | Missing | Status + cancel |
| Merchant pending / floor / reservation / history | Four dashboards | Missing | Pending + active + complete minimum |
| Quick Seat / voice / scribble | Present | — | **FUTURE** |
| Table setup / QR print | Present | Service create area/table | Config UI **FUTURE** (foundation already writes) |
| Super Admin vendor queue | Present | — | OD-SEAT-8 |
| User Tracker | Not a real product | — | **Do not build** |

## 13. Authorization / security matrix

| Rule | Class |
|---|---|
| Server-derived user / merchant scope | **PRESERVE** / **IMPROVE** vs optional `/diner` auth |
| No Alexa secret bypass | **CORRECT** |
| No client `merchantId` trust | **PRESERVE** (45) |
| Feature-gate seating/reservation before create | **IMPROVE** |
| Consumer cannot seat/complete | **PRESERVE** |
| SUPER_ADMIN is not a merchant host stand by default | **PRESERVE** (aligns with 115 catalog isolation) |

## 14. Concurrency / idempotency matrix

| Risk | Target |
|---|---|
| Double submit create | Idempotency key optional; unique active (user, restaurant, type, local day) |
| Double seat same table | Transactional reject |
| Double reject (cron + timeout) | Compare-and-set status |
| Display-code collision | Unique constraint or do not add |

## 15. Migration / data compatibility

- Greenfield writes use target enums/UUIDs. Legacy Mongo `Diner` import is **out of this slice**.
- `table_setup` JSON remains in `Subscription.config` until an import job exists (45). Do not dual-write JSON as SoT.
- Dual seating-vs-dine-in embeds: reconcile at import only (45 §12).
- No OD-11 numeric-enum blocker (statuses are strings) — doc 09.

---

## 16. PRESERVE

- One aggregate for walk-in, waitlist, reservation.
- Booking status graph above.
- Table occupancy as a **separate** machine.
- Table assigned at accept/seat, not at consumer create.
- DEC-2: gates/timers/rules in `Subscription.config`.
- Merchant is the only seater / completer.
- Consumer cancel from PENDING / NOT_SEATED.
- Party facts (size, kids, highchairs, special requests).
- Reservation needs `reservationAt`.
- Optional Order link conceptually; occupancy not from orders.
- Experience / Event seating stay outside this domain.
- QR table print is client-generated (if/when UI exists).
- No waiter↔table binding (never existed).
- Consumer label **“Book a Table”** for the walk-in/waitlist entry (do not rename the domain to a string that is not in source).
- Stages A–G, I, J, 115, H, K untouched.

## 17. IMPROVE

- Typed `SeatingType` instead of `isWalkIn` boolean (already on target).
- HTTP controllers + consumer/merchant UI over existing `SeatingService`.
- Enforce subscription seating/reservation flags on create.
- Transactional duplicate and table-conflict guards.
- Compare-and-set transitions.
- Wire `OperatingHours` for slot derivation.
- Booking→table auto-sync when the runtime slice lands.
- Unique UUID identity (already) instead of random `diner_id`.
- Consumer create authenticated on a first-class route (not optional-auth `/diner`).

## 18. CORRECT

- Do not treat dead NOTSEATED no-show cron as live behavior.
- Do not treat unused reservation-block filtering as enforced policy.
- Do not build “User Tracker” from `/userTrack` / video tabs.
- Do not copy Alexa PATCH bypass.
- Do not use `table_setup` JSON as the operational inventory once relational rows exist.
- Do not invent OpenTable reflow / AI allocation / combinable-table geometry.
- Do not merge Event/Experience seating into `SeatingRequest`.
- Do not create a second price, availability, or promotion engine.
- Do not persist table QR as a security token.

## 19. OWNER DECISION

See §21. Do not guess.

## 20. FUTURE

- Notification platform / WhatsApp/SMS template catalogue (Phase F companion, not required to persist a request).
- Realtime sockets (`diner_trigger` parity).
- Quick Seat voice/scribble, bulk QR, seating analytics reports.
- `seat[]` stools, waiter assignment, hours overrides (`manageDateRange`).
- Experience checkout draft `INITIAL`, Event floor plans.
- Delivery / Dunzo / Porter / rider app (Phase G, D-011).
- Stage H personalization, Stage K celebrations, guest cart, maps, combo/cross-sell authoring UI, media upload.
- Legacy Mongo diner ETL.

---

## 21. Exact owner decisions

### 21.1 Already resolved (do not re-open)

| ID | Resolution |
|---|---|
| DEC-2 | **Hybrid** — config/timers in `Subscription.config`; inventory/runtime/bookings relational (44/45) |
| Unified Diner | **Keep** three types on one `SeatingRequest` |
| Table at create | **No** — bind at accept/seat |
| Occupancy vs booking | **Two machines** |
| Event/Experience seats | **Separate** (113) |
| Delivery in this domain | **No** (D-011 / Phase G) |
| OpenTable auto-assign | **No** |

### 21.2 Unresolved (do not guess)

| ID | Question | Default if forced to ship |
|---|---|---|
| **OD-SEAT-1** | Require consumer geo for walk-in/waitlist create? | **No** — accept `noLocationData` path; do not invent a hard geofence |
| **OD-SEAT-2** | Activate NOTSEATED no-show auto-cancel? | **No** — only PENDING timeout, matching live legacy |
| **OD-SEAT-3** | Enforce `ReservationBlock` in slot generation? | **No** in first slice (legacy does not enforce) |
| **OD-SEAT-4** | Guest OTP create vs signed-in only? | **Signed-in first** (J already requires sign-in for cart). Guest OTP later |
| **OD-SEAT-5** | Add `SeatingStatus.INITIAL` for Experience draft? | **No** — Stage K / 45 |
| **OD-SEAT-6** | Model `seat[]` (non-table)? | **No** |
| **OD-SEAT-7** | `orderId` on `SeatingRequest` in first slice? | **No** — optional later |
| **OD-SEAT-8** | Super Admin host-stand impersonation? | **No** — merchant staff + consumer only |
| **OD-SEAT-9** | Notifications/sockets in first GO? | **No** — persist + poll/list first |
| **OD-SEAT-10** | Client chooses WALK_IN vs WAITLIST vs server derives from `seatingWaitingTime`? | **Server derives** from restaurant wait-time config when consumer sends SEATING-equivalent; merchant Add Diner may set type explicitly |
| **OD-SEAT-11** | Persist per-request `wait_time` now (schema add)? | **No schema in first slice** — merchant can accept without quoting wait |
| **OD-SEAT-12** | Walk-in vs waitlist both on “Book a Table”? | **Yes, preserve V2** — one consumer entry; type resolved per OD-SEAT-10 |

Catalog ODs (OD-I-DUP, OD-I-TEMP, OD-MCA-*, G-MENU-4) **do not block** this domain.

---

## 22. Smallest justified implementation slice

**Name:** Dining / Reservations Runtime Slice 1 — consumer create/track/cancel + merchant accept/seat/complete on existing `SeatingRequest`.

**Why this is the smallest production-grade step:** P1.3 marks reservation lifecycle **REQUIRED**. Docs 44/45 already have the inventory + request write foundation. The hole is the same class as Stage 115: **HTTP + UI over existing services**, plus a consumer create path that does not exist at all.

### Include (after explicit GO — not this task)

1. Consumer JWT: create `WALK_IN`/`WAITLIST`/`RESERVATION`, get, list mine, cancel (`PENDING`/`NOT_SEATED`).
2. Staff JWT: list restaurant requests by status/type; accept → `NOT_SEATED`; assign `tableId`; seat → `SEATED`; complete; reject; existing inventory list/create + `setTableStatus`.
3. Tenant isolation + feature-gate read from `Subscription.config`.
4. Transactional: one active same-day seating request per user+restaurant; table not double-bound.
5. Existing `apps/web` / `apps/merchant` design system only. Consumer: Book a Table + Reservation + track. Merchant: pending + active queues.
6. Prefer **no Prisma migration**. Use existing `SeatingRequest` columns.

### Exclude

- Schema/migrations unless an owner decision forces `wait_time`
- Auto-cancel cron, sockets, SMS/WhatsApp
- Geo fence, maps, guest OTP
- QR print, Quick Seat, Super Admin queues
- Reservation-block enforcement, slot-table inventory
- Order / Experience / Event links
- `seat[]`, waiters, INITIAL
- Stage H / J expansion / K
- Delivery
- Catalog / payment / promo changes

## 23. IMPLEMENT NOW vs DEFER

| Item | When |
|---|---|
| This forensic document | **DONE** (docs only) |
| Runtime HTTP + Book a Table / Reservation / merchant queues | **IMPLEMENT NOW after GO** |
| Docs 44/45 foundation | **Keep** |
| PENDING auto-reject cron | **DEFER** to a follow-up runtime hardening slice |
| Notifications / sockets | **DEFER** (OD-SEAT-9) |
| Geo, guest OTP, QR, Quick Seat, Super Admin ops | **DEFER** |
| Stage H / K / J expansion / Delivery | **DEFER** (already parked) |
| Combo / cross-sell / media / Chain Catalog | **DEFER** (115) |

## 24. Dependencies / blockers

| Blocker | Blocks | Severity |
|---|---|---|
| Explicit implementation GO | Any code | Hard stop — this task must not implement |
| P1.7.16 `SeatingService` | None for first slice | Ready |
| DEC-2 | None | Resolved |
| Catalog ODs / G-MENU-4 | None | Unrelated |
| OD-SEAT-1..12 | Only the matching extras | Not first-slice blockers if defaults in §21.2 are used |
| Amealio-VendorApp missing | Native merchant parity | Residual; web merchant is sufficient |
| Notification platform | Guest comms | Not required to persist a request |
| Delivery assignment (69/91) | Tip beneficiary / rider | **Not** a seating blocker |

---

## Remaining material domains (inventory — not a priority ranking)

| Domain | Existing Stage/Doc | Status | Evidence | Dependency | Planned Next? |
|---|---|---|---|---|---|
| Dining / Reservations runtime | 44, 45, **116**, P1.3 Phase F | Foundation implemented; **runtime unreconciled until this doc**; UI/HTTP missing | 17-TARGET-MIGRATION-MAP; 10-MIGRATION-SEQUENCE Phase F; 45 §13 | Catalog/Orders/Payments done | **YES — official next** |
| Notifications | Phase F companion; database/10 | Planned, not 00-rule reconciled | 10-MIGRATION-SEQUENCE Phase F | Reservations triggers | After/with seating comms; not a substitute |
| Delivery orchestration | 69, 91, Phase G | 91 contract, no impl; driver app D-011 deferred | 17-TARGET-MIGRATION-MAP puts Delivery **after** Reservations | Orders/Payments | No — not next |
| Self-delivery rider app | 91, D-011 | Deferred satellite | BASELINE_SOURCE_DECISION | Delivery module | No |
| Stage H Personalization | 111 | Forensic / **DEFER** | 00-rule; 103 §13 | Owner GO | No |
| Stage K Celebrations/Events | 48, 49, 113 | Forensic / **DEFER**; Experience config exists | 113; Phase H optional | Owner GO | No |
| Stage J remainder | 114 | First slice done; guest cart/maps/prepaid/tip UI need GO | 00-rule | Owner GO | No |
| Combo authoring UI | 109, 115 OD-MCA-12 | Model+consumer exist; merchant UI deferred | 115 §20 | Stage F | No |
| Cross-sell authoring UI | 110, 115 | API exists; UI deferred | 115 | Stage G | No |
| Media / upload | 83–86 | Forensic / partial | 86; 115 OD-MCA-9 | Owner | No |
| Chain Catalog / temp-local | 112 | Deferred | OD-I-TEMP | Owner | No |
| Merchant onboarding UI | 36–39, 43 | Write foundation exists; wizard deferred | 38 | None for seating | No |
| Subscription entitlements | 30, 43 | Foundation exists; not a SaaS rewrite | DEC-2 | Seating reads flags only | No |
| Admin / reporting | Phase G | Optional/later | 10-MIGRATION-SEQUENCE | — | No |
| ONDC | Phase 6 / owner | Out of baseline | 17-TARGET-MIGRATION-MAP | Owner | No |

---

## Confirmation (this task)

- Prisma schema **not** modified  
- No migrations  
- No controllers / services / React / routes / API contracts / seeds / CSS  
- Stages A–J / 115 behavior **not** altered  
- Stage H / K **not** started  
- Seating foundation **not** reimplemented  
- No merge. No new branch. Branch remains `replatform/backend-consolidation`  
- HARD STOP after these documents
