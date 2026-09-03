# 71 — Tip Collection/Capture Foundation (P1.7.38)

> **Type:** IMPLEMENTATION — tip collection/capture foundation for the India baseline, per the P1.7.42 approved product policy. **TIP ONLY** (donations, payout routing, delivery assignment, and pooled allocation are out of scope).
> **Migration:** `20260903060000_p1_7_38_tip_payment_foundation` (additive only).
> **Governing contract:** [70-TIP-DONATION-OWNER-DECISION-PACKET.md](./70-TIP-DONATION-OWNER-DECISION-PACKET.md) (P1.7.42).
> **Baseline:** P1.7.42 `395f23a`, **401/401 → 414/414** (+13 tip tests).

Tags: **APPROVED** (P1.7.42 policy), **IMPLEMENTED**, **DEFERRED**, **BLOCKED** (branch prerequisites).

---

## 1. Approved product policy (implemented subset)

Per P1.7.42: tips **are collected**; tip beneficiary is **merchant-configurable** (`MERCHANT` / `DELIVERY_PERSON` / `SHARED_POOLED`, set at merchant subscription/setup) and **snapshotted** per tip; tip options **10% / 15% / 20% / Custom**; **0% amealio commission** on tips; **separate payment per component** (the tip is NOT added to the order payment); tip refund follows the order/payment lifecycle. This slice implements **collection/capture only** — routing/settlement of the collected tip is deferred to P1.7.39.

## 2. Tip basis reconciliation (Phase 1)

> The approved "Total Order Amount" tip basis maps to the existing canonical `Order.grandTotalMinor`. No new order-total calculation is introduced.

Evidence: `grandTotalMinor = subtotal − discount + tax + fee + delivery` (DB CHECK `order_total_integrity`, `prisma/migrations/20260901224600_.../migration.sql:14-17`), derived in `order.service.ts:187-189`, and equal to the order `PaymentIntent.amountMinor` (`payment.service.ts:43`) — i.e. the amount the customer actually pays for the order. The tip percentage is applied to this canonical value (`basisMinor` snapshot); no "tip subtotal"/"eligible amount" concept is introduced, and `grandTotalMinor` is neither reinterpreted nor modified. (The discount/tax/delivery/fee treatment is whatever the existing `grandTotalMinor` contract already establishes.)

## 3. Canonical collected-tip representation (Phase 2)

New model `TipPayment` (`prisma/schema.prisma`), deliberately **separate** from `PaymentIntent`:

| Field | Purpose |
|---|---|
| `orderId`, `merchantId` (FK) | order + merchant reference |
| `basisMinor` | snapshot of `Order.grandTotalMinor` (the tip basis) |
| `percentBps` (nullable) / `isCustom` | selected option (1000/1500/2000) or custom indicator |
| `amountMinor` | server-calculated collected tip amount |
| `currencyCode` | server-controlled (from the order) |
| `status` (`PaymentStatus`) | CREATED → CAPTURED (or FAILED / PARTIALLY_REFUNDED / REFUNDED) — **intent vs collected** |
| `razorpayOrderId @unique` | provider order id + intent idempotency key |
| `razorpayPaymentId @unique` | provider payment reference (proof of collection) |
| `capturedAt` | collection timestamp |
| `refundedAmountMinor`, `refundStatus`, `providerRefundId @unique`, `refundedAt` | refund-state foundation |
| `beneficiaryPolicy` (`TipBeneficiaryPolicy`) | **snapshot** of the merchant-configured policy at collection time |
| `@@index([orderId]/[merchantId]/[status])` | lookups |

Plus a partial unique index (migration): `CREATE UNIQUE INDEX tip_one_captured_per_order ON "TipPayment"("orderId") WHERE status = 'CAPTURED'` — **at most one CAPTURED tip per order**, DB-enforced under concurrency. New enum `TipBeneficiaryPolicy { MERCHANT, DELIVERY_PERSON, SHARED_POOLED }`. Every field has a demonstrated purpose (Phase 2 requirement).

## 4. Separate payment lifecycle (Phase 3/4)

`TipService` (`tip.service.ts`) + `TipRepository`:
- **createTip** — validates the order exists and is tippable (not CANCELLED/RETURNED), **server-computes** the tip from `Order.grandTotalMinor` (`resolveTip`), snapshots the beneficiary policy, and creates a `TipPayment` (status CREATED) with its own `razorpayOrderId`. Idempotent per provider order id. **A tip intent is never collected money.**
- **verifyAndCaptureTip** — verifies the Razorpay handoff signature (reusing the P1.7.28 pure `verifyPaymentSignature`), matches the tip by `razorpayOrderId`, verifies amount + currency against the tip (exact BigInt), then compare-and-sets CREATED→CAPTURED with the provider payment id + `capturedAt`. If payment fails, the tip stays uncollected. The client cannot assert collection; the server calculates + authorizes the amount.
- Calculation (`tip-calculation.ts`, pure): `percentage = floor(basisMinor × bps / 10000)` (exact integer); custom = validated positive integer; approved options `{1000,1500,2000}` bps enforced; negative/zero/malformed and zero-basis rejected.

## 5. Beneficiary policy snapshot (Phase 5)

The beneficiary is **server-resolved** (never a client input) via `TipService.resolveBeneficiaryPolicy(merchantId)` and **snapshotted** onto `TipPayment.beneficiaryPolicy`. No target merchant-config field exists yet, so it resolves to the baseline-viable `MERCHANT`; the resolver is the single seam to wire real per-merchant config when the merchant tip-config slice lands. **The snapshot prevents the integrity problem** the contract warned about: a later merchant change (e.g. `MERCHANT → DELIVERY_PERSON`) never rewrites the policy that governed an already-collected tip. No schema STOP was required — the additive snapshot column represents it safely.

## 6. Refund foundation (Phase 6)

`recordTipRefundState` records refund state on the tip **without touching the order payment** — they are separate payments with separately verifiable refund state. Supports refunded amount / provider reference / status / timestamp; capped at the collected amount; idempotent (same `providerRefundId` is a no-op — no double-refund). The single `providerRefundId` reference is a deliberate foundation limitation; the full refund lifecycle (provider calls, order-refund linkage, multi-refund ledger) is owned by P1.7.39+. **Refunding the order payment does not implicitly refund the tip** (and vice-versa).

## 7. Financial isolation (Phase 7 — hard requirement, TESTED)

Tip money never enters `Order.grandTotalMinor`, the order `PaymentIntent.amountMinor`, the commission basis, merchant gross, or settlement. `TipPayment` is a separate table; `TipRepository` never reads/writes `PaymentIntent`, `Order` totals, commission, or settlement. A dedicated e2e asserts that collecting a large tip leaves `grandTotalMinor`, the order intent amount, `commissionBasisMinor`, `commissionMinor`, `netAmountMinor`, and settlement items **identical**, and no `SettlementItem` carries the tip.

## 8. Idempotency & concurrency (Phase 8, TESTED)

- Intent creation idempotent per `razorpayOrderId @unique`.
- Capture idempotent per `razorpayPaymentId @unique` + compare-and-set (CREATED→CAPTURED); a repeated capture returns the existing collected tip (`created:false`).
- **At most one CAPTURED tip per order** via the partial unique index; a competing/duplicate capture (even a different tip intent for the same order) rolls back (P2002) and returns current state.
- Concurrent captures of the same tip → exactly one collected tip.
- Refund state idempotent per `providerRefundId`.

## 9. API / security (Phase 9)

`TipController` (`/v1/tips/intents`, `/v1/tips/verify`), gated by `PaymentsEnabledGuard`. Amount is server-derived; percentage validated against approved options; custom validated; currency server-controlled (from order); order existence + tippable-state verified; capture only on a valid signature. The beneficiary is server-resolved (no client selection; no privileged beneficiary-config mutation is exposed). Consistent with the P1.7.28 payment foundation, **production customer-principal authn wiring is deferred** (foundation only; `@Public` behind the feature flag) — documented, not silently skipped.

## 10. Deferred branches (Phase 11) & donations (Phase 12)

- **MERCHANT** — future P1.7.39 routing can reuse the merchant settlement path.
- **DELIVERY_PERSON** — BLOCKED until a delivery assignment + immutable assignment-history foundation exists (P1.7.41 confirmed absent). Not implemented here.
- **SHARED_POOLED** — BLOCKED until a pool membership/allocation/accounting foundation exists. Not implemented here.
- **Donations** — FUTURE (P1.7.40); nothing created here (no donation payment/liability/charity/transfer/refund).

## 11. Migration / rollback

`20260903060000_p1_7_38_tip_payment_foundation` — additive only: new `TipBeneficiaryPolicy` enum, new `TipPayment` table + indexes (incl. the partial unique index) + FKs to `Order`/`Merchant`. No existing table/column/constraint changed; no data change. Rollback: `DROP TABLE "TipPayment"; DROP TYPE "TipBeneficiaryPolicy";` (no data dependency). Applied to dev+test.

## 12. Validation

`prisma generate` + `migrate deploy` ✓; `tsc --noEmit` clean; lint + format clean; new `tip-collection.e2e-spec.ts` (13: calculation 10/15/20/custom/rounding/invalid; intent-vs-collected; custom; capture; signature/amount/currency rejection; idempotent capture + per provider order; one-captured-per-order; concurrency; **financial isolation**; refund-state partial/full/over-refund/duplicate); **full suite 401/401 → 414/414**; `git diff` scoped to P1.7.38 (schema/migration/`modules/tip`/`app.module`/test/docs).

---

## P1.7.38 Result

- **Status:** COMPLETE
- **Tip collection:** IMPLEMENTED (separate payment; server-verified capture)
- **Tip basis:** `Order.grandTotalMinor` (approved "total order amount"; no reinterpretation)
- **Tip options:** 10% / 15% / 20% / Custom (server-validated)
- **Payment architecture:** SEPARATE TIP PAYMENT (`TipPayment`; order payment untouched)
- **Tip payment successfully represented:** YES · **Collected state authoritative:** YES · **Payment provider reference:** YES (`razorpayPaymentId`)
- **Refund foundation:** YES (state only; lifecycle deferred)
- **Beneficiary configuration captured:** YES (snapshot; resolver seam = MERCHANT baseline)
- **Merchant routing:** DEFERRED TO P1.7.39 · **Delivery-person routing:** BLOCKED — ASSIGNMENT FOUNDATION · **Shared-pooled routing:** BLOCKED — POOL FOUNDATION
- **Donation implementation:** DEFERRED
- **`grandTotalMinor` changed:** NO · **Order PaymentIntent changed:** NO · **Commission basis changed:** NO · **Settlement economics changed:** NO
- **Tests:** 414/414 · **TypeScript:** clean · **Lint/format:** clean

### Critical conclusion
The target now has a **canonical, separately collected tip-payment foundation** that does not disturb existing order economics: tips are server-calculated from `Order.grandTotalMinor`, collected via a separate, server-verified, idempotent Razorpay capture into an isolated `TipPayment`, carry a beneficiary-policy snapshot for future routing, and expose an idempotent refund-state foundation — with `grandTotalMinor`, the order payment, the commission basis, and settlement provably unchanged.

### Required next action
Proceed to **P1.7.39 — Config-Driven Tip Beneficiary Routing**, branching on the merchant's configured beneficiary: **MERCHANT** → existing merchant settlement path; **DELIVERY_PERSON** → remain blocked until a delivery assignment/history foundation exists; **SHARED_POOLED** → remain blocked until a pool/allocation foundation exists. Do not implement the blocked branches speculatively.
