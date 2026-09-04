# 66 — Tip/Donation Lifecycle & Economic Contract (P1.7.37)

> **Type:** FORENSIC / RECONCILIATION ONLY — trace the full lifecycle of `Order.tipMinor` / `Order.donationMinor` (added P1.7.36) from customer intent through payment, settlement, refund, and eventual disbursement. **No code, schema, migration, API, or DTO change.**
> **Governing context:** [64-PAYOUT-CHARGES-DEDUCTIONS-RECONCILIATION.md](./64-PAYOUT-CHARGES-DEDUCTIONS-RECONCILIATION.md) (DR-TIP/DR-DONATION) + [65-TIP-DONATION-ORDER-MODEL-FOUNDATION.md](./65-TIP-DONATION-ORDER-MODEL-FOUNDATION.md).
> **Baseline:** P1.7.36 `6c1c0e7`, **401/401** (unchanged — forensic only).

Tags: **VERIFIED** (code file:line), **DEFERRED**, **BLOCKED — OWNER/DATA**.

---

## Critical conclusion (canonical economic lifecycle)

**Today, `tipMinor` and `donationMinor` are recorded *customer intent only* — they are never collected, never held, never disbursed, and never refundable.** Because the entire money-movement chain (capture, refund, settlement) is anchored on `grandTotalMinor = PaymentIntent.amountMinor`, and P1.7.36 deliberately holds tip/donation **outside** `grandTotalMinor`, the customer is **not charged** for tip/donation at capture. The canonical lifecycle is therefore currently truncated:

```
customer intent (Order.tipMinor/donationMinor)  ──►  [ NOT collected ]  ──►  [ nothing to settle ]
                                                     [ NOT refundable ]      [ nothing to disburse ]
```

The **money-in step does not exist yet**. No disbursement, charity transfer, or refund of tip/donation can be built until collection is modeled. **The smallest safe next slice is a tip/donation collection (capture) foundation, NOT payout routing.**

---

## A. Confirmed current behavior (VERIFIED)

1. **Creation is the only write path.** `OrderService.createOrder` reads `input.tipMinor/donationMinor` (default `0n`), validates `>= 0`, and passes them through **without** adding to `grandTotalMinor` (`order.service.ts:134-135,167-176,180-181`). The repo persists them once (`order.repository.ts:209-210`). The only other `Order` write, `updateStatusWithEvent`, sets **only `status`** (`order.repository.ts:312`) — **no post-creation mutation of tip/donation exists**. NOT NULL default 0 ⇒ never null; validated ⇒ never negative.
2. **Capture excludes them.** `PaymentService.createIntent` sets `amountMinor: order.grandTotalMinor` (`payment.service.ts:43`); `verifyAndCapture` requires the captured amount to equal `intent.amountMinor` (`payment.service.ts:79`); the webhook re-checks `entity.amount === intent.amountMinor` (`razorpay-webhook.service.ts:111`). **Tip/donation are never part of the captured amount.**
3. **Refund is bounded by the captured amount.** `remaining = intent.amountMinor − reserved` (`refund.repository.ts:318`); a refund > remaining is rejected (`:321`). Since `intent.amountMinor = grandTotalMinor`, **tip/donation are outside the refundable ceiling** — unrefundable via the current path.
4. **Settlement excludes them.** Eligible contributions use `net = intent.amountMinor − PROCESSED refunds`; basis = `subtotal − (ADMIN?0:discount)` (`settlement.repository.ts:86-93`). Neither reads `tipMinor`/`donationMinor`. `Settlement.payoutType` is hardcoded `'ORDER'` (`:130`).
5. **No disbursement/charity code exists.** `SettlementPayoutType.ORDER_TIP` / `SCAN_AND_PAY` enum values exist (`schema.prisma:131-135`) but are **never produced**; no code references `ORDER_TIP`, a tip beneficiary, a donation beneficiary, or `UDBHAV`.

## B. Confirmed economic semantics (VERIFIED)

- **Order principal (`grandTotalMinor`)** — customer-paid, captured to `PaymentIntent`, merchant revenue net of commission; the sole basis of capture/refund/settlement.
- **Tip / donation** — customer-**intended** amounts recorded on the Order, **excluded** from `grandTotalMinor`, the `order_total_integrity` CHECK, the commission basis, commission, restaurant gross, settlement deductions, and merchant payout (P1.7.36; re-verified above). They currently carry **no collected money and no liability**.
- **Commission** — `floor((subtotal − vendor discount) × commissionBps/10000)`; refund-independent (P1.7.34).

## C. Unknown / unimplemented behavior (DEFERRED)

- Whether tip/donation are **collected** from the customer at all in the target (no capture path today).
- Tip **beneficiary** (restaurant vs delivery person vs employee) and the disbursement mechanism (legacy: separate `ORDER_TIP` payout).
- Donation **beneficiary** and whether it becomes a **charity liability** + transfer (legacy: pass-through to `UDBHAV_ACCOUNT`).
- Tip/donation **refund and partial-refund apportionment**.
- GST treatment of tip/donation (DR-03a).

## D. Contradictions

**One reconcilable gap (not a code contradiction).** Legacy `settleAmount = total_amount` **included** tip+donation (the customer paid them), then subtracted them from the merchant body and disbursed/transferred them separately. The target deliberately keeps tip/donation **outside** `grandTotalMinor`, so the target **does not collect** them at capture. Result: the target can record tip/donation *intent* but has **no money** to disburse/transfer/refund. This is the central gap the next slice must close (collection first). No internal target code contradiction exists — the exclusion is consistent everywhere.

## E. Data available for deterministic refund/accounting decisions

- Per order: `tipMinor`, `donationMinor`, `subtotalMinor`, `discountTotalMinor`, `grandTotalMinor`, `offer.settlementType`.
- Per payment: `PaymentIntent.amountMinor` (= grandTotal), `PaymentAttempt` (CAPTURED, timestamp), PROCESSED `Refund` sum.
- Settlement/payout ledger: `Settlement`/`SettlementItem` (unique per `paymentIntentId`), `Payout` (`idempotencyKey`/`providerPayoutId` unique).

## F. Data currently missing (blocks deterministic disbursement/refund)

- A **collected** tip/donation amount (captured money) distinct from `grandTotalMinor` — the money-in record.
- Tip/donation **beneficiary identity** + account/route.
- A **charity-liability** ledger concept for donations.
- A **tip/donation refund** linkage (current `Refund` is bounded by `intent.amountMinor` and has no tip/donation component).
- Provider disbursement/transfer references (a tip/charity `Payout`/transfer id).

## G. Required invariants for a future tip/donation payout implementation

1. **Collection precedes disbursement** — never disburse/transfer money that was not captured.
2. **Isolation from commission/CHECK** — collection must not enter `grandTotalMinor`, `order_total_integrity`, or the commission basis (preserve P1.7.34/36).
3. **Idempotent disbursement** — mirror existing patterns: unique `paymentIntentId` per settlement item, unique `idempotencyKey`/`providerPayoutId` per payout, unique `providerEventId` per webhook, compare-and-set status transitions — so a tip disbursement / charity transfer happens **at most once** under retry/replay.
4. **Refund symmetry** — a tip/donation refund must reduce only the tip/donation component and reconcile against its own collected amount (never against `grandTotalMinor`).
5. **Exact BigInt** money; no floating point; non-negative; conservation (disbursed + refunded ≤ collected).
6. **Beneficiary authority** — disbursement target resolved server-side from an authoritative beneficiary, not client input.

## H. Smallest safe implementation boundary for the next slice

**Tip/Donation Collection (Capture) Foundation** — model the customer-collected tip+donation as a captured amount **separate from `grandTotalMinor`** (e.g. a dedicated captured component / its own `PaymentIntent` line or `Transaction`), establishing money-in with idempotency, **without** touching `grandTotalMinor`, the CHECK, the commission basis, or capture of the principal. This is the deterministic prerequisite; only after money-in exists can disbursement, charity transfer, and refund be built. **No payout routing, no charity transfer, no beneficiary resolution in that slice.**

## I. Recommended next slice

**P1.7.38 — Tip/Donation Collection (Capture) Foundation** (per §H), gated by an **owner decision** on whether the India baseline collects tips/donations at checkout and, if so, the collection mechanism (bundled-but-separate captured component vs. independent payment). Defer beneficiary/charity/tip-disbursement/refund to subsequent slices. GST stays **DR-03a — BLOCKED**.

## Reconciliation against prior work (§10)

- **P1.7.35** (payout-pool): confirmed tips paid separately (`ORDER_TIP`) and donations as charity pass-through — both **deferred**; this trace confirms neither is collected/represented in the target money chain yet.
- **P1.7.36** (data foundation): re-verified `tipMinor`/`donationMinor` are additive, outside grand-total and commission; this trace extends that to the full lifecycle (capture/refund/settlement/payout) and finds the **collection gap**.
- **`order_total_integrity` CHECK**: unchanged; tip/donation remain outside it. **Not altered.**
- **Settlement economics**: unchanged; no code path includes tip/donation. **Not altered.**

## Validation (forensic-only slice)

No code/schema/API/DTO change. Verified nonetheless: `tsc --noEmit` clean, lint/format clean, **full suite 401/401**, and `git diff` limited to documentation.

---

## P1.7.37 Go/No-Go

- **NO-GO** for implementing tip/donation **payout routing**, **charity transfer**, **beneficiary resolution**, or **tip/donation refund** next — the money is **not collected**, so there is nothing to disburse or refund, and required beneficiary/liability data is missing (§F).
- **GO** for **P1.7.38 — Tip/Donation Collection (Capture) Foundation** (§H) as the smallest safe next step, **conditional on an owner decision** confirming that the India baseline collects tips/donations and the collection mechanism. Until that decision, the fields remain correctly-modeled recorded intent (P1.7.36) with no economic effect.
