# 113 — Stage K: Celebration / Occasion / Festival / Event Commerce

**Status:** FORENSIC ONLY — L1–L4 contract. **No implementation.**  
**Date:** 2026-09-05  
**Accepted HEAD at start:** `49c95c4bf047a8238517a58c0df41dab8d532e16`  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Prior forensics (do not collapse into this domain):** [48](./48-CELEBRATIONS-EXPERIENCES-RECONCILIATION.md) Experience/Celebration UI · [44](./44-SEATING-TABLE-SETUP-RECONCILIATION.md) / [45](./45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md) restaurant seating · [49](./49-EXPERIENCE-CONFIGURATION-FOUNDATION.md) target Experience config · [83](./83-GLOBAL-EXPERIENCE-CATALOGUE-FORENSIC-CONTRACT.md) media folders · [109](./109-STAGE-F-COMBO-BUNDLE.md) food Combo · [112](./112-STAGE-I-GLOBAL-MERCHANT-CATALOG-RECONCILIATION.md) Global Item Catalog  
**Machine-readable matrix:** [113-STAGE-K-GAP-MATRIX.json](./113-STAGE-K-GAP-MATRIX.json)

This document recovers what amealio actually does for celebrations, occasions, festivals, events, packages, tickets, QR, seating, and food-included vs food-extra. It then benchmarks, gaps, and states the target contract.

**Hard stop:** no schema, migrations, APIs, UI, seeds, or A–I production changes in this task. Do not implement Celebration Packages. Do not start Stage J. Do not start Stage K code without an explicit GO.

---

## Vocabulary (do not collapse)

| Term | What the evidence says it is | What it is not |
|---|---|---|
| **Combo** | Stage F food bundle (`combos` → target `Combo`) sold on a restaurant menu | Not a Celebration Package. Not an Event ticket |
| **Package (Experience.packages[])** | Embedded **pricing tier** on a merchant Experience (name, adult/kid seats, price) | Not Combo. Not Global Catalog. Not a reusable platform template |
| **Package (Experience.Package[] / isPackage)** | Experience **menu mode** that lets the booking cart pick combo/package lines | Not a first-class Package catalog |
| **Event** | Merchant-owned RSVP / ticket-book document (`events`) booked via `eventHandler` | Not Experience. Not the consumer “Events” strip |
| **Experience** | Merchant-owned bookable offering (`experiences`) booked via `expRequest` | Not Event. Not Celebration-the-entity |
| **Celebration** | Consumer **UI label** over `ExpEventManagement` rows with `type=EXPERIENCE` | No Mongo/Prisma Celebration model |
| **Occasion** | Consumer **UI route/label** (`/experience/occasions`) plus a free-text `occasion` field on bookings | No Occasion model |
| **Festival** | UI/taxonomy copy only (0 backend model matches) | Not an entity |
| **ExpEventManagement** | Super Admin **taxonomy overlay** (`type ∈ {EVENT, EXPERIENCE}` + Sub Category) | Not a bookable event |
| **exp_events** | Platform **scraped external event cards** (home “Events” strip) | Not merchant Events. Read-only |
| **Admission ticket** | A **booking** (`eventHandler` or `expRequest`) that can display a QR | Not the `ticket` collection |
| **`ticket` collection** | Customer **support / help-desk** case (`event_request_no` / `exp_request_no` are references) | Not admission |
| **QR (admission)** | Client-rendered JSON of booking IDs (+ often attendee name) | Not a signed token. Not one-QR-per-guest |
| **QR (table print)** | Client-generated table/seat label at print time (doc 44) | Not event admission |
| **Seat (Event)** | Optional `Events.table_setup.seat[]` + `eventHandler.seat_number[]` | Not restaurant `Diner` seating |
| **Seat (Experience / restaurant)** | Capacity on Experience; physical table assigned later on `expRequest`/`Diner` | Not event ticket inventory |
| **Food included** | Experience flags `is_food_included` / `serveFood` / `foodItems` | Not present on merchant `Events` |
| **Food extra** | Experience cart `items[]`/`combos[]` → optional `Order` | Not a second price engine |
| **Ticket inventory** | `Events.leftOverTB` / `total_quantity_TB` (ticket-book) and `leftOverRSVP` (RSVP) | Not Stage C item availability |

Product intent (user-desired, **not** fully present in legacy): ticketing for Celebrations / Occasions / Festivals, single or multiple tickets, optional seating, and Event food **INCLUDED** vs **EXTRA**. That intent is reconciled below; it is not treated as already-shipped behavior.

---

## Evidence sources

| Repo | Path | Role | Stage K evidence |
|---|---|---|---|
| Amealio-VendorDashboard | `/agent/repos/amealio-vendordashboard` | Legacy Feathers/Mongo **truth** | `events.model.ts`, `event-handler.model.ts`, `experience.model.ts`, `expRequests.model.ts`, `experience-cart.model.ts`, `ticket.model.ts`, `exp-events.model.ts`, `exp_events.model.ts`, `diner.model.ts`, `event-handler.class.ts`, `experienceRefund.ts` |
| amealio_web_app | `/agent/repos/amealio_web_app` | Consumer | Celebration/Events tabs, occasion routes, exp-cart/checkout/track, `V2TrackScreenViewQR.jsx` |
| AmealioDashboardMVP- | `/agent/repos/amealiodashboardmvp-` | Merchant + Super Admin | Event dashboards, Experience wizard, public `/ticketbooked/:id` + `/experience/ticket/:id`, `QrScanGlobal.js`, Role Management Event / Event Seating Request |
| Replateform-Amealio | `/agent/repos/replateform-amealio` | Target | `Experience` + `ExperienceMenu` **config only**. `SeatingRequest` / `RestaurantTable` restaurant seating. **No Event / EventTicket / expRequest / QR** |
| amealio-nestjs-backend | `/agent/repos/amealio-nestjs-backend` | Legacy Nest | **No** celebration/event/ticket domain |
| amealio-self-delivery-app | `/agent/repos/amealio-self-delivery-app` | Rider | **No** domain code |
| Amealio-VendorApp | — | Native merchant | **Unavailable** |
| Amealio-Homepage-V2-RAG-Server | — | Home V2 RAG | **Unavailable** (irrelevant to this domain) |

---

## 1. L1 — Legacy Reality

### 1.1 Two bookable domains, not one

| Domain | Collection | Booking row | Subscription gate | Consumer entry |
|---|---|---|---|---|
| **Experience** | `experiences` | `exprequests` | `experience_management.offline_experience.{special,curated}` | Home “Celebrations” → `/user-exp-events?type=EXPERIENCE` → `/user/experience` |
| **Event** | `events` | `eventhandlers` | `event_management.offline_event.{booking_enabled,rsvp,seat_management}` | Merchant event flows + `/user/event-handler`. **Not** the home “Events” strip |

They do not share a booking table, status enum, or food model. Doc 48 already forbade merging them. Stage K **preserves** that split.

A third “Events” surface is **scraped** `exp_events` / `GET /user_exp_events` (read-only cards). It is not merchant ticketing.

### 1.2 Celebration / Occasion / Festival / Event distinction

| Name | Backend entity? | Identity | Ownership | Lifecycle | Ticket | Food |
|---|---|---|---|---|---|---|
| **Celebration** | No | UI label | n/a | n/a | Via underlying Experience booking | Via Experience food/menu modes |
| **Occasion** | No | UI route + booking free-text | n/a | n/a | Same | Experience `isOccasionWithText` can skip food/Order |
| **Festival** | No | Copy / subcategory title | n/a | n/a | None | None |
| **Experience** | Yes | `_id` / `expId` | Merchant `restaurantId` | draft → publish → cron endDate | Booking QR on `expRequest` | **Yes** — included / extra / occasion-text |
| **Event** | Yes | `_id` / `event_id` | Merchant `restaurant_id` | `active`, `booking_closed`, `tb_booking_closed`, `rsvp_booking_closed` | `eventHandler` RSVP \| TICKET_BOOKED + public QR page | **No Event food fields** |
| **ExpEventManagement** | Yes | taxonomy row | Super Admin | `isActive` | None | None |
| **exp_events** | Yes | scraped card | Platform ingest | read-only | None | None |

Evidence: `Celebrations.jsx` + `ExperienceTabSwitcher.jsx` (`celebration` / `events` tabs); `celebrationSubCategoryUtils.js`; `events.model.ts`; `experience.model.ts`; grep `festival` = no model.

### 1.3 Package forensic findings

There is **no** Celebration Package catalog, **no** global package materialization, and **no** Festival/Event package entity.

Three different “package” words exist:

1. **`Experience.packages[]`** — embedded tiers: `name`, `price`, `discountedPrice`, `adults`, `kids`, `desc`, `seatCustomized`, `status`. Merchant-owned, not reusable across restaurants, not in Stage I Global Catalog.
2. **`Experience.isPackage` + `Package[]` + `defaultPackageId`** — menu-mode flag. Booking cart uses `combos[]` when this mode is on (`experienceCartHelpers.js`). The referenced objects are menu/combo selections, not a Package domain.
3. **Stage F `Combo`** — separate `combos` collection / target `Combo`. Food-bundle commerce only (doc 109).

Decorations, services, upgrades, and global package templates are **not evidenced** as first-class fields. Prices on `packages[]` are merchant scalars (not Stage D quotes).

### 1.4 Ticket forensic findings

| Question | Finding |
|---|---|
| What is a ticket? | **A booking row**, not a child ticket table. Event: one `eventHandler` with `adult_count` + `kids_count`. Experience: one `expRequest` with pax / optional `package` |
| Ticket types | Event: `RSVP` vs `TICKET_BOOKED`, plus `ticketName`, `adult_price`, `child_price`. Not a TicketType collection |
| Inventory | `total_quantity_TB` / `leftOverTB` / `buffer_TB_guest` (ticket-book); `maxGuest_RSVP` / `leftOverRSVP` (RSVP). Decremented in `event-handler.class.ts` |
| One order → N tickets? | **One booking covering N guests.** No per-guest ticket rows |
| Transfer | **Not found** |
| Dedicated check-in API | **Not found.** Operational equivalent = merchant QR scan + status `SEATED` / `userReached` |
| `tickets` collection | **Support desk.** Fields include `event_request_no`, `exp_request_no` |

Capacity enforcement for ticket-book (`event-handler.class.ts` ~1500–1527): reject when `leftOverTB` is insufficient; decrement leftover on non-INITIAL create. The decrement is a read-modify-write on the Event document — **not a transactional seat/ticket lock**. Seat marks (`table_setup.seat[].status = UNAVAILABLE`) are the same pattern.

Experience capacity: `totalSeats` / `seatsLeft` enforced for **CURATED**, not SPECIAL (doc 48).

### 1.5 QR forensic findings

| Surface | Payload | Authority |
|---|---|---|
| Event public page `/ticketbooked/:id` | `JSON.stringify({ event_id, name, event_request_id, event_type })` | Client `EventQrCodePublicDisplay.js` |
| Event server (commented email QR) | Same JSON | `event-handler.class.ts:1709–1714` (`QRCode.toDataURL` **commented out**) |
| Experience consumer track | `{ experience_id, diner_id, order_id, name }` | `V2TrackScreenViewQR.jsx:67–74` |
| Experience public page `/experience/ticket/:id` | `{ expRequestId: requestId }` | `ExperienceQrCodePublicDisplay.js:242–244` |
| Table print QR | `{ restaurant_id, table_number\|seat_number, type, vendor_id }` | Doc 44 — **not persisted** |

Facts:

- **One QR per booking**, covering all guests on that booking. Not one QR per adult/child.
- QR is **not** a signed / opaque redemption token. It embeds **predictable business IDs and attendee name**.
- Validation is **not** a server redemption endpoint. Merchant `QrScanGlobal.js` parses the JSON and **routes** to `/event`, `/experienceDashboard/all`, or `/seatingdashboard`.
- Duplicate-scan prevention, one-time redemption, and scanner authorization are **not evidenced**.
- `GET /vendor/event-handler/:id` for the public ticket page is an **unauthenticated booking read** (privacy gap).

### 1.6 Seating forensic findings

Three seating systems already exist. Do not merge them.

| System | Inventory | Who assigns | When | Optional? |
|---|---|---|---|---|
| **Restaurant dine-in** | Subscription `table_setup` → target `SeatingArea` / `RestaurantTable` | Merchant at accept/seat | After booking | Core seating (docs 44/45) |
| **Experience** | `totalSeats` (capacity), no event seat map | Merchant `tableNumber` at SEATED | After payment | Date/pax required in UI; physical table optional |
| **Event** | `Events.table_setup` floors/seats/tables; `seat_selection_applicable` | Customer may send `seat_number[]`; merchant Event Seating Request roles assign table | At/after ticket book | Optional (`seat_selection_applicable` default false) |

Event seat hold: selected `seat_number`s are flipped to `UNAVAILABLE` on the Event embed; cancel/reject restores leftover counts and can free seats. **No seat lock TTL, no payment-failure hold, no transactional uniqueness.** Two concurrent buyers can race the same seat.

Role Management labels “Event Management” and “Event Seating Request Management” (view ticket book, assign table) apply to **merchant Events / eventHandler**, not Experience `expRequest`.

### 1.7 Capacity / inventory

| Inventory | Owner | Sold-out signal |
|---|---|---|
| Event ticket-book | `leftOverTB` | “Ticket Booking is full” / leftover message |
| Event RSVP | `leftOverRSVP` | leftover check |
| Event seats | `table_setup.seat[].status`, `left_seat_count` | `tb_booking_closed` / leftover seats |
| Experience seats | `seatsLeft` (CURATED) | booking reject |
| Restaurant tables | Diner + table status | seating, not tickets |
| Food items | Stage C `MenuItem` availability | Independent of ticket leftover |

A ticket can sell out while restaurant food remains available. The inverse is also true for Experience food-extra: Stage C can block a cart item without closing Experience capacity.

### 1.8 Food INCLUDED vs EXTRA

**On Experience (evidenced):**

| Mode | Fields | Purchase |
|---|---|---|
| Included | `is_food_included`, `serveFood`, `foodItems` (text) | In experience price / packages — **not** a structured MenuItem list |
| Extra / selectable | `isStandardMenu` / `isCustomMenu` / `isPackage` | `experience_cart.items[]` / `combos[]` → `expRequest` → optional `Order` |
| No food | `isOccasionWithText` | **No Order created** |

Included food is **not** a copied Global Item, **not** automatically a Combo, and **not** a voucher. Extra food **reuses** merchant menu/combo lines and later an `Order`.

**On merchant Events (evidenced):** **no food fields.** No included menu, no extra checkout, no package food. Product intent to add Event `foodPolicy = INCLUDED | EXTRA` is **new** relative to L1.

### 1.9 Payment / refund

| Path | Pay | Refund |
|---|---|---|
| Experience | Razorpay immediate (`paymentStatus:1`) or pay-at-site (`0`) on `expRequest` | `experienceRefund` (Razorpay/wallet/external); type `EXPERIENCE` |
| Event | `eventHandler.payment_data` / `transactionDetails` (cash, UPI, cards, wallet, pay-later, external) | Event cancel writes refund transactional (`REFUND_TYPE.CANCEL_EVENT`) |
| Policy text | Experience `refundDesc`; Event `refund_and_cancellation` | Free-text. Percentage argument exists; **canonical % policy not evidenced** |

Target `PaymentIntent` / `RefundService` are **Order-scoped**. Experience/Event bookings are **not** on that stack today.

### 1.10 Promotions

- Experience cart may carry an `offer` ref.
- Events store a single `coupon_code` string on the Event document.
- No event-specific promotion engine, early-bird type, or ticket-type discount ledger.
- Target: Stage E remains the only evaluation engine **if/when** event purchases become commercial quotes.

### 1.11 Consumer / merchant / Super Admin flows

**Consumer**

1. Celebrations: taxonomy strip → Experience list → detail → exp-cart (seating + optional food) → checkout → pay/defer → track + QR.
2. Home “Events”: scraped cards only.
3. Merchant Event book: `/user/event-handler` (RSVP or TICKET_BOOKED), pax, optional seats, payment, public QR page.

**Merchant**

- Experience wizard: taxonomy, dates, capacity, packages, food/menu mode, publish.
- Experience ops: `/experienceDashboard/*` — accept, seat, cancel/refund.
- Events: `/event`, `/offline-events-*`, `/event/add-event` — RSVP + ticket config, leftover inventory, optional `table_setup`.
- Event seating requests: assign table / view ticket book (RBAC module).
- Scan: `QrScanGlobal` routes by payload keys.

**Super Admin**

- `ExpEventManagement` CRUD (`/admin/exp-events`).
- Scraped `exp_events` ingest/read.
- Admin views of vendor experiences/events/reports.
- Experience media folder templates (Stage I / docs 83–86) — **media**, not packages.
- Super Admin does **not** own merchant Event tickets or Celebration Packages.

### 1.12 Answers to the 52 forensic questions (compressed)

Stored in Mongo on VendorDashboard (`events`, `eventhandlers`, `experiences`, `exprequests`, `experience_carts`, `diners`, taxonomy/scraped collections). Created/edited/published by **merchant** (Experience/Event) or **Super Admin** (taxonomy/scraped). Purchased/attended by **consumer**. Validated by **merchant staff scan + status**, not a redemption API. Merchant-owned and restaurant-specific; venue is a string/lat-long on Event, not a Venue entity. Scheduled via start/end dates. Capacity yes (leftover counters / CURATED seats). Seating optional on Events; Experience table later. Ticket inventory yes on Events. A “ticket” is one booking entitlement covering N guests. Multiple tickets in one purchase = **pax counts**, not N QR codes. Shared QR = **one QR per booking**. Transfer not found. Cancel/refund exist; partial-guest refund not first-class. Check-in = SEATED. QR not server-authoritative. Duplicate-scan not evidenced. Attendee = purchaser `user_details` only. Seat assignment optional; Event seats at book if selected; Experience table later. Tables/seats/sections exist as embeds. Food included/extra = **Experience only**. Extra food uses menu/combo → Order. Packages merchant-embedded, not global, not materialized. Package prices are scalars. Tax/fee appear as payment_data strings, not Stage D. Promo = optional offer/coupon_code. Event cancel restores leftover + refund transactional. Food unavailable is Stage C on extra-food cart, not Event inventory. Seat/capacity races are possible.

---

## 2. L2 — Industry Benchmark

Smallest production-grade event/ticketing foundation (not a full box-office):

1. **Event** as a scheduled, merchant-owned offer with an explicit lifecycle distinct from `OrderStatus`.
2. **Ticket type + inventory** that is independent of restaurant item availability.
3. **Purchase** that creates **N admission entitlements** (even if UX sells “2 adults”) with a **server-authoritative** inventory decrement (transaction or unique hold).
4. **QR / pass** that is an **opaque unguessable token**, looked up server-side, redeemable by authorized staff, with duplicate-scan rejection and an audit row. No PII in the QR.
5. **General admission** as the default. **Assigned seating** only if the event opts in; seat availability is server-authoritative with a short hold through payment.
6. **Food** either priced into the ticket (entitlement → existing catalog/combo/package quote) or sold as a **normal Stage D order**, never a second arithmetic engine.
7. **Payment / refund / promo** reuse PaymentIntent, RefundService, Stage D, Stage E.
8. **Privacy:** merchants see attendees of *their* event; other attendees do not; scanners see pass status + limited identity.

Unsafe legacy patterns vs this benchmark: guessable JSON QR; public booking GET; non-atomic leftover counters; PII in QR; pay-later + ticket issuance without a hold; support-desk collection named `ticket`.

Assigned seating is **not** mandatory. Transfer, waitlist, seat maps, and scanner-only roles are sophistication, not the first foundation.

---

## 3. L3 — Gap Analysis

| ID | Topic | Class | Gap |
|---|---|---|---|
| K-SPLIT-1 | Experience ≠ Event | PRESERVE | Keep two domains |
| K-LABEL-1 | Celebration/Occasion/Festival | PRESERVE | Remain taxonomy/UI until OD-K-1 |
| K-PKG-1 | Package ≠ Combo | PRESERVE | Doc 109 / this contract |
| K-PKG-2 | No global package catalog | PRESERVE | Do not extend Stage I |
| K-TIX-1 | `ticket` = help desk | CORRECT | Never reuse for admission |
| K-TIX-2 | No per-guest ticket rows | IMPROVE | First slice may still sell pax, but entitlements must be countable |
| K-QR-1 | Client JSON QR + PII | CORRECT | Opaque token + server lookup |
| K-QR-2 | No redemption API | CORRECT | Check-in must be server-authoritative |
| K-INV-1 | leftOverTB race | CORRECT | Transactional inventory |
| K-SEAT-1 | Event seat race | CORRECT | If seating ships, lock/hold |
| K-FOOD-1 | Event has no food | OWNER_DECISION | OD-K-6 / OD-K-7 |
| K-FOOD-2 | Included food is text | IMPROVE | Entitlement → catalog/combo/quote |
| K-PAY-1 | Booking pay off Order stack | IMPROVE | Reuse PaymentIntent/RefundService |
| K-PROMO-1 | Event coupon_code string | IMPROVE | Stage E or none |
| K-PRIV-1 | Public event-handler GET | CORRECT | Authz + no PII in QR |
| K-XFER-1 | Transfer | FUTURE | Not evidenced |
| K-ROLE-1 | Scanner role | FUTURE | Reuse MERCHANT_STAFF first |
| K-SCRAPE-1 | exp_events | FUTURE | External catalog |
| K-SETL-1 | Event settlement | FUTURE / OWNER | Existing settlement is Order-based |
| K-TARGET-1 | No Event/Ticket models | PRESERVE as gap | Config Experience exists; ticketing does not |

---

## 4. L4 — Target Domain Contract

### 4.1 Minimum necessary model (do not create the rest yet)

Required **when Stage K is accepted for implementation** — not now:

| Concept | Why minimum | Do not invent yet |
|---|---|---|
| **Event** | Merchant scheduled offer; L1 `events` | Celebration/Festival entities |
| **TicketType** | Adult/child (and later more) with price + inventory | Unlimited types |
| **EventBooking** | L1 `eventHandler` — one purchase | Parallel OrderStatus |
| **AdmissionPass** | One redeemable pass per booking **or** per guest (OD-K-3) | Support `ticket` rows |
| **EventSeat** (optional) | Only if `seatSelectionApplicable` | Full venue/row seat-map product |
| **FoodPolicy** | Only if OD-K-6 says Events get food | A second food catalog |

**Reuse, do not duplicate:**

- Experience config already exists (`Experience`, `ExperienceFoodMode`, `ExperienceMenuMode`, `ExperienceMenu`).
- Restaurant seating already exists (`SeatingArea`, `RestaurantTable`, `SeatingRequest`).
- Combo, MenuItem, Stage C/D/E, PaymentIntent, RefundService.
- Global Item Catalog (Stage I) stays items, not packages.

**Do not create in the first contract:** Venue, Attendee table (purchaser on booking is enough until OD-K-5), Package Component graph, waitlist, transfer, check-in-operator role, Global Package Catalog.

### 4.2 Lifecycles (distinct from OrderStatus)

**Event (minimum):** `DRAFT` → `PUBLISHED` → `CANCELLED` / `COMPLETED`, with **inventory flags** `SOLD_OUT` as derived (leftover = 0), not a required extra machine. `IN_PROGRESS` is optional (start/end timestamps suffice).

**Booking:** `INITIAL` → `PENDING` → `CONFIRMED` → `CHECKED_IN` / `CANCELLED` / `REJECTED`. Map legacy `NOTSEATED`/`SEATED` onto seating/check-in, not onto payment.

**Pass:** `ISSUED` → `ACTIVE` → `CHECKED_IN` | `CANCELLED` | `EXPIRED`. Refunded bookings cancel unused passes.

### 4.3 QR / security (target, not implemented)

- Opaque random token stored hashed or as a high-entropy secret; QR encodes **only** that token (or a signed pointer).
- Server lookup: event, booking, pass status, timestamp window.
- Authorized staff only; audit: who scanned, when, result.
- Duplicate scan → deterministic reject after first successful check-in.
- **Never** put name/phone/email in the QR. **Never** use sequential `event_request_id` as the only secret.

Legacy JSON QR is **CORRECT**, not PRESERVE.

### 4.4 Multi-ticket purchase

```
Commercial quote (Stage D, when money moves)
  → PaymentIntent
  → EventBooking (purchaser, pax, amounts)
       → AdmissionPass (1..N)   // N depends on OD-K-3
```

Legacy behavior is **one pass for the whole booking**. Product intent wants single- and multi-ticket purchases. **OD-K-3** chooses:

- **A (legacy-faithful):** one pass / one QR for the booking (covers all guests).
- **B:** one pass / one QR per guest.
- **Both** only if operations need group entry *and* individual scan. Do not implement both in a first slice without that need.

Partial cancel/refund of some guests is **OD-K-11**. Transfer is FUTURE.

### 4.5 Seating (target)

- Default: **general admission** (ticket inventory only).
- Optional: **assigned seating** when the Event opts in.
- Customer-selected seats at purchase **only** if opted in (legacy Event path).
- Experience/restaurant table assignment stays on `SeatingRequest` / merchant SEATED — **do not** route Experience tables through EventSeat.
- If assigned seating ships: server-authoritative availability, hold through payment, release on fail/timeout/cancel. Never trust client “seat still free”.

### 4.6 Food

**Experience (already contracted in docs 48/49):** `foodMode` INCLUDED | SEPARATE | OCCASION_TEXT | NONE. Extra food → existing catalog/combo → Stage D Order. Do not invent event-specific price math.

**Event food (product intent, not L1):**

- If **OD-K-6 = no food on Events:** Event price is admission only. Food is ordinary restaurant ordering (EXTRA by going to the menu).
- If **OD-K-6 = Events gain foodPolicy:**
  - INCLUDED: Event/TicketType price includes a **catalog or Combo entitlement** quoted by Stage D at purchase (snapshot). Not `foodItems` free text as the money source.
  - EXTRA: separate Stage D cart/order, not a second checkout arithmetic. Whether that cart is attached to the booking is **OD-K-7**.

### 4.7 Payment, promo, settlement

- Ticket money uses Stage D quote + PaymentIntent + RefundService.
- Stage E evaluates coupons if an Event purchase is a commercial order. Do not keep a parallel `Events.coupon_code` engine.
- Settlement: Event revenue is **FUTURE / owner** unless an Event purchase is an `Order` the current settlement already understands. Do not redesign payouts here.

### 4.8 Authorization / privacy

| Actor | May |
|---|---|
| SUPER_ADMIN | Taxonomy (`ExpEventManagement`); not merchant ticket mutation |
| MERCHANT_OWNER / MERCHANT_STAFF | CRUD own Events/Experiences; scan/check-in own bookings; see own attendees |
| CONSUMER | Discover published; buy; see own passes |
| Scanner-only role | **Not created** (FUTURE). Staff scan is enough |

Never authorize from client `merchantId` / `restaurantId` / `eventId`. Attendee PII is merchant-of-record + the attendee. QR must not leak PII. Public unauthenticated booking GET is **out**.

### 4.9 Cross-domain architecture

```
Stage I Global Item Catalog ──materialize──► Merchant MenuItem
                                                    │
Stage F Combo ──────────────────────────────────────┤
Stage C availability / Stage D quote / Stage E promo
                                                    │
Experience (config exists) ──booking FUTURE──► expRequest-equivalent
     foodMode / menuMode ──► Menu / Combo / Order

Event (NOT in target yet) ──► EventBooking + AdmissionPass
     optional EventSeat
     optional foodPolicy (OD-K-6) ──► same Stage D/E, not a new engine

Restaurant SeatingRequest ── dine-in / Experience table
     ≠ EventSeat

Experience Catalogue (media folders) ≠ Event ≠ Package
Celebration Packages ≠ Combo ≠ Global Item
Stage H personalization ── untouched
Stage J ── not started
```

---

## 5. Entity map (canonical)

```
Platform
  Category / Sub Category
  ExpEventManagement (taxonomy overlay)     [legacy only; overlay still a gap]
  exp_events (scraped cards)                [FUTURE / out]

Merchant restaurant
  Experience (config: IMPLEMENTED)
  ExperienceMenu → Menu(CUSTOM)
  Events                                    [legacy only; target GAP]
  Combo / MenuItem / MerchandisingRelation  [A–G]

Bookings
  expRequest + optional Diner + optional Order   [legacy; target GAP]
  eventHandler + payment_data                    [legacy; target GAP]

Admission
  AdmissionPass / QR                            [legacy = client JSON; target GAP]
  ticket (help desk)                            [keep separate]

Seating
  SeatingArea / RestaurantTable / SeatingRequest [IMPLEMENTED restaurant]
  Events.table_setup                             [legacy Event-only embed]
```

---

## 6–16. Flow / findings index

Sections 1.3–1.11 are the authoritative Package, Ticket, QR, Seating, Capacity, Food, Consumer, Merchant, Super Admin, Payment, and Promotion findings. They are not repeated here.

---

## 17. Authorization (target)

JwtStaffGuard + StaffAuthorizationGuard + restaurant scope. Consumer JWT for purchase/own passes. Super Admin platform-only for taxonomy. No new role in the first slice.

---

## 18. Audit / security

Minimum audit once implemented: who created the Event, who purchased, which pass, which staff checked in, timestamps. Inventory mutations and seat holds must be durable. QR secrets are credentials.

---

## 19–23. Classification summary

**PRESERVE:** Experience ≠ Event; Celebration/Occasion/Festival as labels; Package ≠ Combo; Stage I ≠ packages; restaurant seating ≠ event seating; merchant ownership of Events/Experiences; RSVP vs ticket-book as two Event sale modes; leftover inventory **concept**; optional Event seating; food modes on Experience; A–G money/availability/promo engines.

**IMPROVE:** Booking payment onto PaymentIntent; leftover counters onto transactional inventory; included food as catalog/combo entitlement; Stage E for event coupons; countable admission entitlements even when UX sells pax.

**CORRECT:** Help-desk `ticket` ≠ admission; client JSON QR with PII; public booking GET; non-atomic seat/ticket decrement; guessing Event food from Experience.

**OWNER DECISION:** OD-K-1, OD-K-3, OD-K-6, OD-K-7, OD-K-8, OD-K-10, OD-K-11 (exact list in §26 / JSON).

**FUTURE:** Transfer, scanner role, scraped exp_events, seat-map designer, waitlist, package upgrades, Experience booking runtime (doc 48), Global Package Catalog, Event settlement redesign, Stage H/J.

---

## 24. Owner decisions (unresolved)

| ID | Question | Why unresolved |
|---|---|---|
| **OD-K-1** | Are Celebration / Occasion / Festival Event **kinds**, or do they stay Experience taxonomy labels? | L1 = labels + Experience. Product intent = ticketing for all three |
| **OD-K-3** | One QR/pass per **booking** (legacy) vs per **guest** vs both? | L1 = booking-level. Product lists A/B/C |
| **OD-K-6** | Do merchant Events gain `foodPolicy` INCLUDED \| EXTRA? | L1 Events have **no food**. Product wants the distinction |
| **OD-K-7** | If EXTRA, is food a linked Stage D cart on the booking or ordinary restaurant ordering? | Depends on OD-K-6; L1 Event has neither |
| **OD-K-8** | Are Experience `packages[]` merchant-only forever, or is a reusable package catalog wanted? | L1 = embedded merchant tiers only |
| **OD-K-10** | Event/Experience cancellation refund policy (full / schedule-based / merchant text)? | Only free-text + helper percentage |
| **OD-K-11** | Partial refund of some guests on one booking? | L1 cancels the booking as a whole |

Resolved by evidence (not owner): no ticket transfer (FUTURE); no new scanner role (reuse staff); GA first, assigned seating optional on the Event; purchaser identity required, extra attendee records optional; no package upgrades; inventory must be server-authoritative (CORRECT, not a product fork).

---

## 25. Smallest justified implementation slice

**Decision: DEFER. Do not implement Stage K now.**

Reasons:

1. This task is forensic-only.
2. OD-K-1 / OD-K-3 / OD-K-6 change the first schema if guessed.
3. Experience **configuration** already exists; Experience **booking** is a separate gap (doc 48) and is not this slice.
4. A–G commerce is live and must not be forked by a guessed package/ticket engine.
5. QR/security work is unsafe to copy from legacy JSON.

**If later accepted**, the smallest *justified* first code slice is:

> Merchant **Event** (draft/publish/cancel, schedule, restaurant scope) + **TicketType** adult/child with **transactional inventory** + **EventBooking** purchase on PaymentIntent + **one opaque AdmissionPass / QR per booking** (until OD-K-3 says otherwise) + **general admission**. Assigned seating, Event food, Celebration-as-Event-kind, Experience booking runtime, and packages stay out until their ODs are decided.

That slice is **not** authorized by this document.

---

## Confirmations

- **No production/application code was changed** (documentation only).
- **No Prisma schema, migration, seed, API, or UI change.**
- **A–G production behavior unchanged.** Stage H remains forensic/deferred. Stage I implementation was not modified. **Stage J was not started.**
- **Celebration Packages were not implemented.**
- **Combo, Experience media catalogue, and restaurant seating were not redesigned.**
