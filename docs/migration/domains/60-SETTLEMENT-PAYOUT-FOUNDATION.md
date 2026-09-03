# 60 — Settlement & Payout Foundation (P1.7.31)

> **Type:** IMPLEMENTATION (bounded foundation) — merchant settlement derived from the payment/refund ledger + a distinct payout disbursement layer. One additive migration.
> **Governing gate:** [56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md](./56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md) §15 (settlement) + §29 (gaps); builds on [57](./57-PAYMENT-VERIFIED-CAPTURE-FOUNDATION.md)/[58](./58-REFUND-WALLET-CREDIT-FOUNDATION.md)/[59](./59-LIVE-RAZORPAY-REFUND-INTEGRATION.md).
> **Authority:** target `prisma/schema.prisma` + legacy settlement behaviour (doc 56 §15). Baseline **P1.7.30 `ac056c2`, 361/361 → 378/378**.

---

## 1. Scope

Establish the target merchant **settlement** (accrual) and **payout** (disbursement) foundation, derived from the authoritative P1.7.28–P1.7.30 payment/refund ledger: a merchant is settled the **net-of-refund** amount of its **captured** payments, **minus commission**; the net is disbursed via a separate `Payout` through an isolated RazorpayX boundary. New module `apps/api/src/modules/settlement/`. **No historical migration; no application-surface migration; coupon logic untouched.**

## 2. Settlement calculation (derived, exact)

Settlement is computed **only** from target financial records — never UI/client/legacy totals. Per captured `PaymentIntent`: `net = amountMinor − Σ(PROCESSED Refund.amountMinor)`. A merchant settlement run sums the net of all its **not-yet-settled** captured payments:

```
grossAmountMinor = Σ per-payment net-of-refund   (= Σ SettlementItem.amountMinor)
commissionMinor  = floor(gross × commissionBps / 10000)   (exact BigInt)
amountMinor(net) = gross − commission              (= Payout amount)
```

All arithmetic is exact `BigInt` minor units (no floating point, no silent rounding; commission is floored).

## 3. Eligibility

A payment contributes only if its `PaymentIntent.status ∈ {CAPTURED, PARTIALLY_REFUNDED}` (a captured payment). `CREATED`/`AUTHORIZED`/`FAILED` (unverified/failed) never settle. A fully-refunded payment (`net ≤ 0`) is excluded (nothing to settle). Payments already carrying a `SettlementItem` are excluded (settle-once).

## 4. Refund interaction

Net contribution deducts **PROCESSED** refunds only (failed/rejected refunds are not deductions). `captured 100 − refund 30 = 70` settleable; a full refund → `0` (excluded). Multiple refunds sum. Verified by tests. This reconciles directly from the refund ledger (P1.7.29/30).

## 5. Full vs partial refund

Both reduce the settleable amount by their actual PROCESSED amount (partial → reduced basis; full → excluded). **No coupon logic** enters settlement — coupon redemption/reversal remains a separate concern (order placement + refund, P1.7.24/25/30).

## 6. Commission

The commission **rate** is an explicit `commissionBps` input to the settlement run (basis points, integer `[0,10000]`, default `0`) — never hardcoded. `commissionMinor = floor(gross × bps / 10000)`; `commissionBps` + `commissionMinor` are stored on the `Settlement` for audit. **The authoritative rate SOURCE (per-merchant/restaurant commission config) is a deferred owner decision** — the target has no commission-config field yet (doc 56 §29). The foundation supports commission arithmetically without inventing a rate.

## 7. Settlement itemization / auditability

Each `SettlementItem` = one captured payment's net-of-refund contribution, linked to its `paymentIntentId` (+ `orderId`). `Settlement` stores `grossAmountMinor` (= Σ items), `commissionMinor`, `commissionBps`, and `amountMinor` (net payout). A settlement is fully explainable: `Σ items = gross`, `net = gross − commission`, and each item traces to a `PaymentIntent`/`Order`. No second payment transaction is created for settlement.

## 8. Settlement timing / `settleAfter`

Legacy deferred settlement ~T+2 via `Order.settleAfter` (doc 56 §15). The **target schema has no `settleAfter` field**, and Phase 12/13 forbids inventing a scheduling framework. This foundation therefore settles **currently-eligible captured payments on demand** (SUPER_ADMIN-initiated run); the deferred-window scheduling policy (fixed delay vs calendar period, and its config field) is **documented as a deferred owner decision**, not invented. Eligibility is capture-based (a captured payment not yet settled).

## 9. Idempotency (settle-a-payment-once)

DB-enforced by the new **`SettlementItem.paymentIntentId @unique`**: a captured payment contributes to at most one settlement item, ever. A second settlement run for the same merchant finds no eligible payments and is rejected (`No eligible captured payments`). Under concurrency, two runs picking the same payment collide on the unique constraint → one transaction commits, the other rolls back (tested).

## 10. Payout

`Payout` is the **disbursement** layer, distinct from `Settlement` (accrual): creating a settlement never implies money reached the merchant. `SettlementService.requestPayout(principal, { settlementId, idempotencyKey })` reserves a `Payout` (status `PENDING`) for the settlement's net amount, calls the RazorpayX gateway, persists `providerPayoutId`. Payout lifecycle uses `SettlementStatus` (`PENDING → COMPLETED | FAILED`). A successful settlement does **not** auto-complete the payout; only a provider `processed` response / `markPayoutProcessed` callback does (which also advances the `Settlement` to `COMPLETED`). A provider failure → `FAILED`, settlement stays `PENDING` (retry with a new key).

## 11. RazorpayX boundary

`RazorpayxPayoutGateway.createPayout({ amountMinor, currencyCode, idempotencyKey })` isolates all provider detail (prod = RazorpayX Payouts API, amount in paise, fund-account id, idempotency header). **This is a TARGET FOUNDATION — the live RazorpayX HTTP call is deferred** (no production credentials; dev/test returns a deterministic `pending` payout id). **Live payout capability is NOT production-ready.** Secrets are configuration-only; nothing sensitive is logged.

## 12. Payout idempotency & concurrency

New **`Payout.idempotencyKey @unique`** + existing `Payout.providerPayoutId @unique`: a repeated payout request (same key) returns the existing payout **without** a second provider call; a `PENDING→COMPLETED` compare-and-set makes provider callbacks exactly-once (a duplicate `markPayoutProcessed` is a no-op). Invariant: **one payout instruction = at most one provider payout**. A gateway timeout leaves the payout `PENDING` (retry reuses the key → no duplicate; documented residual reconciliation).

## 13. Merchant ownership

Eligible payments are filtered by `Order.merchantId` (optionally `restaurantId`), so one merchant's financial activity can never appear in another merchant's settlement (tested). `Settlement.merchantId`/`restaurantId` use the existing ownership relationships.

## 14. Authorization

Settlement and payout are **SUPER_ADMIN only** (platform pays merchants), enforced via `isSuperAdmin(principal)` — merchant staff → `Forbidden`. This mirrors the legacy admin-initiated settlement (doc 56 §15). A finer merchant-visible settlement view is a future concern.

## 15. Negative / zero settlement

`net = gross − commission ≥ 0` always (commission ≤ gross; refunds ≤ captured). A zero-net settlement can occur (e.g. 100% commission) and is created but **cannot be paid out** (`requestPayout` rejects `amount ≤ 0`). No negative payout is ever issued. A debt/receivable model is explicitly **not** built (Phase 25).

## 16. Post-settlement refund

A refund occurring **after** a payment is settled still processes at the payment layer (P1.7.29/30 wallet credit), but the already-created `Settlement` is **not** retroactively changed and the payment is **not** re-settled (its `SettlementItem` persists). A **negative settlement adjustment / clawback** for post-settlement refunds is **not modeled** in this slice and is a documented future owner decision (the current `Settlement`/`SettlementItem` model has no negative-adjustment item type). Tested and documented — this case is not hidden.

## 17. Financial invariants (tested)

Captured = payment source amount; refunds ≤ captured; net settlement ≤ captured; commission from the correct basis (gross) with exact arithmetic; `Σ items = gross`; payout amount = settlement net; duplicate processing never duplicates a settlement item or payout; merchant isolation.

## 18. Schema / migration

Additive only (migration `20260903020000_p1_7_31_settlement_payout`, dev+test): `Settlement` += `grossAmountMinor`/`commissionMinor`/`commissionBps`; `SettlementItem` += `paymentIntentId` (FK, `@unique`); `Payout` += `idempotencyKey @unique`; `PaymentIntent` += `settlementItems` back-relation. No existing model redesigned; no data migration.

## 19. Tests

`apps/api/test/settlement-payout.e2e-spec.ts` — 17 tests: eligibility (captured settles, uncaptured excluded, no-eligible rejected); refund adjustment (partial/full/multiple, PROCESSED only); commission (exact bps, invalid rate rejected, items reconcile); settle-once idempotency; merchant isolation; authorization (non-SUPER_ADMIN rejected); payout (create PENDING → complete → settlement COMPLETED, provider failure, idempotent request, duplicate callback no-op, zero-amount rejected); post-settlement refund (no retroactive change); concurrency (no duplicate items). Full suite **378/378** (361 prior + 17). P1.7.28–30 payment/refund tests remain green.

## 20. Decisions

- **DR-02b / DR-02c / DR-02d / DR-02e — BLOCKED — OWNER/DATA** (unchanged; block only historical migration; new settlement/payout writes use canonical target values).
- Commission-rate **source**, `settleAfter` scheduling policy, and post-settlement-refund clawback are **deferred owner decisions** (documented above).

## 21. Deferred functionality

- **Live RazorpayX payout HTTP call** + payout **webhook route** (needs `WebhookProvider.RAZORPAYX` + the provider event contract; `markPayoutProcessed`/`markPayoutFailed` hooks exist for it) — deferred with the live integration.
- **Commission-rate configuration** (per-merchant/restaurant) source.
- **`settleAfter` deferred-window scheduling** policy.
- **Post-settlement refund negative adjustment / clawback**.
- **Historical migration** of settlements/payouts/payments/refunds/wallets — none.

## 22. Recommended P1.7.32

Two evidence-backed candidates (smallest first):
- **Commission configuration + `settleAfter` scheduling foundation** — add the per-merchant/restaurant commission rate source and the deferred-settlement window (resolves the two deferred owner decisions here), so settlement no longer needs an explicit `commissionBps` input.
- Or **post-settlement refund adjustment (clawback) foundation** — model a negative `SettlementItem`/adjustment so a refund after settlement is accounted for.

Both are additive-schema, no historical migration, and reuse the P1.7.28–31 ledger.
