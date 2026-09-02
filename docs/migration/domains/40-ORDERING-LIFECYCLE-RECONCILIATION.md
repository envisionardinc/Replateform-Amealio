# 40 — Ordering Status / Lifecycle Reconciliation (P1.7.11)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration. Resolves the **OD-11** blocker (legacy ordering status vs target `OrderStatus`).
> **Authority:** legacy source (`amealio-vendordashboard`, `amealio-self-delivery-app`, `amealiodashboardmvp-`, `amealio_web_app`) + target `prisma/schema.prisma`. Baseline **210/210**.

---

## 1. Executive conclusion

**OD-11 is RESOLVED.** Legacy native ordering uses a **single numeric `order_status`** field whose enumerated members (`ORDERSTATUS`) are **named** — `INITIAL, PENDING, CONFIRMED, PREPARING, PACKING, READYTOPICK, ONTHEWAY, DELIVERED, COMPLETED, CANCELLED, RETURNED` — and map **1:1** to the existing target `OrderStatus` (only cosmetic renames: `READYTOPICK→READY`, `ONTHEWAY→ON_THE_WAY`). The numeric `5/6` values are simply the **encodings** of `ONTHEWAY`/`DELIVERED` on that same field; the rider advances the same `order_status` (legacy even ships an `ORDERSTATUS.STRING` numeric↔named map). Legacy has **no separate order/delivery state machine** — delivery phases live in `order_status`; `payment_status` is a **separate** numeric enum, and the target already models these as **distinct dimensions** (`OrderStatus`, `PaymentStatus`, `FulfillmentStatus`, `DeliveryTaskStatus`, `OrderStatusEvent`).

The "named `DELIVERED` vs numeric `5/6`" confusion originated from conflating (a) the **ONDC** marketplace lifecycle (`ONDC_ORDER_STATUS`, deferred) and (b) the native numeric `order_status`. They are different systems. The native lifecycle maps cleanly.

→ **OD-11 RESOLVED — existing target `OrderStatus` is sufficient (option A).** No schema change and no owner decision are required to represent the native order lifecycle. **Ordering is the best next candidate** (Seating/Discovery remain blocked by their own owner decisions).

## 2. Complete legacy order-status inventory

Native `ordering.model.ts` status fields:

| Field | Type | Enum members | Role |
|---|---|---|---|
| `order_status` | **Number** (`ORDERSTATUS`) | INITIAL, PENDING, CONFIRMED, PREPARING, PACKING, READYTOPICK, ONTHEWAY, DELIVERED, COMPLETED, CANCELLED, RETURNED (default PENDING) | single order lifecycle |
| `previous_status` | Number | — | prior `order_status` (transition history) |
| `payment_status` | **Number** (`PAYMENTSTATUS`) | PENDING, COMPLETED, CANCELLED, FAILURE, INPROGRESS | payment lifecycle (separate) |
| `payment_method` | Number (`PAYMENTMETHOD`) | CASH, UPI, PAYTM, DEBITCARD, CREDITCARD, NETBANKING, PAYLATER, WALLET, EXTERNAL, INCASH, DIRECT_MERCHANT | payment method |
| `direct_merchant_payment.status` | String | PENDING_VERIFICATION, VERIFIED, REJECTED | direct-merchant UPI verification sub-state |
| `onhold` / `holdHistory[].action` | Bool / String | HOLD, RELEASE, HOLD_ITEM, RELEASE_ITEM | hold sub-state |
| logistics/delivery nested `status` | String | (Dunzo/Porter tracking strings) + `tracking_url` | delivery-provider tracking |
| `petpoojaSync.synced` | Bool | — | POS sync flag |
| `created_by` | Number | 0=user,1=vendor,2=admin | actor |
| `tracking`/`track_location`/`travelMode` | mixed | — | customer live tracking |

Legacy also ships `ORDERSTATUS.STRING.*` (a named string form of each numeric member) used for display/notifications — confirming the **named members are canonical** and numbers are encodings. `ONDC_ORDER_STATUS` (INIT/PAYMENT_DONE/…/RETURN_DELIVERED) is a **separate ONDC** lifecycle (deferred).

## 3. Numeric rider-status analysis

`amealio-self-delivery-app`: `order-card.tsx` sets `order_status = 5` ("On the way") / `6` (delivered) and `payment_status = 1` (COD collected); `order-detail.tsx` computes `nPhase = statusCode >= 6` → "Delivered". So `5`/`6` are **the same `order_status` field's `ONTHEWAY`/`DELIVERED` members** — the rider writes them via `PATCH /orders/delivery-persons`. They are **persisted order-status values**, not a separate rider/delivery field. Neighboring numbers correspond to the other `ORDERSTATUS` members in sequence (INITIAL/PENDING…READYTOPICK before, COMPLETED after). Exact integer-per-name lives in the backend app config (`app.set('ORDERSTATUS', …)`) — an import-time detail (§18 UNKNOWN), non-blocking because names map 1:1.

## 4. Order-vs-delivery lifecycle separation

Legacy has **one** order lifecycle (`order_status`) that spans creation→preparation→delivery→completion; the rider merely advances it. There is **no separate persisted delivery/rider state machine** — only (a) `payment_status` (separate) and (b) delivery-**provider** tracking strings (Dunzo/Porter `status`/`tracking_url`, non-authoritative for order lifecycle). The target **already separates** these into `OrderStatus` + `PaymentStatus` + `FulfillmentStatus` + `DeliveryTaskStatus` — a superset, so no collapse and no conflict.

## 5. Legacy transition graph (derived)

```
INITIAL → PENDING → CONFIRMED → PREPARING → PACKING → READYTOPICK → ONTHEWAY(5) → DELIVERED(6) → COMPLETED
                 ↘ CANCELLED (from PENDING/CONFIRMED/…; auto-cancel crons)
                                                     ↘ RETURNED (post-delivery return)
payment_status:  PENDING → INPROGRESS → COMPLETED | FAILURE | CANCELLED   (separate axis)
```
Dine-in/takeaway variants skip delivery phases (ONTHEWAY/DELIVERED); home-delivery uses the rider transitions. `previous_status` records the prior value on each change.

## 6. Status transition actors

| Transition | Actor | Path |
|---|---|---|
| create → PENDING/INITIAL | customer (web_app) | `POST /user-ordering` |
| → CONFIRMED / PREPARING / PACKING / READYTOPICK | merchant | `/merchant/ordering`, dashboard |
| → ONTHEWAY / DELIVERED | **rider** | self-delivery `PATCH /orders/delivery-persons` (`order_status` 5/6) |
| → COMPLETED | system/merchant | order-status cron (05:00) / merchant |
| → CANCELLED | customer/merchant/system | cancel + auto-cancel crons (`orderCancelCron` */4 min) |
| payment_status | gateway/rider (COD) | Razorpay webhook / `updateTransaction` / rider COD |
| POS-driven status | POS | `/pos/webhook/:posId/:action` (petpoojaSync) |

Multiple authoritative writers exist (customer, merchant, rider, POS, payment gateway) — all mutate the **same** `order_status`/`payment_status` fields.

## 7. Side-effect inventory

Per-transition side effects to preserve (not implement now): customer/merchant/rider **notifications** (FCM/SMS/email + templates); **Socket.IO** `ordering`/`order_trigger`/`order_update` events (customer tracking); **payment** capture/refund (`updateTransaction`, `transactional`); **delivery-provider** assignment (Dunzo/Porter/own rider); **wallet/settlement** on completion; **timestamps** (`max_time_date`, `placedAt`); **analytics**/user-activity; **POS** status propagation (`petpoojaSync`); **auto-cancel** crons.

## 8. POS / webhook interaction

`/pos/webhook/:posId/:action` mutates `order_status` (petpoojaSync); POS is authoritative for POS-integrated merchants. Deferred (order works without POS; POS is a later integration).

## 9. Delivery-provider interaction

Own rider (self-delivery app → `order_status` 5/6), Dunzo, Porter each carry a **provider tracking** sub-state (`status` String, `tracking_url`) but the **order lifecycle remains `order_status`**. Provider abstraction/assignment is deferred to a delivery slice; `DeliveryTask`/`DeliveryTaskStatus` + `DeliveryPartner` exist in the target to receive it.

## 10. Payment / order relationship

**Partially coupled, separate fields.** `payment_status` is independent of `order_status` (e.g., COD orders progress through delivery with `payment_status` set at collection; prepaid capture via Razorpay webhook). Payment success/failure gates confirmation but is tracked separately. Target mirrors this: `Order.paymentStatus` + `PaymentIntent`/`PaymentAttempt`/`Transaction`/`Refund`. Full payment integration is a **later** slice; core ordering can start orders with `paymentStatus` = CREATED/PENDING.

## 11. Business rules (source-confirmed)

Order-type gating via subscription; **auto-cancel** (`orderCancelCron` */4 min; `max_time`/`max_time_date`); order-status completion cron (05:00); **hold** (onhold/holdHistory, item-level); **direct-merchant** UPI verification (PENDING_VERIFICATION→VERIFIED/REJECTED); COD `payment_status` set by rider; `previous_status` retained; POS status propagation; rider `order_status` 5/6 transitions; wallet/settlement on completion.

## 12. Target OrderStatus analysis

Target already provides the separated dimensions (all present, no change):
- `OrderStatus` (INITIAL…RETURNED) — **superset-compatible** with legacy `ORDERSTATUS` (1:1 by name).
- `PaymentStatus` (CREATED/AUTHORIZED/CAPTURED/PARTIALLY_REFUNDED/REFUNDED/FAILED) — gateway-oriented.
- `FulfillmentStatus`, `DeliveryTaskStatus`, `DeliveryMethod`, `PaymentMethod`.
- `Order` (money BigInt minor units, merchant/restaurant/user, delivery address) + `OrderStatusEvent` (fromStatus/toStatus/actorType) ← legacy `previous_status`/transitions.

## 13. Source → target mapping table

| Legacy value | Meaning | Target | Classification | Loss |
|---|---|---|---|---|
| `ORDERSTATUS.INITIAL` | draft | `OrderStatus.INITIAL` | **EXACT** | none |
| `PENDING` | placed, awaiting | `PENDING` | EXACT | none |
| `CONFIRMED` | merchant accepted | `CONFIRMED` | EXACT | none |
| `PREPARING` | cooking | `PREPARING` | EXACT | none |
| `PACKING` | packing | `PACKING` | EXACT | none |
| `READYTOPICK` | ready | `READY` | EXACT (rename) | none |
| `ONTHEWAY` (5) | out for delivery | `ON_THE_WAY` | EXACT (rename) | none |
| `DELIVERED` (6) | delivered | `DELIVERED` | EXACT | none |
| `COMPLETED` | closed | `COMPLETED` | EXACT | none |
| `CANCELLED` | cancelled | `CANCELLED` | EXACT | none |
| `RETURNED` | returned | `RETURNED` | EXACT | none |
| `payment_status.PENDING` | not paid | `PaymentStatus.CREATED`(/PENDING) | SAFE MANY-TO-ONE | coarse→gateway nuance |
| `payment_status.INPROGRESS` | processing | `AUTHORIZED` | SAFE MANY-TO-ONE | minor |
| `payment_status.COMPLETED` | paid | `CAPTURED` | SAFE MANY-TO-ONE | none |
| `payment_status.FAILURE` | failed | `FAILED` | EXACT | none |
| `payment_status.CANCELLED` | payment void | `FAILED`(/void) | SAFE MANY-TO-ONE | minor (see §19) |
| `previous_status` | prior state | `OrderStatusEvent.fromStatus` | EXACT (modeled) | none |
| `payment_method.*` | method | `PaymentMethod` (RAZORPAY/WALLET/SCAN_AND_PAY/DIRECT_MERCHANT) | SAFE MANY-TO-ONE | card/UPI granularity (see §19) |
| `direct_merchant_payment.status` | UPI verification | — | **TARGET ADDITION REQUIRED** (deferred payment slice) | n/a |
| logistics `status` String | provider tracking | `DeliveryTask`/webhook | SEPARATE LIFECYCLE (deferred) | n/a |
| `onhold`/`holdHistory` | hold | — | TARGET ADDITION (deferred) | n/a |
| `petpoojaSync` | POS sync | — | DEFERRED (POS slice) | n/a |
| `ONDC_ORDER_STATUS.*` | ONDC lifecycle | — | DEFERRED — existing (ONDC) | n/a |

## 14. OD-11 decision

**A. RESOLVED — existing target `OrderStatus` is sufficient.** The native order lifecycle maps 1:1 (numeric = encoding of named members); the delivery dimension is not a separate legacy state machine (and the target can represent finer delivery via existing `FulfillmentStatus`/`DeliveryTaskStatus` without change); `payment_status` is separate and representable by existing `PaymentStatus`. The only mapping nuances (payment_status/payment_method value maps, direct-merchant verification, POS/logistics sub-states) are **import-time / separate-slice** concerns, not blockers for the order lifecycle or a schema change.

## 15. Ordering readiness matrix

| Dependency | Status |
|---|---|
| Identity/auth (P1.7.1D–F) | **READY** |
| Merchant creation (P1.7.10) | **READY** |
| Restaurant (P1.7.2/10) | **READY** |
| Subscription/config (P1.7.3) | **READY** (order-type gating) |
| Menu/catalog (P1.7.5) | **READY** (order line items) |
| Order lifecycle (OrderStatus) | **READY** (OD-11 resolved) |
| Payment | **PARTIAL** (models exist; `paymentStatus` value map; full Razorpay integration deferred) |
| Delivery | **PARTIAL** (DeliveryTask exists; provider integration deferred) |
| POS | **DEFERRED** (petpoojaSync webhook) |
| Realtime/Socket.IO | **DEFERRED** (no target realtime layer; REST-first) |
| Cart→Order write path | **PARTIAL** (Cart/CartItem models exist; write foundation needed in the slice) |

**Ordering is READY as a bounded FOUNDATION slice** (order create + status lifecycle + items + status events, merchant-scoped, over existing schema), with payment/delivery/POS/realtime deferred to their own slices.

## 16. Comparison with Seating / Discovery

- **Seating:** still blocked by the **`table_setup` modeling** owner decision (embedded in `Subscription.config`) + incomplete `SeatingRequest`. Not next.
- **Discovery:** still blocked by the **Mood/Craving canonical-source** owner decision. Not next.
- **Ordering:** OD-11 **resolved**; foundations READY. → **best next candidate.**

## 17. Hard blockers

**None for the Ordering foundation.** Numeric rider statuses are unambiguously the `order_status` field's members; order and delivery are not an inseparable machine (target separates them); payment is separable; the target `OrderStatus` represents the confirmed lifecycle; no new core entity or owner decision is required.

## 18. UNKNOWNs

- Exact integer value per `ORDERSTATUS`/`PAYMENTSTATUS`/`PAYMENTMETHOD` member (backend `app.set` config) — needed only for the **numeric→named import value map**; non-blocking (names map 1:1).
- `onhold`/`holdHistory` target representation (deferred order-hold feature).
- Full delivery-provider tracking → `DeliveryTask` mapping (deferred delivery slice).
- Realtime transport choice for order tracking (deferred).

## 19. Owner decisions

1. **payment_status value map** (`PENDING/INPROGRESS/CANCELLED` → target `CREATED/AUTHORIZED/FAILED`) — a small import mapping; confirm during the **payment** slice (not the order-foundation slice). Non-blocking for order lifecycle.
2. **payment_method granularity** — legacy has card/UPI/Paytm subtypes; target `PaymentMethod` is coarser (RAZORPAY/WALLET/SCAN_AND_PAY/DIRECT_MERCHANT). Confirm at payment migration. Non-blocking now.
3. **direct-merchant verification + order-hold** — add fields in a later payment/ops slice. Non-blocking now.

None block the Ordering **foundation** slice.

## 20. Recommended next migration slice

**Ordering Foundation** — a bounded slice: canonical **order creation + status lifecycle** (`Order` + `OrderItem` + `OrderStatusEvent`) over the existing schema, with the 1:1 `OrderStatus` mapping, merchant-tenant-scoped writes and status transitions (reusing P1.7.1F/P1.7.2/P1.7.5/P1.7.10), money in BigInt minor units. **Explicitly deferred within/after it:** full payment integration (Razorpay capture/refund + payment_status value map), delivery-provider integration, POS webhooks, Socket.IO realtime tracking, cart write path depth, order-hold, ONDC. A short pre-implementation reconciliation may scope cart→order vs order-only for the first slice.

## 21. Evidence index

- Legacy order model/status: `amealio-vendordashboard/src/models/ordering.model.ts` (`order_status` `ORDERSTATUS` enum L194-212, `previous_status`, `payment_status` `PAYMENTSTATUS`, `payment_method`, `direct_merchant_payment.status`, `onhold`/`holdHistory`, `petpoojaSync`, `tracking`).
- Enums: `amealio-vendordashboard/src/enums/orderEnums.ts` (`ORDER_TYPE`, `PAYMENT_STATUS`, **`ONDC_ORDER_STATUS`** [separate/deferred]); numeric `ORDERSTATUS`/`ORDERSTATUS.STRING` via `app.set` (config).
- Order services: `src/services/ordering/{user-ordering,ordering,admin-vendor-ordering}.class.ts`; `/user-ordering`, `/merchant/ordering`, `/updateTransaction`, `/orders/delivery-persons`.
- Rider numeric 5/6: `amealio-self-delivery-app/src/features/orders/{order-card,order-detail}.tsx` (`order_status` 5/6, `payment_status` 1, `statusCode >= 6`).
- POS/delivery: `/pos/webhook/:posId/:action`, Dunzo/Porter services.
- Target: `prisma/schema.prisma` (`OrderStatus`, `PaymentStatus`, `FulfillmentStatus`, `DeliveryTaskStatus`, `PaymentMethod`, `Order`, `OrderStatusEvent`, `PaymentIntent`/`Transaction`/`Refund`, `DeliveryTask`).
- Prior: docs 38/39; `current-state` API/DATA-MODEL/BUSINESS-RULE inventories.

---

## Final conclusion

**OD-11 RESOLVED — SAFE NEXT SLICE: ORDERING FOUNDATION.**

Source-backed: legacy native `order_status` is a single numeric lifecycle whose named members map 1:1 to the existing target `OrderStatus` (rider 5/6 = `ONTHEWAY`/`DELIVERED` on that same field); `payment_status`/delivery are separate and already represented by distinct target enums; no schema change or owner decision blocks the order lifecycle. Ordering is the best next candidate; Seating and Discovery remain blocked by their own owner decisions.

*Validation: discovery-only — `prisma/schema.prisma` and `apps/` untouched, no migrations created, baseline remains 210/210.*
