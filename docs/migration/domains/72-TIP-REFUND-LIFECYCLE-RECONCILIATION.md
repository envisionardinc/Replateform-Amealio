# 72 — Tip Refund Lifecycle & ORDER_TIP Settlement Reconciliation (P1.7.40)

> **Type:** FORENSIC-FIRST + bounded IMPLEMENTATION. Reconciles the tip refund lifecycle against the P1.7.38 collection foundation and the P1.7.39 ORDER_TIP settlement. **No schema/migration change** (logic + tests only). Post-settlement tip clawback is **OWNER DECISION REQUIRED** — not invented.
> **Governing baseline:** P1.7.38 (doc 71), P1.7.39 (doc 68). **Baseline 422/422 → 427/427** (+5 refund-lifecycle tests).

Tags: **VERIFIED** (code file:line), **IMPLEMENTED**, **OWNER DECISION REQUIRED**, **DEFERRED**, **LEGACY-ONLY**.

---

## 1. Status & headline

**FORENSIC COMPLETE + bounded implementation; post-settlement clawback = OWNER DECISION REQUIRED.** Tip refunds are now **settlement-aware**: a **pre-settlement** tip refund proceeds and then blocks routing (the tip is no longer collectible/settleable); a **post-settlement** tip refund is **deterministically rejected** because reducing an already-settled merchant tip needs a clawback/adjustment mechanism that **does not exist** in the target (or legacy target) and is not an approved product decision. This preserves invariant #9 (no refunded-but-settled tip without reconciliation) without inventing a financial subsystem.

## 2. Existing architecture (VERIFIED)

- **Order refund** (`payment/infrastructure/refund.repository.ts`, P1.7.29/30): a full `Refund` entity keyed to the **order `PaymentIntent`** — WALLET credit or async RAZORPAY, per-intent `FOR UPDATE`, DB idempotency (`Refund.idempotencyKey @unique`, `providerRefundId @unique`), reserve→INITIATED→PROCESSED, wallet credit + `WalletEntry` + `Transaction` + full-refund coupon reversal. **Keyed on PaymentIntent — not directly reusable for a `TipPayment`** (a tip is not a PaymentIntent).
- **Tip refund foundation** (P1.7.38, `tip/infrastructure/tip.repository.ts` `recordRefundState`): state-only on `TipPayment` — `refundedAmountMinor`, `refundStatus`, `providerRefundId @unique`, `refundedAt`; capped at collected; same-`providerRefundId` idempotent; per-tip `FOR UPDATE`. Records refund STATE; does not itself move provider/wallet money.
- **Settlement** (`settlement/…`, P1.7.31/39): `Settlement`/`SettlementItem`/`Payout`. **No reversal, negative settlement, or adjustment exists.** Order refunds reduce only the *future* payout pool (net-of-refund); **post-settlement order clawback was already deferred (DR-COMM-CLAWBACK)** — there is no retroactive settlement change for orders either.

## 3. Tip refund state machine (VERIFIED + this slice)

```
CREATED ─capture→ CAPTURED ─(route)→ CAPTURED + ORDER_TIP SettlementItem
   │                  │                        │
   │                  ├─ refund (pre-settle) → PARTIALLY_REFUNDED / REFUNDED  (routing then blocked)
   │                  └─ refund (post-settle) → REJECTED (owner decision; no clawback)
   └─ (uncollected → not routable, not refundable-as-collected)
```
No new states invented — reuses `PaymentStatus` (CAPTURED / PARTIALLY_REFUNDED / REFUNDED / FAILED) + `RefundStatus`. "Routed/settled" = the existence of a `SettlementItem.tipPaymentId` (P1.7.39).

## 4. Failure matrix

| Case | Behavior (target) | Mechanism |
|---|---|---|
| A. refund **before** ORDER_TIP settlement | ALLOWED → tip PARTIALLY_REFUNDED/REFUNDED; routing then rejected | `recordRefundState` + routing status gate |
| B. refund **after** settlement, before payout | **REJECTED** (clawback = owner decision) | settlement-item check under tip lock |
| C. refund **after** payout/disbursement | **REJECTED** (same; even harder — money left the platform) | same |
| D. provider refund failure | tip stays CAPTURED; no state change | (provider wiring deferred; state foundation) |
| E. provider success + local persist fail | reconciled on retry via `providerRefundId` idempotency | same-key no-op |
| F. duplicate refund request | idempotent no-op (same `providerRefundId`) | `providerRefundId` guard |
| G. duplicate webhook | n/a yet (tip provider webhook deferred) — idempotency pattern ready | — |
| H. partial refund | SUPPORTED (cumulative `refundedAmountMinor`, capped) | `recordRefundState` |
| I. full after partial | SUPPORTED → REFUNDED when cumulative == collected | `recordRefundState` |
| J. refund > collected | REJECTED | cap check |
| race: refund ↔ route | serialized; a refunded tip is never settled | tip `FOR UPDATE` in BOTH paths + in-txn re-check |

## 5. Implementation performed (bounded)

1. **Settlement-aware tip refund** (`tip.repository.ts recordRefundState`): under the existing per-tip `FOR UPDATE`, reject if a `SettlementItem.tipPaymentId` exists (post-settlement → owner-decision clawback). Prevents invariant-#9 violation.
2. **Route↔refund race closure** (`settlement.repository.ts createTipSettlement`): lock the `TipPayment` row `FOR UPDATE` and re-verify `status = CAPTURED` inside the routing transaction, serializing with the refund path so a concurrently-refunded tip cannot be settled.

No schema/migration change; the P1.7.38 state foundation + P1.7.39 `tipPaymentId @unique` are reused.

## 6. Post-settlement clawback — OWNER DECISION REQUIRED

There is **no** merchant clawback / negative-settlement / future-settlement-deduction / adjustment mechanism (target or legacy-target). Options for the owner:

- **(a) Block post-settlement tip refunds** *(current safe default)* — customer cannot be refunded a tip once settled; no merchant recovery needed. Simplest; may be product-unacceptable.
- **(b) Clawback from the merchant** *(recommended to evaluate)* — reduce the merchant's payable balance / deduct from a future settlement / issue a negative adjustment. Requires a **new settlement-adjustment mechanism** (also unblocks DR-COMM-CLAWBACK for orders) — a real accounting subsystem; must be owner-approved and is out of scope to invent here.
- **(c) Platform absorbs** — refund the customer, do not recover from the merchant (platform cost). Requires an approved cost-absorption policy + a funding source record.

**Recommendation:** evaluate (b) with a canonical settlement-adjustment/reversal entity (reused for orders and tips), but this is a **product + accounting-architecture decision** and must not be silently chosen. Until decided, (a) is enforced.

## 7. Financial isolation invariants (TESTED)

`Order.grandTotalMinor`, the order `PaymentIntent`, order commission, and the order settlement are unchanged by any tip refund (a tip refund creates **no** order `Refund`/wallet entry); tip commission stays 0%; `beneficiaryPolicy` snapshot is immutable; no refunded tip remains settled without reconciliation (post-settlement refund blocked); no duplicate refund/settlement-adjustment (DB idempotency + row locks).

## 8. Legacy forensics (classification)

- Legacy `ORDER_TIP` settled to the vendor account via `tipSettledId`; legacy ordering refunds were **wallet credits** with ≥8 inconsistent formulas and **no idempotency** (doc 56) — **LEGACY-ONLY** (not reproduced). No clean legacy tip-clawback/settlement-reversal pattern exists — **MISSING** in both legacy and target ⇒ **POLICY DECISION REQUIRED** for post-settlement recovery. Provider refund idempotency/webhook pattern (target P1.7.30) is the **TARGET** pattern a future tip provider-refund would reuse.

## 9. Deferred (explicit)

- Actual tip **provider refund + customer money-return wiring** (wallet/Razorpay for the tip component) — the P1.7.38 foundation records state; live money-movement for tips is a later slice (reuse the P1.7.30 pattern; requires the tip refund-method product decision).
- Post-settlement **clawback/adjustment** mechanism (§6) — OWNER DECISION.
- DELIVERY_PERSON / SHARED_POOLED, delivery assignment/history, pool allocation, donations — untouched.

## 10. Validation

`tsc --noEmit` clean; lint + format clean; new `tip-refund-lifecycle.e2e-spec.ts` (5: pre-settlement refund + routing-blocked; post-settlement refund rejected + settlement untouched; refund↔route race serialized; idempotent duplicate + over-refund rejected; order-economics isolation); tip-routing (8) + tip-collection (13) regression green; **full suite 422/422 → 427/427**. `git diff` scoped to P1.7.40 (tip repo, settlement repo, test, docs).

---

## P1.7.40 Result

- **Status:** FORENSIC COMPLETE + bounded IMPLEMENTATION; post-settlement clawback = **OWNER DECISION REQUIRED**
- **Verified:** existing order-refund (PaymentIntent-keyed) + tip refund-state foundation + no settlement-reversal mechanism (target/legacy)
- **Implemented:** settlement-aware tip refund (post-settlement rejected) + route↔refund race closure (tip row lock + in-txn re-check)
- **Tip refund lifecycle:** CREATED → CAPTURED → (pre-settle) PARTIALLY/REFUNDED (routing then blocked) | (post-settle) REJECTED
- **Before ORDER_TIP settlement:** refund allowed; refunded tip is not routable
- **After ORDER_TIP settlement:** refund rejected; tip stays CAPTURED, settlement untouched — no impossible state
- **Post-settlement clawback exists?** NO (target & legacy) → OWNER DECISION REQUIRED
- **Owner decision:** post-settlement tip recovery — (a) block [current], (b) merchant clawback [recommended, needs a settlement-adjustment subsystem], (c) platform absorb
- **Financial isolation:** proven (order economics unchanged; no order refund/wallet entry from a tip refund)
- **Idempotency/concurrency:** `providerRefundId` same-key no-op + cap; per-tip `FOR UPDATE` serializes refund↔route; `SettlementItem.tipPaymentId @unique`
- **Tests:** 427/427 · **TypeScript:** clean · **Lint/format:** clean
- **Schema/migration change:** NONE

### Critical conclusion
Tip refunds are now financially correct across the parts of the lifecycle that are determinable without new product policy: pre-settlement refunds work and correctly prevent settlement of a refunded tip; post-settlement refunds are safely rejected rather than silently creating a refunded-but-settled tip. The one genuinely unresolved piece — recovering an already-settled tip from the merchant — has **no existing mechanism** and is an explicit **OWNER DECISION** (with option (b), a canonical settlement-adjustment/reversal entity, recommended for evaluation, which would also unblock order-side DR-COMM-CLAWBACK). Order economics remain fully isolated.

### Required next action
Obtain the **owner decision on post-settlement tip recovery** (§6). If (b) is chosen, the next slice is a **canonical settlement-adjustment/reversal foundation** (shared by tip and order post-settlement refunds). Independently, **tip provider-refund + customer money-return wiring** (reusing the P1.7.30 pattern) can proceed for the pre-settlement path once the tip refund-method is confirmed. Do not implement DELIVERY_PERSON/SHARED_POOLED or donations.
