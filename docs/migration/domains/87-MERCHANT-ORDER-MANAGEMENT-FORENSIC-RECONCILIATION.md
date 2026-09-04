# 87 — Merchant Order Management Forensic Reconciliation

**Status:** FORENSIC EVIDENCE (legacy recovery). Target behavior is **not** this document.  
**Target contract:** [88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md](./88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md)  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Date:** 2026-09-04  
**Brand:** amealio  
**Canonical target:** `replateform-amealio` / `replatform/backend-consolidation`  
**Legacy sources (read-only):** `amealio-vendordashboard`, `amealiodashboardmvp-`, `amealio_web_app`, `amealio-self-delivery-app`

**Supersedes for merchant-dashboard vertical planning:** docs 40 (lifecycle names) and 41 (service foundation). Those remain valid for the kernel. This document adds the **merchant operational contract** (UI paths, dual engines, cancel/refund/item actions, delivery handoff, HTTP gap).

Classification:

| Mark | Meaning |
| ---- | ------- |
| 🟢 | EXISTS AND VALIDATED (target code + tests designed to prove it) |
| 🟡 | EXISTS BUT NEEDS RECONCILIATION |
| 🔴 | MISSING |
| ⚠️ | CONFLICTING / AMBIGUOUS |

---

## 1. Legacy order lifecycle

Consumer → merchant kitchen → fulfillment → close is **one numeric `order_status`** on Mongo `ordering` (`ordering.model.ts`). Payment is a **separate** `payment_status`. Delivery-provider strings (`Dunzo`/`Porter` / `deliveryAssignmentStatus`) are **non-authoritative** for the order lifecycle.

```
Consumer checkout
  → POST /user-ordering  (amealio_web_app)
  → order_status INITIAL (9) for most prepaid methods, else PENDING (0)
  → payment capture / COD / direct-merchant verify
  → PENDING (0) surfaces on merchant dashboard + Socket.IO pending_notification
Merchant
  → Accept → CONFIRMED (1)
  → Preparing (2) → Packing (3) → Ready (4)
  → Delivery: ONTHEWAY (5) → DELIVERED (6)   [home delivery / rider]
  → Pickup/dine-in: Ready (4) → DELIVERED/Served (6)  [skip 5]
  → COMPLETED (7)
Cancel / reject → CANCELLED (8)
Post-delivery return → RETURNED (10)
```

**Writers of the same field:** consumer, merchant (two HTTP engines), rider (self-delivery), POS webhook, payment auto-accept, auto-cancel cron, Dunzo timeout.

Experience kitchen orders are **not** a separate `order_type`; they attach via `exp_id` / `exp_request_id` and sync statuses from the MVP (`syncLinkedExperienceForOrderStatus`).

---

## 2. Merchant order lifecycle

### 2.1 Screens (MVP)

| Surface | Path |
| ------- | ---- |
| Active / history dashboard | `…/Orders/OrderDashboard/OrderDashboard.js` → `VendorOrderTablesBodyMobile.js` |
| Pending notification popup | `client/src/NotificationPopup.js` |
| Item cancel / substitute / hold | same dashboard body + `order-cancel-substitution` |
| Assign rider | `AssignDeliveryPerson.js` |
| Direct-merchant UPI verify | `PATCH /merchant/direct-merchant-payment/:orderId` |
| Vendor-created order | `POST /ordering` (`add_order_vendor_side`) |

### 2.2 Two status engines (⚠️)

| Path | UI | HTTP | Semantics |
| ---- | -- | ---- | --------- |
| **A (primary dashboard)** | Accept / Prep / Pack / Ready / Complete buttons | `PATCH /ordering/:id` `{ order_status }` | Integer increment (+1, or +2 skip ONTHEWAY for takeaway/dine-in) |
| **B (popup + subscription)** | Notification Accept; `orderSteps` 3 vs 7 | `PATCH /merchant/ordering/:id` `{ next: true }` / `{ prev: true }` | Server `forwardAction` / `backwardAction` may **chain** multiple statuses |

**Evidence:** `vendorOrderingAction.js` `edit_order_vendor_side` vs `edit_order_vendor_v2`; `merchant-ordering.class.ts`.

When `orderSteps === 3`, Accept (`next`) can jump `0 → 1 → 2` in one call. Dashboard Path A does **one** increment. **Do not invent a single Nest engine until an owner picks the canonical merchant UX.**

Reject always uses Path A: `{ order_status: 8, reason }` — **no REJECTED code**.

---

## 3. Order statuses

### 3.1 Canonical named set (legacy + target)

| # | Legacy name | Target `OrderStatus` | Typical merchant label |
| - | ----------- | -------------------- | ---------------------- |
| 0 | PENDING | `PENDING` | Order request / Accept |
| 1 | CONFIRMED | `CONFIRMED` | Accepted |
| 2 | PREPARING | `PREPARING` | Getting prepared |
| 3 | PACKING | `PACKING` | Packing / Food plating (dine-in) |
| 4 | READYTOPICK | `READY` | Ready for {type} |
| 5 | ONTHEWAY | `ON_THE_WAY` | Out for delivery |
| 6 | DELIVERED | `DELIVERED` | Delivered / Served |
| 7 | COMPLETED | `COMPLETED` | Complete |
| 8 | CANCELLED | `CANCELLED` | Cancelled / Rejected |
| 9 | INITIAL | `INITIAL` | Pre-payment / direct-merchant pending |
| 10 | RETURNED | `RETURNED` | Returned |

Integers are **encodings**. MVP `ORDER_STATUS[9]` is `""` while server uses **9 = INITIAL** (⚠️ display gap, not a second status).

Numeric values are env-driven (`ORDERSTATUS_*` in `config/default.js`). MVP hard-codes 0–8, 10 as above. Treat **names** as canonical.

### 3.2 Separate payment axis (legacy)

`payment_status`: PENDING / COMPLETED / CANCELLED / FAILURE / INPROGRESS (numeric).  
MVP treats `0` unpaid, `1` paid.

Target: `PaymentStatus` CREATED / AUTHORIZED / CAPTURED / PARTIALLY_REFUNDED / REFUNDED / FAILED on **both** `Order.paymentStatus` and `PaymentIntent.status`. **Application code updates the intent, not `Order.paymentStatus`** (doc 57 deferred sync) — ⚠️.

---

## 4. Valid status transitions

### 4.1 Target graph (enforced) — 🟢

`apps/api/src/modules/ordering/application/order.service.ts` `TRANSITIONS`:

```
INITIAL     → PENDING | CANCELLED
PENDING     → CONFIRMED | CANCELLED
CONFIRMED   → PREPARING | CANCELLED
PREPARING   → PACKING | READY | CANCELLED
PACKING     → READY | CANCELLED
READY       → ON_THE_WAY | COMPLETED | CANCELLED
ON_THE_WAY  → DELIVERED
DELIVERED   → COMPLETED | RETURNED
COMPLETED / CANCELLED / RETURNED → (terminal)
```

Proven by `apps/api/test/ordering-foundation.e2e-spec.ts` (designed to prove invalid + terminal rejection + event history).

### 4.2 Legacy merchant Path A (dashboard)

| From | To | Notes |
| ---- | -- | ----- |
| 0 | 1 | Accept; sets `OrderAcceptTime` |
| 1 | 2 | Prep |
| 2 | 3 | Pack / plate |
| 3 | 4 | Ready |
| 4 | 5 | +1 if not takeaway/dine-in |
| 4 | 6 | +2 skip ONTHEWAY for `order_type` 0 (takeaway) and 3 (dine-in) |
| 5 | 6 | Delivered |
| 6 | 7 | Complete; sets `OrderCompleteTime` |
| 0 | 8 | Reject |
| N | N−1 or N−2 | Reset previous (dine-in/takeaway at 6 go to 4) |

**Guards (frontend, verified):** unpaid at ready (except self-delivery COD/pay-later); catering prep date; experience-linked complete block; takeaway unpaid complete block; **merchant blocked at 4/5 when home-delivery rider assigned** (`shouldBlockMerchantOutForDelivery`).

**Server:** cannot change status after CANCELLED (403).

### 4.3 Conflicts vs target graph (⚠️)

| Legacy | Target |
| ------ | ------ |
| Merchant may PATCH arbitrary `order_status` integer (Path A) | Only listed edges |
| 3-step engine chains multiple hops | One hop per `transitionStatus` |
| `ONTHEWAY` skip is UI-encoded (+2) | `READY → COMPLETED` is the pickup hop (equivalent if used) |
| Cancel from many live states | Cancel allowed through READY, **not** from `ON_THE_WAY` |
| Rider sets 5 then 6 | Same names; no rider HTTP |

**Do not widen the target graph in this forensic slice.** Owner must decide whether Nest merchant API is **one-hop graph** (current) vs **legacy increment/skip engine**.

---

## 5. Order types

| Legacy # | Legacy name | Target `OrderType` |
| -------- | ----------- | ------------------ |
| 0 | TAKEAWAY | `TAKE_AWAY` |
| 1 | CURBSIDE | `CURB_SIDE` |
| 2 | SKIPTHELINE | `SKIP_LINE` |
| 3 | DINEIN | `DINE_IN` |
| 4 | BUFFET | 🔴 **missing** |
| 5 | CATERING | `CATERING` |
| 6 | DRIVETHRU | 🔴 **missing** |
| 7 | HOMEDELIVERY | `HOME_DELIVERY` |

Catering takeaway/self-delivery is UI-remapped to type 0 / 7 for status flow (`cateringConfig.js`) — ⚠️ operational alias, not a schema type.

Experience is linkage, not a type.

---

## 6. Fulfillment types

Legacy `deliveryMethod`: `SELF_DELIVERY` | `THIRD_PARTY_DELIVERY` | `AGENT_DELIVERY`.

Target `DeliveryMethod`: `SELF_DELIVERY` | `THIRD_PARTY` | `AGENT` — 🟡 rename only; **`CreateOrderInput` does not set it**.

Target also has `FulfillmentStatus` (`UNFULFILLED` / `IN_PROGRESS` / `FULFILLED` / `CANCELLED`) and `DeliveryTaskStatus`. **Only `OrderStatus` is written in application code** — ⚠️ dual-model risk (doc 40 already noted target as a superset).

Pickup / dine-in: skip `ON_THE_WAY`. Home delivery: rider advances `ON_THE_WAY` → `DELIVERED` on the **same** order status field.

---

## 7. Item-level actions

Legacy line flags (`ordering.model.ts`): `isCancelled`, `isSubstituted`, `isOnHold`; `incase_of_unavailable` ∈ {contact_me, substitute_item, cancel_and_refund, cancel_order}.

| Action | HTTP | Behavior |
| ------ | ---- | -------- |
| Cancel item | `POST /order-cancel-substitution?cancelItem=true` (+ optional `POST /ordering-transactionals?debitMemo=true&cancelItem=true`) | Marks item; if all cancelled → order 8 + totals 0; wallet debit memo when prepaid |
| Substitute item | `POST /order-cancel-substitution?substituteItem=true` (+ debit/credit memo) | Replaces item, taxes, `substitute_memo`; emits `order_trigger` |
| Hold / release | `PATCH /merchant/order-hold/:id` | Order- and item-level hold; completion blocked if on hold |

Target `OrderItem`: snapshot money + addOns/customization JSON only — **no cancel/substitute/hold columns** — 🔴.

Whole-order `CANCELLED` + coupon reversal is 🟢 (`offer-redemption-reversal.e2e-spec.ts`).

---

## 8. Cancellation rules

| Actor | When | Mechanism |
| ----- | ---- | --------- |
| Merchant reject | PENDING | `order_status: 8` + reason |
| Merchant / user / cron / Dunzo timeout | Various live states | Same CANCELLED field |
| All items cancelled | Any active | MVP forces status 8 |
| Direct-merchant reject | INITIAL | → 8 |
| After cancel | — | Status frozen (403) |

Target: cancel is a **graph edge** to `CANCELLED` (not from `ON_THE_WAY`). Coupon redemptions reverse on cancel. **No automatic payment refund on cancel** (doc 41 deferred) — ⚠️ vs legacy `RefundOrder` when `settleAmount` is set.

---

## 9. Refund rules

**Legacy (verified):**

- Full cancel refund: `RefundOrder` → `wallet.create` with `refund_type = CANCEL_ORDER`; amount = sum of paid RAZORPAY/WALLET `transactionDetails` minus donation. **Gated on `order.settleAmount`** — unpaid/`settleAmount` unset may skip refund.
- Item cancel/substitute: wallet via `ordering-transactionals` when `payment_status === 1` and method not COD/pay-later/external/direct-merchant (`[0,6,8,9]`).
- Razorpay **capture** is separate (`payment_capture: false` at create; explicit capture later). Cancel path is **wallet credit**, not automatic Razorpay refund API.

**Target:**

| Capability | Status |
| ---------- | ------ |
| `RefundService` WALLET (sync) | 🟢 `refund-wallet-credit.e2e-spec.ts` |
| Razorpay async refund + webhook | 🟢 `payment-live-refund.e2e-spec.ts` |
| Merchant-scoped `requestRefund` | 🟢 service tests |
| HTTP refund endpoint | 🔴 |
| Cancel → auto refund | 🔴 |
| Item-level refund | 🔴 |

---

## 10. Payment relationship

**Partially coupled, separate fields.**

- Prepaid Razorpay: authorize then capture; success + `payment_status == 1` can auto-accept on patch.
- COD / pay-later: kitchen proceeds unpaid; collection at delivery (`POST /updateTransaction` from MVP when merchant marks delivered).
- Direct merchant (method 11): stays INITIAL until `PATCH /merchant/direct-merchant-payment/:id` VERIFIED/REJECTED.
- MVP blocks forward at ready if unpaid (except self-delivery collect-on-delivery).

**Target:** `POST /api/v1/payments/intents` + `POST /api/v1/payments/verify` + Razorpay webhook — 🟢 capture kernel. Routes are `@Public()` (signature-gated verify). **`Order.paymentStatus` is not synced on capture** — 🔴/⚠️. Wallet/COD/direct-merchant pay rails 🔴. Cart→checkout 🔴.

Settlement **requires `Order.status = COMPLETED`** (doc 62) — 🟢 — so merchant Complete is the financial gate, not Delivered.

---

## 11. Settlement relationship

| Rule | Target |
| ---- | ------ |
| Settle only captured payments past `settleAfter` | 🟢 docs 60/61 |
| **and** order `COMPLETED` | 🟢 doc 62 `settlement.repository.ts` |
| Net of refunds, settle-once | 🟢 |
| Commission from `Restaurant.commissionBps` | 🟢 |
| HTTP settlement API / cron | 🔴 |
| Dunzo cancelled partial-settlement | 🔴 DR-SETTLE-CANCELLED-PARTIAL |

Merchant Complete is a **settlement prerequisite**, not a payout trigger.

---

## 12. Delivery handoff

| Mode | Legacy trigger | Target |
| ---- | -------------- | ------ |
| Self / agent rider | Assign at READY; `selfDeliveryPerson` → `deliveryMethod = AGENT_DELIVERY`; emit `assign_delivery_person` | Schema `DeliveryTask` / `DeliveryPerson` 🔴 unwired |
| Rider app | `amealio-self-delivery-app` patches `order_status: 5` then `6` (+ `payment_status: 1` COD) | 🔴 no rider API |
| Dunzo | On CONFIRMED/PREPARING HOMEDELIVERY + subscription partner DUNZO → integration `delivery/system/create`; 20‑min timeout cancel | 🔴 |
| Porter | Sets `deliveryAssignmentStatus: pending` | 🔴 |
| Merchant OFD | Blocked if rider already assigned | 🔴 no equivalent guard |

---

## 13. Notifications / events

**Legacy sockets** (`ordering.service.ts`): `order_creation`, `pending_notification`, `order_trigger`, `order_delivered`, `assign_delivery_person`, `delivery_location`, `curb_notification`, `curb_arrival`. MVP `NotificationPopup` listens to the first three. Push/SMS/email templates keyed by type+status inside `ordering.class.ts` patch.

**Target:** `OrderStatusEvent` persistence 🟢. Domain event bus exists but **ordering does not publish**. `Notification*` Prisma models unused. Socket.IO 🔴. Razorpay webhooks 🟢 as payment events only.

---

## 14. Merchant authorization

**Legacy:** vendor JWT on `Authorization` (`ordering.hooks.ts`). Superadmin may impersonate via `vendorAccess`. Dunzo/POS bypass flags. **No fine-grained permission** on Accept vs Cancel vs Refund — restaurant ownership via vendor record. `/merchant/ordering` has **no dedicated hooks**; auth rides the inner `ordering.patch`.

**Target:** Staff JWT + `MerchantScopeService.assertRestaurantInScope` 🟢 (`staff-auth`, `staff-authorization`, `merchant-scope`, ordering tenancy tests). `OrderService.createOrder` / `getOrder` / `transitionStatus` take `StaffPrincipal`. **No HTTP to attach guards to** — 🔴. `staff-permissions.ts` has foundation keys only (`staff.read` / `staff.write`) — no `orders.*` — 🔴.

Preserve: MERCHANT_OWNER / MERCHANT_STAFF + restaurant scope. Do not weaken.

---

## 15. APIs

### 15.1 Legacy merchant (traced)

| Method | Path | Use |
| ------ | ---- | --- |
| GET | `/ordering?order_type=&order_status=` | Active list (`$nin` 0,7,8,9,10 for “all”) |
| GET | `/ordering?order_status=HISTORY&startDate&endDate` | History |
| PATCH | `/ordering/:id` | Status / payment / assign rider |
| PATCH | `/ordering` `{ markAllComplete }` | Bulk complete |
| POST | `/ordering` | Vendor-created order |
| PATCH | `/merchant/ordering/:id` | next/prev engine |
| PATCH | `/merchant/order-hold/:id` | Hold |
| POST | `/order-cancel-substitution` | Item cancel/substitute |
| POST | `/ordering-transactionals` | Debit/credit memo |
| POST | `/updateTransaction` | COD collection |
| PATCH | `/merchant/direct-merchant-payment/:id` | UPI verify |
| GET | `/merchant/direct-merchant-payment?status=PENDING_VERIFICATION` | Pending UPI |

Consumer: `POST/PATCH /user-ordering` (`amealio_web_app`).

### 15.2 Target HTTP

| Area | Routes | Status |
| ---- | ------ | ------ |
| Order list/get/transition | — | 🔴 no `OrdersController` |
| Payment | `POST /api/v1/payments/intents`, `/verify`, `/payments/razorpay/webhook` | 🟢 kernel, `@Public()` |
| Tip | `POST /api/v1/tips/intents`, `/verify` | 🟢 adjacent |
| Refund / settlement | service-only | 🔴 HTTP |

---

## 16. Data model

### Legacy (selected)

`order_id`, `user_id`, `vendor_id`, `restaurant_id`, `order_type`, `order_status`, `previous_status`, `payment_status`, `payment_method`, `order_items[]`, `total_amount` / `base_amount`, `offer`, `tip`, `donation`, `auditLogs[]`, `deliveryMethod`, `deliveryAddress`, `OrderAcceptTime`, `OrderCompleteTime`, `cancelledDate`, `max_time` / `max_time_date`, `onhold` / `holdHistory`, `direct_merchant_payment`, `transactionDetails`, `exp_id` / `exp_request_id`, catering/curbside/dine-in blobs.

### Target

`Order` + `OrderItem` + `OrderStatusEvent` + payment/refund/settlement/delivery/notification models as in `prisma/schema.prisma`.

| Legacy | Target | Class |
| ------ | ------ | ----- |
| `order_id` | `orderNumber` | 🟢 |
| vendor/restaurant | `merchantId` (derived) + `restaurantId` | 🟢 |
| `order_status` | `status` | 🟢 |
| `previous_status` | `OrderStatusEvent.fromStatus` | 🟢 |
| money floats | BigInt minor units + integrity CHECK | 🟢 |
| `order_items` flags | — | 🔴 |
| accept/complete timestamps | `placedAt` only | 🟡 |
| `auditLogs` | `OrderStatusEvent.reason` | 🟡 coarser |
| `fulfillmentStatus` | column default only | 🟡 unused |

---

## 17. Target implementation status

| Capability | Class | Evidence |
| ---------- | ----- | -------- |
| Order create + items + money | 🟢 | `ordering-foundation.e2e-spec.ts` |
| Status graph + events | 🟢 | same |
| Merchant restaurant scope on service | 🟢 | same + `merchant-scope.service.spec.ts` |
| Offer/coupon at create + cancel reverse | 🟢 | `offer-redemption*.e2e-spec.ts` |
| Tip/donation outside grand total | 🟢 | `order-tip-donation.e2e-spec.ts` |
| Payment capture / webhook | 🟢 | `payment-verified-capture.e2e-spec.ts` |
| Wallet + Razorpay refund services | 🟢 | refund e2e specs |
| Settlement + COMPLETED gate | 🟢 | `settlement-payout.e2e-spec.ts`, doc 62 |
| Staff JWT / RBAC foundation | 🟢 | `staff-auth` / `staff-authorization` e2e |
| Merchant order HTTP | 🔴 | no controller |
| Order list / filters | 🔴 | no `findMany` |
| Cart → consumer place order | 🔴 | Cart schema only |
| `Order.paymentStatus` sync | 🔴 | deferred doc 57 |
| Item cancel / substitute / hold | 🔴 | |
| Reject distinct from cancel | 🔴 | use CANCELLED |
| Delivery assignment / rider | 🔴 | schema only (doc 69) |
| Notifications / sockets | 🔴 | |
| Auto-cancel / complete crons | 🔴 | |
| POS / PetPooja | 🔴 | |
| BUFFET / DRIVETHRU types | 🔴 | |
| Fine-grained `orders.*` permissions | 🔴 | |

---

## 18. Gaps (merchant vertical)

Required for:

`Consumer → Order → Payment → Merchant receives → Detail → Preparing → Packing → Ready → Delivery/Pickup → Completed`

plus cancel / refund / item actions:

1. **Merchant REST:** `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status` (staff JWT + restaurant scope).
2. List filters: status, type, restaurant, active vs history.
3. Receive: polling first; sockets later.
4. Payment-state visibility: sync `Order.paymentStatus` **or** read `PaymentIntent` in the DTO.
5. Cancel + **explicit** refund call (do not silently couple until owner decides).
6. Type-aware hops: `READY → COMPLETED` (pickup) vs `READY → ON_THE_WAY` (delivery).
7. Rider handoff + merchant OFD block (later slice).
8. Item cancel/substitute schema + APIs (later slice).
9. Notifications (later slice).

Do **not** duplicate `OrderService.transitionStatus`, payment/refund/settlement kernels, or invent a second status enum.

---

## 19. Owner decisions

Stop only on these (evidence conflicts or policy):

1. **OD-MOM-ENGINE** — Canonical merchant advance: one-hop target graph vs Path A increment/skip vs Path B `orderSteps` 3/7 chaining.
2. **OD-MOM-REJECT** — Reject remains `CANCELLED` + reason (legacy-faithful) vs new `REJECTED`.
3. **OD-MOM-CANCEL-REFUND** — Cancel auto-refunds wallet (legacy `RefundOrder` + `settleAmount` gate) vs explicit refund API only (current target).
4. **OD-MOM-ONTHEWAY-CANCEL** — Allow `ON_THE_WAY → CANCELLED` (legacy-ish) vs keep target (rider-only forward).
5. **OD-MOM-TYPES** — Add `BUFFET` / `DRIVE_THRU` to `OrderType` vs map into existing types.
6. **OD-MOM-PAY-SYNC** — Write `Order.paymentStatus` on capture vs DTO join to `PaymentIntent`.
7. **OD-MOM-FULFILLMENT** — Keep delivery phases on `OrderStatus` only vs start using `DeliveryTask` / `FulfillmentStatus`.
8. **OD-MOM-ITEM** — Defer item cancel/substitute/hold vs add columns now.

Recommended defaults if owner is silent **only for the next HTTP slice** (not invented business rules): use existing graph (1), `CANCELLED`+reason (2), no auto-refund (3), no graph widen (4), no new types (5), DTO join not schema write (6), `OrderStatus` only (7), defer items (8). **Record the decision before coding exceptions.**

---

## 20. Recommended next implementation slice

**Merchant Order HTTP + list/detail/transition (Nest only).**

- Controller on existing `OrderService` (`getOrder`, `transitionStatus`, plus a scoped list query).
- Staff JWT; `MERCHANT_OWNER` / `MERCHANT_STAFF`; `assertRestaurantInScope`.
- DTO: status, type, money, items, `OrderStatusEvent[]`, payment intent status if present.
- Tests: merchant login → list → get → accept→prep→pack→ready→complete (pickup) and ready→on_the_way (delivery hop) → cross-merchant 403 → invalid transition 400 → cancel from PENDING.
- **Out of scope:** sockets, upload, delivery partners, item cancel, auto-refund, cart/checkout, MVP rewrite, settlement HTTP.

That is the first complete **target** merchant vertical kernel the dashboard can later flag-gate onto. Consumer place-order and payment remain existing/adjacent slices.

---

## Source index

| Area | Path |
| ---- | ---- |
| Legacy model | `amealio-vendordashboard/src/models/ordering.model.ts` |
| Legacy patch / refund / Dunzo | `…/services/ordering/ordering.class.ts` |
| Step engine | `…/services/ordering/merchant-ordering.class.ts` |
| Item cancel/sub | `…/services/ordering/order-cancel-substitution.class.ts` |
| Hooks / events | `…/ordering.hooks.ts`, `ordering.service.ts` |
| Config enums | `…/config/default.js` `ORDERSTATUS` / `ORDERTYPE` |
| MVP dashboard | `amealiodashboardmvp-/…/VendorOrderTablesBodyMobile.js` |
| MVP actions | `…/store/actions/OrderingAction/vendorOrderingAction.js` |
| MVP enums | `…/client/src/enums/OrderEnums.js` |
| Rider | `amealio-self-delivery-app` order-card status 5/6 |
| Target graph | `apps/api/src/modules/ordering/application/order.service.ts` |
| Target schema | `prisma/schema.prisma` `Order` / `OrderStatus` / `OrderType` |
| Prior docs | 40, 41, 52, 56–62, 68–74 |

**No production credentials. No legacy repos modified. No Nest production code in this slice.**
