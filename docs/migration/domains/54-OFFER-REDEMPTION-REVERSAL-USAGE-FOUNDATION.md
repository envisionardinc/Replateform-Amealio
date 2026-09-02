# 54 — Order Cancellation / Coupon Redemption Reversal + Usage Semantics Reconciliation (P1.7.25)

> **Type:** IMPLEMENTATION (bounded) + reconciliation sub-phase for `useLimit`/`useFrequency`. **No schema change; no migration.**
> **Governing gate:** [53-OFFER-REDEMPTION-DISCOUNT-FOUNDATION.md](./53-OFFER-REDEMPTION-DISCOUNT-FOUNDATION.md) (P1.7.24).
> **Authority:** legacy `amealio-vendordashboard` (`usercart.class.ts`, `services/offers/user-offer.class.ts`, `helpers/autoCancel.ts`, `models/offers.model.ts`) + target `prisma/schema.prisma` + P1.7.12/P1.7.24 ordering module. Baseline **293/293 → 305/305**.

---

## 1. Legacy cancellation behavior

`helpers/autoCancel.ts` (cron + manual cancel) sets the order status to cancelled and, **separately**, releases coupon usage: it finds the **last** `offerUsedBy` entry for the order's `user_id`, splices it out, and decrements the mutable counter — `offersModel.update({_id}, { $set:{ offerUsedBy: usedBy }, $inc:{ offerUsed: -1 } })` (`autoCancel.ts:797-806`). This is **not transactional** with the order-status write (two independent Mongo updates — a legacy consistency risk) and removes exactly **one** use per cancellation. There is **no** standalone refund→usage logic: `RefundOrder(...)` is invoked on the cancel path but performs no offer-usage change; a refund that is not a cancellation does not release usage (doc 52 finding).

## 2. Target cancellation behavior (implemented)

The authoritative target cancellation path is the existing **`OrderService.transitionStatus(principal, orderId, 'CANCELLED')`** (P1.7.12) — merchant-tenant-scoped, validated against the native `OrderStatus` transition graph (`INITIAL|PENDING|CONFIRMED|PREPARING|PACKING|READY → CANCELLED`; terminal states have no outgoing edges). No parallel cancellation API was created. `OrderRepository.updateStatusWithEvent` performs the status change, the `OrderStatusEvent`, and — when `toStatus = CANCELLED` — the redemption reversal, **all in one `prisma.$transaction`** (introduced in P1.7.24, hardened here).

## 3. CouponRedemption lifecycle

`ACTIVE` at order placement (commit point, P1.7.24) → `REVERSED` on order cancellation (P1.7.25). No third state, no second record, no mutable `Offer` counter. Usage is always **derived** from `ACTIVE` rows.

## 4. ACTIVE → REVERSED transition

On cancellation the transaction runs `UPDATE "CouponRedemption" SET status='REVERSED', reversedAt=now() WHERE orderId=$id AND status='ACTIVE'`. The `status='ACTIVE'` predicate makes it **exactly-once**: an already-`REVERSED` row is not matched (stays `REVERSED`, `reversedAt` not re-stamped), and a redemption belonging to a different order is never touched (scoped by `orderId`).

## 5. Usage derivation

Unchanged from P1.7.24 and consistent with the reversal: total usage = `COUNT(CouponRedemption WHERE couponId=? AND status='ACTIVE')`; per-user usage adds `AND userId=?`. Because a reversed row is no longer `ACTIVE`, cancellation **releases** both `maxUsageLimit` and `perUserLimit` capacity (tested). No `offerUsed`/`offerUsedBy` counter exists or was added.

## 6. Transaction boundary

```
BEGIN
  compare-and-set: UPDATE Order SET status=CANCELLED WHERE id=? AND status=<fromStatus>   -- 1 row
  INSERT OrderStatusEvent(from=<fromStatus>, to=CANCELLED)
  UPDATE CouponRedemption SET status=REVERSED, reversedAt=now() WHERE orderId=? AND status=ACTIVE
COMMIT
```

Any failure rolls back the whole unit — the state can never be `Order=CANCELLED` with an `ACTIVE` redemption, nor a `REVERSED` redemption on a non-cancelled order.

## 7. Idempotency behavior

Two layers:

- **Upstream (sequential):** `CANCELLED` is terminal, so a second `transitionStatus(…, 'CANCELLED')` is rejected by the transition graph (`BadRequestException`) before any write — no second reversal.
- **Transactional (concurrent):** the status update is a **compare-and-set** (`updateMany WHERE id=? AND status=<fromStatus>`). Under a read-then-write race (status is read outside the tx by the service), exactly one concurrent writer's update affects a row; the loser affects **0 rows** and returns as an idempotent no-op. Thus the `OrderStatusEvent` and the reversal happen **at most once** even under concurrent cancellation. Sequential (already-validated) transitions always affect exactly one row, so P1.7.12 behavior is unchanged.

## 8. Concurrency behavior

The reversal `updateMany(status=ACTIVE→REVERSED)` is itself race-safe: two concurrent statements targeting the same `ACTIVE` row serialize on the row lock; the second re-evaluates `status='ACTIVE'` against the now-`REVERSED` row and matches 0 rows. Combined with the compare-and-set on the order, concurrent cancellation yields **one** `CANCELLED` event and **one** `REVERSED` redemption (tested). This composes with P1.7.24's per-coupon `SELECT … FOR UPDATE` on the placement side (different code path; no shared lock needed because reversal is keyed by `orderId`).

## 9. Refund / payment boundary

**Not implemented.** No Razorpay, capture, authorize, retry, webhook, `PaymentIntent`/`PaymentAttempt`/`Transaction` change, or payment-linked redemption behavior. The target has no authoritative refund lifecycle to own usage reversal.

> Cancellation reversal is implemented. Payment/refund reversal remains deferred until the target payment lifecycle establishes the authoritative refund commit point.

The P1.7.24 decision is preserved: **order placement** is the redemption commit point until a real payment module defines a different boundary.

## 10. `useLimit` evidence

Enforced identically in two independent legacy paths:

- Apply/order path — `usercart.class.ts:1244-1254`: within `if (offer?.isGlobal)`, filter `offerUsedBy` to the **current user** AND `start < timestamp < end`, then block when `users.length >= offer.useLimit`.
- Listing/availability path — `user-offer.class.ts:257-268`: same per-user + windowed filter, `users.length >= off.useLimit` marks the offer unavailable.

So **`useLimit` = maximum redemptions by a single user within one `useFrequency` calendar period.** It is gated to **global offers** in legacy and is per-user. (`maximum_usage_limit` → target `maxUsageLimit` is the separate all-offers global total; `maxUsage` → target `perUserLimit` is the per-user lifetime cap.)

## 11. `useFrequency` evidence

`models/offers.model.ts:58`: `enum ['DAILY','WEEKLY','MONTHLY','YEARLY']`. `usercart.class.ts:46-51`: `FREQUENCY_TIME = { DAILY:'day', WEEKLY:'week', MONTHLY:'month', YEARLY:'year' }`. Used as the moment unit for `moment().startOf(type)` … `moment().endOf(type)` — i.e. the **current calendar period** boundary. So **`useFrequency` = the calendar-period unit** of the `useLimit` window.

## 12. What was implemented

1. **Cancellation reversal hardening** — `updateStatusWithEvent` now uses a **compare-and-set** status update, making the status event + redemption reversal exactly-once and consistent under concurrency, while preserving P1.7.12 sequential behavior. (The reversal itself was introduced in P1.7.24; P1.7.25 hardens its atomicity/idempotency and adds full coverage.)
2. **12 integration tests** covering reversal, `reversedAt`, usage release, atomicity of a failed cancellation, no double-reversal, non-coupon orders, merchant scoping, other-order isolation, `maxUsageLimit`/`perUserLimit` release, and concurrent cancellation.

No schema change and no migration were required — the P1.7.24 `CouponRedemption` model (`status`, `reversedAt`, derived usage) already supports reversal.

## 13. What remains UNKNOWN

`useLimit`/`useFrequency` **enforcement** is deferred (CASE B). The *rule* is source-established (§10–11), but faithful enforcement needs two details that are **not** established by source — they were implicit in the legacy runtime, not in code:

- **Calendar timezone anchor** — legacy `moment()` uses the server's local timezone; the target stores `createdAt` in UTC. "Which calendar day/week/month" depends on the timezone (UTC vs `Asia/Kolkata` for this India-first product). Choosing one changes when a user's limit resets.
- **Week-start convention** — `moment().startOf('week')` depends on the locale (default Sunday); ISO-8601 is Monday. This changes the `WEEKLY` window boundary.

Also unresolved from source: whether the target should keep the legacy **global-offers-only** gating for `useLimit`/`useFrequency` (P1.7.24 already applies `perUserLimit` to all offers, a documented strengthening).

Picking any of these = inventing reset-window semantics, which this slice explicitly forbids. Fields are preserved and **not enforced** at runtime; P1.7.24 behavior is unchanged.

## 14. Deferred owner decisions

- **OD-USG-1:** Calendar timezone anchor for `useFrequency` windows (recommend **UTC**, or `Asia/Kolkata` if the product defines per-IST calendar days).
- **OD-USG-2:** Week-start convention for `WEEKLY` (recommend **ISO-8601 / Monday**).
- **OD-USG-3:** Whether `useLimit`/`useFrequency` (and `perUserLimit`) enforcement is gated to global offers (legacy) or applied whenever configured (P1.7.24 precedent for `perUserLimit`).
- **OD-REF-1:** Refund-driven usage reversal commit point — deferred until a payment/refund lifecycle exists.

## 15. Recommended next slice

**P1.7.26 — Usage-frequency enforcement + payment/refund commit-point foundation:** once OD-USG-1/2/3 are decided, implement `useLimit`/`useFrequency` as a per-user, per-calendar-period cap derived from `ACTIVE` redemption `createdAt` (enforced under the existing per-coupon lock); and, when a target payment module lands, revisit whether the redemption commit point and reversal move from order placement/cancellation to payment capture/refund (OD-REF-1). No payment code should be written before that module exists.
