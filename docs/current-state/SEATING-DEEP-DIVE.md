# Seating Deep Dive — Current-State Forensic Audit

**Status classification key:** IMPLEMENTED | PARTIAL | NOT FOUND | UNKNOWN

---

## Executive Summary

Seating is a **live, cross-repository capability** spanning waitlist, reservations, table management, real-time tracking, and links to events/experiences. The authoritative backend is the `Diner` MongoDB collection and `subscription` table configuration embedded in vendor subscriptions.

There is **no separate "Seating" microservice**. All logic lives in `amealio-vendordashboard`.

---

## Domain Model (Backend)

### Primary entity: `Diner`

**File:** `amealio-vendordashboard/src/models/diner.model.ts`

| Field | Purpose |
|-------|---------|
| `service_type` | `"SEATING"` (waitlist) or `"RESERVATION"` |
| `diner_status` | Lifecycle status (see below) |
| `adult_count`, `kids_count` | Party size |
| `high_chair`, `handicap_chair` | Accessibility counts |
| `seating_preference` | Array of preference strings |
| `table_number` | Assigned table (string) |
| `reservationTime` | For reservations |
| `wait_time`, `wait_time_date` | Queue wait |
| `vendor_id`, `restaurant_id`, `user_id` | Ownership |
| `exp_request_id`, `exp_id`, `order_id` | Cross-links to experience/order flows |
| `occasion` | Free-text special occasion |
| `isWalkIn`, `pointOfEntry` | Walk-in vs app entry |
| `track_location`, `travelMode` | Customer ETA tracking |
| `shareLink` | Firebase dynamic link for sharing |

**Status enum (`SEATING_STATUS`):**  
`INITIAL` → `PENDING` → `NOTSEATED` → `SEATED` → `COMPLETED` | `REJECTED` | `CANCELLED`

**Evidence:** `amealio-vendordashboard/src/common/constants.ts` lines 4–12

### Seating areas (taxonomy)

**File:** `amealio-vendordashboard/src/models/seating-area.model.ts`

Simple catalog: `icon`, `title`, `description`, `status`. Referenced from subscription `seating_areas` as ObjectIds to `Sub Category`.

**Status:** IMPLEMENTED (catalog); customer selection of specific area is PARTIAL (preference strings, not interactive floor plan in user app audit scope)

### Table configuration (merchant subscription)

**File:** `amealio-vendordashboard/src/models/subscription.model.ts` — `casual_dining_status.seating`

| Sub-capability | Config path | Status |
|----------------|-------------|--------|
| General seating | `general_seating` | IMPLEMENTED |
| Walk-in waitlist | `walkin_waitlist` | IMPLEMENTED |
| Reservation | `reservation` | IMPLEMENTED |
| Table management | `table_management.table_setup` | IMPLEMENTED |
| Event seat management | `event_management.offline_event.seat_management` | IMPLEMENTED |
| Room/banquet setup | `event_management.offline_event.seat_management.room_setup` | IMPLEMENTED |

**Table setup structure:**
- `floors[]` — floor_number, area
- `seat[]` — seat_number, pax_value, shape, active, status, location
- `table[]` — table_number, pax_value, shape, active, status, location
- Event-specific: `general_rooms[]`, `banquet[]`, `banquet_seat[]`, `banquet_table[]`

**Table status values:** Updated by diner cron when diner status changes — `AVAILABLE`, `OCCUPIED` (via `app.get("TABLE_STATUS")`)

**Evidence:** `diner-cron.class.ts` `updateTableStatusInSubscription()` lines 56–80

---

## API Endpoints (Backend)

| Path | Actor | Purpose | Status |
|------|-------|---------|--------|
| `POST/GET/PATCH /diner` | Customer, vendor | Create/list/update diner requests | IMPLEMENTED |
| `/user/diner` | Customer | User-scoped diner operations | IMPLEMENTED |
| `/vendor/diner` | Merchant | Vendor diner management | IMPLEMENTED |
| `/Admin/diner` | Admin | Admin diner management | IMPLEMENTED |
| `/Admin/diner-request` | Admin | Diner request admin | IMPLEMENTED |
| `/table/diner` | Merchant | Table view of diners (date range) | IMPLEMENTED |
| `/restaurant-availability/:id` | Customer, merchant | Availability for date | IMPLEMENTED |
| `/manage-reservation-block` | Merchant | Block reservation dates/times | IMPLEMENTED |
| `/subscription/table` | Merchant | Table CRUD via subscription | IMPLEMENTED |
| `/seatingarea` | Admin/catalog | Seating area taxonomy | IMPLEMENTED |
| `/dinerReports`, `/admin-dinerReports` | Merchant, admin | Seating reports | IMPLEMENTED |
| `/cron/diner` | System | Auto-cancel, wait time, notifications | IMPLEMENTED |
| `voice-get-diner` | Voice integration | Voice diner lookup | IMPLEMENTED |

**Real-time:** Socket event `diner_trigger` on `diner` service

**Evidence:** `diner.service.ts`, `amealio_web_app` `useTrackScreenSocket.js`

---

## Customer Scenarios (IMPLEMENTED)

### Waitlist (SEATING)

| Step | Behavior |
|------|----------|
| Entry | `/restaurant/:restaurantId/seating/waitlist` → `NewSeatingResquest.jsx` |
| Request type | `service_type: "SEATING"` when path includes `waitlist` |
| Form | Party size, kids, high chair, handicap, seating preference, occasion |
| Submit | `POST /diner` |
| Track | `/restaurant/:restaurantId/seating/track/:dinerId` |
| Real-time | Feathers `diner` service `diner_trigger` event |
| Success | Status progresses to SEATED → COMPLETED |
| Cancel | Status → CANCELLED |

**Evidence:** `NewSeatingResquest.jsx` lines 91–93, 229

### Reservation (RESERVATION)

| Step | Behavior |
|------|----------|
| Entry | `/restaurant/:restaurantId/seating/reservation` |
| Request type | `service_type: "RESERVATION"` |
| Additional | `reservationTime` selection |
| Availability | `GET /restaurant-availability/:id?date=` |
| Legacy routes | `/restaurant/:id/seating`, `/reservation` (older UI) — PARTIAL |

### Customer table selection

**Status:** NOT FOUND as interactive customer table picker in user app.  
Merchant assigns `table_number` via dashboard. Customer sees assigned table on track screen.

### QR / check-in

| Capability | Status |
|------------|--------|
| User profile QR (identity share) | IMPLEMENTED — `/qruser` |
| Track screen QR display | IMPLEMENTED — `V2TrackScreenViewQR.jsx` |
| Restaurant QR scan entry route | NOT FOUND — `qr_scan.js` exists but not routed |
| Direct merchant payment QR | IMPLEMENTED — separate from seating |

---

## Merchant Scenarios (IMPLEMENTED)

| Capability | Route (dashboard) | Backend |
|------------|-------------------|---------|
| Seating dashboard | `/seatingdashboard` | `/vendor/diner`, `/diner` |
| Pending requests | `/pendingdashboard` | PATCH diner status |
| Reservations | `/reservationdashboard` | RESERVATION type diners |
| History | `/historydashboard` | Filter completed/cancelled |
| Add walk-in | `/seatingdashboard/adddiner`, `/quickseat` | POST `/diner` with `isWalkIn: true` |
| Edit diner | `/editdiner/:id` | PATCH `/diner/:id` |
| Assign table | Seating dashboard actions | PATCH `table_number`, updates subscription table status |
| Block reservations | `/manage-block-reservation-calendar` | `/manage-reservation-block` |
| Table setup | Subscription onboarding/edit | `/subscription/table`, embedded in subscription model |
| Reports | `/allseatingreports` | `/dinerReports` |

**Permissions (backend schema):** `seatingManagement.*`, `event_seating_request_management.*` in `role-management.model.ts`

**Frontend guard:** Coarse — vendor/superadmin role only; fine-grained permission flags not consistently enforced in UI (PARTIAL)

---

## Admin Scenarios (IMPLEMENTED)

| Capability | Route | Backend |
|------------|-------|---------|
| Vendor seating impersonation | `/superadminseatingdashboard` | Same diner APIs with admin token |
| Diner reports | `/superadminreports`, seating report routes | `/admin-dinerReports` |
| Reservation management | Admin seating screens | `/Admin/diner` |

---

## Cross-Application Links

| Link | Evidence |
|------|----------|
| Diner ↔ Experience | `exp_request_id`, `exp_id` on Diner model |
| Diner ↔ Order | `order_id`, `cross_ref_id`, `preOrder` flag |
| Diner ↔ Event | Event `table_setup` in Events model; event-handler has `table_number`, seating fields |
| Experience request ↔ Diner | `diner_id` on `expRequest` model |

When experience booking includes seating, a linked `Diner` record can be created.

---

## Business Rules (Code-Enforced)

| Rule | Source | Status |
|------|--------|--------|
| `service_type` must be SEATING or RESERVATION | diner.model.ts enum | CODE-ENFORCED |
| Default diner_status = INITIAL | diner.model.ts | CODE-ENFORCED |
| Table status AVAILABLE on REJECTED/COMPLETED/CANCELLED | diner-cron.class.ts | CODE-ENFORCED |
| Table status OCCUPIED on SEATED | diner-cron.class.ts | CODE-ENFORCED |
| Auto-cancel timers from subscription config | diner-cron, subscription walkin/reservation settings | CODE-ENFORCED |
| Walk-in distance limit (default 10000m) | subscription walkin_waitlist.distance | CONFIG-ENFORCED |
| Reservation min/max party, lead time, cut-off | subscription reservation block | CONFIG-ENFORCED |
| Reservation block calendar | manage-reservation-block service | CODE-ENFORCED |

---

## Cron / Background Processing

| Job | Schedule | Purpose |
|-----|----------|---------|
| Diner cron | Every minute (`* * * * *`) | Auto-cancel, wait time expiry, notifications |
| Session automate | Every minute | Restaurant open/close session sync |

**Evidence:** `cron.ts` lines 63–70, 93–96

---

## Gaps & Unknowns

| Item | Status |
|------|--------|
| Customer interactive floor-plan table selection | NOT FOUND |
| Restaurant QR scan routed entry | NOT FOUND (orphan component) |
| Per-permission UI enforcement on merchant dashboard | PARTIAL |
| Voice diner (`voice-get-diner`) production usage | UNKNOWN |
| Pilot route guard (`PilotRouteGuard.jsx`) active enforcement | UNKNOWN |

---

## Status Summary

| Area | Status |
|------|--------|
| Waitlist | IMPLEMENTED |
| Reservation | IMPLEMENTED |
| Table management (merchant) | IMPLEMENTED |
| Table assignment | IMPLEMENTED (merchant-side) |
| Real-time tracking | IMPLEMENTED |
| Availability API | IMPLEMENTED |
| Reservation blocking | IMPLEMENTED |
| Event/experience seating linkage | IMPLEMENTED |
| Customer table picker | NOT FOUND |
| Seating areas taxonomy | IMPLEMENTED |
| Admin seating oversight | IMPLEMENTED |
