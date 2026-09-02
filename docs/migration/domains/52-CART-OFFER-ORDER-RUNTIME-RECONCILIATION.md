# P1.7.23 — Cart / Offer / Order Runtime Reconciliation

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no tests. Resolves **DEC-OFF-1** (discount source of truth) and **DEC-OFF-3** (redemption timing) from source, and scopes P1.7.24.
> **Authority:** legacy `amealio-vendordashboard` + `amealio_web_app` vs target `replateform-amealio` (Prisma). Baseline **268/268**, unchanged.
> **Method:** frontend → API → service → persistence tracing with file:line evidence. UNKNOWN preserved.

---

## 1. Executive Summary

- **Legacy discount/total is CLIENT-SUPPLIED and trusted.** The customer web path computes discount + total in the browser (`OrderingCalculations.js`), stores them in `sessionStorage`, and `POST /user-ordering` **persists the client payload without recomputing** (`user-ordering.class.ts:2043-2073` only checks the offer id exists). Only the legacy `/usercart` PATCH recomputes server-side (`usercart.class.ts calcDiscount`), but the web checkout does not use it for offers. Payment charges the stored `total_amount`. **DEC-OFF-1 legacy = A (client-supplied); target recommendation = server-authoritative (D).**
- **Legacy redemption timing is split & inconsistent.** Usage (`offerUsed`/`offerUsedBy[]` on the single `Offers` doc — **no `CouponRedemption` collection**) is incremented at **coupon-apply** (`POST /user/offers`, pre-payment) **and again at payment** (if the order carries an `offer` FK) → **double-count**; cancel decrements one; **refund does not reverse**; no idempotency; an inactive-offer apply can even increment before the active check. **DEC-OFF-3 legacy = none/split; target recommendation = one idempotent redemption event at the payment/commit point.**
- **Target already has the primitives to fix both:** `Order` with money fields + a grand-total-integrity CHECK (P1.7.12), `PaymentIntent`/`PaymentAttempt` with **`idempotencyKey`/`razorpayPaymentId` unique** (idempotency the legacy lacks), `Transaction`/`Refund`, and a `CouponRedemption` table (a proper ledger vs legacy counters). Gaps: `Order` has **no offer/coupon link or settlement fields**; `CouponRedemption` is **minimal** (no status/reversal/unique/paymentIntent link); `Cart`/`CartItem` exist **schema-only** (no price/offer fields, no module).
- **Experience promotion is DORMANT** (the `experience_cart.offer` FK is unused scaffolding). **Seating has no cart/offer/order runtime dependency.**

---

## 2. Legacy Cart Architecture

**Three layers, no single source of truth:** (1) legacy `/usercart` (`UserCart`) — server recomputes discount when patched with `offerId` (`offerData`→`calcDiscount`); (2) new `/user/cart` + `/user/checkout` (`Cart`/`Checkout`) — **no offer wiring** (`calcDiscount` always returns 0); (3) customer web `sessionStorage` + `OrderingCalculations.js` — client math, the primary checkout path. Registration: `usercart.service.ts:27-31`.

## 3. Customer Cart Flow

`GET /user/offers?vendorId=&cart=true` (discover) → tap offer → `POST /user/offers` (validate + **increment usage**, returns offer doc, **no computed cart discount**) → client `calcDiscount`/`calcFinalTotal` (`OrderingCalculations.js:245-380`) → `sessionStorage order_details`/`orderPostData` → `CheckOutPage` merges + `POST /user-ordering` with client `total_amount`/`discount`/`coupon_code`/`offerId`. `CheckOutPage.js:444` prefers Redux `userCart.total_amount` (undiscounted) over the client discounted total — a divergence risk. Remove-coupon is local-only. The **frontend computes the commercial amounts; the backend does not re-verify them at order create.**

## 4. Offer Application Flow

`coupon_code` → offer lookup (`user-offer.class.ts:46-51`) → eligibility (dates, global cap, min/max order) → **usage increment** → returns offer. Validation happens at: `GET /user/offers` (list/frequency), `PATCH /usercart` (cart discount, no usage mutation), **`POST /user/offers` (apply — usage++)**, order create (offer-id existence only), payment (usage++ if `order.offer`). **An offer becomes "used" at apply, before payment succeeds.**

## 5. Discount Calculation

Legacy discount = percentage or fixed, capped, on the discount-adjusted line sum (`calcDiscount` client + `usercart.class.ts:156-188` server). **Order create performs NO `calcDiscount`/`calcFinalTotal`/`splitTaxes`** — it persists `contextData` and (home delivery only) may add a delivery estimate. Amount-by-amount: subtotal/discount/tax/surcharges/delivery/tip/total are all **client-supplied on the web order-create path**; server recomputation only occurs on the legacy `/usercart` cart build, not at order creation.

## 6. Order Creation

`ordering.model.ts` stores `base_amount`, `total_amount`, `discount{amount,percentage}`, `deliveryDiscount`, `offer`→Offers, `offerSettlement`, `settleAmount`. `user-ordering.class.ts:create` validates the `offer` ObjectId exists (strips if not), sums client `gstAmount+surCharges` into `tax_amount`, optionally adds a delivery estimate, then `OrderModel.create(contextData)` — **no discount/total/item-price recomputation** (client is trusted).

## 7. Payment Flow

Razorpay order amount = client-supplied `contextData.amount` = `orderSuccess.total_amount` (`razorpay.class.ts:667-838`, `CheckOutPage.js:785-788`), **not re-derived from DB**. Success recorded via `PATCH /user-ordering` (sets `payment_status`, `settleAmount = total_amount`, `offerSettlement`, and **usage++** if `order.offer.settlementType`) + `POST /updateTransaction` (`payment_status:COMPLETED`, `$inc settleAmount`, `$push transactionDetails`). Failure appends a failed transaction; **no usage reversal**. Razorpay **capture** is idempotent (`payment_captured` guard, `razorpay.class.ts:1238`) but the **user-ordering payment patch is NOT** (audit-log dedupe only) → duplicate `payment_status=1` patches **double-increment usage**.

## 8. Offer Usage / Redemption

**No `CouponRedemption` collection** — usage = embedded `Offers.offerUsed` (counter) + `offerUsedBy[]` (array) + `maximum_usage_limit`/`useLimit`/`useFrequency`/`maxUsage`. Mutation sites: apply `+1` (`user-offer.class.ts:87-107`), vendor `useOffer` `+1` (`offers.hooks.ts:346-358`), payment `+1` (`user-ordering.class.ts:3522-3541`), cancel `-1` (user/vendor/auto). **Usage-mutation matrix:**

| Event | offerUsed | Notes |
|---|---|---|
| SUCCESS (apply + pay w/ order.offer) | **+2** | double-count |
| SUCCESS (apply only, offerId not bound as `offer`) | +1 | typical web |
| FAILURE | apply +1 retained | not reversed |
| CANCEL | −1 | removes one `offerUsedBy` entry |
| REFUND | **not restored** | wallet credit only |
| PAYMENT-RETRY | +1 per success patch | no guard |
| DUPLICATE-PAYMENT | +1 per duplicate patch | user patch unguarded |

## 9. Cancellation

User/vendor/auto-cancel decrement usage by one (`user-ordering.class.ts:3298-3308`, `ordering.class.ts:6303-6313`, `autoCancel.ts:796-806`) and, if paid, trigger `RefundOrder` (wallet credit). Decrement removes a single `offerUsedBy` entry via `lastIndexOf(user_id)` — insufficient if apply+pay both incremented.

## 10. Refund

All `RefundOrder` implementations (user/vendor/auto/partial) create a wallet transaction + set `refund_id`/`refundCompleted` — **zero offer mutations**. Full-cancel refund = captured payment (minus donation); issue refund = explicit partial `amount`. **Refund never restores coupon capacity.**

## 11. Payment Failure / Retry

Failure: failed transaction appended, order back to `order_status:0`, **no usage reversal**. Retry: each successful payment patch re-runs the usage-increment block (no `paymentCompletionLog` guard on it). Duplicate callbacks: Razorpay capture guarded; user-ordering patch + `updateTransaction` not → repeated increments/`transactionDetails`.

## 12. Duplicate / Race Behavior

**No concurrency protection on offers:** usage-limit check and `$inc` are separate (no atomic compare-and-set / conditional `$inc`), no MongoDB transactions/sessions, no optimistic locking. Concurrent checkouts can both pass `maximum_usage_limit <= offerUsed` before either increments (lost update). Razorpay capture has a partial guard; the offer/order payment patch does not.

## 13. Experience Relationship

`experience_cart.offer`→Offers FK exists but **no service reads/writes it** (`user-exp-cart.class.ts`/`user-exp-checkout.class.ts`/`userExpRequest.class.ts` have zero offer references); experience cart total = base + tax + tip/donation, **no discount term**. **Experience promotion runtime is DORMANT** — experiences do not share the ordering offer redemption lifecycle.

## 14. Seating Relationship

Seating (`Diner`/SeatingRequest) has **no cart/offer/order discount dependency**. Seating→ordering is optional (`cross_ref_id`, doc 44). **NO DEPENDENCY** on the offer runtime.

## 15. Legacy Source of Truth

| Amount | Source of truth (legacy) |
|---|---|
| Discount / total (web) | **Client** (`OrderingCalculations.js` + sessionStorage) |
| Discount (legacy `/usercart`) | Server `usercart.class.ts` (only when `offerId` patched) |
| Offer eligibility | Server `/user/offers` (usage++), but discount amount not enforced at order |
| Order totals | Persisted client payload (order create trusts it) |
| Payment amount | Stored `order.total_amount` |
| Usage | Embedded `Offers.offerUsed`/`offerUsedBy[]` (no ledger) |

## 16. DEC-OFF-1 — Discount Source of Truth

- **Legacy behavior:** **A (client-supplied)** on the web ordering path — discount + total computed client-side, trusted by order create; **B (server cart calc)** only on the legacy `/usercart` PATCH path (not used for web offers); **C** offer eligibility validated at `/user/offers` but the discount **amount** is not enforced at order create; **not D/E** (no order-time or payment-time recomputation of discount).
- **Risks:** arbitrary discount/total/item-price injection at `POST /user-ordering`; double source of truth (server cart total vs client session total, `CheckOutPage.js:444`); usage decoupled from the order's discount; payment charges an unverified client total.
- **Target canonical recommendation:** **server-authoritative discount (D — order-time computation).** On order creation the server must: load the coupon/offer, re-validate eligibility, **compute `discountTotalMinor` and `grandTotalMinor` server-side** from server-priced items (the target `Order` already enforces a grand-total-integrity CHECK, P1.7.12), and **never trust a client discount/total**. This **diverges from legacy** (a deliberate security fix) — documented here, **not implemented**.

## 17. DEC-OFF-3 — Redemption Timing

- **Legacy behavior:** **no single authoritative moment** — usage is incremented at **coupon-apply** (`POST /user/offers`, pre-payment) and again at **payment success** (if the order carries an `offer` FK), reversed by **one** on cancel, and **not reversed** on refund.
- **Inconsistencies:** double-count (apply + pay); apply-before-pay consumes usage on abandoned checkouts; client `offerId` vs backend `offer` field mismatch (increment/decrement may not align); no idempotency (duplicate payment patches re-increment); refund ≠ un-redeem; cancel removes only one entry; inactive-offer apply can increment before the active check; no concurrency guard.
- **Target canonical recommendation:** **one idempotent redemption event at the commit point** — create exactly one `CouponRedemption` row per (coupon, order) at **payment capture** (online) / **order placement** (pay-at-site), enforced by a **unique constraint** + atomic usage-limit check; **usage counts become derived** (`COUNT` of non-reversed redemptions) rather than a mutable counter, eliminating double-count and races; **reverse** the redemption (status/`reversedAt`) on cancel **and** refund. Since target payment is not yet implemented, the practical first authoritative point is **order placement** (the current commercial commit, P1.7.12), migrating to payment-capture when the payment slice lands. **Migration implication:** legacy `offerUsed`/`offerUsedBy[]` back-fill into `CouponRedemption` rows (best-effort; the counter/array is lossy re: order linkage).

## 18. Target Cart Assessment

`Cart`/`CartItem` exist **schema-only** (`Cart{userId?,guestToken?,merchantId?,restaurantId?,type?}`, `CartItem{menuItemId?,variantId?,quantity,customization,addOns}`) — **no price/discount/offer/total fields, no service/module**. A Cart runtime (server pricing + offer preview) is **optional** for redemption: the P1.7.12 order-create already accepts resolved items, so a coupon can be validated + discount computed at order creation without a Cart. **A Cart foundation is NOT required before P1.7.24.**

## 19. Target Order Assessment

`Order` (P1.7.12) has money fields **`subtotalMinor`/`taxTotalMinor`/`discountTotalMinor`/`feeTotalMinor`/`deliveryChargeMinor`/`grandTotalMinor`** + `paymentStatus` + a grand-total-integrity CHECK + `couponRedemptions` relation. **Gaps:** no `offerId`/`couponId` link on `Order` (only via `CouponRedemption.orderId`), and **no settlement fields** (`offerSettlement`/`settleAmount`). `discountTotalMinor` can hold the server-computed discount — good.

## 20. Target Payment Assessment

`PaymentIntent{amountMinor,razorpayOrderId @unique,status,attempts,transactions,refunds}` + `PaymentAttempt{idempotencyKey @unique, razorpayPaymentId @unique, providerPayload}` + `Transaction` + `Refund{status}` + `PaymentStatus{CREATED,AUTHORIZED,CAPTURED,PARTIALLY_REFUNDED,REFUNDED,FAILED}`. **The target already provides the idempotency + attempt-tracking the legacy lacks** — a strong base for capture-time redemption. **No payment module/service exists yet** (schema only).

## 21. Target CouponRedemption Assessment

`CouponRedemption{couponId, userId?, orderId?, createdAt}`. **Insufficient** to represent the intended semantics: **no status/reversal** (`reversedAt`), **no unique constraint** (can't enforce one-per-order/idempotency), **no `paymentIntentId` link**, **no discount snapshot** (`discountAppliedMinor`), **no `merchantId`/settlement**. It can log "a coupon was used on an order" but cannot enforce limits idempotently or support reversal. **Gap documented; not redesigned here.**

## 22. Required Target Changes (documented, NOT implemented)

- `CouponRedemption`: add `status`/`reversedAt` (reversal), `discountAppliedMinor`, optional `paymentIntentId`, and a **unique constraint** (e.g. `@@unique([couponId, orderId])`) for idempotency.
- `Order`: add the applied coupon/offer link + `discountTotalMinor` population by the server; settlement fields (`offerSettlement`) if settlement is in scope.
- A **redemption service** that validates the coupon, computes the discount server-side, enforces usage limits atomically, and writes one `CouponRedemption` at the commit point (reversible on cancel/refund).
- (Optional) A **Cart** runtime for discount preview — not required for redemption.

## 23. Confirmed Gaps

Server-authoritative discount computation; a redemption ledger with status/reversal/idempotency; `Order`↔offer link + settlement fields; usage-limit enforcement as derived counts with concurrency safety; refund→redemption reversal; a Cart service (optional).

## 24. Partial

`CouponRedemption` (exists, minimal); `Order` money fields (present, but no offer link/settlement); `PaymentIntent`/`PaymentAttempt` (present with idempotency, no service); `Cart`/`CartItem` (schema only).

## 25. UNKNOWNs

Exact redemption commit point once payment lands (capture vs authorization vs order-completion) — recommended **capture**, but payment isn't implemented; whether pay-at-site should redeem at placement; whether settlement (`offerSettlement`/SPLIT) is in scope for the target; whether a Cart runtime is desired for parity.

## 26. Dependency Graph

| Relationship | Class | Evidence |
|---|---|---|
| Cart → Order | **SOFT** | order-create accepts resolved items; cart is a preview (target cart schema-only) |
| Offer → Coupon | **HARD** | code belongs to an offer (P1.7.22) |
| Coupon → CouponRedemption | **HARD** (for redemption slice) | redemption references a coupon |
| CouponRedemption → Order | **HARD** (redemption) | redemption is per order (`orderId`) |
| CouponRedemption → User | **SOFT** | per-user limits; guest possible |
| CouponRedemption → PaymentIntent | **SOFT/RECOMMENDED** | capture-time redemption (not yet modeled) |
| Order → discount computation | **HARD** (target recommendation) | server must compute `discountTotalMinor` |
| Order → PaymentIntent/Transaction | **HARD** (payment slice) | payment against order total |
| Offer → Order | **OPTIONAL** | orders may have no offer |
| Offer/Order → Merchant/Restaurant | **HARD** | tenancy |
| Offer → Menu/MenuItem | **NO DEPENDENCY** | order/restaurant-level scope (doc 46/50) |
| Offer/Order → Experience | **NO DEPENDENCY (dormant)** | experience offer FK unused |
| Offer/Order → Seating | **NO DEPENDENCY** | no offer runtime in seating |
| Redemption → Currency | **SOFT** | minor-unit discount |

## 27. Owner Decisions

- **DEC-OFF-1 — RESOLVED (recommendation):** discount is **server-authoritative** at order creation; client discount/total are never trusted. (Diverges from legacy; security fix.)
- **DEC-OFF-3 — RESOLVED (recommendation):** **one idempotent `CouponRedemption` at the commit point** (payment capture when payment exists; order placement in the interim), usage derived from non-reversed redemptions, reversed on cancel **and** refund.
- **Still open (genuine):** (i) exact commit point once payment is implemented (capture vs authorization); (ii) whether settlement (`offerSettlement`/SPLIT) is in target scope; (iii) whether a Cart runtime is built for parity or order-create takes resolved input + coupon directly; (iv) legacy usage back-fill fidelity into `CouponRedemption`.

## 28. Recommended P1.7.24

**Offer Redemption & Server-Side Discount at Order Creation.** The smallest slice that makes discounts server-authoritative and redemption correct: extend the P1.7.12 order-creation path to (1) accept an optional coupon code, (2) **validate the coupon server-side** (eligibility, validity, min-order, usage limits — reusing P1.7.22 config), (3) **compute `discountTotalMinor` + `grandTotalMinor` server-side** (never trust client), and (4) write **one idempotent `CouponRedemption`** at order placement with usage enforced as a derived count, **reversible** on order cancel. This requires a **minimal additive** `CouponRedemption` extension (status/reversedAt + unique constraint + discount snapshot) and an optional `Order`↔coupon link. **Defer:** Cart runtime, payment-capture-timed redemption, settlement/SPLIT, refund-reversal wiring (until payment/refund slices), and Experience promotion (dormant). Redemption at payment capture migrates in when the payment slice lands.

---

### Confirmations
- **No application code changed** (documentation only). **P1.7.18, P1.7.20, P1.7.22 untouched.**
- **No Prisma schema / migration / test change.** Baseline **268/268**, build/lint/format/Prisma unaffected.
- **No legacy source modified; no production DB; no Mongo migration; no frontend; no Ordering/Payment/Seating/Experience behavior changed; no ONDC.**
