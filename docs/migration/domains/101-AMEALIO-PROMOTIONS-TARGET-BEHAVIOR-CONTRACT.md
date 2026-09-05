# 101 — Amealio Promotions Target Behavior Contract

**Status:** CONTRACT — ARCHITECTURE ONLY (no implementation)  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Legacy browse evidence:** [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) — remains valid. Do **not** implement the deferred legacy-style browse slice.  
**Prior offer kernel:** [50](./50-OFFERS-PROMOTIONS-RECONCILIATION.md), [51](./51-OFFER-COUPON-CONFIGURATION-FOUNDATION.md), [52](./52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md), [53](./53-OFFER-REDEMPTION-DISCOUNT-FOUNDATION.md), [54](./54-OFFER-REDEMPTION-REVERSAL-USAGE-FOUNDATION.md), [55](./55-OFFER-USAGE-FREQUENCY-RECONCILIATION.md), [90](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)

Favorites ([97](./97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md)), Profile ([96](./96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md)), Addresses ([98](./98-CONSUMER-SAVED-ADDRESSES-TARGET-BEHAVIOR-CONTRACT.md)), and Order Tracking ([95](./95-NEXT-CONSUMER-SURFACE-TARGET-BEHAVIOR-CONTRACT.md)) stay closed.

**Decision:** amealio should build a **modern promotion engine**. It must **not** reproduce the legacy Mongo Offers document, client-authoritative discount, or pre-payment usage counters. It **must** evolve the existing Nest `Offer` / `Coupon` / `CouponRedemption` + checkout kernel rather than throw it away or invent a parallel coupon product.

This document is investigation + target architecture only. No schema, API, UI, checkout, cart, payment, or order changes in this turn.

---

## 0. Method

1. **L1** — Reused [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) and verified Feathers `Offers` / `user-offer`, client `OrderingCalculations.js`, and target Prisma + `assertOfferEligible` / checkout `deferRedemption` / refund reversal.
2. **L2** — Benchmarked Toast, DoorDash, Uber Eats, and Square promotion mechanics from current vendor docs (not coupon-blog scrapes).
3. **L3/L4** — Gap matrix + conceptual model + lifecycles + phasing.

**Hard rules:** No implementation. No Prisma / checkout / cart / payment / order / Favorites / Profile / Addresses / Home / Home V2 / geo / delivery changes. Do not invent tax. Do not fold wallet, loyalty, referrals, or `merchant-permotion` into this domain.

Five lanes stay five lanes. This contract designs **C + D + E** first, then **A + B** as consumers of the engine.

| Lane | Meaning | Target authority |
| ---- | ------- | ---------------- |
| **A. Discovery** | Facts a diner can see | Engine quote + restaurant context. Never “available” without cart. |
| **B. Detail** | Terms, dates, scope, code as a fact | Same payload as A |
| **C. Application** | Intent: code or selected promotion on cart/checkout | Client sends intent only |
| **D. Redemption** | Ledger commit / reverse | Server, transactional, derived usage |
| **E. Eligibility** | May this promotion apply to this cart/order? | Server, fail-closed |

A coupon is a **redeemable mechanism**. A promotion is the **business rule and benefit**.

---

## 1. L1 — Legacy reality

Verified against [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md), [50](./50-OFFERS-PROMOTIONS-RECONCILIATION.md), [52](./52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md), and `amealio-vendordashboard` `src/models/offers.model.ts` + `src/services/offers/user-offer.class.ts`.

### 1.1 What actually existed

One Mongo `Offers` document was definition **and** code **and** usage log.

| Concern | Legacy field / path | What it did |
| ------- | ------------------- | ----------- |
| Offer | `Offers` | Campaign + benefit + eligibility + code |
| Coupon code | `coupon_code` unique | De-facto 1 offer : 1 code. Resolve-by-code on apply |
| Discount | `isPercentage` + `discount` + `maximum_discount_applied` | Order-level % or fixed, capped. **No** item / category / BOGO / free-item |
| Min / max order | `minimum_order_applied` / `maximum_order_applied` | Enforced on apply; cart patch only min |
| Scope | `vendor_id`, `restaurant_id`, `restaurants[]`, `isGlobal` | Restaurant / vendor / platform |
| Dates | `start_date` / `end_date` | Inclusive window |
| Service types | `service_type[]` free strings | Takeaway / Delivery / Dine-In; not a typed enum |
| Usage total | `maximum_usage_limit` vs `offerUsed` | Mutable counter |
| Per-user lifetime | `maxUsage` vs `offerUsedBy` | Global-offer gated in list/apply |
| Per-period | `useLimit` + `useFrequency` vs windowed `offerUsedBy` | IST calendar; global-only ([55](./55-OFFER-USAGE-FREQUENCY-RECONCILIATION.md)) |
| Usage storage | `offerUsed` + `offerUsedBy[]` | **No** redemption collection |
| Cart application | `POST /user/offers` then client `calcDiscount` | Usage ++ **before payment** |
| Order create | Client `total_amount` / `discount` trusted | Server did not recompute |
| Payment | Sometimes usage ++ again | Double-count |
| Cancel | Decrement one `offerUsedBy` | Not transactional with status |
| Refund | Wallet only | **Did not** restore usage |
| Delivery discount | `isDelivery` / `deliveryMinOrder` / `deliveryMaxDiscount` | Quote path only — not order discount |
| Adjacent systems | referral, signup reward, `merchant-permotion`, promo video | **Independent.** Do not merge |

Working consumer surfaces ([99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md)): restaurant tickets + cart “Show Available Offers.” Account `/offers` is 404 / `route: null`. Home carousel click is a stub. Geo carousel is STOP.

### 1.2 Preserve vs replace

| Legacy capability | Class | Why |
| ----------------- | ----- | --- |
| Order-level % and fixed + cap | **PRESERVE** | Source-confirmed; already in target `calculateDiscountMinor` |
| Restaurant / merchant / platform scope | **PRESERVE** | Clear amealio intent |
| Date window, min/max order, service type | **PRESERVE** | Clear; target already enforces at order create |
| Usage limits (total, per-user, period) | **IMPROVE** | Keep intent; **derived** `ACTIVE` counts, never `offerUsed` |
| Optional vanity code as apply token | **PRESERVE** | Mechanism, not the domain |
| Restaurant + cart as real diner surfaces | **PRESERVE** (later UX) | Account wallet was never shipped |
| Server must own discount and grand total | **CORRECT** vs legacy client math | Already target law ([53](./53-OFFER-REDEMPTION-DISCOUNT-FOUNDATION.md), [90](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)) |
| One redemption ledger, reversible | **CORRECT** vs counters | `CouponRedemption` already |
| Increment usage at apply / before payment | **CORRECT** — do not copy | Integrity bug; prepaid unpaid orders must not consume capacity |
| Client `calcDiscount` as authority | **CORRECT** — do not copy | Tamper + stale cart |
| Double increment at payment | **CORRECT** — do not copy | |
| Refund never releasing usage | **CORRECT** — do not copy | Target full refund already reverses `ACTIVE` |
| Mongo toggle / `hidden` / `mark_as_primary` | **CORRECT** / **FUTURE** | Not a product model |
| Delivery-fee promo fields | **FUTURE** | Coupled to delivery quote; do not invent here |
| Item / BOGO / free-item / audience | **FUTURE** | Not in legacy; industry-standard later |
| Clip/save `offerFav` | **FUTURE** | Not a product ([97](./97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md) closed) |

---

## 2. L2 — Industry benchmark

Sources: Toast Platform Guide (discount types, exclusivity, auto-apply, promo codes); DoorDash merchant Promotions help; Uber Eats Manager offers; Square Support (discounts vs vanity coupons). Loyalty / wallet / referrals out of scope.

### 2.1 Discount types

| Type | Toast | DoorDash | Uber Eats | Square | amealio today |
| ---- | ----- | -------- | --------- | ------ | ------------- |
| Percentage off check / basket | Yes | Yes | Yes | Yes | Yes (order) |
| Fixed amount off check / basket | Yes | Yes | Yes | Yes | Yes (order) |
| Max discount cap | Common | Yes | Common | Max on some discounts | Yes |
| Item / category % or $ | Yes | Item-specific | Item / category | Item / category | **No** |
| Free item | Via 100% get | Yes | Yes + min basket | 100% BOGO | **No** |
| BOGO / Buy X Get Y | First-class | Yes | Yes | Yes | **No** |
| Spend X Get Y | Min check + benefit | First-class | Min ticket | Min spend rule | Min order only |
| Free / discounted delivery | Not core POS | First-class | £0 delivery + min | Not core | Legacy quote-only |
| Open / cashier-entered $ or % | Yes (POS) | No | No | Manual POS | **Out** (no diner POS) |

### 2.2 Scope

Industry applies promotions to **order**, **restaurant / store**, **category**, **item**, and **service type** (delivery vs pickup). Toast also has combo (set of required items → set price). amealio target today: order + restaurant/merchant/global + `serviceTypes`. No item/category targets.

### 2.3 Eligibility

Common: min spend, max discount, date range, daypart / happy hour, order type, usage / budget caps, first-order / existing / lapsed (marketplaces). Toast: min/max check totals, date range, active flag, required items. Square: schedule, customer group, min spend, quantity. DoorDash / Uber: audience + budget as the spend cap.

amealio today: active, dates, scope, min/max, service type, total / per-user / global period limits. **No** daypart, first-order, lapsed, or segment.

### 2.4 Promo codes

| Practice | Evidence |
| -------- | -------- |
| Code is optional | Toast “requiring promo codes”; Square discounts can auto-apply without a code; marketplace offers usually have **no diner-typed code** |
| Code ≠ promotion | Square: Dashboard **Discounts** vs Marketing **Coupons** (vanity codes). Toast: discount config + optional code |
| One diner-typed code per checkout | Square online: one coupon at a time. ChowNow / DoorDash consumer: one entry box |
| Reusable vanity vs single-use unique | Both exist. Square recommends unique codes for tracking |
| Expiry + usage limits | Universal |

### 2.5 Application

- **Automatic** when rules match (Toast auto-apply; Square automatic; DoorDash / Uber segment offers).
- **Customer-selected** from eligible list (DoorDash checkout “Promo codes, rewards & gift cards”).
- **Promo-code entry** (Square online, Toast required-code discounts, amealio legacy cart).

### 2.6 Stacking

Industry **does not agree**. Do not copy one vendor as amealio law.

| Vendor | Policy |
| ------ | ------ |
| Toast | Exclusive vs nonexclusive. Item-level and combo **always exclusive**. Exclusive cannot stack with exclusive. Sequence can matter when items are “used up.” |
| Square | A given discount once per sale. % then $. One **online** coupon. Advanced-rule discounts only hit eligible items. |
| Uber Eats | Official: item-level **may combine** with basket-level; example BOGO for all + 30% basket for new. |
| DoorDash | Merchant campaigns are audience-targeted and generally present as **the** offer; consumer typed codes are a separate checkout instrument. |
| Legacy amealio | **One code / one offer per order.** |

### 2.7 Consumer UX

Discover on **restaurant / offers rail** (facts + constraints). Evaluate on **cart**. Apply / remove / see amount / see **rejection reason** on **checkout**. Save-for-later is optional and not required for a working product ([99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md)). Showing “available” without a cart or without an apply path is the industry failure mode.

### 2.8 Merchant / admin UX

Configure name, type, benefit, scope (menu / item / store), eligibility, schedule, audience, limits / budget, optional code, active, exclusivity / auto-apply, inspect redemptions. Toast and Square are configuration-rich POS. DoorDash / Uber are campaign + budget + audience.

---

## 3. L3 — Gap analysis

| Topic | Legacy | Industry | Target today | Class |
| ----- | ------ | -------- | ------------ | ----- |
| Domain noun | One Mongo Offer+code+counters | Promotion + optional code | `Offer` + `Coupon` + `CouponRedemption` — coupon-triggered order discount | **IMPROVE** — keep tables; engine language is Promotion |
| Discount types | % / fixed / cap | Also item, BOGO, free item, spend/get, delivery | Same as legacy, server-side | **PRESERVE** now; **FUTURE** richer benefits |
| Eligibility engine | Partial + client | Server vs live cart | `assertOfferEligible` at order create only | **IMPROVE** — same rules as a **quote** against cart |
| Code-less auto apply | Config allowed; runtime unused ([53](./53-OFFER-REDEMPTION-DISCOUNT-FOUNDATION.md) §20) | Standard | Code-less offer cannot be applied | **IMPROVE** |
| Application UX | Cart code + client math | Quote + apply + reject reason | Checkout DTO has `couponCode`; web never sends it; cart has no promo | **IMPROVE** (later slice) |
| Redemption timing | Apply + sometimes pay | At paid / placed commit | COD: ACTIVE at place. PREPAID: `deferRedemption` until capture | **PRESERVE** |
| Usage storage | Mutable counters | Derived / ledger | Derived `ACTIVE` counts + coupon row lock | **PRESERVE** |
| Cancel | Non-transactional −1 | Release on void | Status + `REVERSED` in one tx | **PRESERVE** |
| Refund | No release | Release on full void | Full refund reverses `ACTIVE` | **PRESERVE** |
| Idempotency | None | Checkout + payment keys | `checkoutIdempotencyKey` + unique `(couponId, orderId)` | **PRESERVE** |
| Stacking | One per order | Varies | Singular `Order.offerId` / `couponId` | **PRESERVE** for v1 |
| Item / category / BOGO | Absent | Standard modern restaurant | Absent | **FUTURE** |
| Audience (first / lapsed) | Absent | Marketplace standard | Absent | **OWNER DECISION** / **FUTURE** |
| Day / time | Absent | Happy hour standard | `validFrom`/`validTo` only | **FUTURE** |
| Delivery fee promo | Partial quote | Marketplace standard | Not in order discount | **FUTURE** (delivery vertical) |
| Tax on discounted base | Client `getDiscountPrice` partial | Jurisdiction-specific | `taxTotalMinor` accepted; not recomputed here | **PRESERVE** — do not invent tax |
| Settlement who pays | `VENDOR`/`ADMIN`/`SPLIT` stored | Merchant vs platform funded | `settlementType` stored; SPLIT not calculated | **PRESERVE** store; **FUTURE** calc |
| Consumer browse without apply | Dead account page | Facts on restaurant; apply on cart | No consumer read HTTP | **CORRECT** — do not ship [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) browse-only |
| Merchant HTTP / UI | Feathers CRUD | Required | `OfferService` no controllers | **FUTURE** after engine |
| Wallet / referral / tags | Separate | Separate | Separate | **PRESERVE** separation |

**Are current Prisma models sufficient?**  
Sufficient as the **v1 adapter** for order-level % / fixed promotions with optional code and a redemption ledger. **Not** sufficient as the long-term conceptual model once benefits need item targets, dayparts, audience, unique single-use code batches, or line allocations. Do not treat `Coupon` as the primary object. Do not add a second competing discount system.

---

## 4. L4 — Target contract

### 4.1 Target conceptual model

```
Promotion          business campaign (name, owner, status, schedule, priority, exclusive)
  └─ Benefit       what the diner gets (type + parameters)
  └─ Eligibility   when it may apply (scope, cart gates, audience)
  └─ PromoCode[]   optional redeemable mechanisms (not required)
Application        diner/server intent on a cart or checkout (quote, not ledger)
RedemptionLedger   committed usage (today: CouponRedemption)
OrderDiscount      money snapshot + optional line allocation
```

| Concept | Responsibility | v1 persistence |
| ------- | -------------- | -------------- |
| **Promotion** | Identity, copy, owner, active, deleted, priority, exclusive | Existing `Offer` row |
| **Benefit** | `%` or fixed order discount + cap | `discountPercent` XOR `discountMinor` + `maxDiscountMinor` |
| **Eligibility** | Scope, dates, min/max, service types, usage caps | Existing `Offer` fields |
| **PromoCode** | Unique typed token | Existing `Coupon` (0..n; v1 typically 0..1) |
| **Customer eligibility** | Remaining uses, later first-order | Derived from ledger + `userId`; no segment table yet |
| **Application** | Quote / selected intent | **Not stored** in v1 (cart has no promo field). Checkout sends `couponCode` or later `promotionId` |
| **Redemption ledger** | ACTIVE / REVERSED + amount | `CouponRedemption` (name may stay; meaning is promotion redemption) |
| **Order discount allocation** | `discountTotalMinor` + `offerId`/`couponId` | Existing Order columns. Line split **FUTURE** |

**Retain.** `Offer`, `Coupon`, `CouponRedemption`, Order money integrity, checkout idempotency, prepaid defer, cancel/refund reverse.

**Improve later (new tables only when a benefit cannot fit):** item/category targets, daypart windows, audience rules, unique-code batches, `PromotionApplication` quote rows, `OrderDiscountLine`.

**Do not add.** Parallel “legacy Offer” and “modern Promotion” runtimes. Do not make `Coupon` the root.

### 4.2 Promotion lifecycle

```
DRAFT (active=false, not evaluable)
  → SCHEDULED / ACTIVE   (active=true, in validFrom..validTo)
  → INACTIVE             (merchant turns off; existing committed orders keep snapshot)
  → EXPIRED              (now > validTo; not a separate write — evaluated)
  → SOFT-DELETED         (deletedAt set; invisible)
```

No cron required for expiry. Evaluation uses `now`. Soft-delete is configuration, not a redemption event. Changing benefit after redemptions exist does **not** rewrite historical `discountAppliedMinor`.

### 4.3 Eligibility model

Evaluation input (required; **fail closed** if missing):

| Input | Source | If missing |
| ----- | ------ | ---------- |
| `now` | Server | Impossible |
| `restaurantId`, `merchantId` | Cart / order | Reject |
| `orderType` | Cart / checkout | Reject |
| `subtotalMinor` | Server-priced lines | Reject (never client total) |
| `lines[]` | Server catalog prices | Required for v1 subtotal; required for later item benefits |
| `userId` | JWT | Anonymous: personal limits / first-order fail closed or skip those promotions |
| `promoCode?` | Client intent | Optional |
| `promotionId?` | Client intent (later) | Optional |

Checks, in order:

1. Promotion exists, `deletedAt` null, `active`.
2. Calendar window.
3. Scope: global **or** `restaurantId` match **or** `merchantId` match. Unscoped non-global → reject ([`assertOfferEligible`](../../../apps/api/src/modules/ordering/domain/offer-discount.ts)).
4. `serviceTypes` vs `orderType` (`ALL` wildcard).
5. `minOrderMinor` / `maxOrderMinor` vs **server subtotal**.
6. Benefit configured (XOR % / fixed).
7. Usage: `maxUsageLimit`, `perUserLimit`, global `useLimit`/`useFrequency` (IST, Sunday week, [55](./55-OFFER-USAGE-FREQUENCY-RECONCILIATION.md)) against **ACTIVE** rows only.
8. Code, if required or supplied: resolve `Coupon.code` → this promotion; unknown code → reject.
9. Stacking / exclusive (v1: at most one promotion).
10. Discount = `calculateDiscountMinor`; clamp to subtotal.

**Quote vs commit.** Quote returns `{ eligible, discountMinor, rejectionCode, rejectionMessage }` and writes **nothing**. Commit re-runs the same function inside the order/payment transaction.

Do not build a second rules language. Do not evaluate “available to you” without this context.

### 4.4 Coupon / code model

- A **PromoCode** is optional.
- Automatic promotions have **no** code.
- Typed codes are unique, case-normalized at compare (legacy was exact; Square is case-insensitive — **IMPROVE** to case-insensitive trim).
- v1: reusable vanity code, usage via ledger.
- Single-use unique codes, batched campaign codes: **FUTURE**.
- Code-less offers become first-class **automatic** promotions once evaluate exists.
- The diner never “owns” a coupon row. Usage is ledger-derived.

### 4.5 Application lifecycle

```
NONE
  → QUOTED      evaluate(cart) — no write
  → SELECTED    client sends couponCode and/or promotionId (intent)
  → PRICED      checkout recomputes; grandTotal uses server discount
  → COMMITTED   ACTIVE ledger (see 4.6)
  → REMOVED     client omits intent; quote discount 0; no ledger
```

No durable “reserve” hold. Legacy apply-time `offerUsed++` was a reserve and is **forbidden**. Capacity is checked again at commit under the existing coupon `FOR UPDATE` lock.

### 4.6 Redemption lifecycle

| Settlement | Evaluate | Ledger ACTIVE | Reverse |
| ---------- | -------- | ------------- | ------- |
| COD / PAY_LATER | At place | At place (order → `PENDING`) | Cancel tx; full refund if later paid |
| PREPAID | At place (discount in `grandTotalMinor` / intent amount) | At **capture** (`deferRedemption` + `promoteOnPaymentCapture`) | Cancel before capture: no ACTIVE row. After capture: cancel or full refund → `REVERSED` |

Payment **failure** / abandon: order stays `INITIAL`, **no** ACTIVE row, capacity free.  
Duplicate checkout: return existing order by `checkoutIdempotencyKey`; do not create a second redemption.  
`(couponId, orderId)` unique remains the idempotency invariant.  
**Do not** increment anything before payment on prepaid.

### 4.7 Stacking policy

**v1 (auto-resolved):** **at most one promotion per order.**

Reasons: legacy was one; `Order.offerId`/`couponId` are singular; checkout DTO has one `couponCode`; Square online and typical diner code boxes are one; Toast item/combo exclusivity shows unconstrained stacking is a finance product. Industry disagreement means **do not invent multi-stack** until amealio chooses it.

If both an automatic promotion and a code qualify: **the selected code wins**; otherwise the highest `priority` then largest `discountMinor` automatic wins. Document the winner in the quote. Do not silently stack.

**Later / OWNER DECISION (only if product asks):** one automatic (e.g. item/happy hour) + one code; exclusive flags; max total discount. Not v1.

### 4.8 Accounting implications

Existing integrity (do not change in this architecture turn):

```
grandTotalMinor = subtotalMinor − discountTotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor
tipMinor and donationMinor stay outside grand and outside commission
```

| Bucket | v1 meaning |
| ------ | ---------- |
| Gross subtotal | Server sum of catalog line totals |
| Promotion discount | Single `discountTotalMinor` from the engine |
| Coupon discount | **Not a second money field.** A code is how the promotion was selected |
| Taxable subtotal | **Do not invent.** Keep current tax input path until a tax contract exists |
| Fees / delivery | Unchanged; delivery promos are FUTURE and would adjust `deliveryChargeMinor`, not food discount |
| Final payable | `grandTotalMinor` (+ tip/donation collection rules already in payment) |
| Refund allocation | Full refund: reverse ledger (already). Partial refund: **do not** invent line-level promo clawback this phase |

Settlement: keep `Offer.settlementType`. Do not calculate SPLIT here. Who funds a platform-wide promotion remains stored, not newly computed.

### 4.9 Consumer UX (staged, not implemented)

| Stage | Surface | Behavior |
| ----- | ------- | -------- |
| 1 | **Checkout** | Promo-code field. Show applied title + `discountTotalMinor` or structured rejection. Remove = resubmit without code. |
| 2 | **Cart** | `evaluate(cart)` list: qualifying promotions with computed savings; non-qualifying with reason (“add ₹X more”). Apply writes intent for checkout. |
| 3 | **Restaurant** | Catalog **facts** (title, terms, window, advertised min, code if any). Badge “works on this cart” only if a cart for that restaurant exists and evaluate says so. |
| 4 | **Account** | Saved / available book **only** if product later proves need. Default: **no**. Favorites `OFFER` stays closed. |

Do not ship Stage 3 before Stage 1. That is the [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) failure.

### 4.10 Merchant / admin UX (not implemented)

Minimum configuration (maps to today’s `OfferService` fields + later HTTP):

- Name, description, terms
- Benefit: percent or fixed + cap
- Scope: restaurant / merchant / global (global = platform admin)
- Eligibility: min/max, service types, schedule, usage limits
- Optional promo code
- Active / inactive, soft-delete
- Priority (default 0)
- Exclusivity: v1 implicit exclusive
- Usage inspection: count ACTIVE / REVERSED by promotion

Audience, daypart, item targets, exclusions, unique-code batches: later. No merchant UI in the first engine slice.

### 4.11 Ordering integration boundary

**Do not change ordering in this architecture turn.** Future implementation must attach at these existing seams only:

| Moment | Existing hook | Engine duty |
| ------ | ------------- | ----------- |
| Cart price | `CartService.price` — subtotal only today | Optional quote; no ledger |
| Checkout create | `CheckoutService` → `OrderService.createOrder` | Re-evaluate intent; set `discountTotalMinor`; COD commit / PREPAID defer |
| Prepaid capture | `promoteOnPaymentCapture` | Commit ACTIVE once |
| Checkout idempotency | `checkoutIdempotencyKey` | Replay; no second ledger |
| Cancel | `updateStatusWithEvent` → `REVERSED` | Unchanged contract |
| Full refund | `refund.repository` reverses ACTIVE | Unchanged contract |
| Payment amount | Intent = `grandTotalMinor` | Engine discount must be inside that total before intent create |

Out of boundary: Home V2, geo, delivery fee engine, tax engine, wallet as a promo, Favorites, Profile, Addresses.

### 4.12 Server evaluation contract (canonical)

The client may send **intent only** (`couponCode` and later `promotionId`). The client is never authoritative for eligibility, discount amount, usage, or redemption status.

```
evaluate(context) -> Quote
commit(context, orderTx) -> Redemption | already-exists
reverse(orderId, tx) -> REVERSED (idempotent)
```

Fail closed. Same function for quote and commit. Commit is the only writer.

### 4.13 Migration implications

- Mongo `Offers` → one `Offer` + optional `Coupon`. Do **not** migrate `offerUsed` / `offerUsedBy`; rebuild usage from historical orders if needed, else start ledger at cutover.
- Do not migrate dead `/offers` account chrome.
- Do not migrate `hidden`, carousel geo, or `offerFav` as product.
- Keep `legacyId` on `Offer`.
- Adjacent referral / tag / video systems stay out.
- No Prisma change is authorized by this document. Schema evolution waits for a benefit the current columns cannot express.

---

## 5. Classifications (legacy capabilities)

| Capability | Class |
| ---------- | ----- |
| Order-level % / fixed / cap | **PRESERVE** |
| Restaurant / merchant / global scope | **PRESERVE** |
| Dates, min/max, service types | **PRESERVE** |
| Optional vanity code | **PRESERVE** |
| Derived usage limits + IST period for global | **PRESERVE** / **IMPROVE** |
| Restaurant + cart as diner surfaces | **PRESERVE** (after apply exists) |
| Server-authoritative discount | **CORRECT** (already target) |
| Ledger + cancel/refund reverse | **CORRECT** (already target) |
| Prepaid defer until capture | **PRESERVE** |
| One promotion per order (v1) | **PRESERVE** |
| Apply-time usage ++ | **CORRECT** — forbidden |
| Client discount authority | **CORRECT** — forbidden |
| Browse-only account / discover list | **CORRECT** — do not ship [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) |
| Code-less automatic apply | **IMPROVE** |
| Cart/checkout quote + rejection reasons | **IMPROVE** |
| Case-insensitive codes | **IMPROVE** |
| Item / BOGO / free item / spend-get | **FUTURE** |
| Daypart | **FUTURE** |
| Delivery-fee promotion | **FUTURE** |
| Audience first/lapsed/segment | **OWNER DECISION** then **FUTURE** |
| Stacking beyond one | **OWNER DECISION** (not v1) |
| Platform vs merchant funded calc | **OWNER DECISION** / **FUTURE** (field exists) |
| Saved promotions wallet | **FUTURE** (default no) |
| Tax recomputation on discount | **FUTURE** / do not invent |
| SPLIT settlement math | **FUTURE** |

---

## 6. Implementation phasing

Derived from evidence: the missing capability is **not** a catalog. It is a **server quote** that checkout can trust, then diner apply UX, then discovery.

| Phase | Vertical | In | Out |
| ----- | -------- | -- | --- |
| **1** | Promotion evaluation foundation | Pure `evaluate(context)` over existing `Offer` as v1 Promotion; quote DTO; reuse `assertOfferEligible` + `calculateDiscountMinor`; code **or** code-less automatic; no ledger write; tests | Schema rewrite, checkout UI, browse, tax, delivery, stacking |
| **2** | Cart / checkout application | Cart quote on priced cart; checkout field wired to existing `couponCode`; rejection reasons; web apply/remove; keep prepaid defer | Payment rewrite, browse, Favorites |
| **3** | Consumer discovery | Restaurant fact tickets from evaluate-or-catalog facts; “on this cart” only with cart | Geo, Home V2, account wallet |
| **4** | Advanced campaigns | Item/category, BOGO, spend/get, daypart, audience, exclusive flags, unique codes, line allocation — **only with a new schema slice** | Loyalty, wallet, referrals |

Phase 1 may add **read** HTTP for quote. It must not add a nationwide offers feed.

---

## 7. Exact next implementation slice

**Phase 1 — promotion evaluation kernel (quote only).**

Smallest truthful slice:

1. Domain function `evaluatePromotion(context)` (extract/extend `offer-discount.ts`).
2. Resolve by `couponCode` **or** list automatic (code-less, active, in-window, in-scope) promotions for the cart’s restaurant/merchant.
3. Return computed `discountMinor` or a closed rejection code.
4. No `CouponRedemption` writes.
5. No Prisma migration.
6. No checkout/cart/payment/order behavior change.
7. No consumer browse UI.

Phase 2 is the first diner-visible apply path and is **blocked on Phase 1**.

---

## 8. Owner decisions (not guessed)

| ID | Decision | Why it waits |
| -- | -------- | ------------ |
| OD-PROMO-1 | Allow one automatic + one code later? | Industry split; v1 is one |
| OD-PROMO-2 | First-order / lapsed / member segments? | Marketplace pattern; amealio has no segment product |
| OD-PROMO-3 | Who funds global promotions (ADMIN vs MERCHANT vs SPLIT math)? | Field exists; finance |
| OD-PROMO-4 | Delivery-fee promotions? | Delivery vertical + geo |
| OD-PROMO-5 | Account saved-promotions book? | Legacy never shipped; default no |

---

## 9. Closed doors

Do not implement [99](./99-CONSUMER-OFFERS-COUPONS-TARGET-BEHAVIOR-CONTRACT.md) browse-only.  
Do not reopen Favorites, Profile, Addresses, Order Tracking.  
Do not touch checkout, cart, payment, or orders in the name of this document.  
Do not resurrect pre-payment usage mutation.
