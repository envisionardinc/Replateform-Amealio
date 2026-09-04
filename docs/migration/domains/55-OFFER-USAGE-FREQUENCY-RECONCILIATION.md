# 55 — Offer Use-Limit / Use-Frequency Reconciliation (P1.7.26A)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no application code, no Prisma schema, no migration, no tests. Resolves the three usage-frequency owner decisions left open by P1.7.25 (OD-USG-1/2/3).
> **Governing gate:** [54-OFFER-REDEMPTION-REVERSAL-USAGE-FOUNDATION.md](./54-OFFER-REDEMPTION-REVERSAL-USAGE-FOUNDATION.md) (P1.7.25).
> **Authority:** legacy `amealio-vendordashboard` + customer `amealio_web_app` + target `replatform-amealio`. Baseline **305/305** (unchanged — documentation only).

---

## 1. Executive summary

The three unknowns from P1.7.25 are now **RESOLVED from source**:

- **OD-USG-1 (timezone anchor): RESOLVED = `Asia/Kolkata` (IST, UTC+05:30).** The legacy process pins `process.env.TZ = "Asia/Kolkata"` and the offer window uses bare `moment()` (no `.tz`), so all calendar boundaries are IST.
- **OD-USG-2 (WEEKLY week-start): RESOLVED = Sunday.** moment `2.29.0` with no locale override → default `en` locale → `startOf('week')` = Sunday.
- **OD-USG-3 (gating): RESOLVED = enforced only when `offer.isGlobal === true`.** Both the cart-apply and offer-listing paths wrap the per-user (`maxUsage`) and per-period (`useLimit`/`useFrequency`) checks in `if (isGlobal)`. `maximum_usage_limit` (global total) is enforced for all offers.

The **legacy rule** (per-user redemptions within an IST calendar period, global-offer-gated) can be represented in the target **without mutable counters**, using derived queries over `CouponRedemption` (`status`, `createdAt`, `userId`, `couponId`). The existing P1.7.24 per-coupon `SELECT … FOR UPDATE` lock is **sufficient** to serialize the check.

One **target design decision** remains (not a legacy unknown): whether to keep the legacy **global-only gating** or apply the limit to all offers (P1.7.24 already applies `perUserLimit` to all offers as a documented strengthening). No implementation in this slice.

## 2. Legacy source evidence

Repositories inspected: `amealio-vendordashboard` (legacy backend), `amealio_web_app` (customer), `replatform-amealio` (target). Searches covered `useLimit`, `useFrequency`, `offerUsed`, `offerUsedBy`, `frequency`, `daily/weekly/monthly/yearly`, coupon/offer validation/application/redemption, cancellation, refund, payment failure, cron/jobs, and timezone/locale handling.

Field definition — `models/offers.model.ts:57-59`:

```
useLimit:     { type: Number },
useFrequency: { type: String, enum: ['DAILY','WEEKLY','MONTHLY','YEARLY'] },
maxUsage:     { type: Number },
```

Frequency→unit map — `services/usercart/usercart.class.ts:46-51`:

```
const FREQUENCY_TIME = { DAILY:'day', WEEKLY:'week', MONTHLY:'month', YEARLY:'year' };
```

Process timezone — `src/app.ts:26` and `src/index.ts:12`:

```
process.env.TZ = "Asia/Kolkata";
```

moment import/version — `usercart.class.ts:18` / `user-offer.class.ts:18`: `import moment from "moment";`, `package.json:89`: `"moment": "2.29.0"`. No `moment-timezone`, `.tz(`, `utcOffset`, `moment.locale`, `updateLocale`, or `defineLocale` anywhere in `src` (confirmed by search).

## 3. Legacy execution paths

- **Cart validation (apply-time check)** — `services/usercart/usercart.class.ts:1221-1270`: validates date window, `maximum_usage_limit` (all offers), then `if (offer?.isGlobal)` → per-user `maxUsage` + per-period `useLimit`/`useFrequency`, then `service_type`, then `minimum_order_applied`.
- **Offer listing / availability** — `services/offers/user-offer.class.ts:241-278`: `if (off?.isGlobal && tokenData?.sub)` → same per-user + per-period checks to mark an offer available/unavailable.
- **Coupon apply / usage record** — `services/offers/user-offer.class.ts:46-113` (POST `/user/offers`) and `services/offers/offers.hooks.ts:305-357`: checks `maximum_usage_limit`, then `$inc offerUsed` (unless `repeatOffer`) and pushes `offerUsedBy {user_id, timestamp}` — **records usage at coupon apply** (not gated by `isGlobal`).
- **Order/payment record** — `services/ordering/user-ordering.class.ts:3522-3540`: on the payment-success branch, pushes a **second** `offerUsedBy {user_id, timestamp}` + `$inc offerUsed:1`, and deactivates the offer when `offerUsedBy.length+1 >= maximum_usage_limit`. This is the legacy **double-count** (apply + payment), which P1.7.24 eliminates with a single `CouponRedemption` at the commit point.
- **Cancellation release** — `user-ordering.class.ts:3286-3308`, `ordering.class.ts:6302-6313`, `helpers/autoCancel.ts:796-806`: when `order_status === CANCELLED`, remove the user's last `offerUsedBy` entry (`lastIndexOf(user_id)` → `splice`) and `$inc offerUsed:-1`.
- **Customer app** — `amealio_web_app`: **no** references to `useLimit`/`useFrequency`/`offerUsed`/`offerUsedBy`; the frontend does not enforce or mutate usage (backend-owned).

## 4. `useLimit` semantics

`useLimit` = the maximum number of redemptions **a single user** may make **within one `useFrequency` calendar period**. Evidence — `usercart.class.ts:1244-1254`:

```
let users = offer.offerUsedBy.filter(e => e.user_id == user_id);      // per-user
if (users.length >= offer.maxUsage) err = ...;                        // lifetime per-user cap
users = offer.offerUsedBy.filter(e =>
  e.user_id == user_id && start < e.timestamp && end > e.timestamp);  // per-user, in window
if (users.length >= offer.useLimit) err = ...;                        // per-period per-user cap
```

Mirrored in `user-offer.class.ts:257-268`. The check counts **prior** redemptions in the window and blocks when `count >= useLimit`; the redemption being attempted is not pre-counted, so effectively **≤ `useLimit` redemptions per user per period**. Boundary comparison is **strict** (`start < timestamp < end`), so a redemption whose timestamp equals `startOf(period)` is excluded (an edge nuance).

## 5. `useFrequency` semantics

`useFrequency` selects the **calendar-period unit** for the `useLimit` window: `DAILY→day`, `WEEKLY→week`, `MONTHLY→month`, `YEARLY→year` (`FREQUENCY_TIME`). The window is `moment().startOf(unit)` … `moment().endOf(unit)` — the **current calendar period**, i.e. reset at the calendar boundary (not a rolling window, not anchored to first redemption or offer validity start).

## 6. OD-USG-1 — timezone anchor

**RESOLVED = `Asia/Kolkata` (IST, UTC+05:30).**

- Evidence: `src/app.ts:26` and `src/index.ts:12` set `process.env.TZ = "Asia/Kolkata"`; the offer window uses bare `moment().startOf(type)`/`endOf(type)` (`usercart.class.ts:1236-1237`, `user-offer.class.ts:248-249`) with a plain `moment` import and **no** timezone conversion, so periods are computed in the process-local timezone = IST.
- Not anchored to restaurant/user timezone: `restaurant.model.ts` has unused `timezone` / `timeZoneOffset` fields, but the offer path never reads them. No browser/user timezone is used (checks are server-side).
- No code-path disagreement: every offer usage-frequency path uses the same bare `moment()`.
- **Target recommendation:** compute period boundaries in **`Asia/Kolkata`** (store the anchor as an explicit platform/offer timezone constant rather than relying on `process.env.TZ`, since the target stores `createdAt` in UTC). **Do not use UTC boundaries** — that would shift the reset by 5.5 hours vs legacy.

## 7. OD-USG-2 — WEEKLY week-start

**RESOLVED = Sunday.**

- Evidence: moment `2.29.0` (`package.json:89`), plain `import moment from "moment"`, and **no** `moment.locale` / `updateLocale` / `defineLocale` / `dow` anywhere in `src` (confirmed by search). moment's default locale is `en`, whose `dow = 0` (Sunday), so `startOf('week')` = Sunday 00:00 and `endOf('week')` = Saturday 23:59:59.999 (in IST per OD-USG-1). Other unrelated `startOf('week')` call sites (`user-events-filter.class.ts:115`, `pageStats/adminPageStats.class.ts:46`, `filter-user-offer.class.ts:120`) rely on the same default.
- **Target recommendation:** WEEKLY window = **Sunday → Saturday** (IST). **Do not** use ISO-8601 (Monday) week semantics.

## 8. OD-USG-3 — global gating

**RESOLVED = enforced only when `offer.isGlobal === true`.**

- Evidence: `usercart.class.ts:1234` `if (offer?.isGlobal && !err) { … maxUsage … useLimit … }`; `user-offer.class.ts:242` `if (off?.isGlobal && tokenData?.sub) { … maxUsage … useLimit … }`. The per-user (`maxUsage`) and per-period (`useLimit`/`useFrequency`) checks are inside the `isGlobal` branch in **both** paths.
- `maximum_usage_limit` (global total across all users) is enforced **outside** the `isGlobal` gate — for all offers (`usercart.class.ts:1230`, `user-offer.class.ts:56-57`).
- The **order-creation** path (`user-ordering.class.ts`) does **not** re-check `useLimit`/`useFrequency`; it only records usage. The **customer app** performs no frequency logic. So there is no divergent additional enforcement path.
- **Target recommendation / open design choice:** legacy gates `maxUsage` **and** `useLimit`/`useFrequency` to global offers. P1.7.24 already enforces `perUserLimit` (= legacy `maxUsage`) for **all** offers — a documented strengthening. The owner must choose whether `useLimit`/`useFrequency` follows the legacy **global-only** gate or the P1.7.24 **all-offers** precedent. Recommendation: apply whenever `useLimit` **and** `useFrequency` are configured (consistent with P1.7.24’s `perUserLimit` strengthening), documented as an intentional divergence — but this is an owner decision, not a legacy unknown.

## 9. Cancellation interaction

Legacy releases one usage slot on cancellation: when `order_status === CANCELLED`, the user's last `offerUsedBy` entry is spliced and `offerUsed` decremented (`user-ordering.class.ts:3286-3308`, `ordering.class.ts:6302-6313`, `autoCancel.ts:796-806`). The target already models this (P1.7.25): `ACTIVE → REVERSED` + `reversedAt`, scoped by `orderId`, exactly-once. **Do not change** this behavior. Under a per-period derived count, a `REVERSED` redemption drops out of the window count, releasing the period slot — exactly matching legacy.

## 10. Refund interaction

Legacy releases usage **only** through the `CANCELLED` branch above. `RefundOrder(...)` (invoked on the auto-cancel path, `autoCancel.ts`) performs **no** independent `offerUsedBy`/`offerUsed` mutation. A standalone refund that is not a cancellation does **not** release usage (consistent with doc 52 / P1.7.23). **Target:** refund-driven reversal remains **deferred** until a payment/refund lifecycle exists (OD-REF-1); do not implement here.

## 11. Payment-failure interaction

Legacy records usage at **two** points: coupon apply (`user-offer.class.ts:87,103-107` / `offers.hooks.ts:346-357`, independent of payment) and payment success (`user-ordering.class.ts:3523-3530`). There is **no** automatic release on payment failure — an apply-time `offerUsedBy` entry persists even if payment never completes and the order is never cancelled (a legacy usage leak / double-count). **Target:** P1.7.24 avoids this by writing **one** `CouponRedemption` at the order-placement commit point (no separate apply-time record); payment is not yet modeled, so there is no payment-failure release to implement in the target now.

## 12. Target mapping

The rule maps onto existing target structures with **no schema change**:

- Config: `Offer.useLimit` (Int?), `Offer.useFrequency` (String? `DAILY|WEEKLY|MONTHLY|YEARLY`) — already present (P1.7.22).
- Usage source of truth: `CouponRedemption` (`status`, `createdAt`, `userId`, `couponId`) — already present (P1.7.24/P1.7.25).
- Enforcement (future P1.7.26B): inside the order-creation transaction, after the existing `SELECT … FOR UPDATE` on the coupon, when `useLimit` and `useFrequency` are configured and `userId` is present, compute `[periodStart, periodEnd]` for `now` in **Asia/Kolkata** (Sunday-start for WEEKLY) and reject when
  `COUNT(CouponRedemption WHERE couponId=? AND userId=? AND status='ACTIVE' AND createdAt ∈ [periodStart, periodEnd]) >= useLimit`.
- `ACTIVE`/`REVERSED` fully represents the rule: reversed rows are excluded, so cancellation releases the period slot. No mutable `offerUsed`/`offerUsedBy` counters are needed or permitted.

## 13. Concurrency requirements

The existing P1.7.24 per-coupon `SELECT id FROM "Coupon" WHERE id = ? FOR UPDATE` (held inside the order-creation transaction) **is sufficient** to serialize the windowed per-user check — it is the same mechanism that already protects `maxUsageLimit`/`perUserLimit`:

- **Two users, same coupon:** serialize on the coupon row; each observes the other's committed `ACTIVE` rows. `useLimit` is per-user, so cross-user contention only matters for the separate `maxUsageLimit` (already handled).
- **Same user, two simultaneous redemptions:** serialize on the coupon row; the second counts the first's committed row within the window → correctly blocked at the boundary. No over-subscription.
- **`useLimit = 1` vs `> 1`:** identical mechanism; the `>= useLimit` comparison under the lock is exact.
- **Cancellation concurrent with a redemption of the same coupon:** the redemption holds the coupon lock; the cancellation reversal (P1.7.25) mutates a **different** `CouponRedemption` row keyed by `orderId` and does **not** take the coupon lock. Worst case, an in-flight redemption counts a soon-to-be-`REVERSED` row (fail-closed / conservative — never over-allows). If strict serialization of cancel-vs-redeem is desired, the reversal could additionally acquire the coupon `FOR UPDATE` lock; this is an implementation refinement, **not** a correctness requirement.
- **Global max usage present:** `maxUsageLimit` (total) and the per-user period check both run under the same coupon lock → jointly consistent.

No additional locking or database constraint is required for correctness. (A partial/functional unique index cannot express a per-period count, so a query-derived check under the existing lock remains the right approach.)

## 14. Required owner decisions

- **OD-USG-1 — timezone anchor:** RESOLVED (legacy = IST). Target decision: adopt `Asia/Kolkata` as the fixed anchor (recommended) vs. a future per-restaurant timezone.
- **OD-USG-2 — WEEKLY week-start:** RESOLVED (legacy = Sunday). Target decision: adopt Sunday-start (recommended) to match legacy.
- **OD-USG-3 — gating scope:** RESOLVED (legacy = global-only). Target decision (open): follow legacy global-only vs. apply whenever configured (P1.7.24 `perUserLimit` precedent — recommended, documented divergence).
- **OD-REF-1 — refund reversal:** deferred until a payment/refund lifecycle exists.
- **Boundary inclusivity:** legacy uses strict `<`/`>`; target should use `createdAt ∈ [startOf, endOf]` inclusive (recommended) — a negligible, documented refinement.

## 15. Implementation recommendation

**Recommended next slice — P1.7.26B (implementation, bounded):** enforce `useLimit`/`useFrequency` as a per-user, per-calendar-period cap derived from `ACTIVE` `CouponRedemption.createdAt`, anchored to **`Asia/Kolkata`** with **Sunday-start** weeks, applied whenever `useLimit`+`useFrequency` are configured and the order has a `userId`, evaluated inside the existing order-creation transaction under the existing per-coupon `FOR UPDATE` lock. No schema change, no new migration, no mutable counters. Add integration tests for each frequency unit including IST calendar-boundary timestamps (DAILY/WEEKLY(Sunday)/MONTHLY/YEARLY), `useLimit > 1`, cancellation releasing a period slot, and concurrent same-user redemption. Do **not** move the payment commit point or implement refund handling.

## 16. Explicit UNKNOWNs

None for the legacy semantics — OD-USG-1/2/3 are all RESOLVED from source. Residual items are **target design choices** (OD-USG-3 gating adoption, boundary inclusivity, IST-fixed vs per-restaurant timezone) and **OD-REF-1** (refund reversal), all recorded above.

## 17. Deferred functionality

- Enforcement of `useLimit`/`useFrequency` (implementation P1.7.26B).
- Refund-driven usage reversal (OD-REF-1; requires a payment/refund lifecycle).
- Payment capture/authorize/retry/webhooks, settlement/SPLIT, code-less offers, Cart runtime, Experience promotions — all remain out of scope and unchanged.
