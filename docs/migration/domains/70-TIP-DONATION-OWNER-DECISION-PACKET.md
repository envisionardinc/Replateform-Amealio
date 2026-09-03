# 70 — Tip/Donation Owner Decision Packet & Financial Policy Contract (P1.7.42)

> **Type:** DECISION-RECONCILIATION / CONTRACT-DEFINITION. **No code, schema, migration, API, or DTO change.** Converts the unresolved findings of P1.7.37/38/39/41 into an explicit, auditable owner-decision packet that determines the future implementation path.
> **Status of this packet:** **BLOCKED — OWNER/DATA.** The packet is *decision-ready* — all evidence, constraints, options, and branching rules are recorded — but **no owner decision has been supplied**, so every policy line is recorded as `BLOCKED — OWNER/DATA (awaiting owner)`. No decision is fabricated, assumed, or inferred from legacy.
> **Baseline:** P1.7.41 `7153b85`, **401/401** (unchanged — decision/documentation only).

Tags: **DECIDED**, **REJECTED**, **DEFERRED**, **BLOCKED — OWNER/DATA**, **PROVEN** (target), **HISTORICAL** (legacy).

---

## 1. Executive Decision Summary

**No owner decision has been provided to this slice.** Every row below is therefore `BLOCKED — OWNER/DATA`. The "Options" column is the exact menu the owner must choose from; the "Implementation consequence" states what each choice triggers (see §6 branching rules).

| Decision | Owner decision | Options (owner picks one) | Evidence | Implementation consequence |
|---|---|---|---|---|
| Tips/donations collected? | **BLOCKED — OWNER/DATA** | A1 not collected · A2 collected | P1.7.37/38 (doc 66/67) | A1 → close chain; A2 → P1.7.38 becomes precursor |
| Collection architecture (if A2) | **BLOCKED — OWNER/DATA** | bundled-tracked-component · separate payment intent | P1.7.38 (doc 67 §Phase 2) | determines the P1.7.38 model shape |
| Tip beneficiary (if tips collected) | **BLOCKED — OWNER/DATA** | B1 merchant · B2 delivery person · B3 pooled/other | P1.7.39/41 (doc 68/69) | B1 → reuse settlement path; B2 → P1.7.42A precursor; B3 → STOP (define model) |
| Tip refundable? | **BLOCKED — OWNER/DATA** | yes · no | P1.7.37/38 (doc 66/67) | defines tip refund model |
| Tip refund window | **BLOCKED — OWNER/DATA** | e.g. pre-capture / pre-completion / pre-payout / none | doc 66 §G | gates payout timing vs refund risk |
| Donation collected? | **BLOCKED — OWNER/DATA** | not collected · collected | P1.7.38 (doc 67); P1.7.40 (absent) | independent of tips (§4) |
| Donation beneficiary/charity | **BLOCKED — OWNER/DATA** | customer-selected · platform-configured · merchant · other | P1.7.40 (not executed) | defines charity-liability model |
| Donation refund policy | **BLOCKED — OWNER/DATA** | refundable? window? follows-tip? | doc 66 §G | defines donation refund model |

## 2. Evidence (file:line)

- **Intent only, not collected:** `Order.tipMinor`/`donationMinor` recorded at creation, never mutated post-creation, NOT NULL default 0 — `apps/api/src/modules/ordering/application/order.service.ts:134-135,180-181`; `order.repository.ts:209-210,312`; `prisma/schema.prisma:1002-1003`.
- **Charge = grandTotal (excludes tip/donation):** `payment.service.ts:43` (`amountMinor = order.grandTotalMinor`), verified `= intent.amountMinor` at capture `:79` and webhook `razorpay-webhook.service.ts:111`.
- **Refund ceiling excludes tip/donation:** `refund.repository.ts:318` (`remaining = intent.amountMinor − reserved`).
- **Settlement excludes tip/donation; `payoutType` hardcoded `'ORDER'`:** `settlement.repository.ts:86-93,130`.
- **`PaymentIntent` has only `amountMinor`** (no collected-vs-merchant split): `prisma/schema.prisma:1073-1091`.
- **Legacy `ORDER_TIP` → vendor/merchant settlement account:** `amealio-vendordashboard/src/models/settlement.model.ts:77-87`; `settlement.class.ts:166-171,248-266`; `settlement-process.class.ts:89,172`; `settlement-process-cron.class.ts:68,99`.
- **Legacy self-delivery assignment (HISTORICAL):** `Order.selfDeliveryPerson` assigned at READYTOPICK + socket `assign_delivery_person` — `ordering.class.ts:509-541,561,3485-3561`; `order-completion-cron.class.ts:41-51,92-103`.
- **Target delivery domain schema-only/unimplemented:** `prisma/schema.prisma:209-228,1505-1548`; no delivery module in `apps/api/src/modules/`.

## 3. Historical Behavior (isolate from target policy)

**`legacy ORDER_TIP → vendor/merchant settlement`** (VERIFIED, §2). Legacy also ran self-delivery (`Order.selfDeliveryPerson`) + Porter/Dunzo logistics. **This is HISTORICAL evidence only.** Per the hard constraints, it is **NOT** the target rule unless the owner explicitly selects merchant as the tip beneficiary (B1). Legacy is surfaced here solely to inform the owner's B-decision; it does not pre-decide it.

## 4. Target Constraints (PROVEN facts)

- Payment intent amount is anchored to `grandTotalMinor` (server-authoritative; excludes tip/donation).
- **No canonical collected-tip amount** and **no canonical collected-donation amount** exist.
- **No delivery-assignment implementation** and **no assignment history** exist; `DeliveryTask.deliveryPersonId` is a nullable, mutable FK with no timestamp; `DeliveryTask` is 1:1 with `Order`.
- Existing settlement architecture: `Settlement`/`SettlementItem`/`Payout`, commission on `subtotal − vendor discount`, `payoutType = 'ORDER'`.
- Refund architecture is bounded by `intent.amountMinor` (= grandTotal); refunds cannot currently touch tip/donation.
- `order_total_integrity` CHECK fixes `grand = subtotal − discount + tax + fee + delivery` (tip/donation outside it).

## 5. Owner Decisions (register)

No `DECIDED`/`REJECTED`/`DEFERRED` values can be recorded because **no owner input was supplied to this slice**. All decisions are:

- **A. Collection (tips):** `BLOCKED — OWNER/DATA`
- **A. Collection architecture:** `BLOCKED — OWNER/DATA`
- **A. Collection (donations):** `BLOCKED — OWNER/DATA`
- **B. Tip beneficiary:** `BLOCKED — OWNER/DATA` (legacy evidence = vendor/merchant, not auto-adopted)
- **C. Tip refundability / window / partial / cancellation-auto-refund / failure interaction / merchant-refund interaction / post-settlement / post-transfer / authoritative-refund-event:** `BLOCKED — OWNER/DATA` (all 10 Phase-3 questions unanswered)
- **D. Donation beneficiary/charity identity source / platform-liability / sync-vs-async transfer / charity-selection authority / donation-refund-vs-tip-refund:** `BLOCKED — OWNER/DATA` (Phase-4; independent of tips)

No ambiguous language ("probably/likely/assume/TBD-without-owner") is used; each is an explicit `BLOCKED — OWNER/DATA` awaiting a named owner decision.

## 6. Implementation Branch (pre-wired; selected once the owner decides)

The branch is **not yet selected** (decisions BLOCKED). The rules below apply deterministically once the owner answers:

- **Branch 1 — NOT collected (A1):** P1.7.38 → CLOSED BY POLICY; P1.7.39 → CLOSED BY POLICY; P1.7.40 → CLOSED BY POLICY if donations also not collected. No payment/settlement change. `Order.tipMinor`/`donationMinor` stay recorded intent.
- **Branch 2 — Collected (A2) + merchant beneficiary (B1):** next = **P1.7.38 Collection/Capture Foundation**, then **P1.7.39 Merchant Tip Settlement/Routing** (evaluate reuse of the existing merchant settlement/payout path). No delivery-assignment foundation required for tip routing.
- **Branch 3 — Collected (A2) + delivery-person beneficiary (B2):** next = **P1.7.38**, then **P1.7.42A — Delivery Assignment + Immutable Assignment-History Foundation** (mandatory precursor), then **P1.7.39 Delivery-Person Tip Routing**. P1.7.39 must not precede P1.7.42A.
- **Branch 4 — Collected (A2) + pooled/other (B3):** STOP — architecture/owner blocker until beneficiary identity, allocation formula, eligibility, settlement destination, timing, refund, and reconciliation are fully owner-defined.

Donation policy (Phase 4) branches **independently**; a tip decision does not resolve it. If donation policy is undecided, **P1.7.40 remains independently BLOCKED** regardless of the tip branch.

## 7. Dependency status after this slice

- **P1.7.38 (collection):** BLOCKED — OWNER/DATA (unchanged; awaiting Decision A).
- **P1.7.39 (tip payout):** BLOCKED (awaiting A + B, and B2 additionally requires P1.7.42A).
- **P1.7.40 (donation liability/charity):** BLOCKED — OWNER/DATA (awaiting the independent Phase-4 decisions).
- **P1.7.41 (delivery reconciliation):** FORENSIC COMPLETE (doc 69) — facts established; no decision here changes it.

## 8. Validation
No code/schema/API/DTO/migration change. Verified: `tsc --noEmit` clean, lint/format clean, **full suite 401/401**, `git diff` limited to documentation.

---

## P1.7.42 Result

- **Status:** BLOCKED — OWNER/DATA (decision-ready packet produced; **no owner decision supplied**, so none recorded as DECIDED)
- **Tips collected:** UNRESOLVED
- **Donations collected:** UNRESOLVED
- **Collection architecture:** UNRESOLVED (options: bundled-tracked-component | separate payment intent)
- **Tip beneficiary:** UNRESOLVED (options: MERCHANT | DELIVERY PERSON | POOLED/OTHER; legacy evidence = merchant, not auto-adopted)
- **Tip refund policy:** UNRESOLVED (all 10 Phase-3 questions unanswered)
- **Donation refund policy:** UNRESOLVED (independent of tips)
- **Delivery assignment foundation required:** CONDITIONAL — YES only if the owner selects a delivery-person beneficiary (B2); otherwise NO
- **P1.7.38:** BLOCKED
- **P1.7.39:** BLOCKED
- **P1.7.40:** BLOCKED
- **Code changes:** NO · **Schema changes:** NO
- **Tests:** 401/401 · **TypeScript:** clean · **Lint/format:** clean

### Critical conclusion
No owner financial-policy decision has been established. This slice cannot manufacture one: the governing principle is that the owner decides policy, and the prompt supplies the decision *framework* but no actual selections. The packet is therefore produced as a **decision-ready contract** — full evidence, isolated legacy behavior (`legacy ORDER_TIP → vendor/merchant`, not adopted), target constraints, an explicit decision register (all `BLOCKED — OWNER/DATA`), and four pre-wired branching rules — so the migration path resolves deterministically the instant the owner answers the three questions (collect? beneficiary? refund policy?), with donation policy branching independently. No decision, beneficiary, or legacy-as-policy conversion was assumed.

### Required next action
**Obtain the owner's answers to the §1 decision table** (specifically: A — are tips/donations collected and, if so, the collection architecture; B — the tip beneficiary; C — tip and donation refund policy). No implementation slice may proceed until these are recorded. Do not speculatively implement collection, routing, or delivery assignment before the owner decision is captured.
