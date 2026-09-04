# 53 — Offer Redemption & Server-Side Discount at Order Creation (P1.7.24)

> **Type:** IMPLEMENTATION (bounded slice) — server-authoritative offer discount + an idempotent, reversible `CouponRedemption` ledger, integrated into the EXISTING P1.7.12 order-creation path. One additive migration.
> **Governing gate:** [52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md](./52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md) (DEC-OFF-1 + DEC-OFF-3).
> **Authority:** legacy `amealio-vendordashboard` (`OrderingCalculations.js`, `usercart.class.ts`, `offers.model.ts`) + target `prisma/schema.prisma` + P1.7.12 `ordering` module. Baseline **268/268 → 293/293**.

---

## 1. Scope

Extend canonical order creation so that, when a coupon is applied, **the server owns the discount and the grand total**. Implemented:

- **Offer validation** at order creation (existence, active, soft-delete, validity window, coupon match, restaurant/merchant/global scope, order-amount gates, service type, usage limits).
- **Server-side discount calculation** (percentage / fixed + cap) against the server-authoritative subtotal.
- **`CouponRedemption` ledger** extended into a status-bearing, reversible, idempotent record.
- **Order integration** to persist the applied offer/coupon and the authoritative discount.
- **Usage-limit enforcement** derived from ACTIVE redemptions, concurrency-safe under a per-coupon row lock.
- **Idempotent redemption creation** (DB unique constraint).

**Out of scope (unchanged / deferred):** Cart runtime, Razorpay/payment authorize/capture/retries/callbacks, refund workflow, Experience booking/promotions, settlement/SPLIT calculation, UI, public coupon-validation API, generic promotion/rules/pricing engine. **No payment or Experience-booking behavior was implemented; P1.7.18/P1.7.20/P1.7.22 behavior is untouched.**

## 2. Source evidence (discount semantics)

Per doc 50/52: legacy discount is **order-level percentage or fixed, capped** by `maximum_discount_applied` — no BOGO/free-item/item-category/experience/delivery/payment-method discounts. Legacy computes it in `OrderingCalculations.js` (frontend) + `usercart.class.ts` and **`POST /user-ordering` persists the client `total_amount`/discount without recomputation** (integrity risk). This slice implements **only** the two source-confirmed discount types and moves the computation server-side (DEC-OFF-1). Legacy `service_type[]` are free-form strings (Takeaway/Delivery/Dine-In); the target matches them against canonical `OrderType` tokens (§16, owner decision).

## 3. Target Offer integration

At `OrderService.createOrder`, an optional `couponCode` carries only the **intent**. The server resolves the coupon → offer (`OrderRepository.findAppliedOfferByCouponCode`), validates eligibility, computes the discount, and passes a `RedemptionDirective` into the order-creation transaction. No new controller/module dependency: the ordering module reads `Coupon`/`Offer` directly (the same DB), keeping the redemption write inside the order transaction. The P1.7.22 `OfferService` (configuration) is unchanged and not imported.

## 4. Coupon validation

The target represents the code with the existing **`Coupon`** (one per offer, `code @unique`) — no second coupon abstraction. Resolution is `Coupon.code → Coupon → Offer`. Validated: coupon exists (else `Invalid coupon code`), offer is not soft-deleted, offer is active. There is **no standalone coupon behavior**; the coupon only points at its offer. Code-less offers cannot be applied via this path (no code to supply, no coupon row to reference) — auto-applied code-less offers are deferred (§20).

## 5. Discount calculation

Pure functions in `apps/api/src/modules/ordering/domain/offer-discount.ts`:

- **Percentage:** `discount = floor(subtotalMinor × discountPercent / 100)` (BigInt truncation).
- **Fixed:** `discount = discountMinor`.
- **Cap:** `discount = min(discount, maxDiscountMinor)` when set.
- **Clamp:** `discount = min(discount, subtotalMinor)` (an offer discount never exceeds the items it applies to) and `≥ 0`.

Exactly one of `discountPercent` / `discountMinor` is expected (P1.7.22 enforces XOR at configuration); a mis-configured offer is rejected.

## 6. Order integration

`grandTotalMinor = subtotalMinor − discountTotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor`, preserving the existing `order_total_integrity` CHECK. When a coupon is applied, `discountTotalMinor` is the **server-computed** value and any client-supplied `discountTotalMinor` is **ignored**. Without a coupon, the existing P1.7.12 ad-hoc `discountTotalMinor` behavior is preserved (no offer involved). Tax/fee/delivery components are **not invented** — they remain exactly as P1.7.12 accepts them. The Order additively records `offerId` and `couponId`; the redemption reference is the `Order.couponRedemptions` back-relation.

## 7. CouponRedemption schema (extended additively)

`CouponRedemption` now carries:

| Field | Type | Meaning |
|-------|------|---------|
| `couponId`, `userId?`, `orderId?` | (existing) | coupon / customer / order |
| `status` | `RedemptionStatus` (`ACTIVE`\|`REVERSED`) | default `ACTIVE` |
| `discountAppliedMinor` | `BigInt?` | server-calculated discount snapshot |
| `reversedAt` | `DateTime?` | set when reversed |
| `createdAt` | (existing) | placement time |
| `@@unique([couponId, orderId])` | | idempotency invariant |
| `@@index([userId])` | | per-user usage counts |

**No `paymentIntent` linkage** was added — order placement is the commit point in this slice and payment linkage is not required for order-placement semantics (§14). No mutable `offerUsed`/`offerUsedBy` counters exist or were added.

## 8. Redemption status

Only two source/target-justified states: **`ACTIVE`** (created at successful order placement) and **`REVERSED`** (set when the order is cancelled). No generic state machine. `REVERSED` rows are excluded from usage counts, releasing usage.

## 9. Usage-limit enforcement

Usage is **derived** by counting `ACTIVE` redemptions — never a stored counter:

- **`maxUsageLimit`** (total): reject when `count(ACTIVE where couponId) ≥ maxUsageLimit`.
- **`perUserLimit`** (per-user lifetime): reject when `count(ACTIVE where couponId, userId) ≥ perUserLimit` (only when the order has a `userId`).

Both checks run **inside the order-creation transaction**, after acquiring the per-coupon lock, so the derived count already reflects any concurrent redemption.

## 10. Concurrency strategy

Inside the transaction we issue `SELECT id FROM "Coupon" WHERE id = $couponId FOR UPDATE` **before** counting. This row-locks the coupon, serializing concurrent redemptions of the **same** coupon: a competing transaction blocks until the first commits, then (READ COMMITTED) observes the newly-committed redemption in its own count and is correctly rejected. This makes the "last available usage" race impossible without any application-only pre-check. Different coupons never contend. Verified by the concurrent-placement test (two simultaneous placements against a `maxUsageLimit=1` offer → exactly one succeeds; exactly one `ACTIVE` row).

## 11. Idempotency

Two DB-enforced layers, no race-prone `if-exists-then-create`:

- **Order-level (retries):** the existing `Order.orderNumber @unique` (P1.7.12, caller-supplied reference). A retry with the same `orderNumber` fails at `order.create`, rolling back the whole transaction — so **no** duplicate order and **no** second redemption. No second idempotency framework was introduced.
- **Redemption-level:** `@@unique([couponId, orderId])` guarantees at most one redemption per (coupon, order).

## 12. Transaction boundary

One `prisma.$transaction` performs: lock coupon → enforce usage → create Order (+ items + initial `OrderStatusEvent`) → create `CouponRedemption`. Any rejection (usage exceeded, duplicate order number) rolls the whole thing back. The final state can never be **Order-without-redemption** (when an offer applied) or **redemption-without-Order**. Reuses the existing P1.7.12 Prisma transaction pattern; no generic transaction abstraction added.

## 13. Cancellation / reversal

P1.7.12 already exposes a cancellation path (the `→ CANCELLED` status transition). We integrate reversal into that **existing** path only: `updateStatusWithEvent`, when `toStatus === CANCELLED`, sets the order's `ACTIVE` redemptions to `REVERSED` (+ `reversedAt`) in the same transaction as the status update + event, releasing usage. **No new cancellation system** was built. **Refund-driven reversal is deferred** (no refund path exists yet).

## 14. Payment boundary

**No payment code was touched.** No Razorpay, authorize, capture, retry, callback, refund; `PaymentIntent`/`PaymentAttempt`/`Transaction` are untouched; redemption is **not** tied to capture. Per doc 52 the final payment-era commit point stays unresolved; for this slice the commit point is **order placement**. Payment remains downstream (P1.7.25+).

## 15. Security / integrity behavior

When a coupon is applied the server **never trusts** the client discount, offer discount amount, grand total, or coupon savings. The client may supply only the coupon identity; the server validates the offer and computes `discountTotalMinor` + `grandTotalMinor` from the server-priced subtotal, then persists them. Tests prove an inflated client discount and a reduced (zero) client discount are both ignored in favor of the server value. This closes the legacy client-authoritative-total injection risk (DEC-OFF-1).

## 16. Field mapping

| Legacy (`Offers` / order create) | Target |
|---|---|
| `discount` + `isPercentage` | `Offer.discountPercent` / `Offer.discountMinor` → server-computed `Order.discountTotalMinor` |
| `maximum_discount_applied` | `Offer.maxDiscountMinor` (cap) |
| `minimum_order_applied` / `maximum_order_applied` | `Offer.minOrderMinor` / `maxOrderMinor` (enforced vs subtotal) |
| `service_type[]` (free strings) | `Offer.serviceTypes` matched against canonical `OrderType` tokens / `ALL` |
| `start_date` / `end_date` | `Offer.validFrom` / `validTo` |
| `active` | `Offer.active` |
| `maximum_usage_limit` | `Offer.maxUsageLimit` (derived count enforced) |
| `maxUsage` | `Offer.perUserLimit` (derived count enforced) |
| `useLimit` / `useFrequency` | preserved config, **enforcement deferred** (§20) |
| `coupon_code` | existing `Coupon.code` |
| `offerUsed` / `offerUsedBy[]` (mutable) | **removed concept** → derived from `CouponRedemption` (ACTIVE) |
| client `total_amount` / `discount` (trusted) | **rejected** → server-authoritative `grandTotalMinor` / `discountTotalMinor` |

## 17. Schema changes (additive only)

- `enum RedemptionStatus { ACTIVE, REVERSED }`.
- `CouponRedemption` += `status` (default `ACTIVE`), `discountAppliedMinor BigInt?`, `reversedAt DateTime?`, `@@unique([couponId, orderId])`, `@@index([userId])`.
- `Order` += `offerId String? @db.Uuid` (FK → `Offer`, `ON DELETE SET NULL`), `couponId String? @db.Uuid` (FK → `Coupon`, `ON DELETE SET NULL`); `Offer`/`Coupon` gain virtual `orders Order[]` back-relations.

No historical migration modified; no destructive change to existing `CouponRedemption` data (all new columns nullable or defaulted).

## 18. Migration

`prisma/migrations/20260902160000_p1_7_24_offer_redemption_discount/` — creates the enum, adds the columns/indexes/unique/FKs. Applied to dev + test DBs; `prisma migrate status` up to date (11 migrations).

## 19. Tests

New suite `apps/api/test/offer-redemption.e2e-spec.ts` (25 real-Postgres integration tests): valid percentage / fixed / cap; min & max order gates; inactive / soft-deleted / expired / future rejected; invalid coupon; wrong-restaurant / wrong-merchant / service-type rejected; matching service type + `ALL`; global offer for SUPER_ADMIN; merchant tenancy; **client inflated & reduced discount ignored**; ACTIVE redemption with discount snapshot; no-coupon path creates no redemption; max-usage & per-user limits; **concurrent placement cannot oversubscribe**; idempotent repeated order (no duplicate redemption); cancellation reverses redemption and releases usage. Full suite **293/293** (268 prior + 25), 34 suites.

## 20. Deferred functionality

- **`useLimit` / `useFrequency` (per-period) enforcement** — semantics still under-specified (window anchoring / timezone / global-vs-per-user); config preserved, **not enforced** (owner decision → P1.7.25).
- **Code-less offer auto-application** — the ledger is coupon-keyed; offers without a coupon can't be redeemed via order-create yet.
- **Refund-driven reversal** — no refund path exists (P1.7.25).
- **Payment-capture commit point / payment linkage on redemption** — deferred until a payment module exists.
- **Cart runtime, settlement/SPLIT, Experience promotions, public coupon validation, UI** — out of scope.

## 21. UNKNOWNs

- Exact intended vocabulary for `serviceTypes` in the target (legacy free-form) — assumed canonical `OrderType` tokens; import normalization is an owner decision.
- Whether `useLimit`/`useFrequency` is per-user or global per period, and its window anchoring — unresolved (deferred).

## 22. Owner decisions

- **DEC-OFF-1 (server-authoritative discount):** IMPLEMENTED.
- **DEC-OFF-3 (idempotent reversible redemption at commit point = order placement):** IMPLEMENTED.
- **serviceTypes vocabulary = canonical OrderType tokens** (documented; requires import-time normalization of legacy strings).
- **Usage-limit reject-whole-order:** when an applied coupon fails usage enforcement, the entire order creation is rejected (no silent price change).

## 23. Recommended P1.7.25

**Order cancellation / refund reversal + per-period usage (`useLimit`/`useFrequency`) foundation** — formalize the cancellation/refund write path (beyond the current status transition), resolve and enforce per-period usage semantics, and (when a payment module lands) revisit the redemption commit point (order placement → payment capture) and optional `paymentIntent` linkage.
