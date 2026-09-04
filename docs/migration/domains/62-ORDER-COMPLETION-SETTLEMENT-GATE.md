# 62 — Order-Completion Settlement-Eligibility Gate (P1.7.33)

> **Type:** IMPLEMENTATION (bounded foundation) — add the legacy `order_status = COMPLETED` condition to settlement eligibility. **No schema change, no migration.**
> **Governing gate:** [61-COMMISSION-SETTLEMENT-TIMING-FOUNDATION.md](./61-COMMISSION-SETTLEMENT-TIMING-FOUNDATION.md) §4/§14; builds on [60-SETTLEMENT-PAYOUT-FOUNDATION.md](./60-SETTLEMENT-PAYOUT-FOUNDATION.md).
> **Authority:** legacy `amealio-vendordashboard` `settlement.class.ts:552-567` + target `prisma/schema.prisma` (`OrderStatus`). Baseline **P1.7.32 `93227df`, 385/385 → 387/387**.

Evidence tags: **VERIFIED**, **DEFERRED**.

---

## 1. Scope

Close the remaining settlement-eligibility gap from doc 61 §14: legacy settles a payment only when its **order is COMPLETED**. P1.7.31/32 gated only on payment capture + `settleAfter`; this slice adds the **order-completion** condition. Nothing else changes — no Super-Admin/Merchant/User/Delivery/UI work, no historical migration, coupon logic untouched.

## 2. Legacy evidence (VERIFIED)

`settlement.class.ts:552-567` — the ordering settlement `$match` requires, in addition to `settleAfter` window + `payment_status = COMPLETED` + `settleInprogress = false` + `settleOrderAmount = false`:

```
$or: [
  { order_status = COMPLETED },
  { order_status = CANCELLED AND delivery_partner = 2 AND settlementReady = true }
]
```

So the **primary rule is `order_status = COMPLETED`**. The second branch is a **Dunzo (delivery) rider-not-found partial-settlement** case (`ordering.class.ts:4213-4222`) — delivery-domain, out of the current India baseline.

## 3. Target implementation

`SettlementRepository.findEligibleContributions` now additionally filters `order.status = 'COMPLETED'` (target `OrderStatus.COMPLETED`, P1.7.12 lifecycle). A payment whose order has not reached `COMPLETED` is not settleable, even if captured and past its `settleAfter` window. This composes with the P1.7.32 gates (capture + `settleAfter`) and all P1.7.31 invariants (settle-once, merchant isolation, refund deduction, exact commission, payout = net). No schema change (a query-filter condition only).

## 4. Deferred

The legacy **cancelled + Dunzo-`delivery_partner=2` + `settlementReady`** partial-settlement branch is **DEFERRED** — it depends on the delivery domain (`delivery_partner`/`settlementReady` are legacy delivery-runtime fields not modeled in the target, and delivery is out of the current baseline). Documented as **DR-SETTLE-CANCELLED-PARTIAL** (a future delivery-settlement decision). No delivery fields were invented.

## 5. Financial invariants (tested)

Order must be COMPLETED to settle; a non-completed (but captured + past-window) order is excluded; a completed order settles; mixed sets settle only the COMPLETED ones. All P1.7.32 behavior preserved.

## 6. Tests

`apps/api/test/settlement-payout.e2e-spec.ts` (+2 tests; the settle-eligible `capture()` helper now also advances the order to `COMPLETED` via the P1.7.12 status lifecycle): "does NOT settle a payment whose order is not COMPLETED" and "settles only COMPLETED orders, excluding an otherwise-eligible non-completed one". Full suite **387/387** (385 prior + 2). All prior settlement/payment/refund behavior unchanged.

## 7. Decisions

- **RESOLVED:** settlement eligibility now requires `order_status = COMPLETED` (VERIFIED legacy primary rule).
- **BLOCKED — OWNER/DATA:** DR-02b/c/d/e (historical migration only; unaffected).
- **DEFERRED:** DR-SETTLE-CANCELLED-PARTIAL (Dunzo cancelled partial settlement — delivery domain); plus the P1.7.32 deferrals (DR-03a GST-on-commission, DR-COMM-BASIS, DR-COMM-CLAWBACK, per-restaurant window, auto-settlement cron, live RazorpayX HTTP).

## 8. Recommended P1.7.34

**DR-COMM-BASIS resolution** — reconcile the exact commissionable basis (legacy = `base_amount`/subtotal minus vendor-funded discount, excluding tax/delivery/tips; the target currently commissions on the net-of-refund captured amount) once the GST/fee model (DR-03a) owner input is available. This is the last open economic accuracy item in the settlement chain. Alternatively, an **order-completion → auto-eligibility** notification/derivation slice (still no cron), or begin the **delivery-domain reconciliation** that DR-SETTLE-CANCELLED-PARTIAL depends on.
