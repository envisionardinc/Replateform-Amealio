# 95 — Next Consumer Surface Target Behavior Contract

**Status:** CONTRACT + implementation (order tracking)  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [90](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md), [91](./91-SELF-DELIVERY-TARGET-BEHAVIOR-CONTRACT.md), [93](../93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md)

Home 1, restaurant/menu/item, cart, checkout, confirmation, and order **list** are already shipped. This slice is the next existing post-purchase surface.

---

## 0. Method

1. **L1** — Inventoried `amealio_web_app` post-core routes (`/Profile/track-order`, `/restaurant/:ID/food/ordertrack/:order_id`, profile, addresses, favorites, wallet, offers, help, reservations, experiences). Inventoried target Prisma + Nest consumer HTTP.
2. **L2** — Dining apps: named status timeline, rider identity after assign, cancel before accept, payment/refund visibility from the server, active vs history, poll if no socket, 404 on foreign orders.
3. **L3/L4** — Matrix + contract. Selected **order tracking**. No new domain tables.

**Hard rules:** Do not change cart/checkout/payment. Inter + `--ame-*`. No Mulish. No Home V2 / moods / cravings / curations / guest cart / OTP / tax / geo.

---

## 1. Candidates investigated

| Surface                        | Legacy                                                                       | Target                                                                                                                                    | Class     | Why not now                                            |
| ------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| Order tracking / detail        | Track hub + per-order track; `GET user-ordering/:id`; socket `order_trigger` | `GET /api/v1/me/orders/:id` already returns `status`, `statusEvents`, `deliveryPerson`, `paymentIntents`; `PATCH …/cancel`; list `?lane=` | **🟢**    | **Selected**                                           |
| Order history                  | ONGOING / HISTORY tabs                                                       | List exists; UI was flat                                                                                                                  | 🟢 polish | Covered as lane filter on the same surface             |
| Profile                        | `/profile/new`                                                               | `UserProfile` service, **no HTTP**                                                                                                        | 🟡        | Does not unblock post-purchase journey                 |
| Dietary prefs                  | Health flow → `user-service`                                                 | `UserProfile.preferences` Json, no HTTP                                                                                                   | 🟡        | Discovery does not consume prefs                       |
| Addresses                      | `GET/POST/PATCH/DELETE /address`                                             | Prisma `Address`; **no consumer HTTP**; checkout has no `deliveryAddressId`                                                               | 🟡        | Wiring checkout would change ordering; map/geo is STOP |
| Favorites                      | `GET/POST /favourites` + lat/long                                            | Prisma `Favourite`; no API                                                                                                                | 🟡        | New CRUD + legacy geo                                  |
| Reservations                   | `POST /diner`                                                                | Staff seating only                                                                                                                        | 🔴        | Major booking stack                                    |
| Experiences / celebrations     | Book/pay/track loop                                                          | Staff config only                                                                                                                         | 🔴 / ⚪   | Booking deferred; OD-1                                 |
| Notifications                  | Drawer inbox                                                                 | Models unused                                                                                                                             | 🔴        | No inbox HTTP                                          |
| Support / help                 | `/raiseTicket`                                                               | No schema                                                                                                                                 | 🔴        | Greenfield                                             |
| Wallet                         | Checkout instrument; `/wallet` 404                                           | Refund rail only; **OD-6**                                                                                                                | 🟡 / ⚪   | Owner decision                                         |
| Offers / coupons page          | Drawer 404; apply at cart                                                    | Checkout `couponCode` unused in web                                                                                                       | 🟡        | Not a standalone journey step                          |
| Referrals / loyalty / settings | Dead or absent                                                               | Missing / OD-5                                                                                                                            | ⚪        | Owner / future                                         |

---

## 2. DECISION

**Selected surface: consumer order tracking.**

It is the next real step after checkout: “where is my order, can I cancel, what did I pay, who is the rider.” Target HTTP already exists. Profile/addresses/favorites are real but either need new APIs or do not complete the placed-order loop.

---

## 3. L1 — LEGACY

- After pay, v1 navigates to `/restaurant/:ID/food/ordertrack/:order_id`.
- Track hub `/Profile/track-order` tabs: seating / food / experience.
- Food track: `GET user-ordering/:id`, numeric timeline 0–7, cancel only while `order_status` is 0 (PENDING / not accepted), delivery map at status 5, socket `order_trigger`.
- History listing is separate; ordering tab often has `Track={false}`.
- No live GPS in Nest; sockets are not on this slice (doc 90).

---

## 4. L2 — INDUSTRY (not branding)

Named status timeline from server events (not a client-predicted machine). Rider name/phone after assign. Cancel before restaurant accept. Show payment method/status as returned. Active vs history. Loading / empty / error+retry. Foreign order → not found. Poll when push is absent. No invented refund math.

---

## 5. L3 — GAP

| Behavior             | LEGACY                   | INDUSTRY              | TARGET                                                                 | CLASS                                          |
| -------------------- | ------------------------ | --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Track after checkout | Dedicated track route    | Timeline + refresh    | `/orders/:id` renders events + current status                          | **IMPROVE**                                    |
| Status source        | Numeric + socket         | Server events         | `statusEvents[]` only                                                  | **PRESERVE** / **CORRECT** (no client machine) |
| Live map / GPS       | Porter/Dunzo URL         | Common                | **FUTURE** (no consumer geo API)                                       | **FUTURE**                                     |
| Sockets              | `order_trigger`          | Push or poll          | GET + manual refresh + light poll on active                            | **IMPROVE**                                    |
| Cancel               | Status 0 only            | Before accept         | `INITIAL`/`PENDING` → `PATCH /me/orders/:id/cancel` + `expectedStatus` | **PRESERVE** (doc 90)                          |
| Paid cancel          | Wallet if `settleAmount` | Explicit refund       | Existing `RefundService`; UI shows `paymentIntents`                    | **PRESERVE**                                   |
| Rider                | Delivery track URL       | Identity after assign | `deliveryPerson` from GET                                              | **PRESERVE**                                   |
| History vs active    | Separate tabs            | Same                  | `GET /me/orders?lane=active\|history`                                  | **PRESERVE**                                   |
| Auth / privacy       | JWT                      | Own orders only       | 401 unauthenticated; 404 foreign                                       | **PRESERVE**                                   |
| Font                 | Mulish                   | One family            | Inter                                                                  | **CORRECT**                                    |

---

## 6. TARGET

### 6.1 APIs (existing — do not duplicate)

| Method | Path                               | Use                                    |
| ------ | ---------------------------------- | -------------------------------------- |
| GET    | `/api/v1/me/orders`                | `lane=active\|history`                 |
| GET    | `/api/v1/me/orders/:id`            | Status, events, items, payments, rider |
| PATCH  | `/api/v1/me/orders/:id/cancel`     | `{ expectedStatus, reason? }`          |
| GET    | `/api/v1/discover/restaurants/:id` | Optional restaurant name (public)      |

No new Prisma models. No new order state machine.

### 6.2 UI (`apps/web`)

- Orders list: Active / History using server `lane`.
- Order track: current badge, chronological `statusEvents`, items, payment intents as returned, rider when present, cancel only when `INITIAL` or `PENDING`.
- 409 on cancel → reload latest status.
- Same-status cancel remains server-idempotent.
- Inter + `--ame-*`. Empty / loading / retry.

### 6.3 Out of scope

Guest cart, geo/map, OTP, tax engine, V2 RAG, moods/cravings/curations, sockets, DeliveryTask, rider earnings, OTP/POD, profile/addresses/favorites HTTP, offer browse.

---

## 7. Owner decisions (do not guess)

1. When to add live location / sockets.
2. Whether seating/experience track becomes consumer HTTP (doc 48/49).
3. OD-6 consumer wallet ledger.
