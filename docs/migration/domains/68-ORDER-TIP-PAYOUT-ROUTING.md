# 68 — ORDER_TIP Payout Routing Foundation (P1.7.39) — **BLOCKED**

> **Type:** FORENSIC — Phase 0 GO GATE. **Outcome: BLOCKED at the GO GATE.** No code, schema, migration, API, or DTO change.
> **Governing context:** [65-TIP-DONATION-ORDER-MODEL-FOUNDATION.md](./65-TIP-DONATION-ORDER-MODEL-FOUNDATION.md) (P1.7.36 intent) + [66-TIP-DONATION-LIFECYCLE-ECONOMIC-CONTRACT.md](./66-TIP-DONATION-LIFECYCLE-ECONOMIC-CONTRACT.md) (P1.7.37 lifecycle).
> **Baseline:** P1.7.37 `0b87c02`, **401/401** (unchanged — no implementation).

Tags: **VERIFIED** (code file:line), **BLOCKED — OWNER/DATA**, **DEFERRED**.

---

## Central question

*"What exact, server-authoritative economic event converts a collected customer tip into one and only one payable `ORDER_TIP` obligation for the correct beneficiary, without changing existing order, commission, or settlement economics?"*

**It cannot be answered today: there is no collected customer tip, and no deterministically resolvable beneficiary. P1.7.39 is BLOCKED.**

## Phase 0 — GO GATE result: **FAIL**

P1.7.39 requires P1.7.38 to have ended with a validated collection foundation. It did **not** — **P1.7.38 was never executed**. Evidence:

- **No P1.7.38 slice / no doc 67.** The latest tip work is P1.7.36 (`6c1c0e7`, data foundation) and P1.7.37 (`0b87c02`, lifecycle contract). P1.7.37 explicitly recommended P1.7.38 as the collection foundation and **gated it on an owner decision** that has not been made.
- **No canonical collected-tip representation.** The only tip fields are `Order.tipMinor` (intent) — `schema.prisma:1002`. There is no captured-tip amount, no tip `Transaction`, no tip `PaymentIntent` line, no tip collection status, and no tip provider/payment reference anywhere in schema or code.
- **No provider/payment reference for a tip.** Capture is anchored on `grandTotalMinor`: `createIntent` amount = `order.grandTotalMinor` (`payment.service.ts:43`), verified `= intent.amountMinor` at capture/webhook (`payment.service.ts:79`, `razorpay-webhook.service.ts:111`). Tips are **never collected** (P1.7.37 §A/critical conclusion).
- **No collection status / idempotency semantics** for tips exist.

Required GO-GATE preconditions vs reality:

| Precondition | Status |
|---|---|
| Collection foundation implemented & validated | **MISSING** (P1.7.38 not executed) |
| Canonical collected-tip representation | **MISSING** |
| Provider/payment reference | **MISSING** (capture excludes tip) |
| Collection status | **MISSING** |
| Idempotency semantics for collection | **MISSING** |

Per the P1.7.39 Phase 0 instruction ("If P1.7.38 ended BLOCKED, STOP and report BLOCKED. Do not invent missing collection semantics."), the slice stops here. Phase 4's own floor invariant — **"NO collected tip → NO tip payout; a tip intent must never create a payout"** — is dispositive: with no collected-tip concept, no `ORDER_TIP` payout may be created.

## Second, independent blocker — Phase 6 beneficiary safety: **FAIL**

Even if collection existed, the tip beneficiary is **not deterministically server-resolvable** today:

- The schema models `DeliveryPerson` (`schema.prisma:1516`) and `DeliveryTask.deliveryPersonId` (**nullable**, `:1541-1542`), but **no delivery module exists** in the target API (`apps/api/src/modules/`: catalog, experience, identity, merchant, offer, onboarding, ordering, payment, reference-data, seating, settlement, subscription, user-profile — **no delivery**). Nothing assigns `deliveryPersonId`; it is never populated.
- The **legacy beneficiary rule** for a tip (restaurant vs delivery person vs pooled staff vs platform) is **not established in the target** — the delivery domain has been deferred throughout the program. Determining it is an **owner decision + delivery-domain migration** dependency, not something to infer.
- Phase 6 mandates: "If the current data model cannot deterministically resolve the beneficiary, STOP and mark the slice BLOCKED rather than implementing speculative routing." → **BLOCKED.**

## Forensic decision record

### A. Tip intent — **EXISTS (VERIFIED)**
`Order.tipMinor` (BigInt, NOT NULL default 0), recorded at order creation only; never mutated post-creation; never null/negative (P1.7.36/37).

### B. Tip collection — **DOES NOT EXIST**
No collected-money representation. The customer is not charged for the tip (capture = `grandTotalMinor`, which excludes it). P1.7.38 (collection) is the missing predecessor.

### C. Tip eligibility — **UNDEFINED (cannot be established)**
Eligibility (collection success + completion/settlement + no-refund + beneficiary resolution) cannot be defined because its first term (collection) does not exist. No timing may be invented.

### D. Beneficiary resolution — **BLOCKED (not resolvable)**
No server-authoritative beneficiary is derivable: delivery domain unmigrated, `deliveryPersonId` nullable/unassigned, legacy rule not established, owner decision required. Client-supplied/mutable-state beneficiaries are prohibited.

### E. ORDER_TIP payout — **NOT IMPLEMENTED**
`SettlementPayoutType.ORDER_TIP` exists (`schema.prisma:133`) but is never produced; `Settlement.payoutType` is hardcoded `'ORDER'` (`settlement.repository.ts:130`). `ORDER_TIP` remains the plausible canonical representation for a **future** separate tip economic component, but must not be created without collection + beneficiary.

### F. Idempotency — **PATTERN AVAILABLE, not applicable yet**
Established target patterns exist and would be reused: unique `SettlementItem.paymentIntentId`, unique `Payout.idempotencyKey`/`providerPayoutId`, unique webhook `providerEventId`, compare-and-set status transitions. A future canonical key would be deterministic per `(sourceCollection/order, ORDER_TIP)`. Not usable now (no collection to key on).

### G. Refund dependency — **UNRESOLVED**
Current refunds are bounded by `intent.amountMinor` (= grandTotal), which excludes tips (`refund.repository.ts:318`); tips are not refundable via the current path (P1.7.37). Whether a tip payout may occur before the refund-risk window closes cannot be answered until collection + tip-refund semantics exist. No prorating/apportionment invented.

### H. What remains deferred
Tip collection (P1.7.38), tip beneficiary resolution + delivery-domain migration, tip eligibility/timing, `ORDER_TIP` payout creation, tip refund interaction; donation liability + charity transfer (P1.7.40); GST (DR-03a).

### I. Exact P1.7.40 boundary
Per the directive, **P1.7.40 = Donation Liability + Charity Transfer Foundation**, kept **completely separate** from ORDER_TIP payout routing. Note it shares the **same unmet predecessor** (collection foundation) and is therefore also gated on P1.7.38 + an owner decision; it must not be started as routing until donation *collection* + a charity-liability model exist.

## Phase 3 — settlement isolation (unchanged, VERIFIED)
No change was made. Commission basis (`subtotal − vendor discount`), commission, `grandTotalMinor`, `order_total_integrity`, restaurant gross, and marketplace deductions are untouched; `Settlement.payoutType` remains `'ORDER'`. No `ORDER_TIP` record is created.

## Validation (BLOCKED / docs-only slice)
No code/schema/API/DTO/migration change. Verified regardless: `tsc --noEmit` clean, lint/format clean, **full suite 401/401**, `git diff` limited to documentation.

---

## P1.7.39 Go/No-Go

**BLOCKED — No-Go.** Two independent, dispositive dependencies are unmet:

1. **No collected tip exists** — P1.7.38 (Tip/Donation Collection/Capture Foundation) was never executed and is itself gated on an owner decision on whether/how the India baseline collects tips. GO-GATE precondition fails; Phase 4 floor invariant ("no collected tip → no tip payout") forbids any `ORDER_TIP` payout.
2. **Beneficiary is not deterministically resolvable** — the delivery domain is unmigrated, `deliveryPersonId` is nullable/unassigned, and the legacy beneficiary rule is not established (owner + delivery-domain dependency). Phase 6 mandates BLOCKED over speculative routing.

**Exact missing contract/data dependencies:** (a) a canonical collected-tip representation with provider reference, collection status, and idempotency (P1.7.38); (b) a server-authoritative tip beneficiary (owner decision + delivery-domain migration); (c) tip refund-window semantics (dependent on collection).

**Required predecessors before P1.7.39 can proceed:** execute **P1.7.38 — Tip/Donation Collection (Capture) Foundation**, and obtain the **owner decision** on tip collection *and* tip beneficiary (with the delivery domain migrated far enough to assign/resolve the beneficiary). No `ORDER_TIP` routing, no beneficiary inference, and no collection semantics were invented in this slice.
