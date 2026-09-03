# 73 — Tip Pre-Settlement Refund Money-Return (Wallet Credit) (P1.7.43)

> **Type:** IMPLEMENTATION — completes the P1.7.38 tip refund-state foundation into real money movement for the **pre-settlement** path, per the P1.7.42 approved policy ("tip refundable via the associated order/payment refund lifecycle"). One additive migration.
> **Governing baseline:** P1.7.38 (doc 71), P1.7.39 (doc 68), P1.7.40 (doc 72). **Baseline 427/427 → 429/429** (+2 wallet tests; refund suite 5→7).

Tags: **APPROVED** (P1.7.42 #5), **IMPLEMENTED**, **DEFERRED**, **OWNER DECISION** (post-settlement, unchanged).

---

## 1. What this adds

P1.7.38/40 recorded tip refund **state**; the actual customer money-return was deferred. This slice wires a **pre-settlement** tip refund to **credit the customer's `Wallet`**, reusing the authoritative amealio refund mechanism (P1.7.29 wallet-credit — legacy ordering refunds were wallet credits, doc 56). "Tip follows the order/payment refund lifecycle" (P1.7.42 #5) ⇒ wallet credit; no new provider abstraction is created.

## 2. Behavior

`TipRepository.recordRefundState` (called by `TipService`), for a PROCESSED refund of a **CAPTURED, un-routed** tip, in ONE transaction under a per-tip + per-wallet `FOR UPDATE`:
1. same-`providerRefundId` idempotency no-op; cap at collected; post-settlement (routed) → **rejected** (P1.7.40, owner decision — unchanged);
2. resolve the customer from the tip's `order.userId` (required — a refund needs a payee);
3. upsert + lock the customer `Wallet`, credit `balanceMinor += amount`;
4. write a `WalletEntry` (`CREDIT`, `refType='TIP_REFUND'`, `refId=tipPaymentId`);
5. write a REFUND `Transaction` (`type=REFUND`, `direction=CREDIT`, `tipPaymentId`, `orderId`, `userId`, `merchantId`, `walletEntryId`) — distinguishable from order-payment transactions;
6. advance the tip refund state (`refundedAmountMinor`, `refundStatus=PROCESSED`, `providerRefundId`, `refundedAt`, `status=PARTIALLY_REFUNDED|REFUNDED`).

Non-PROCESSED statuses record the reference/status only (no credit).

## 3. Schema (additive)

`Transaction.tipPaymentId String?` (+ FK to `TipPayment`, `@@index`) — links a tip-refund wallet transaction to the tip, keeping tip money distinguishable from order money in the ledger. `TipPayment.transactions` back-relation. Migration `20260903080000_p1_7_43_tip_refund_wallet_credit` (additive; rollback = drop FK+index+column). No existing column/constraint/data change.

## 4. Financial isolation & invariants (TESTED)

A tip refund credits only the customer wallet + writes a tip-linked ledger entry. It creates **no** order `Refund` row, touches **no** order `PaymentIntent`, order commission, or order settlement; `Order.grandTotalMinor` is unchanged; tip commission stays 0%; the beneficiary snapshot is immutable. Idempotent (same `providerRefundId` → no double-credit), cap-enforced, concurrency-safe (per-tip + per-wallet locks; the per-tip lock also serializes with routing per P1.7.40).

## 5. Deferred / unchanged

- **Post-settlement tip refund** stays **rejected** — OWNER DECISION REQUIRED for merchant clawback (P1.7.40, doc 72). Unchanged.
- **Live Razorpay tip provider-refund** (money out via the provider rather than wallet) — the wallet-credit path is the authoritative refund mechanism; a provider-refund variant (P1.7.30-style) can be added if the owner requires cash-back-to-source instead of wallet. Wallet credit is the approved-lifecycle default.
- DELIVERY_PERSON / SHARED_POOLED, donations — untouched.

## 6. Validation

`prisma generate` + `migrate deploy` ✓; `tsc --noEmit` clean; lint + format clean; `tip-refund-lifecycle.e2e-spec.ts` now 7 (adds: wallet credited by tip amount + tip-linked REFUND transaction; cumulative partial→full credit, duplicate not double-credited); tip-routing (8) + tip-collection (13) green (order helpers now attach a customer); **full suite 427/427 → 429/429**. `git diff` scoped to P1.7.43.

---

## P1.7.43 Result

- **Status:** COMPLETE (pre-settlement tip refund money-return)
- **Money-return:** WALLET CREDIT (reuses P1.7.29 mechanism; approved-lifecycle default)
- **Pre-settlement refund:** credits customer wallet + tip-linked REFUND transaction; idempotent; capped; partial/full
- **Post-settlement refund:** still REJECTED — OWNER DECISION REQUIRED (unchanged)
- **Financial isolation:** proven (no order Refund/PaymentIntent/commission/settlement change; `grandTotalMinor` unchanged)
- **Schema:** additive `Transaction.tipPaymentId` only
- **Tests:** 429/429 · **TypeScript/lint/format:** clean

### Critical conclusion
A collected tip can now be **refunded to the customer as real money** (wallet credit) on the pre-settlement path — completing the refund-state foundation — fully isolated from order economics and idempotent/concurrency-safe. Post-settlement recovery remains the single owner-gated dependency.

### Required next action
Obtain the **owner decision on post-settlement tip recovery** (block vs merchant-clawback via a canonical settlement-adjustment entity vs platform-absorb, per doc 72). Optionally, add a **live-provider tip refund** variant if cash-back-to-source (not wallet) is required. Do not implement DELIVERY_PERSON/SHARED_POOLED or donations.
