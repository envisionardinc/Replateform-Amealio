# 70 — Tip/Donation Product Decision Contract (P1.7.42)

> **Type:** PRODUCT-DECISION / CONTRACT-DEFINITION — documentation only. **No code, schema, migration, API, or DTO change.** Records the **owner-APPROVED** target financial policy for tips and donations, resolving the blockers from P1.7.37/38/39/41 and defining the canonical contract for the implementation slices that follow.
> **Status:** **COMPLETE — PRODUCT POLICY APPROVED.** The previously `BLOCKED — OWNER/DATA` decisions are now explicitly resolved by the product owner and are authoritative target policy. Implementation remains out of scope for this slice.
> **Baseline:** P1.7.41 `7153b85`, **401/401** (unchanged — documentation only).

Tags: **APPROVED** (owner target policy), **PROVEN** (target facts), **HISTORICAL** (legacy evidence), **DEFERRED** (implementation-slice-owned).

---

## 1. Approved decision table

The following are **explicitly approved by the product owner** and may be treated as authoritative target policy.

| Decision | Approved policy | Status |
|---|---|---|
| Tips collected | YES | **APPROVED** |
| Donations collected | YES | **APPROVED** |
| Collection architecture | Single customer checkout with separately identified financial components | **APPROVED** |
| Tip beneficiary | MERCHANT/VENDOR | **APPROVED** |
| Delivery person receives tip | NO — initial baseline | **APPROVED** |
| Tip refundability | YES, associated order/payment lifecycle | **APPROVED** |
| Tip independent refund window | NO | **APPROVED** |
| Donation beneficiary | Customer-selected / platform-configured charity | **APPROVED** |
| Donation refundability | Until transfer; post-transfer recovery policy applies | **APPROVED** |

## 2. Approved policy detail (canonical target contract)

1. **Tips are collected** — when a customer chooses a tip, amealio collects it as actual money; the tip must remain a **separately identifiable financial component** (not folded into merchant revenue). `Order.tipMinor` graduates from intent-only to a collected component.
2. **Donations are collected** — collected as actual money; **NOT merchant revenue**; donation money has its **own accounting/liability lifecycle** and must never be silently incorporated into merchant settlement economics.
3. **Collection architecture** — a **single customer checkout/payment** where practical, while **separately representing** order amount, collected tip, and collected donation. The customer needs no separate payment interaction for a tip/donation. Governing rule: **one payment does NOT mean one financial component** — component-level financial identity is preserved. **`grandTotalMinor` is NOT changed** to make tips/donations appear collected. P1.7.38 owns the payment/capture design.
4. **Tip beneficiary = MERCHANT/VENDOR** (initial India baseline). Consistent with (not blindly copied from) the legacy evidence `legacy ORDER_TIP → vendor/merchant settlement`. **Delivery persons are NOT tip beneficiaries** in the initial baseline ⇒ `DeliveryPerson` is not a financial beneficiary; delivery assignment is **not** a prerequisite for tip routing; **no delivery assignment/history foundation is required** for this path. A future "tip your delivery person" capability requires a separate product decision + delivery financial foundation.
5. **Tip refunds** — refundable as part of the **associated order/payment refund lifecycle** (no independent tip-refund timer). Implementation (P1.7.38/P1.7.39) must guarantee: order refund correctly handles the collected tip; partial refunds never create money; a tip cannot be refunded twice; already-refunded amounts cannot be refunded again; settlement/payout state reconciles correctly.
6. **Donation beneficiary** — **NOT the merchant**; donation funds belong to a **separate donation/charity liability flow**; direction = **customer-selected or platform-configured charity**. Charity selection/transfer/onboarding are **not** implemented here — P1.7.40 owns donation liability + charity transfer.
7. **Donation refunds** — refundable **until the donation has been transferred out of amealio's control**; after transfer, refund/recovery requires the appropriate transfer/recovery mechanism. The exact state machine belongs to P1.7.40.

## 3. Financial invariants (unchanged — these decisions do NOT authorize changing order economics)

Preserve exactly: `Order.grandTotalMinor`; the `order_total_integrity` CHECK; the commission basis (`subtotal − vendor discount`); merchant settlement economics; existing order-amount semantics. **`grandTotalMinor` must NOT be redefined** as a combined customer-charge field. The architecture must distinguish four concepts:

| Concept | Meaning |
|---|---|
| **Customer charge** | what the customer actually pays (order + tip + donation) |
| **Order/merchant economics** | what belongs to the merchant/order settlement (`grandTotalMinor`, commission basis) — unchanged |
| **Tip component** | collected customer money designated as a **merchant** tip (separate identity; excluded from commission basis) |
| **Donation component** | collected customer money **held for eventual charity transfer** (platform liability; never merchant revenue) |

The target payment model therefore needs a customer-charge total (order + tip + donation) that is **distinct from** `PaymentIntent.amountMinor`-as-merchant-gross today — P1.7.38 owns that design (e.g. separate collected components / transactions), without altering `grandTotalMinor` or the commission basis.

## 4. Evidence & historical context (isolated)

- **Approved decisions** above are the **authoritative source**; the items below are supporting context only.
- **Legacy (HISTORICAL):** `ORDER_TIP` payout settled to the vendor/merchant account (`amealio-vendordashboard/src/models/settlement.model.ts:77-87`, `settlement.class.ts:166-266`, `settlement-process*.ts`). This is **consistent with** the approved MERCHANT/VENDOR tip beneficiary — cited as corroboration, not as the reason.
- **Target (PROVEN):** tip/donation are currently intent-only, excluded from the charge/commission/settlement (`payment.service.ts:43,79`; `refund.repository.ts:318`; `settlement.repository.ts:86-93,130`; `prisma/schema.prisma:1002-1003,1073-1091`); the delivery domain is schema-only/unimplemented (`prisma/schema.prisma:1505-1548`) — **now irrelevant to tips** because delivery-person tipping is excluded from the baseline.

## 5. Unblocked migration path

- **P1.7.38 — Tip/Donation Collection/Capture Foundation: UNBLOCKED.** Collection policy is established (tips + donations collected; single checkout, separate components; `grandTotalMinor` unchanged). This is the **next implementation slice**.
- **P1.7.39 — Tip Payout/Settlement Routing: UNBLOCKED IN PRINCIPLE** — beneficiary = **MERCHANT/VENDOR**, **no delivery-person assignment dependency**; depends only on P1.7.38 establishing the canonical collected-tip representation. Merchant routing should evaluate reuse of the existing settlement/payout path.
- **P1.7.40 — Donation Liability + Charity Transfer: UNBLOCKED IN PRINCIPLE** — requires its own donation-liability/charity-transfer implementation design (customer-selected/platform-configured charity; refundable-until-transfer). Independent of the tip path.
- **Delivery Assignment + Assignment-History foundation: NOT REQUIRED** for the approved initial tip model.

## 6. Sequencing correction

**Do NOT** create "P1.7.42A — Delivery Assignment + Assignment History" as the next slice — it was only required under the **rejected** alternative (tip beneficiary = delivery person). The approved policy removes that dependency. **The next implementation slice returns to P1.7.38 — Tip/Donation Collection/Capture Foundation**, using this approved contract.

## 7. Implementation boundaries (DEFERRED to owning slices)

Not designed here (implementation-slice-owned): the exact collected-tip/collected-donation persistence model, the customer-charge total representation, capture/webhook idempotency for the tip/donation components, the merchant tip routing/settlement mechanics, the donation liability ledger + charity transfer state machine, and refund reconciliation mechanics. P1.7.38 (collection), P1.7.39 (merchant tip routing), and P1.7.40 (donation liability/charity) own these respectively.

## 8. Validation
No code/schema/API/DTO/migration change. Verified: `tsc --noEmit` clean, lint/format clean, **full suite 401/401**, `git diff` limited to documentation.

---

## P1.7.42 Result

- **Status:** COMPLETE — PRODUCT POLICY APPROVED
- **Tips collected:** YES
- **Donations collected:** YES
- **Collection architecture:** SINGLE CHECKOUT / SEPARATE FINANCIAL COMPONENTS
- **Tip beneficiary:** MERCHANT/VENDOR
- **Delivery-person tip:** NO — INITIAL BASELINE
- **Tip refundability:** YES
- **Tip refund window:** ASSOCIATED ORDER/PAYMENT LIFECYCLE
- **Donation beneficiary:** CUSTOMER-SELECTED / PLATFORM-CONFIGURED CHARITY
- **Donation refundability:** UNTIL TRANSFER
- **P1.7.38:** UNBLOCKED
- **P1.7.39:** UNBLOCKED IN PRINCIPLE (depends on P1.7.38; beneficiary MERCHANT/VENDOR; no delivery dependency)
- **P1.7.40:** UNBLOCKED IN PRINCIPLE (own donation-liability/charity design)
- **Delivery assignment foundation required for tips:** NO
- **Code changes:** NO
- **Schema changes:** NO
- **Tests:** 401/401
- **TypeScript:** `tsc --noEmit` clean
- **Lint/format:** clean

### Critical conclusion
The previously owner-blocked financial-policy questions are now **explicitly resolved**. The approved India baseline is **merchant tips** (collected as money, separately identified, beneficiary = merchant/vendor, refundable via the order/payment lifecycle) **plus separately accounted charity donations** (collected as a platform liability, never merchant revenue, routed to a customer-selected/platform-configured charity, refundable until transfer). **Delivery-person tipping is intentionally excluded from the initial India baseline**, which removes any delivery-assignment/history prerequisite from the tip implementation path. `grandTotalMinor`, order-total integrity, commission basis, and merchant settlement economics are explicitly preserved.

### Required next action
Return to **P1.7.38 — Tip/Donation Collection/Capture Foundation** and implement the smallest canonical collection foundation consistent with this approved policy: a customer-charge total (order + tip + donation) captured in a single checkout with **separately identified, server-authoritative collected-tip and collected-donation components**, idempotent and webhook-safe, **without** changing `grandTotalMinor`, the order-total CHECK, the commission basis, or merchant settlement economics.
