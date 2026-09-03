# 67 — Tip/Donation Collection (Capture) Foundation (P1.7.38) — **BLOCKED**

> **Type:** FORENSIC — collection-foundation attempt with a Phase 2 owner-decision gate. **Outcome: BLOCKED — OWNER/DATA.** No code, schema, migration, API, or DTO change.
> **Governing context:** [65](./65-TIP-DONATION-ORDER-MODEL-FOUNDATION.md) (intent) + [66](./66-TIP-DONATION-LIFECYCLE-ECONOMIC-CONTRACT.md) (lifecycle) + [56](./56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md)/[52](./52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md) (legacy payment/cart runtime).
> **Baseline:** P1.7.39 `1c7a6bd`, **401/401** (unchanged — no implementation).

Tags: **VERIFIED** (code/doc), **BLOCKED — OWNER/DATA**, **DEFERRED**.

---

## Purpose & result

P1.7.38 aims to establish a canonical, server-authoritative representation of tip/donation amounts **actually collected** (vs. merely intended), to unblock P1.7.39 (tip payout) and P1.7.40 (donation liability). **It is BLOCKED at the Phase 2 owner-decision gate:** the target does not collect tips/donations today, the payment architecture has no way to distinguish collected funds from merchant funds, and the collection *mechanism* + *charge policy* + *refund policy* are unresolved business/architecture decisions that cannot be derived from repository evidence without reversing a deliberate prior decision and reworking capture/settlement/refund. Per the CRITICAL NO-GO conditions, the slice stops rather than inventing collection semantics.

## Phase 0 — payment-lifecycle forensic trace (VERIFIED)

| Step | Finding (target) | Evidence |
|---|---|---|
| Order + intent creation | `Order.tipMinor`/`donationMinor` recorded at creation only; never mutated post-creation; NOT NULL default 0 | `order.service.ts:134-135,180-181`; `order.repository.ts:209-210,312` |
| Payment intent / amount | `PaymentIntent.amountMinor = order.grandTotalMinor` — **server-authoritative, EXCLUDES tip/donation** | `payment.service.ts:43` |
| Provider request | Razorpay order created for the intent amount (= grandTotal); no tip/donation line | `payment.repository.ts` (createIntent) |
| Capture | Verified capture requires captured amount `= intent.amountMinor` (signature + amount + currency + order id) | `payment.service.ts:79-83` |
| Webhook | `payment.captured` re-checks `entity.amount === intent.amountMinor` | `razorpay-webhook.service.ts:111` |
| Refund | Ceiling `remaining = intent.amountMinor − reserved`; **tips/donations outside the refundable amount**; refunds = wallet credit | `refund.repository.ts:318`; legacy `wallet.class.ts:64-101` (doc 56) |
| Settlement | Merchant gross `net = intent.amountMinor − PROCESSED refunds`; basis = `subtotal − vendor discount` | `settlement.repository.ts:86-93` |
| `PaymentIntent` model | **Only `amountMinor`** — no field distinguishing customer charge from merchant-settleable amount | `schema.prisma:1073-1091` |

**Proven facts:** `tipMinor`/`donationMinor` originate at order creation (intent); **neither enters the provider charge amount** (charge = grandTotal); neither is persisted as a collected amount; neither is in `grandTotalMinor`; refunds do not account for either; there is **no collected-tip/donation record, provider reference, collection status, or idempotency**. Every downstream money consumer (capture, refund, settlement) treats `PaymentIntent.amountMinor` as the merchant-settleable grandTotal.

**Legacy contrast (VERIFIED, docs 52/56):** the charged `total_amount` was **client-supplied and bundled** tip+donation into a **single** Razorpay charge (`order create performs no server recompute`; `subtotal/discount/tax/surcharge/total client-supplied`), then settlement subtracted tip/donation from the merchant body and handled them separately; ordering refunds were **wallet credits** with ≥8 inconsistent formulas and no idempotency.

## Phase 2 — owner-decision gate: **BLOCKED**

The following are genuine business-policy decisions (not derivable technical details), each required to make collection deterministic:

1. **Are tips charged to the customer in the target India baseline?** Unresolved. Legacy charged them (bundled); the target **deliberately excludes** them from the charge (`amountMinor = grandTotal`, P1.7.36) and **no target flow charges them**. The consumer checkout/charge path is **not migrated**.
2. **Are donations charged to the customer?** Same as (1).
3. **Collection mechanism — bundled vs separate intent vs other?** Unresolved and **high-impact**:
   - *Bundled* (legacy style): the customer charge becomes `grandTotal + tip + donation`, so `PaymentIntent.amountMinor` would have to mean "full charge" and a **new merchant-gross field** would be needed — reworking capture verification, the refund ceiling, and settlement gross derivation (all currently keyed on `amountMinor = grandTotal`). This **reverses the deliberate P1.7.36 decision** and is exactly the "generalized payment refactoring / speculative payout semantics" the slice forbids.
   - *Separate intent*: a second Razorpay order/charge for tip+donation — requires the (unmigrated) checkout to create it.
   Neither can be chosen from evidence without an owner call.
4. **Authorization succeeds but tip/donation collection fails →** behavior unresolved (depends on mechanism).
5. **Order succeeds without the optional tip/donation →** unresolved (depends on 1-3).
6-8. **Partial refund / tip refundable / donation refund window →** unresolved. P1.7.37 established no deterministic refund info; legacy used wallet-credit refunds with inconsistent formulas (doc 56). No refund policy exists to model against.
9. **Exact amount eligible for downstream payout/liability →** undefined until 1-3 are decided.

Per the Phase 2 instruction ("If an owner decision is required and cannot be established from repository evidence or existing authoritative documentation, STOP and record BLOCKED rather than inventing policy"), and after confirming **no authoritative doc resolves the tip/donation charge/collection policy** (docs consistently DEFER it), the gate is BLOCKED.

## CRITICAL NO-GO conditions met

- **Actual collection semantics cannot be established** (mechanism + charge policy undecided).
- **The payment architecture cannot safely distinguish collected funds from intent** — `PaymentIntent` has only `amountMinor` (= grandTotal); adding a collected-vs-merchant split is the very thing that needs the owner-approved mechanism.
- **Required owner business policy is unresolved** (Phase 2 #1-3, 7-8).
- **Implementing the foundation would require speculative payout/liability semantics** — any model would presuppose a charge mechanism and a refund policy that are not established.

## Phase 8 — forensic completion review

1. **Customer intent amount?** `Order.tipMinor` / `Order.donationMinor` (VERIFIED).
2. **Amount actually collected?** **None** — tips/donations are not charged (charge = grandTotal).
3. **Canonical collected amount stored where?** Nowhere (does not exist).
4. **Provider event proving collection?** None (no tip/donation charge/capture).
5. **Duplicate capture/webhook prevention?** N/A (nothing collected); the existing intent-level idempotency (`razorpayOrderId @unique`, webhook `providerEventId`, capture compare-and-set) is the pattern a future model would reuse.
6. **Refund state representation?** None for tip/donation; policy unresolved.
7. **Can P1.7.39 determine whether a tip was collected?** **No** — remains BLOCKED.
8. **Can P1.7.40 determine whether a donation was collected?** **No** — remains BLOCKED.
9. **Tip beneficiary routing resolved?** No (delivery domain unmigrated; owner decision — doc 68).
10. **Donation recipient/charity routing resolved?** No.
11. **Did any settlement/commission economics change?** **No** — nothing was modified.
12. **Outstanding owner decisions?** Phase 2 #1-3, 7, 8 (charge policy, mechanism, refund policy).

## Decision record

- **Facts from the repository (VERIFIED):** target charge = `grandTotal` (excludes tip/donation); `PaymentIntent` has a single `amountMinor` consumed as merchant gross by capture/refund/settlement; no collected-tip/donation record exists; legacy bundled tip+donation into one client-supplied charge and refunded via wallet credit.
- **Owner decisions (required, BLOCKED):** whether tips/donations are charged; the collection mechanism (bundled vs separate intent); tip/donation refundability + window.
- **Implementation decisions (deferred until unblocked):** collected-amount model shape (depends on mechanism), provider-reference linkage, idempotency key derivation, refund-linkage fields.
- **Assumptions:** none made (explicitly avoided per the "most important rule").
- **Unresolved dependencies:** owner charge/collection/refund policy; migration of the consumer checkout/charge path; delivery-domain migration (for the tip beneficiary, P1.7.39).
- **Migration impact:** none (no schema change).
- **Validation evidence:** `tsc --noEmit` clean; lint/format clean; **full suite 401/401**; `git diff` limited to documentation.

## What remains deferred

Tip/donation **collection** (this slice, pending owner decision); tip **payout routing** (P1.7.39); donation **liability + charity transfer** (P1.7.40); tip/donation **refund policy**; GST (DR-03a).

---

## P1.7.38 Go/No-Go — **BLOCKED**

**Exact blocker:** the target does not collect tips/donations and the payment architecture cannot distinguish collected funds from the merchant grandTotal; the collection **charge policy**, **mechanism** (bundled vs separate intent), and **refund policy** are unresolved owner business decisions.

**Evidence:** `PaymentIntent.amountMinor = order.grandTotalMinor` (`payment.service.ts:43`), consumed as merchant gross by capture (`:79`), refund (`refund.repository.ts:318`), and settlement (`settlement.repository.ts:86-93`); `PaymentIntent` has no collected-vs-merchant field (`schema.prisma:1073-1091`); no target flow charges tips; no authoritative doc resolves the policy.

**Why proceeding would be speculative:** any collection model presupposes (a) that tips/donations are charged, (b) a specific mechanism that would either reverse the deliberate P1.7.36 grandTotal decision and rework capture/settlement/refund, or depend on the unmigrated checkout, and (c) a refund policy that does not exist — all invented, not evidenced.

**Owner decision required (decision menu):**
1. Does the India-baseline target charge the customer for tips and/or donations at checkout? (yes/no per component)
2. If yes, the collection mechanism: **(a)** bundle into the order payment as a separate tracked component (introduces a customer-charge vs merchant-gross split — larger payment-architecture change), or **(b)** a separate payment intent per tip/donation.
3. Refund policy per component: refundable? full/partial? within what window relative to capture/completion?

**Next prerequisite:** obtain the above owner decisions, then re-run P1.7.38 to implement the smallest collection model consistent with the chosen mechanism (server-authoritative, idempotent, webhook-safe, refund-trackable), **before** P1.7.39/P1.7.40. Until then, tip/donation remain correctly-modeled recorded **intent** (P1.7.36) with no economic effect, and P1.7.39/P1.7.40 stay BLOCKED.
