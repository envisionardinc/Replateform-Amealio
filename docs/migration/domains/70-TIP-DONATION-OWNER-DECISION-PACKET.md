# 70 — Tip & Donation Product Policy Contract (P1.7.42)

> **Type:** PRODUCT-DECISION / CONTRACT-DEFINITION — documentation only. **No code, schema, migration, API, or DTO change.** Records the **owner-APPROVED, finalized** target financial policy for tips and donations and corrects the downstream migration dependencies.
> **Status:** **COMPLETE — PRODUCT POLICY APPROVED.** These decisions are authoritative target policy. Implementation is out of scope for this slice.
> **Baseline:** P1.7.41 `7153b85`, **401/401** (unchanged — documentation only).

Tags: **APPROVED** (owner target policy), **PROVEN** (target facts, file:line), **HISTORICAL** (legacy evidence), **FUTURE** (deferred capability), **DEFERRED** (implementation-slice-owned).

> **Supersession note:** this contract supersedes two earlier interim states of P1.7.42 — (a) a decision-ready packet with all lines `BLOCKED — OWNER/DATA`, and (b) an interim approval of "beneficiary = MERCHANT global" + "single checkout with separate components." The finalized policy below (merchant-configurable beneficiary; **separate payment per component**; donations deferred; 0% commission) is authoritative.

---

## 1. Approved decision table

| Decision | Approved policy | Status |
|---|---|---|
| Tips collected | YES | **APPROVED** |
| Tip beneficiary | Merchant-configurable | **APPROVED** |
| Beneficiary options | MERCHANT / DELIVERY_PERSON / SHARED_POOLED | **APPROVED** |
| Configuration point | Merchant subscription/setup | **APPROVED** |
| Tip basis | Total order amount | **APPROVED — canonical definition requires reconciliation** |
| Tip options | 10% / 15% / 20% / Custom | **APPROVED** |
| Donations | Future capability | **APPROVED** |
| Charity model | amealio-selected charity | **APPROVED (future)** |
| Donation amounts | ₹25 / ₹50 / ₹100 / ₹250 / Custom | **APPROVED (future)** |
| Donation transfer | Batch | **APPROVED (future)** |
| Tip refund | Associated order/payment lifecycle | **APPROVED** |
| Donation refund | Until transfer | **APPROVED (future)** |
| Payment architecture | Separate payment per component | **APPROVED** |
| Tip commission/platform fee | 0% | **APPROVED** |
| Donation commission/platform fee | 0% | **APPROVED** |

## 2. Approved policy detail (canonical target contract)

1. **Tips are collected** — once successfully collected, `tipMinor` is a **real monetary component** (not merely customer intent).
2. **Tip beneficiary is merchant-configurable** — configured at **merchant subscription/setup**, one of `MERCHANT` / `DELIVERY_PERSON` / `SHARED_POOLED`. This is **not** a global amealio setting; the merchant's active subscription/configuration determines the policy for that merchant. Legacy `ORDER_TIP → vendor/merchant` is **historical evidence only** and does **not** default every merchant to MERCHANT. Foundation dependencies (not built here): `MERCHANT` can eventually reuse merchant settlement infrastructure; `DELIVERY_PERSON` requires an authoritative delivery assignment + **immutable historical beneficiary** foundation (P1.7.41 established this does not exist); `SHARED_POOLED` requires an explicit pool/allocation foundation.
3. **Tip basis = TOTAL ORDER AMOUNT** — approved *concept*; the exact canonical definition must be reconciled against existing target order-total semantics **before** P1.7.38 implements calculation (see §5). Not to be equated with changing `grandTotalMinor`. Treatment of discounts / tax / delivery / service-platform fees / promotional credits / other charges must be explicitly resolved (not invented). Recorded as **APPROVED CONCEPT — EXACT CANONICAL BASIS REQUIRES RECONCILIATION**.
4. **Tip options = 10% / 15% / 20% / Custom** — Custom must support a customer-entered amount with appropriate validation. **No default/preselected tip** is approved (do not invent one).
5. **Donations = FUTURE capability** — **not** part of the immediate P1.7.38 path. Current priority = **tip collection first**. Donation architecture must remain **separable** so it can be activated later without redesigning tip/order economics.
6. **Charity model (future) = amealio-selected charity** — amealio determines the available charity beneficiary. No charity selection/onboarding here.
7. **Donation amounts (future) = ₹25 / ₹50 / ₹100 / ₹250 / Custom.**
8. **Donation transfer (future) = BATCH** — funds aggregated, not transferred per order; the eventual donation-liability foundation must support aggregation + reconciliation before batch transfer. Batch mechanics not designed here.
9. **Tip refund = YES** — follows the associated order/payment refund lifecycle; eventual implementation must be idempotent and financially reconcilable. Not implemented here.
10. **Donation refund (future) = REFUNDABLE UNTIL TRANSFER** — post-transfer requires recovery/reconciliation semantics (not invented now).
11. **Payment architecture = SEPARATE PAYMENT PER COMPONENT** — financial separation into **ORDER payment**, **TIP payment**, and (future) **DONATION payment**. **Do NOT** increase the order `PaymentIntent.amountMinor` to include tips/donations; **do NOT** redefine `Order.grandTotalMinor` as order + tip + donation. P1.7.38 designs the smallest canonical mechanism for a **separate tip payment**; future donation collection uses a separately identifiable donation payment component. Governing rule: **tip and donation are not bundled into the canonical order payment amount.**
12. **Commission / platform fee = 0%** on tips and donations. Tips must **not** increase the order commission basis merely because they are collected; donations must **never** become merchant or amealio revenue.

## 3. Financial invariants (preserved — this policy does NOT authorize order-economics changes)

Preserve exactly: `Order.grandTotalMinor`; the `order_total_integrity` CHECK; the commission basis (`subtotal − vendor discount`); merchant settlement gross; tax calculation; delivery economics; and the **refund ceilings for the ORDER payment**. The separate TIP payment must not corrupt existing ORDER payment semantics. Four distinct concepts:

| Concept | Meaning |
|---|---|
| **Customer charge** | what the customer pays overall (order payment + separate tip payment [+ future donation payment]) — **not** a single combined field |
| **Order/merchant economics** | `grandTotalMinor`, commission basis, settlement gross — **unchanged** |
| **Tip component** | collected customer money for the merchant-configured tip beneficiary; **0% commission**; excluded from the order commission basis |
| **Donation component (future)** | collected customer money held as a platform liability for an amealio-selected charity; never merchant/amealio revenue |

## 4. Migration dependency correction (P1.7.39 has THREE branches)

The earlier simplified assumption "tip beneficiary = MERCHANT globally" is **superseded**. P1.7.39 must route according to the merchant's authoritative configuration:

- **MERCHANT** — requires: collected tip + authoritative merchant beneficiary + merchant settlement routing. (Merchant settlement infrastructure exists; reuse is evaluated in P1.7.39.)
- **DELIVERY_PERSON** — requires: collected tip + **authoritative delivery assignment** + **immutable historical beneficiary evidence** + delivery-person payout destination + payout/reversal handling. **P1.7.41 established this foundation does not exist**, so this branch **cannot be implemented** until it does (a future `P1.7.42A — Delivery Assignment + Immutable Assignment-History Foundation`).
- **SHARED_POOLED** — requires a future explicit definition of pool membership, allocation formula, allocation timing, eligibility, rounding, payout destination, reassignment/cancellation effects, and refund/reversal handling. Not invented here.

**Collection (P1.7.38) is independent of beneficiary routing (P1.7.39)** — a tip must be collectible and representable before any routing branch runs.

## 5. Tip-basis reconciliation trace (input to P1.7.38)

Existing target order economics (PROVEN, file:line):

| Amount | Definition | Location |
|---|---|---|
| `subtotalMinor` | Σ line totals (pre-discount item sum) | `apps/api/src/modules/ordering/application/order.service.ts:82,111-112` |
| `discountTotalMinor` | server-computed offer discount (else client ad-hoc) | `order.service.ts:136-164` |
| `taxTotalMinor` | order-level tax component (accepted as resolved) | `order.service.ts:126` |
| `feeTotalMinor` | order-level service/platform fee component | `order.service.ts:127` |
| `deliveryChargeMinor` | order-level delivery charge | `order.service.ts:128` |
| `grandTotalMinor` | `subtotal − discount + tax + fee + delivery` (DB CHECK) | `order.service.ts:187-189`; CHECK `prisma/migrations/20260901224600_constraints_and_immutability/migration.sql:14-17` |
| Payment amount | `PaymentIntent.amountMinor = order.grandTotalMinor` | `payment.service.ts:43` |
| Settlement gross | `intent.amountMinor − PROCESSED refunds` | `settlement.repository.ts:86-93` |
| Commission basis | `subtotal − vendor discount` (excludes tax/delivery/fees) | `settlement.repository.ts:90-93` |
| Promotional credits | **no distinct field** — offers reduce `discountTotalMinor` only; wallet credit is a separate `WalletEntry`, not an order-total component | `prisma/schema.prisma` (Order money fields `:991-996`) |

**Candidate canonical "total order amount":** `grandTotalMinor` is the single amount the customer actually pays for the order (= the ORDER `PaymentIntent.amountMinor`), and is the natural customer-visible total. **However**, `grandTotalMinor` is **net of discount** and **includes tax + fee + delivery** — so whether the approved tip basis should be tax-/delivery-/fee-inclusive and discount-net is a **product nuance not resolvable from repository evidence alone**. There is **no separate "promotional credits" order field** (offers flow through `discountTotalMinor`; wallet credits are separate ledger entries).

**Narrow product question returned for P1.7.38 (or owner) resolution:** does the approved percentage tip apply to `grandTotalMinor` as-is (discount-net, tax/fee/delivery-inclusive), or to a different basis (e.g. `subtotalMinor`, or subtotal net of discount, excluding tax/delivery/fees)? **This packet does not invent the rule.** Recorded as `APPROVED CONCEPT — EXACT CANONICAL BASIS REQUIRES RECONCILIATION`.

## 6. Immediate implementation scope

Next implementation slice = **P1.7.38 — Tip Collection/Capture Foundation**, scoped **only** to establishing canonical **separate tip collection** (a separate TIP payment component that can be collected and represented independently). **Do NOT** implement beneficiary payout paths, delivery-person payout, shared-pool allocation, or donation collection in P1.7.38. Collection and beneficiary routing remain separate concerns. P1.7.38 must first reconcile the §5 tip basis (file:line) and, if ambiguous, return the narrow question rather than inventing the formula.

## 7. Dependency status after this slice

- **P1.7.38 (tip collection/capture):** UNBLOCKED — next implementation slice (collection only; basis reconciliation first).
- **P1.7.39 (tip routing):** UNBLOCKED IN PRINCIPLE, **config-driven three-branch** (MERCHANT now-viable; DELIVERY_PERSON gated on a delivery assignment/history foundation; SHARED_POOLED gated on a pool/allocation foundation). Depends on P1.7.38.
- **P1.7.40 (donation liability/charity):** DEFERRED — FUTURE capability; policy preserved; must stay architecturally separable.
- **P1.7.41 (delivery reconciliation):** FORENSIC COMPLETE — its finding (no assignment/history) now gates only the DELIVERY_PERSON tip branch.

## 8. Validation
No code/schema/API/DTO/migration change. Verified: `tsc --noEmit` clean, lint/format clean, **full suite 401/401**, `git diff` limited to documentation.

---

## P1.7.42 Result

- **Status:** COMPLETE — PRODUCT POLICY APPROVED
- **Tips collected:** YES
- **Tip beneficiary:** MERCHANT-CONFIGURABLE
- **Beneficiary options:** MERCHANT / DELIVERY_PERSON / SHARED_POOLED
- **Configuration point:** MERCHANT SUBSCRIPTION/SETUP
- **Tip calculation basis:** TOTAL ORDER AMOUNT
- **Exact canonical basis:** REQUIRES P1.7.38 RECONCILIATION (candidate = `grandTotalMinor`; component treatment is a narrow product question — §5)
- **Tip options:** 10% / 15% / 20% / CUSTOM
- **Donations:** FUTURE
- **Charity model:** AMEALIO-SELECTED
- **Donation amounts:** ₹25 / ₹50 / ₹100 / ₹250 / CUSTOM
- **Donation transfer:** BATCH
- **Tip refund:** YES — ORDER/PAYMENT LIFECYCLE
- **Donation refund:** YES — UNTIL TRANSFER
- **Payment architecture:** SEPARATE PAYMENT PER COMPONENT
- **Tip commission/platform fee:** 0%
- **Donation commission/platform fee:** 0%
- **Delivery assignment foundation:** REQUIRED ONLY FOR DELIVERY_PERSON BENEFICIARY
- **Pool allocation foundation:** REQUIRED ONLY FOR SHARED_POOLED BENEFICIARY
- **Code changes:** NO · **Schema changes:** NO
- **Tests:** 401/401 · **TypeScript:** `tsc --noEmit` clean · **Lint/format:** clean

### Critical conclusion
The financial-policy blocker is now substantially resolved. The target supports **collected tips** with a **merchant-configurable beneficiary policy** (MERCHANT / DELIVERY_PERSON / SHARED_POOLED, set at merchant subscription/setup), a **separate tip payment** (never bundled into the order payment or `grandTotalMinor`), **percentage/custom** tip options (10/15/20/Custom), **0% amealio commission** on tips, and **order/payment-linked** tip refunds. **Donation capability is explicitly deferred as a future feature** (amealio-selected charity, ₹25–₹250/Custom, batch transfer, refundable-until-transfer) while its high-level policy is preserved and kept architecturally separable. The only immediate reconciliation required before tip-collection implementation is the **exact canonical definition of "total order amount"** for the tip basis (§5): the candidate is `grandTotalMinor`, but the discount/tax/delivery/fee treatment is a narrow product question, not inventible from repository evidence. All existing order/merchant financial invariants are preserved.

### Required next action
Proceed to **P1.7.38 — Tip Collection/Capture Foundation**, scoped **only** to the separate tip-payment collection/representation foundation (plus the §5 tip-basis reconciliation). Do **not** implement payout routing, delivery-person payout, shared-pool allocation, or donation collection in that slice.
