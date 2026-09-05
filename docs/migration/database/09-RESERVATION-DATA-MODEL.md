# 09 — Reservation Data Model

Conceptual target model for the baseline reservation/seating capability. Design only. Legacy: `diners` (`diner.model.ts`), `seating areas`, `managereservationblocks` (P1.1 [05](../india-baseline/05-DATA-MODEL.md)); behavior: P1.1 [07](../india-baseline/07-BUSINESS-RULES.md)/[11](../india-baseline/11-END-TO-END-WORKFLOWS.md).

## Entities (conceptual)

### SeatingRequest  (unified "Diner": seating + reservation)
`id`, `merchantId`, `restaurantId`, `userId?` (nullable/guest), `type` (**WALK_IN | WAITLIST | RESERVATION**), `status` (**PENDING | NOT_SEATED | SEATED | REJECTED | COMPLETED | CANCELLED** — string, known), `partySize`, `kidsCount?`, `highChairs?`, `accessibilityNeeds?`, `specialRequests?`, `reservationAt?` (for RESERVATION), `waitTime?`, `tableId?`, `orderId?` (dine-in link), timestamps.
- One entity models both **seating** and **reservation** via `type` (legacy `Diner.service_type`).

### SeatingArea / Table
`SeatingArea(id, restaurantId, name)`; `Table(id, seatingAreaId, code, capacity)`. Legacy `seating areas` are reference; tables inferred from restaurant seating config.

### ReservationBlock
`id`, `restaurantId`, `title`, `allDay`, `startAt`, `endAt` — blackout windows (legacy `manageReservationBlock`).

## Fields / behavior to preserve
- **Time:** `reservationAt` (reservations); creation time (waitlist/walk-in). Stored UTC, presented in restaurant timezone.
- **Party details:** size, kids, high chairs, accessibility, special requests.
- **Status lifecycle:** PENDING → SEATED/NOT_SEATED → COMPLETED | REJECTED | CANCELLED (preserve baseline transitions).
- **Confirmation / auto-accept:** driven by restaurant subscription settings (baseline rule) — represented as restaurant/subscription config, evaluated by app; store the resulting status + `confirmedAt`.
- **Cancellation:** status CANCELLED + `cancelReason`/`cancelledBy`/`cancelledAt`.
- **Availability:** derived from operating hours + reservation blocks + capacity; not a separate stored "slot" table unless the baseline maintains slots (**not evidenced** → do not invent slot inventory).
- **Geo-fenced arrival:** app-level check (geolib in baseline); store arrival timestamp/flag.

## Relationships
- `Restaurant 1:N SeatingRequest`; `SeatingArea 1:N Table`; `SeatingRequest 0..1 Table`; `SeatingRequest 0..1 Order` (dine-in). See [04](./04-RELATIONSHIPS-CONSTRAINTS.md).

## Legacy fields NOT to copy
- Broken ref `"User Service"` (→ proper `userId`).
- Embedded `auditLogs[]` → status-event history (consistent with orders).
- `strict`/loose fields.

## Notes
- Reservation notifications handled by Notifications ([10](./10-NOTIFICATION-DATA-MODEL.md)).
- Migration classification: **MEDIUM** ([14](./14-DATA-MIGRATION-COMPLEXITY.md)) — no numeric-enum blocker (statuses are strings).
