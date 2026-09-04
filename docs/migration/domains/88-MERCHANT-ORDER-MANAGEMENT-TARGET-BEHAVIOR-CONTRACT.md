# 88 — Merchant Order Management Target Behavior Contract

**Status:** CONTRACT (no implementation in this slice)  
**Date:** 2026-09-04  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Forensic evidence:** [87-MERCHANT-ORDER-MANAGEMENT-FORENSIC-RECONCILIATION.md](./87-MERCHANT-ORDER-MANAGEMENT-FORENSIC-RECONCILIATION.md)  
**Kernel already implemented:** docs 40–41, 56–62; `OrderService.transitionStatus`

Legacy and industry are **evidence**. This document is the proposed **target behavior**. Implementation waits on this contract.

---

## 0. Method (this domain)

1. Recovered legacy merchant order behavior (doc 87).
2. Benchmarked against:
   - Toast Orders Hub (Needs Approval → Active → Order Ready → Complete; first-party approve/reject; fulfillment time)
   - Typical partner/KDS lanes (New / Preparing / Ready as **display groupings** over a longer status set) — Supaorder, commercial KDS comparisons
   - Delivery platforms: merchant accept/reject on pending; rider owns dispatch after ready; cancel restricted after pickup
   - Razorpay: authorize vs capture (5-day auto-refund if uncaptured); captured payments require an explicit refund; check paid status before providing service
   - Stripe/commerce: delayed capture / void vs refund; refund is a ledger event, not a status synonym
3. Classified gaps. Auto-resolved where evidence + amealio intent agree. Escalated only remaining product/finance choices.

---

## 1. amealio intent (what we are not free to drop)

These are product facts, not legacy accidents:

- Merchant **receives** a placed order and **accepts or rejects** it.
- Kitchen progresses **Preparing → Packing → Ready**.
- **Home delivery** has an on-the-way / delivered phase owned by the **rider**, not the merchant once assigned.
- **Pickup / dine-in** skip on-the-way.
- **Completed** is the close state that **gates settlement**.
- Payment method diversity for India: Razorpay, wallet, COD/pay-later, direct-merchant UPI.
- Customer **unavailability preferences** (contact / substitute / cancel item / cancel order).
- Orders are **merchant- and restaurant-scoped**.
- Experience kitchen tickets may **link** to an order (not a separate order type).

---

## 2. Risk register (legacy vs industry)

| Risk | Evidence | Severity |
| ---- | -------- | -------- |
| Client computes next status (`+1` / `+2`) | MVP Path A | High — races, skips, type bugs |
| Dual engines (increment vs `orderSteps` chain) | Path A vs B | High — Accept does different things |
| Arbitrary integer PATCH | `PATCH /ordering/:id` | High — no graph on that path |
| Cancelled money stranded | `RefundOrder` only if `settleAmount` | High — financial integrity |
| Status change = implied refund | wallet.create inside cancel | High — non-idempotent, hard to audit |
| `Order.paymentStatus` unused in Nest | doc 57 | Medium — merchant sees wrong paid state |
| Weak/absent auth on some merchant hops | `/merchant/ordering` no own hooks | High — security |
| Many writers, one field, no version | consumer/merchant/rider/POS/cron | High — concurrency |
| Numeric env-driven enums | `ORDERSTATUS_*` | Medium — obsolete |
| Open dual-path sockets as source of truth | Feathers events | Medium — operational |
| Merchant can OFD after rider assign | UI guard only | Medium — customer/merchant edge |
| INITIAL hidden in MVP labels | `ORDER_STATUS[9] = ""` | Low — ops confusion |
| Item cancel without target schema | flags on Mongo items | Medium — missing capability |

---

## 3. Legacy vs Industry Gap Matrix

| Topic | Legacy | Industry practice | amealio intent | Class | Target |
| ----- | ------ | ----------------- | -------------- | ----- | ------ |
| Status representation | Numeric 0–10, env-mapped | Named statuses; lanes are UI | Named lifecycle already in Nest | **IMPROVE** | Named `OrderStatus` only; never accept client integers as authority |
| Transition engine | Dual: increment and `next` chaining | One server graph; UI may hide steps | Kitchen steps exist; 3 vs 7 is UX density | **CORRECT** dual engines → **IMPROVE** UX | One-hop `transitionStatus`; 3-step is **display** (hide Packing / On the way), not a second machine |
| Accept | 0→1 (A) or 0→1→2 (B) | Approve fires kitchen (Toast) | Merchant accept is required | **PRESERVE** accept | `PENDING → CONFIRMED` only; UI may then offer Preparing |
| Reject | Status 8 + reason | Accept/Reject on pending; then cancelled | Merchant can refuse work | **PRESERVE** + **IMPROVE** | `PENDING → CANCELLED` with `reasonCode=MERCHANT_REJECT` (no new enum) |
| Pickup skip | Client `+2` at ready | Ready → Complete / collected | Skip on-the-way for takeaway/dine-in | **IMPROVE** | Server allows `READY → COMPLETED` for non-delivery; client sends **named** `COMPLETED` |
| Delivery hop | Client `+1` or rider 5/6 | Rider owns dispatch after ready | Rider writes same field | **PRESERVE** | `READY → ON_THE_WAY` rider (or unassigned merchant); merchant **blocked** if rider assigned |
| Cancel after dispatch | Often possible via PATCH | Restricted after pickup/dispatch | Don’t let kitchen pull order from a rider | **CORRECT** | Keep Nest: no `ON_THE_WAY → CANCELLED` |
| Payment vs fulfillment | Separate fields; UI sometimes couples | Separate ledgers (Razorpay/Stripe) | Paid vs kitchen are different | **PRESERVE** | Keep two axes; DTO **joins** `PaymentIntent` |
| Kitchen on unpaid prepaid | INITIAL until pay; ready-step UI block | Razorpay: check captured before service | Don’t cook unpaid prepaid | **PRESERVE** | Server: prepaid must be captured (or COD/pay-later/direct-pending rules) before `CONFIRMED`+ |
| Capture vs refund | Auth then capture; cancel → wallet if `settleAmount` | Uncaptured → void; captured → refund API | Customer must not lose money on reject | **CORRECT** | Status ≠ money. Paid cancel/reject **must** request refund via `RefundService`. Unpaid/COD: no refund |
| Refund rail | Wallet credit | Original instrument common | Wallet is existing amealio rail | **OWNER DECISION** | See §6 |
| Settlement | Complete-ish + flags | Complete + captured + window | Complete gates payout (doc 62) | **PRESERVE** | `COMPLETED` required (already) |
| Item 86 / substitute | Dedicated endpoints + flags | Void/resend or in-place (Toast) | Unavailability options are product | **FUTURE** (intent **PRESERVE**) | Do not invent in first HTTP slice |
| Hold | Parallel hold API | Pause ticket | Exists in legacy | **FUTURE** | |
| List / receive | GET + sockets | Live lanes + history | Merchant must see incoming | **IMPROVE** | Authenticated list+get; poll first; sockets **FUTURE** |
| AuthZ | Vendor JWT; coarse | Staff + outlet scope | Merchant-scoped | **CORRECT** weak hops | Staff JWT + restaurant scope on every order route |
| Idempotency | None on status | Conditional / versioned updates | Don’t double-advance | **IMPROVE** | If already `toStatus`, return current (no extra event); else one hop + event |
| Concurrency | Last write wins | Optimistic version | Two staff must not skip | **IMPROVE** | Optional `expectedStatus` on PATCH; 409 on mismatch |
| Types | 8 numeric including buffet/drive-thru | Channel/service types | Six Nest types today | **OWNER DECISION** | See §6 |
| DeliveryTask / FulfillmentStatus | Nested provider strings | Separate delivery job common | One order field today | **FUTURE** | Keep `OrderStatus` authoritative; DeliveryTask later |
| Notifications | Sockets + FCM/SMS | Event-driven, not SoT | Alerts on new/ready | **FUTURE** | Persist `OrderStatusEvent`; notify later |
| Crons / POS / ONDC | Present | Integrations | Out of first vertical | **FUTURE** | |

---

## 4. Auto-resolved (not owner)

| ID | Resolution | Why (evidence, not invention) |
| -- | ---------- | ----------------------------- |
| OD-MOM-ENGINE | **One server graph, one hop.** `orderSteps` 3/7 is UI grouping. | Nest graph already validated; Toast/KDS treat New/Prep/Ready as lanes; dual engines are unsafe |
| OD-MOM-REJECT | **`CANCELLED` + `reasonCode=MERCHANT_REJECT`** | Legacy already uses 8; industry reject ≠ new lifecycle; analytics via reason |
| OD-MOM-ONTHEWAY-CANCEL | **No cancel from `ON_THE_WAY`** | Target graph; delivery-platform restriction; rider owns the hop |
| OD-MOM-PAY-SYNC | **DTO join to `PaymentIntent`**; do not invent a second write path this slice | Payment kernel already authoritative; stale `Order.paymentStatus` is the bug |
| OD-MOM-FULFILLMENT | **`OrderStatus` remains the kitchen/handoff SoT** | Doc 40; unused extra enums must not become a second machine |
| OD-MOM-ITEM | **Defer** item cancel/substitute/hold | Intent preserved; no schema yet; first slice is order-level |
| Paid cancel money | **CORRECT:** paid reject/cancel **orchestrates** `RefundService` (separate ledger). Unpaid/COD: no refund. | Razorpay captured→refund; stranded funds are not amealio intent; legacy `settleAmount` gate is unsafe |
| Client increment | **CORRECT:** client sends **named target status**; server validates edge | Industry + existing `TRANSITIONS` |

Doc 87 §19 list is **superseded** by this section except remaining §6.

---

## 5. Target business / behavior contract

### 5.1 Actors

| Actor | May |
| ----- | --- |
| `MERCHANT_OWNER` / `MERCHANT_STAFF` | List/get in-scope restaurant orders; one-hop transitions listed below; reject pending; complete pickup |
| Rider (future HTTP) | `READY → ON_THE_WAY → DELIVERED` when assigned |
| Customer (future) | Place order; cancel only while `INITIAL`/`PENDING` (existing graph) |
| System (future) | Auto-cancel stale `PENDING`; auto-complete cron |
| Super Admin | Platform scope; no silent impersonation in first slice |

Cross-merchant: **403**. Unauthenticated: **401**.

### 5.2 Status graph (canonical — already in Nest)

```
INITIAL     → PENDING | CANCELLED
PENDING     → CONFIRMED | CANCELLED
CONFIRMED   → PREPARING | CANCELLED
PREPARING   → PACKING | READY | CANCELLED
PACKING     → READY | CANCELLED
READY       → ON_THE_WAY | COMPLETED | CANCELLED
ON_THE_WAY  → DELIVERED
DELIVERED   → COMPLETED | RETURNED
COMPLETED / CANCELLED / RETURNED → terminal
```

**Type-aware allowed next (computed server-side, not client math):**

| Type | After `READY` merchant may request |
| ---- | --------------------------------- |
| `HOME_DELIVERY` | `ON_THE_WAY` only if **no** assigned rider; else 409/403 with rider-owned message |
| `TAKE_AWAY`, `DINE_IN`, `CURB_SIDE`, `SKIP_LINE`, `CATERING` (pickup-like) | `COMPLETED` (or `CANCELLED`) |

Do not add `BUFFET` / `DRIVE_THRU` until §6.

### 5.3 Payment gates (server)

| Payment situation | Kitchen |
| ----------------- | ------- |
| Prepaid captured (`PaymentIntent` CAPTURED) | May accept (`PENDING → CONFIRMED`) |
| Prepaid not captured | Must not leave `INITIAL` into kitchen (`CONFIRMED+`) |
| COD / pay-later | May progress unpaid; collection is a **payment** action, not a status synonym |
| Direct-merchant pending verification | Stay `INITIAL` until verified (legacy intent) — **FUTURE** HTTP if not already representable |

Razorpay: uncaptured auth expires (~5 days) — do not treat as paid.

### 5.4 Cancel / reject / refund

1. `transitionStatus(..., CANCELLED)` records `OrderStatusEvent` with `reason` / `reasonCode`.
2. If a **captured** (or wallet-paid) payment exists and is not already fully refunded: **create a refund** via existing `RefundService` in the same use-case (`rejectPaidOrder` / `cancelPaidOrder`). Two facts: status event + refund row. Retry must be **idempotent** (existing refund idempotency keys).
3. If unpaid / COD uncollected: cancel only; no refund.
4. Donation/tip: do not invent new split rules here — follow existing tip/donation refund docs when those amounts exist.
5. Coupon reversal on full cancel: already implemented — **PRESERVE**.

### 5.5 Money / settlement

- Order money remains BigInt minor units; grand total integrity **PRESERVE**.
- Settlement eligibility remains **order `COMPLETED` + captured + settleAfter** — **PRESERVE**.
- `COMPLETED` is merchant/system close, not automatic on `DELIVERED`.

### 5.6 Merchant HTTP (next implementation — not done yet)

| Method | Path | Behavior |
| ------ | ---- | -------- |
| GET | `/api/v1/orders` | Scoped list: `restaurantId`, `status`, `type`, active (`not terminal`) vs history |
| GET | `/api/v1/orders/:id` | Detail + items + status events + payment summary (joined) |
| PATCH | `/api/v1/orders/:id/status` | Body `{ toStatus, reason?, reasonCode?, expectedStatus? }` |

No `next: true`. No raw `order_status` integer.

### 5.7 Concurrency / idempotency

- `expectedStatus` optional; mismatch → **409**.
- Requested `toStatus === current` → **200** current order, **no** new event.
- Invalid edge → **400**.
- Terminal → **400**.

### 5.8 Out of contract (FUTURE)

Sockets, FCM, item cancel/substitute/hold, delivery partner create, rider app, POS, ONDC, auto-crons, cart/checkout, settlement HTTP, new order types.

---

## 6. Remaining owner decisions

Only these are still genuine product/finance choices:

1. **OD-MOM-REFUND-RAIL** — On paid merchant reject/cancel, refund to **wallet** (legacy amealio rail) vs **original Razorpay instrument** (Razorpay/industry default).  
   *Not silent:* first HTTP slice may call `RefundService` with the **method already stored on the payment** (WALLET vs RAZORPAY) — that is adapting existing data, not choosing a new rail. Escalate only if finance wants to **force** one rail for all.

2. **OD-MOM-TYPES** — First-class `BUFFET` / `DRIVE_THRU` vs map to `DINE_IN` / `TAKE_AWAY` until usage is confirmed.  
   Greenfield Nest orders use the six existing types. Do not add enums without this decision.

No other doc-87 owner IDs remain open.

---

## 7. Implementation gate

Do **not** implement merchant order HTTP until this contract is accepted (or the two owner items above are recorded).

When implementing, reuse `OrderService.transitionStatus`, `MerchantScopeService`, `RefundService`. Do not add a second graph, a `REJECTED` enum, client increment, or auto-wallet inside a generic status PATCH.

**Next slice (after accept):** Merchant Order HTTP per §5.6–5.7 + paid-cancel orchestration per §5.4 + tests for list/get/hops/403/400/409/idempotent same-status.

---

## 8. Industry sources (benchmark, not authority)

- Toast Orders Hub: approval, scheduled, active, order ready, complete  
- Supaorder / KDS lane model: New / Preparing / Ready as groupings  
- Razorpay capture settings & orders API: authorize, capture window, refund of captured payments, verify paid before service  
- Stripe capture strategies: void authorization vs refund after capture  

---

**No secrets. No production code. No legacy repo changes.**
