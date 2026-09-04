# 91 — Self-Delivery Target Behavior Contract

**Status:** CONTRACT (no implementation)  
**Date:** 2026-09-04  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md](./88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md), [90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)  
**Kernel:** `OrderStatus` graph; Prisma `DeliveryPerson` / `DeliveryTask` **schema-only** (doc 69)

Legacy and industry are **evidence**. This is merchant **self/agent rider** delivery — not Dunzo/Porter marketplace dispatch.

---

## 0. Method

1. **L1** — Rider app, VendorDashboard `ordering` + `orders/delivery-persons`, MVP `AssignDeliveryPerson`, consumer track screen.
2. **L2** — DoorDash/Uber-style offer timeout + accept; idempotent status; pickup vs delivered; POD/OTP (common in India apps); separate delivery job vs order status.
3. **L3/L4** — amealio self-delivery is **merchant-assigned staff**, not open dispatch. Do not copy 30-second cascade matching.

---

## 1. amealio intent

- Home-delivery orders can be fulfilled by the **merchant’s own riders**.
- Merchant marks kitchen **READY** and **assigns** an online, unoccupied rider.
- Once assigned, **merchant does not** mark out-for-delivery / delivered.
- Rider marks **on the way** then **delivered** (COD may collect payment).
- **Completed** (settlement gate) stays merchant/system (doc 88 / 62).
- Customer sees rider identity + live location when available.
- This is **not** third-party logistics (Dunzo/Porter = FUTURE / other slice).

---

## 2. L1 — Legacy reality

### 2.1 No separate delivery state machine

Self-delivery **writes `order_status` only**:

| Code | Name | Writer |
| ---- | ---- | ------ |
| 4 | READYTOPICK | **Merchant** `PATCH /ordering/:id` + `selfDeliveryPerson` |
| 5 | ONTHEWAY | **Rider** `PATCH /orders/delivery-persons/:id` |
| 6 | DELIVERED | **Rider** (COD: also `payment_status: 1`) |
| 7 | COMPLETED | Merchant `markAllComplete` or completion cron |

`DeliveryTask` in Nest is unused. `orderStatus` string / `delivery_task` are Dunzo/Porter.

### 2.2 Assignment

- Config: subscription `deliveryMethod: SELF_DELIVERY`, partner code `1`.
- UI: rider must be `is_online` and not `OCCUPIED`; assign only if `order_status < 4`.
- Backend: set `runningStatus=OCCUPIED`, `currentOrder`, emit `assign_delivery_person`, FCM `DELIVERY_PERSON_ORDER_REQUEST_CREATED`.
- Sometimes writes `deliveryMethod: "AGENT_DELIVERY"` when finalizing delivery cost — **mislabel**.
- Rider modal **“Got it”** — **no accept/reject API**, **no offer timeout**, **no reassignment**.

### 2.3 Pickup / verification

- **No pickup status.** UI treats ≥4 as “Accepted.”
- **No delivery OTP, POD photo, or failed-delivery / unreachable** flows.
- Rider login OTP exists (auth only).

### 2.4 Realtime / address

- Feathers: `assign_delivery_person`, `order_trigger`, `order_delivered`, `delivery_location`.
- Location: separate gateway `updateLocation` when status ≥5 (server **outside** these repos — UNKNOWN contract).
- Address: `deliveryAddress` + `user_details` on order.

### 2.5 Money

- No rider earnings/payout API. Tips settle to **vendor** (doc 69).
- COD: rider sets paid on delivered.

### 2.6 Cancel

- Merchant OFD blocked if rider assigned (UI).
- Cron may auto-cancel stale non-terminal orders including assigned ones.
- No rider-cancel-assignment API.

---

## 3. L2 — Industry benchmark

| Practice | Typical marketplace | Fit for amealio self-delivery? |
| -------- | ------------------- | ------------------------------ |
| Offer to nearest driver, 30s timeout, cascade | DoorDash/Uber design literature | **Poor fit** — riders are merchant staff, merchant picks |
| Explicit Accept API | Yes | Optional IMPROVE, not required to copy cascade |
| Atomic lock (one rider / one order) | Yes | **Yes** — already OCCUPIED |
| Idempotent status (retry = no-op) | Yes | **Yes** — align doc 88 |
| Pickup as own state | Common | Legacy has none; don’t invent unless owner wants |
| OTP / photo POD | Common in India last-mile | **Not in product today** — FUTURE/OWNER |
| Separate Delivery job vs Order | Common | Nest schema exists; 88 says OrderStatus remains SoT |
| Failed delivery / return | Common | Missing; don’t invent codes beyond existing `RETURNED` |
| Driver earnings | Marketplace | Not amealio self-delivery today |

Sources: DoorDash/Uber system-design dispatch (offer timeout, SETNX lock, idempotent PICKED_UP); India OTP-at-handoff papers/apps; doc 88/69.

---

## 4. L3 — Gap matrix

| Behavior | LEGACY | INDUSTRY | GAP | TARGET | DECISION TYPE |
| -------- | ------ | -------- | --- | ------ | ------------- |
| Merchant ready | PATCH status 4 + assign | Ready then dispatch | Combined | `READY` + assign in one merchant use-case | **PRESERVE** |
| Eligibility | Online + not occupied | Available + lock | UI-only occupied check | **Server** reject occupied/offline | **IMPROVE** |
| Assignment | Merchant picks rider | Auto-match | Different product | Merchant-assign only | **PRESERVE** |
| Accept | Notification only | Accept/timeout | No accept | Assign **is** the bind; “Got it” is UX | **PRESERVE** |
| Offer timeout / reassign | None | 30s cascade | Missing marketplace | **Do not add** for staff riders | **CORRECT** (don’t copy) |
| Reassign | Blocked after 4 | Common | Ops pain | Reassign only before `ON_THE_WAY` | **IMPROVE** |
| Pickup | Collapsed | Distinct PICKED_UP | No pickup | Not required | **FUTURE** |
| OFD | Rider sets 5 | Driver | OK | Rider `READY → ON_THE_WAY` | **PRESERVE** (88) |
| Delivered | Rider sets 6 | Driver | OK | Rider `ON_THE_WAY → DELIVERED` | **PRESERVE** |
| Completed | Merchant/cron | Separate close | OK | Not rider | **PRESERVE** (88/62) |
| Merchant OFD after assign | UI block | Driver-owned | Weak | Server 403/409 | **CORRECT** |
| Customer cancel in transit | Restricted-ish | Restricted | 88 forbids ON_THE_WAY cancel | Same | **PRESERVE** |
| Merchant cancel in transit | PATCH possible | Restricted | Unsafe | No `ON_THE_WAY → CANCELLED` | **CORRECT** (88) |
| Rider drops assignment | None | Decline/unassign | Ops | FUTURE unassign before OFD | **FUTURE** |
| OTP / POD | None | Common | Missing | Do not require | **FUTURE** / **OWNER** if compliance |
| Failed delivery | None | Failed/return | Missing | Use `RETURNED` only if product later | **FUTURE** |
| Duplicate status | Last write | Idempotent | Races | Same-status no-op + expectedStatus | **IMPROVE** (88) |
| Delivery vs order status | One field | Often two | Schema unused | **OrderStatus SoT**; DeliveryTask = assignment record later | **PRESERVE** 88 + **FUTURE** task |
| AGENT_DELIVERY on self-assign | Written sometimes | Distinct methods | Bug | `SELF_DELIVERY` / `AGENT` only when true | **CORRECT** |
| Rider auth | OTP JWT | Role-scoped | OK | Delivery-person principal | **IMPROVE** |
| Notifications | FCM + sockets | Evented | SoT is DB | Persist events; notify FUTURE | **IMPROVE** |
| Location | External gateway | Separate stream | UNKNOWN server | Don’t invent gateway | **FUTURE** |
| Earnings | None (tips → vendor) | Driver pay | None | Keep vendor settlement | **PRESERVE** |
| COD collect | Rider marks paid | Collect on deliver | OK | Payment action, not status synonym | **PRESERVE** (88/90) |

---

## 5. Auto-resolved

| Topic | Resolution | Why |
| ----- | ---------- | --- |
| Marketplace dispatch | **Not the product** | Merchant-assigned staff; copying 30s cascade would invent ops |
| Accept API | **Not required** | Assign binds rider; no legacy accept |
| Second status machine | **Do not activate DeliveryTask as SoT** | Doc 88 OD-MOM-FULFILLMENT |
| Pickup OTP | **Not in first slice** | Absent in product; don’t invent security theater |
| Rider earnings | **Out of scope** | No legacy rail |
| Handoff point | **Assign at READY**; rider owns `ON_THE_WAY`/`DELIVERED` | Legacy + 88 |
| Complete | **Never rider** | Settlement gate |

---

## 6. Target contract (self-delivery)

### 6.1 Ownership

| State | Owner |
| ----- | ----- |
| … → `READY` | Merchant (88) |
| Assign `deliveryPersonId` | Merchant, only for `HOME_DELIVERY`, rider in merchant scope, online, not occupied |
| `READY → ON_THE_WAY` | **Assigned rider** (or merchant **only if unassigned** — 88) |
| `ON_THE_WAY → DELIVERED` | Assigned rider |
| `DELIVERED → COMPLETED` | Merchant / system (88) |
| `CANCELLED` after assign, before OFD | Merchant/customer per 88/90 graphs |
| `ON_THE_WAY` / `DELIVERED` cancel | **Forbidden** (88) |

### 6.2 Assignment rules

1. Server enforces online + not occupied + restaurant scope.
2. One active delivery per rider (OCCUPIED).
3. Reassign allowed while status is `READY` (not yet `ON_THE_WAY`): release previous rider, occupy new one. **IMPROVE** vs legacy lock-at-4.
4. Idempotent assign of same rider: no-op.

### 6.3 Rider transitions

`PATCH` with named `toStatus` + optional `expectedStatus` (88 concurrency).  
Must be the assigned person. Same-status → 200 no extra event.

COD: marking delivered may include a **payment collection** call (`PaymentService` / pay-later complete) — **not** a raw `payment_status` integer.

### 6.4 Data

- Customer-visible: rider name, phone, order status, address already on order.
- Location stream: **FUTURE** (external gateway).
- `DeliveryTask`: **FUTURE** projection of assignment; must not diverge from `OrderStatus`.

### 6.5 Notifications

DB `OrderStatusEvent` is SoT. Push/socket **FUTURE**. Do not make sockets authoritative.

---

## 7. Cross-domain (88 + 90)

| Question | Contract |
| -------- | -------- |
| Who creates the order? | Consumer (90): `INITIAL` → paid `PENDING` |
| Who accepts kitchen? | Merchant (88): `PENDING → CONFIRMED` … → `READY` |
| Handoff to delivery | Merchant assign at `READY` (91) |
| Who writes OFD/delivered? | Rider (91); merchant blocked if assigned (88+91) |
| Customer cancel | 90: only `INITIAL`/`PENDING` |
| Merchant cancel | 88: through `READY`, not `ON_THE_WAY` |
| Refund | 88+90 `RefundService`; delivery does **not** invent refunds |
| Payment on COD | 90/88 payment action at delivered (91 may trigger) |
| Notification ownership | Order domain emits; delivery does not own customer refund comms |
| Delivery data | Assignment + rider identity on order; location FUTURE |

**Conflicts:** **None** if DeliveryTask is not made a second SoT and rider cannot complete/cancel-in-transit.

**Tension (documented, not a fight):** Industry pickup/OTP vs amealio collapsed 4→5. Classified FUTURE, not a 88/90 break.

---

## 8. Remaining owner decisions

1. **OD-SDL-REASSIGN** — Confirm IMPROVE: allow merchant reassign while `READY` (recommended) vs keep legacy freeze at assign.
2. **OD-SDL-POD** — Require delivery OTP/photo (compliance / dispute) vs keep mark-delivered. Default **FUTURE** unless legal/ops demands it now.
3. Rider earnings: not opened unless finance asks (would be a new product).

---

## 9. Implementation dependencies

1. Doc 88 merchant status HTTP + OFD server block.
2. Doc 90 consumer order + address + payment (COD).
3. Delivery-person identity (Prisma `DeliveryPerson` + auth).
4. Assign + rider transition APIs **after** 88 graph.
5. Location gateway + sockets: later.
6. Dunzo/Porter: separate slice.

**Do not implement in this slice.**

---

## 10. Sources / evidence index

**Industry:** DoorDash/Uber dispatch literature (timeout, lock, idempotent status); India OTP-handoff practice (benchmark only).  
**Legacy:** `ordering.class.ts` assign block; `delivery-persons-orders.class.ts`; `AssignDeliveryPerson.js`; `cateringConfig.js`; rider `order-card.tsx`; `otp-authentication.class.ts`; consumer `OrderTrackScreenNew.jsx`.  
**Target:** `prisma` DeliveryPerson/Task; docs 69, 88, 90.
