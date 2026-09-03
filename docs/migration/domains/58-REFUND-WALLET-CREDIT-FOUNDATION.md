# 58 — Refund + Wallet-Credit Foundation (P1.7.29)

> **Type:** IMPLEMENTATION (bounded foundation) — wallet-credit refund against a captured payment, with full-refund coupon reversal. One additive migration (`Refund.idempotencyKey`).
> **Governing gate:** [56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md](./56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md) (P1.7.27), [57-PAYMENT-VERIFIED-CAPTURE-FOUNDATION.md](./57-PAYMENT-VERIFIED-CAPTURE-FOUNDATION.md) (P1.7.28).
> **Authority:** target `prisma/schema.prisma` + reconciled legacy refund behaviour (doc 56 §16/§17). Baseline **P1.7.28 `10d2c9c`, 340/340 → 351/351**.

---

## 1. Scope

The smallest safe refund foundation (doc 56 §36, doc 57 §15): issue a **WALLET** refund (full or partial) against a **CAPTURED** `PaymentIntent`, crediting the customer `Wallet` through a `WalletEntry` ledger + one `Transaction`, and — on a **full** refund — reversing the order's `ACTIVE` `CouponRedemption` (**OD-REF-1**). Refunds are wallet-only, matching the reconciled legacy ordering behaviour (doc 56 §16). New service/repository in the existing `apps/api/src/modules/payment/`.

**Not in scope** (deferred): settlement/`SettlementItem`/`Payout`/RazorpayX; live Razorpay refund API; async refund states; any historical refund/wallet/transaction migration; DR-02b/c/d/e resolution; commit-point relocation.

## 2. Full/partial refund semantics

- **Full refund:** `amountMinor` omitted → the remaining refundable amount; or a partial that brings cumulative refunds to the captured amount. Sets `PaymentIntent → REFUNDED` and reverses the coupon (§7).
- **Partial refund:** `0 < amountMinor < remaining` → wallet credit + transaction; `PaymentIntent → PARTIALLY_REFUNDED`; **coupon unchanged** (§7).
- **Remaining refundable** = `captured − Σ(PROCESSED refunds)`. Rejects `amount <= 0` and `amount > remaining`. The **sum of successful refunds can never exceed the captured amount** (enforced under a per-intent row lock, §6).

## 3. Wallet-credit behaviour

The refund credits the order's **customer** `Wallet` (target `Wallet` is user-owned, `userId @unique`). Balance model: `Wallet.balanceMinor` is authoritative; every credit writes a `WalletEntry` (`direction=CREDIT`, `amountMinor`, `balanceAfterMinor` = running balance, `refType='REFUND'`, `refId=<refundId>`). Balance reconciles to entries via `balanceAfterMinor`. A refund for an order with **no customer** (`userId` null / guest) is rejected (no wallet owner) — documented limitation.

## 4. Transaction behaviour

One authoritative `Transaction` per refund: `type=REFUND`, `direction=CREDIT`, `amountMinor`, linked to `orderId`/`paymentIntentId`/`userId`/`merchantId`/`walletEntryId`. This distinguishes the refund/wallet-credit financial event from the original `PAYMENT`/`CREDIT` transaction (P1.7.28). Canonical target enums only — legacy numeric `t_type`/`transaction_type` are not reproduced or migrated (doc 56 §17).

## 5. Idempotency

DB-enforced by the new `Refund.idempotencyKey @unique`. The service pre-checks the key (returns the existing refund without re-applying effects); the transaction's `Refund.create` is the authoritative guard — a duplicate key throws a unique violation, the whole transaction rolls back, and the caller returns the existing state (`created=false`). Repeated processing therefore never creates duplicate wallet entries, transactions, or coupon reversals.

## 6. Concurrency protection

The refund runs in one `prisma.$transaction` holding two row locks (no distributed locking):
- **`SELECT … FROM "PaymentIntent" … FOR UPDATE`** serializes refunds for a payment, so the `remaining` computation is consistent → two concurrent refunds cannot both consume the same remaining amount (`total refunds ≤ captured`, test-verified).
- **`SELECT … FROM "Wallet" … FOR UPDATE`** serializes the balance read-modify-write for that wallet.
Locks are always acquired intent-then-wallet (consistent order → no deadlock). Same-key concurrent requests converge via the `idempotencyKey` unique constraint.

## 7. Full-refund coupon reversal (OD-REF-1)

When a refund makes the payment **fully refunded** (`Σ PROCESSED == captured`) and the order has an `ACTIVE` `CouponRedemption`, the same transaction sets it `REVERSED` + `reversedAt` (`updateMany where orderId, status=ACTIVE` → idempotent; partial refunds never reach this branch). This **reuses** the existing `ACTIVE→REVERSED` lifecycle (P1.7.25) and **does not**: create/consume a coupon, touch offer usage counters, or move the order-placement commit point. A full refund on a non-coupon order simply reports `couponReversed=false`.

## 8. Partial-refund behaviour (evidence)

A partial refund that leaves `remaining > 0` **never** reverses the coupon. Legacy reverses coupon usage only on full order cancellation (`order_status===CANCELLED`), not on partial/item refunds (doc 56 §3/§17). The target mirrors this: reversal is gated on the order becoming fully refunded, so a non-completing partial refund leaves the redemption `ACTIVE` (test-verified).

## 9. Refund state machine

Uses the existing `RefundStatus`. A wallet refund is **synchronous** (no external gateway call in this slice), so a successful refund is written directly as `PROCESSED`. `INITIATED`/`FAILURE` are reserved for a future async Razorpay refund (via webhook). A rejected refund (uncaptured payment, over-amount, invalid amount, missing wallet owner) throws and creates **no** `Refund`/`WalletEntry`/`Transaction` — a failed refund never produces a wallet credit.

## 10. Provider / authorization boundary

No live Razorpay refund API is built (foundation only; wallet-credit refunds need no provider call). When Razorpay refunds are integrated, the provider refund id maps onto `Refund.idempotencyKey`/`gatewayPayload` and the async `INITIATED→PROCESSED` states apply. **Refund authorization** (which staff/admin role may initiate a refund) is **not** wired in this slice — the refund is exposed as a service (no unauthenticated HTTP money-moving endpoint), and the API/authorization boundary is **deferred** to when staff-auth is wired into the payment module (documented limitation; existing auth not bypassed or reinvented).

## 11. Schema / migration

One **additive** change: `Refund.idempotencyKey String? @unique` (+ `@@index([paymentIntentId])`), closing the legacy no-idempotency gap (doc 56 §16/§25). Migration `20260903000000_p1_7_29_refund_idempotency` (applied dev+test). No other model changed; no data migration.

## 12. Tests

`apps/api/test/refund-wallet-credit.e2e-spec.ts` — 11 tests: full refund (1 Refund + 1 WalletEntry + 1 Transaction, wallet credited, intent REFUNDED); full-refund coupon reversal; full refund without coupon (no reversal); partial refund (wallet credited, intent PARTIALLY_REFUNDED); partial refund does not reverse coupon; sequential 30/40/30 up to captured then reject; idempotent repeat (no duplicate effects); concurrent full refunds cannot exceed captured; reject uncaptured payment / over-amount / invalid amount / missing wallet owner (no financial effects). Full suite **351/351** (340 prior + 11).

## 13. OD-REF-1 assessment

**PARTIALLY RESOLVED (advanced).** Refund-driven full-refund coupon reversal is now implemented, idempotent, concurrency-safe, atomic, and test-proven — the refund→reversal relationship is authoritative for the wallet-refund path. It is **not** marked RESOLVED because: (a) refunds here are wallet-only and synchronous — the **live Razorpay refund** path (async `INITIATED→PROCESSED`, provider refund id) is not integrated; and (b) the redemption **commit point** remains order placement (out of scope). Once the provider refund path + its authorization boundary exist, OD-REF-1 can be closed.

## 14. Deferred functionality / decisions

- **Settlement / `SettlementItem` / `Payout` / RazorpayX** — deferred (P1.7.30+).
- **Live Razorpay refund integration** + async refund states + refund authorization/HTTP boundary — deferred.
- **Historical migration** (refunds/wallets/transactions/balances) — none in this slice.
- **DR-02b/c/d/e** — remain `BLOCKED — OWNER/DATA` (block only historical migration; greenfield writes use canonical target enums).
- **Coupon / payment commit-point relocation** — unchanged (order placement).

## 15. Recommended P1.7.30

**Settlement & payout foundation** (bounded): compute a merchant `Settlement` + `SettlementItem` from captured payments (net of refunds), model `Payout` via RazorpayX, and represent commission/deferred-`settleAfter` scheduling (the fields flagged as gaps in doc 56 §29) — additive schema only, no historical migration, reusing the P1.7.28/29 payment ledger. Alternatively, a **live Razorpay refund integration** slice (async states + provider id + refund authorization) to fully close OD-REF-1.
