# 90 — Consumer Ordering + Payment Target Behavior Contract

**Status:** CONTRACT (no implementation)  
**Date:** 2026-09-04  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md](./88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md)  
**Kernel already present:** `OrderService` (staff create), `PaymentService.verifyAndCapture`, Razorpay webhook idempotency, Cart/Order Prisma models, consumer JWT (`/api/v1/auth/consumer/*`)  
**Not present:** consumer cart/checkout HTTP, consumer place-order API

Legacy and industry are **evidence**. This is the proposed **consumer** target behavior.

---

## 0. Method

1. **L1** — Traced `amealio_web_app` ordering v1 + legacy checkout, VendorDashboard `user/cart`, `user/checkout`, `user-ordering`, `razorpay`, `updateTransaction`. `amealiodashboardmvp-` is not on the consumer path. `amealio-nestjs-backend` had no consumer checkout source in this workspace.
2. **L2** — Razorpay Orders/capture/webhooks; Stripe PaymentIntent idempotency + verify-before-fulfill; Toast first-party approve after paid; marketplace “check paid before service.”
3. **L3/L4** — Matrix + contract. Auto-resolved where evidence + amealio intent agree.

---

## 1. amealio intent (not optional)

- Consumer logs in, discovers a restaurant, builds a **cart** (items, modifiers/add-ons), sees **price + tax + optional tip/donation + optional offer**.
- **Checkout creates an unpaid order first**, then payment, then the order becomes visible to the merchant as **PENDING**.
- India rails: Razorpay, wallet, COD/pay-later, direct-merchant UPI.
- Customer can **track** and see **history**.
- Customer may **cancel only before merchant accept** (legacy: status still PENDING / `order_status` 0).
- Paid cancel/reject must not strand customer money (doc 88).
- Tip/donation are **not** merchant commissionable revenue (existing Nest `tipMinor` / `donationMinor`).

---

## 2. L1 — Legacy reality (execution)

### 2.1 Two checkout paths (⚠️)

| Path | Cart | Price authority | Order create |
| ---- | ---- | --------------- | ------------ |
| **Ordering v1** (pilot: `/food/cart` → `/food/ordercheckout`) | `POST/GET /user/cart` (Mongo) | Server cart totals | `POST /user/checkout` → `user-ordering.create` |
| **Legacy** (`CheckOutPage` + `/usercart`) | Client `sessionStorage` + optional `/usercart` | **Client-supplied** `total_amount` (doc 52) | `POST /user-ordering` |

V1 checkout **ignores client line items** and maps the **server cart**. V1 has **no offer UI**. Legacy applies coupons via `POST /user/offers` and **increments usage before payment**.

### 2.2 Sequence (v1 + Razorpay)

```
JWT login (OTP / social)
→ discovery / restaurant / menu
→ POST /user/cart (items, tip, donation)
→ POST /user/checkout → Order INITIAL, payment pending
→ POST /razorpay?order=true  (payment_capture: true)
→ Razorpay Checkout SDK
→ POST /razorpay?payments=true  (fetch; capture if needed)
→ POST /updateTransaction (clear cart)
→ PATCH /user-ordering  order_status=0 PENDING, payment_status=1
→ /food/ordertrack/:id
```

**Auth:** Feathers JWT in `Authorization` (raw). Firebase is FCM/social, not checkout auth.

**Taxes:** `splitTaxes` on server cart. **Inventory:** item existence + type flags; **no stock decrement**.

**Signature verify:** **not** on consumer path. **Webhook:** `RazorpayWebhook` stub (no-op).

**Customer cancel:** `PATCH user-ordering` `{ order_status: 8 }` blocked if current status **> 0**. Refund via wallet if `settleAmount` set.

**Track/history:** `GET user-ordering/:id`, `?status=ONGOING|HISTORY`; socket `order_trigger`.

### 2.3 Failure modes (coded)

| Case | Legacy |
| ---- | ------ |
| Duplicate checkout click | UI `placingOrder` only; **no idempotency key** |
| Payment OK, PATCH fails | Payment recorded; order may stay INITIAL — **no compensate** |
| Payment fail / dismiss | Order remains INITIAL unpaid |
| Duplicate capture | `payment_captured` guard |
| Webhook dup / delay | No processing |
| Pay-later transaction fail | May still navigate to track |
| Stale offer | V1: none; legacy: usage++ at apply |

---

## 3. L2 — Industry benchmark (evidence, not authority)

| Practice | Source | Implication |
| -------- | ------ | ----------- |
| Server-authoritative order amount | Razorpay Orders API; Nest `PaymentIntent.amountMinor = grandTotalMinor` | Never charge client-typed totals |
| HMAC verify + webhook as SoT | Razorpay docs; Nest `verifyAndCapture` + `providerEventId` | Client “success” is not sufficient |
| Idempotent payment + webhook | Stripe/Razorpay; Nest unique payment/webhook ids | One payment = one Transaction |
| Check captured before fulfill | Razorpay best practices; Toast approve after pay | Kitchen sees PENDING only when paid (prepaid) |
| Authorize then void vs capture then refund | Stripe capture strategies; Razorpay 5-day auth window | Status ≠ money |
| Customer cancel before restaurant accept | Delivery platforms | Aligns with legacy status>0 block |
| Idempotent checkout | HTTP idempotency keys | Retry must not double-create |
| Price freshness at commit | Cart reprice / offer revalidate | Stale cart / expired coupon rejected |

---

## 4. L3 — Gap matrix

| Behavior | LEGACY | INDUSTRY | GAP | TARGET | DECISION TYPE |
| -------- | ------ | -------- | --- | ------ | ------------- |
| Login | Feathers JWT (+ OTP/social) | Consumer session | Parallel Nest consumer JWT unused by web | Consumer JWT for Nest APIs | **IMPROVE** |
| Discovery/menu | Existing restaurant/menu APIs | Catalog read | Nest catalog exists | Use Nest catalog reads | **FUTURE** (not this contract’s first HTTP) |
| Cart storage | Mongo `/user/cart` + client mirror; legacy sessionStorage | Server cart | Prisma Cart schema-only | Server cart, server totals | **IMPROVE** |
| Price freshness | V1 server cart; legacy client totals | Reprice at checkout | Client-trusted path unsafe | Recompute at checkout from catalog + cart | **CORRECT** |
| Modifiers/add-ons | Item snapshots on cart | Snapshots at add | OK | Persist snapshots on CartItem / OrderItem | **PRESERVE** |
| Inventory | Existence only | Soft 86 / stock | No stock | Reject missing/unavailable items at checkout; stock **FUTURE** | **IMPROVE** |
| Restaurant closed | Partial checks | Block checkout | Inconsistent | Reject checkout if restaurant not accepting type | **IMPROVE** |
| Offers | Usage++ at apply (legacy); absent in v1 | Redeem at pay/commit | Double-count; prepaid unused | One `CouponRedemption` at **paid commit** (Nest already) | **CORRECT** |
| Taxes | Server `splitTaxes` | Server tax | OK | Server tax at cart + checkout | **PRESERVE** |
| Tip/donation | On cart before pay; Razorpay split for donation | Separate from food total | OK | `tipMinor`/`donationMinor` outside grand total | **PRESERVE** |
| Checkout vs pay | **Order first** (INITIAL), then pay | Either; marketplaces often pay then place | Orphan unpaid orders | **Keep order-first** `INITIAL`; attach `PaymentIntent` | **PRESERVE** |
| Duplicate checkout | UI flag | Idempotency-Key | Double orders | Client key → one order | **IMPROVE** |
| Concurrent checkout | Last write | Lock cart | Race | One active cart; checkout locks cart | **IMPROVE** |
| Payment amount | Razorpay amount from client/order field | Server amount | Tamper risk | Intent amount = `grandTotalMinor` only | **CORRECT** |
| Payment verify | Fetch/capture, **no HMAC** | Signature + webhook | Unsafe | Existing Nest verify + webhook | **CORRECT** |
| Webhook dup/delay | Stub | Idempotent ingest | Missing | Existing Nest webhook | **CORRECT** |
| Pay OK / order patch fail | Possible stranded INITIAL | Reconcile via webhook | Gap | Webhook/verify **promotes** INITIAL→PENDING when captured | **IMPROVE** |
| Pay fail | Leave INITIAL | Leave unpaid | OK | Leave `INITIAL`; expire/auto-cancel **FUTURE** | **PRESERVE** |
| COD / pay-later | Order PENDING unpaid | Allowed | OK | May go PENDING unpaid; collection is payment action | **PRESERVE** |
| Direct merchant UPI | INITIAL until verify | Manual confirm | Product | Stay INITIAL until verified | **PRESERVE** |
| Confirmation | Navigate to track | Paid/pending screen | OK | Track when PENDING (prepaid) or INITIAL+pending-pay | **PRESERVE** |
| Tracking | GET + `order_trigger` | Poll + push | Sockets FUTURE | GET order + events; sockets later | **IMPROVE** |
| History | ONGOING / HISTORY | Same | OK | Consumer list by status set | **PRESERVE** |
| Customer cancel | Only status 0 | Before accept | Aligns 88 | `INITIAL`/`PENDING` → `CANCELLED` only | **PRESERVE** |
| Refund vs order | Wallet if `settleAmount` | Explicit refund | Unsafe gate | Doc 88: `RefundService` on paid cancel | **CORRECT** |
| Stale cart | Checkout uses server cart (v1) | Revalidate | Legacy client path | Invalidate cart after pay; reject empty/cross-restaurant | **IMPROVE** |
| Audit | Partial transactional + auditLogs | Ledger | Weak consumer audit | `OrderStatusEvent` + PaymentAttempt + Transaction | **IMPROVE** |
| Customer-visible states | Numeric + currentStatusText | Named | Confusion | Named `OrderStatus` + payment summary | **IMPROVE** |

---

## 5. Auto-resolved

| Topic | Resolution | Why |
| ----- | ---------- | --- |
| Which checkout is product | **Server cart + order-first** (v1 shape), **not** client totals | Doc 52 + Razorpay amount integrity; v1 already closer |
| HMAC / webhook | **Use Nest payment kernel** | Already validated; legacy stub is CORRECT-to-replace |
| Customer cancel window | **`INITIAL` + `PENDING` only** | Legacy `status>0` block + doc 88 + industry |
| Kitchen visibility | Prepaid becomes merchant-visible **PENDING only after capture** | Razorpay “check paid”; doc 88 prepaid gate |
| Offer redeem | **At paid commit**, not apply | Doc 52 double-count; Nest redemption |
| Order-first vs pay-first | **Keep order-first** | amealio v1 + Nest `INITIAL`; webhook attaches payment |
| Stock decrement | **Not required** for first consumer slice | Never implemented; don’t invent |

---

## 6. Target contract (consumer)

### 6.1 Happy path

```
Consumer JWT
→ (FUTURE) catalog browse
→ Cart: add/update/remove (server prices)
→ Checkout (Idempotency-Key):
     create Order INITIAL + items + money
     create PaymentIntent (amount = grandTotalMinor)   [prepaid]
     OR mark pay-later/COD
→ Client Razorpay Checkout using server order id
→ POST /payments/verify  (HMAC)
   and/or webhook payment.captured
→ On capture: Order INITIAL → PENDING; cart cleared
→ Merchant list (doc 88) sees PENDING
→ Track GET /orders/:id (consumer scope)
```

### 6.2 Payment / order coupling

| Event | Order | Payment |
| ----- | ----- | ------- |
| Checkout prepaid | `INITIAL` | Intent `CREATED` |
| Verify/webhook capture | `INITIAL → PENDING` | `CAPTURED` + Transaction |
| Checkout COD/pay-later | `PENDING` | no capture; collection later |
| Direct-merchant | `INITIAL` until verified | `DIRECT_MERCHANT` |
| Verify fail | stay `INITIAL` | no Transaction |
| Customer cancel unpaid | `CANCELLED` | void/ignore intent |
| Customer cancel paid (`PENDING`) | `CANCELLED` + `RefundService` | refund ledger |
| Merchant reject paid (88) | `CANCELLED` + refund | same kernel |

**Never** create a second order because the client retried verify.

### 6.3 Consumer APIs (when implemented — not now)

| Method | Intent |
| ------ | ------ |
| Cart CRUD | Server totals, restaurant-scoped |
| POST checkout | Idempotent; returns order + payment instructions |
| POST payments/verify | Existing |
| GET order / list | Consumer `userId` scope only |
| PATCH cancel | `toStatus=CANCELLED` only from `INITIAL`/`PENDING` |

### 6.4 Alignment with doc 88

| Topic | 88 | 90 | Conflict? |
| ----- | -- | -- | --------- |
| Graph | Named one-hop | Consumer only INITIAL→PENDING or →CANCELLED | **None** |
| Prepaid kitchen | Capture before CONFIRMED | PENDING only after capture | **None** |
| Customer cancel | INITIAL/PENDING | Same | **None** |
| Paid reject/cancel | RefundService | Same orchestration | **None** |
| Payment DTO | Join PaymentIntent | Same | **None** |
| Sockets | FUTURE | FUTURE | **None** |
| Item cancel | FUTURE | FUTURE | **None** |

**Non-conflicts (role split):** Merchant owns CONFIRMED→…→COMPLETED. Consumer never increments kitchen statuses. Rider hops are doc 91.

---

## 7. Remaining owner decisions

1. **OD-COP-REFUND-RAIL** — same as **OD-MOM-REFUND-RAIL** (doc 88 §6): wallet vs original instrument. Do not decide twice.
2. **OD-COP-UNPAID-TTL** — How long an `INITIAL` unpaid Razorpay order lives before auto-cancel (Razorpay auth ~5 days is a ceiling, not a product SLA). **FUTURE** cron until chosen.

No other consumer-specific owner items.

---

## 8. Implementation dependencies (after accept)

1. Doc 88 merchant HTTP (list sees PENDING).
2. Consumer cart module on Prisma `Cart`.
3. Consumer checkout → existing `OrderService.createOrder` **adapted for consumer principal** (today staff-only) — **do not** invent a second create graph.
4. Existing `PaymentService` + webhook.
5. Consumer JWT already exists.
6. Doc 91 for home-delivery tracking after READY.

**Do not implement in this slice.**

---

## 9. Industry sources

- Razorpay: Orders API, capture settings, signature verification, webhooks, “check payment status before service”
- Stripe: PaymentIntent idempotency; authorize vs capture vs refund
- Toast Orders Hub: first-party approval after placement/payment
- Doc 52 / 56 / 57 (in-repo payment/offer forensics)

## 10. Legacy evidence index

`OrderCheckout.jsx`, `cartManager.js`, `useAmealioRazorpay.js`; `cart.class.ts`, `checkout.class.ts`, `user-ordering.class.ts`, `razorpay.class.ts`, `updateTransaction.class.ts`, `webhook.class.ts`; docs 52, 56, 57, 88.
