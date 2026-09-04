# 59 — Live Razorpay Refund Integration & Authorization (P1.7.30)

> **Type:** IMPLEMENTATION (bounded foundation) — authorized, asynchronous provider-refund lifecycle on top of the P1.7.29 internal refund/wallet-credit foundation. One additive migration (`Refund.providerRefundId`).
> **Governing gate:** [56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md](./56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md) (P1.7.27), [57](./57-PAYMENT-VERIFIED-CAPTURE-FOUNDATION.md)/[58](./58-REFUND-WALLET-CREDIT-FOUNDATION.md).
> **Authority:** target `prisma/schema.prisma` + Razorpay refund API contract. Baseline **P1.7.29 `471cbed`, 351/351 → 361/361**.

---

## 1. Scope

Add the live-provider refund boundary missing from P1.7.29: an **authorized** (merchant-scoped) refund that issues a **Razorpay** refund, tracks the **asynchronous** provider lifecycle (`INITIATED → PROCESSED | FAILURE`) keyed on a **provider refund id**, and applies the P1.7.29 financial effects (wallet credit + transaction + full-refund coupon reversal) **exactly once** only at the authoritative `PROCESSED` point. No settlement; no historical migration; commit point unchanged.

## 2. Provider vs internal financial state

A refund **request** is never treated as a completed refund. The RAZORPAY path creates an `INITIATED` `Refund` (which reserves the amount) when the request is accepted; the wallet is **not** credited then. The financial effects run only when the refund reaches **`PROCESSED`** — via the `refund.processed` webhook (async) or a synchronous provider `processed` response. This matches Razorpay semantics (a refund is `pending` then `processed`, confirmed by webhook).

## 3. Provider boundary

`RazorpayRefundGateway` (`infrastructure/razorpay-refund.gateway.ts`) isolates all provider detail; business logic only calls `requestRefund({ providerPaymentId, amountMinor, idempotencyKey })`. The production call is `POST /v1/payments/:payment_id/refund` (amount in paise = our minor units, basic-auth `key_id:key_secret`, `Idempotency-Key` header). **Live HTTP is intentionally deferred** (no production credentials in the repo): with dev/test config the gateway returns a deterministic `pending` response (provider refund id derived from the idempotency key), so the async lifecycle is exercised end-to-end via the webhook. A thrown gateway error = **UNKNOWN** outcome (see §10).

## 4. Refund request + authorization

`RefundService.requestRefund(principal, input)` is the authorized entry point. It resolves the order behind the payment intent and enforces **merchant tenancy** via `MerchantScopeService.assertRestaurantInScope` — a merchant staff may only refund an order within their merchant scope; SUPER_ADMIN is platform-wide. An arbitrary/other-merchant principal is rejected (`Forbidden`), so one cannot refund another merchant's/customer's payment. Requires a captured intent, valid amount within remaining, and an idempotency key; rejects uncaptured/unknown/over-amount/invalid/unauthorized.

## 5. Provider refund id

`Refund.providerRefundId` (new, `@unique`) holds the Razorpay refund id. Uniqueness guarantees **one provider refund → exactly one internal `Refund`**, and the `refund.processed`/`refund.failed` webhook is keyed on it. A repeated provider response cannot create a second refund.

## 6. Refund states

Uses the existing `RefundStatus`: **`INITIATED`** (provider refund requested/reserved), **`PROCESSED`** (provider confirmed → financial effects applied), **`FAILURE`** (provider failed → reservation released). Transitions are compare-and-set: `INITIATED → PROCESSED` (applies effects once) or `INITIATED → FAILURE`; a completed/failed refund is never moved backward.

## 7. Internal financial effects (reused, not duplicated)

The P1.7.29 effect — wallet credit + `WalletEntry(CREDIT, balanceAfterMinor)` + one `Transaction(REFUND/CREDIT)` + `PaymentIntent` advance + full-refund `CouponRedemption` reversal — is refactored into a single shared method used by **both** the synchronous WALLET path and the async RAZORPAY completion. The provider integration never independently creates a second wallet entry/transaction/coupon reversal.

## 8. Reservation & remaining amount

`remaining = captured − Σ(refunds in {INITIATED, PROCESSED})`. An `INITIATED` provider refund **reserves** its amount immediately (so concurrent/pending refunds cannot over-subscribe); a `FAILURE` releases the reservation. Enforced under the per-`PaymentIntent` `SELECT … FOR UPDATE` lock, so **total successful refunds ≤ captured amount** (test: `100 → 30/40/30` completes to `remaining=0`, a 4th is rejected). The WALLET path is unchanged (no `INITIATED` rows).

## 9. Idempotency & concurrency

Three DB-enforced layers + the transaction locks: `Refund.idempotencyKey @unique` (a repeated request returns the existing refund with **no** second provider call), `Refund.providerRefundId @unique` (one internal refund per provider refund), `WebhookEvent.providerEventId @unique` (duplicate webhook = no-op), and the `INITIATED→PROCESSED` compare-and-set (effects applied once even if the synchronous response and the webhook both arrive). Concurrent full refunds serialize on the per-intent lock → one succeeds, the other is rejected. **One provider refund = one wallet entry = one transaction = at most one coupon reversal.**

## 10. Recovery (timeout / lost response)

If the gateway throws (timeout/unknown), the reserved `INITIATED` refund is left in place (not failed, not completed) and the request errors with `BadGateway`. A retry with the **same idempotency key** returns that reserved refund **without** calling the provider again (the gateway is idempotent per key → same provider refund), so **no unsafe duplicate refund** is issued. **Residual uncertainty:** such a refund has no `providerRefundId` attached, so it cannot be auto-completed by a webhook — resolution requires operator/reconciliation (documented limitation). A definitive provider `failed` response instead marks `FAILURE` and releases the reservation.

## 11. Webhook

`RazorpayWebhookService` (P1.7.28) is extended for `refund.processed` / `refund.failed` — the authoritative async completion point. The raw-body HMAC is verified, the event is persisted idempotently (`WebhookEvent.providerEventId @unique`), and processing calls `completeProviderRefund(providerRefundId)` / `failProviderRefund(providerRefundId)`. A duplicate/redelivered refund webhook is a no-op (compare-and-set), so it cannot create a second financial effect.

## 12. Full vs partial refund

Preserved from P1.7.29: a refund that brings cumulative PROCESSED refunds to the captured amount is **full** → `PaymentIntent = REFUNDED` + `ACTIVE CouponRedemption → REVERSED`. A **partial** refund → `PARTIALLY_REFUNDED`, coupon **unchanged**. Coupon reversal happens only at the authoritative completed state, never on request. The order-placement commit point is unchanged.

## 13. Security

Razorpay `key_secret`/`webhook_secret` remain **configuration-only** (dev defaults; infra-managed in prod; never logged/committed). The gateway logs no secrets/signatures/payloads beyond a minimal debug line. Webhook signatures are verified server-side against the raw body. Refund authorization + ownership (merchant scope) are enforced. Client input cannot mark a refund completed — only a signed provider webhook or a provider-confirmed `processed` response can.

## 14. Schema / migration

One additive change: `Refund.providerRefundId String? @unique`. Migration `20260903010000_p1_7_30_refund_provider_id` (applied dev+test). No other model changed; no data migration.

## 15. Tests

`apps/api/test/payment-live-refund.e2e-spec.ts` — 10 tests: authorization (scoped staff vs another merchant); provider request args (payment id/amount); INITIATED→`refund.processed` full refund (effects once + coupon reversed) with duplicate-webhook no-op; synchronous `processed` completes immediately + later duplicate webhook no-op; `refund.failed` releases reservation; partial provider refund (wallet credited, coupon unchanged); multi-refund reservation reconciliation (30/40/30 then reject) → REFUNDED; idempotent repeat (one provider call); concurrent full refunds ≤ captured; provider-timeout recovery (no duplicate on retry); invalid webhook signature. Full suite **361/361** (351 prior + 10). P1.7.29 wallet-refund tests remain green (the internal `refund()` mechanism is preserved).

## 16. OD-REF-1 assessment

**RESOLVED.** All ten conditions hold: (1) the live provider refund lifecycle is represented (`INITIATED/PROCESSED/FAILURE`); (2) `providerRefundId` is persisted (unique); (3) refund authorization is enforced (merchant scope); (4) full refund reverses the active coupon redemption; (5) partial refund does not; (6) wallet credit occurs exactly once; (7) the refund transaction occurs exactly once; (8) duplicate webhook/request cannot duplicate effects; (9) concurrent refunds cannot exceed the captured amount; (10) tests prove the complete lifecycle. **Caveat:** the actual Razorpay HTTP call is stubbed pending production credentials (the gateway boundary + lifecycle + idempotency are complete); wiring the live `fetch`/SDK call is the only remaining production task and does not change the reconciled semantics. The redemption **commit point** remains order placement (deliberately unchanged).

## 17. Deferred functionality / decisions

- **Live Razorpay HTTP call** inside `RazorpayRefundGateway` (credentials infra-managed) — the sole remaining production wiring.
- **Settlement / `SettlementItem` / `Payout` / RazorpayX** — deferred (P1.7.31).
- **Historical migration** (refunds/wallets/transactions/payments) — none.
- **DR-02b/c/d/e** — remain `BLOCKED — OWNER/DATA` (block only historical migration; greenfield writes use canonical target enums).
- **Coupon / payment commit-point relocation** — unchanged (order placement).
- Reconciliation of an `INITIATED` refund left without a `providerRefundId` after a gateway-unknown outcome (operator/job) — a documented residual.

## 18. Recommended P1.7.31

**Settlement & payout foundation** (bounded): compute a merchant `Settlement` + `SettlementItem` from captured payments **net of refunds**, model `Payout` via RazorpayX, and represent commission + deferred `settleAfter` scheduling (the gaps in doc 56 §29) — additive schema only, no historical migration, reusing the P1.7.28–30 payment/refund ledger.
