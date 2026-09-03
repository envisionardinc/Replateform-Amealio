# 57 — Payment Intent & Verified-Capture Foundation (P1.7.28)

> **Type:** IMPLEMENTATION (bounded foundation) — server-verified Razorpay capture + idempotent webhook ingestion over the EXISTING target payment schema. **No schema change, no migration.**
> **Governing gate:** [56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md](./56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md) (P1.7.27).
> **Authority:** target `prisma/schema.prisma` (payment models/enums) + P1.7.12 ordering. Baseline **P1.7.26B `f3b6efe` / P1.7.27 `4f7bd6d`, 323/323 → 340/340**.

---

## 1. Scope

The smallest safe payment foundation from doc 56 §36: create a `PaymentIntent` for an order, perform a **server-verified** Razorpay capture (signature + intent + amount + currency) into `PaymentAttempt` + a `Transaction`, and ingest Razorpay **webhooks idempotently** via `WebhookEvent`. Closes the legacy gaps (no signature verification, no-op webhook stub). New module `apps/api/src/modules/payment/`; gated by `PAYMENTS_ENABLED`; not wired to production.

**Explicitly NOT in this slice** (deferred): refund, wallet, wallet-entry, settlement, payout, coupon/offer changes, commit-point relocation, and **all** historical payment/wallet/settlement data migration.

## 2. Implemented payment foundation

- **`PaymentIntent`** — `PaymentService.createIntent(orderId, razorpayOrderId)` loads the order and derives `amountMinor = order.grandTotalMinor` + `currencyCode` (server-authoritative; never client input), `method = RAZORPAY`, `status = CREATED`. Idempotent per `razorpayOrderId` (`@unique`): a repeat returns the existing intent.
- **`PaymentAttempt`** — one row per provider payment, created only on verified capture (`status = CAPTURED`, `razorpayPaymentId @unique`, `idempotencyKey @unique`). Multiple attempts are never collapsed.
- **`Transaction`** — created only after verified capture: `type = PAYMENT`, `direction = CREDIT`, `amountMinor`, links `orderId`/`paymentIntentId`/`userId`/`merchantId`. Represents the payment **rail** only (no wallet transaction here).
- **`WebhookEvent`** — idempotent ingestion (`providerEventId @unique`); `payment.captured` drives a verified capture, `payment.failed` marks the intent FAILED (compare-and-set), other events are ingested and marked PROCESSED (ignored).

## 3. Verified capture

`PaymentService.verifyAndCapture` rejects (and creates **no** Transaction) unless all hold: (1) valid **signature** `HMAC_SHA256(order_id|payment_id, key_secret)`; (2) the `razorpayOrderId` maps to a known `PaymentIntent`; (3) any supplied `amountMinor`/`currencyCode` **exactly** equals the intent's. A client "success" flag is never accepted (doc 56 §8). The capture write (`PaymentRepository.recordCapture`) is one `prisma.$transaction`: create `PaymentAttempt` → compare-and-set `PaymentIntent` `CREATED|AUTHORIZED|FAILED → CAPTURED` (never moves backward from CAPTURED/REFUNDED) → create `Transaction`.

## 4. Webhook ingestion

`RazorpayWebhookService.ingest(rawBody, signature)` verifies the **raw-body** HMAC against `RAZORPAY_WEBHOOK_SECRET` (byte-accurate; bootstrap enables `rawBody: true`), persists a `WebhookEvent` (`providerEventId @unique`), and — only if not a duplicate — processes it. `payment.captured` re-uses the same idempotent capture path (shared `razorpayPaymentId @unique` guard), so a webhook + client handoff for the same payment yield exactly one `Transaction`. Processing result is recorded as `PROCESSED`/`FAILED` with `processedAt`.

## 5. Idempotency strategy

DB-enforced, no application locks: `PaymentIntent.razorpayOrderId @unique` (one intent per provider order), `PaymentAttempt.razorpayPaymentId @unique` + `idempotencyKey @unique` (one attempt/transaction per provider payment), `WebhookEvent.providerEventId @unique` (one processing per event). A duplicate/concurrent capture hits the `razorpayPaymentId` unique constraint → the `$transaction` rolls back → the caller returns the existing captured state (`created = false`). **Invariant:** one successful provider payment = one authoritative captured `Transaction`.

## 6. Transaction creation

Exactly one `Transaction` (`type = PAYMENT`, `direction = CREDIT`) per captured provider payment; **none** for failed verification (bad signature / amount / currency / unknown intent) or duplicate/unverified callbacks. `t_type`/`transaction_type` legacy split is **not** reproduced — new writes use the canonical target `TransactionType` + explicit `TransactionDirection` (doc 56 §17).

## 7. Target enums used for new writes

`PaymentStatus` (`CREATED`/`CAPTURED`/`FAILED` used here), `PaymentMethod.RAZORPAY`, `TransactionType.PAYMENT`, `TransactionDirection.CREDIT`, `WebhookProvider.RAZORPAY`, `WebhookProcessingStatus`. Legacy numeric `payment_status`/`payment_method`/`t_type` codes are **not** written (they are env-injected in legacy; doc 56 §20–22).

## 8. Money / amount verification

Amounts are exact `BigInt` minor units (paise for INR). The intent amount equals `Order.grandTotalMinor`. Verification compares provider amount to the intent amount with **exact `BigInt` equality** (`===`), never floating point, never rounding. The webhook payload `amount` (a signature-covered number) is compared via `BigInt(entity.amount) === intent.amountMinor`.

## 9. Security / secret handling

Razorpay `key_secret` and `webhook_secret` are **configuration only** (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in `env.validation.ts`), with dev-only defaults for local/test; real secrets are infra-managed and never committed. Signatures are verified **server-side** with constant-time comparison (`node:crypto.timingSafeEqual`); secrets/signatures are never logged; client input cannot determine captured state (only a valid signature can).

## 10. Order integration

`PaymentIntent.orderId` establishes ownership; amount/currency are read from the order. **No order business rule, order lifecycle, `CouponRedemption`, or offer usage is changed.** `Order.paymentStatus` is intentionally **not** mutated in this slice (kept decoupled; mirroring order payment state is deferred). Coupon-redemption commit point remains **order placement** (OD-REF-1, unchanged).

## 11. API boundary

Follows existing conventions (`@Controller({path,version})`, `@Public()`, feature-flag guard). New routes under `PAYMENTS_ENABLED`: `POST /api/v1/payments/intents`, `POST /api/v1/payments/verify` (safe: only actioned on a valid signature), `POST /api/v1/payments/razorpay/webhook` (public, raw-body HMAC). Production authn/authorization wiring for intents/verify is deferred (foundation only). BigInt money is serialized to decimal strings in responses.

## 12. Schema

**No change.** The existing `PaymentIntent`/`PaymentAttempt`/`WebhookEvent`/`Transaction` models + enums (`schema.prisma:71-135,230-240,1055-1123`) are sufficient (doc 56 §27). No migration generated.

## 13. Tests

`apps/api/test/payment-verified-capture.e2e-spec.ts` — 17 tests: signature (valid/invalid, handoff + webhook body); amount match/mismatch; currency mismatch; unknown intent; first capture (intent CAPTURED + 1 attempt + 1 transaction); repeated capture idempotent; concurrent capture → 1 transaction; intent idempotency; webhook valid/invalid-signature/duplicate/unknown-type/failed-processing; client+webhook for same payment → 1 transaction; no transaction on any failed verification. Full suite **340/340** (323 prior + 17).

## 14. Explicit deferrals

Refund, wallet, `WalletEntry`, settlement, `SettlementItem`, `Payout`, RazorpayX payouts, partial-refund handling, coupon reversal / commit-point relocation, `Order.paymentStatus` sync, the live Razorpay `orders.create` provider call (the `razorpayOrderId` is recorded here), and **all historical data migration** — all deferred. **DR-02b/c/d/e remain `BLOCKED — OWNER/DATA`** (only block historical migration, not these greenfield writes). **OD-REF-1 remains PARTIALLY RESOLVED** (commit point stays order placement).

## 15. Recommended P1.7.29

**Refund + wallet-credit foundation** (bounded): model `Refund` (full/partial, `RefundMethod`, `RefundStatus`) linked to a captured `PaymentIntent`, credit the user `Wallet` via a `WalletEntry` ledger (`balanceAfterMinor`) + `Transaction` (`REFUND`/`WALLET_CREDIT`), and — resolving **OD-REF-1** — reverse the coupon `CouponRedemption` on a **full** refund (partial refund does not). No settlement/payout; no historical migration. This is the next evidence-backed slice per doc 56 §36.
