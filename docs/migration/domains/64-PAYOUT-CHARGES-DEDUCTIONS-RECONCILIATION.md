# 64 — Payout Charges & Financial Deduction Reconciliation (P1.7.35)

> **Type:** FORENSIC / RECONCILIATION ONLY — reconcile the remaining payout-pool economics (charges, tips, donations, ADMIN reimbursement, adjustments). **No code, schema, migration, or test change.**
> **Governing gate:** [63-COMMISSION-BASIS-GST-RECONCILIATION.md](./63-COMMISSION-BASIS-GST-RECONCILIATION.md) §10 + [60](./60-SETTLEMENT-PAYOUT-FOUNDATION.md)/[61](./61-COMMISSION-SETTLEMENT-TIMING-FOUNDATION.md).
> **Authority:** legacy `amealio-vendordashboard` (`settlement.class.ts:45-91,730-750,475`, `user-ordering.class.ts:3472,3542-3547,2060-2069`, `order-cron.class.ts:665`, `razorpay.class.ts:863-921`) + target `prisma/schema.prisma`. Baseline **P1.7.34 `8c2f043`, 391/391 (unchanged — reconciliation only).**

Tags: **VERIFIED**, **INFERRED**, **DEFERRED**, **BLOCKED — OWNER/DATA**.

---

## 1. Executive summary / outcome

**Forensic-only.** Every payout-pool deduction/addition beyond the current target model is either (a) **not modeled in the target Order** (tips, donations), (b) **tied to the blocked GST decision** DR-03a (customer-GST remittance, GST-on-outgoing-charge), (c) **dependent on a config rate not in the target** (OUTGOING_CHARGES), (d) a **delivery-domain** concern, or (e) has **unproven refund/clawback semantics** (ADMIN reimbursement full-refund edge). None is conclusively implementable in this slice without guessing. The current target settlement model is confirmed correct and minimal; each additional component is classified and deferred/blocked with an explicit owner decision. **No implementation change was made** (per the slice's forensic-first rule).

## 2. Legacy payout-pool flow (VERIFIED)

`settlement.class.ts:733-750` (per restaurant batch of eligible COMPLETED orders):

```
per order o (COMPLETED, !blockSettlement, total_amount>0):
  orderPayAmount += o.settleAmount − o.tip.amount − o.donation.amount        // :739-741
  orderPayAmount −= calcRazorpayCharges(o)                                   // :743
  orderPayAmount −= o.gstTaxes                                               // :744
commission = totalComission(batch)                                          // :749  (base − vendor disc) × rate × 1.18
orderPayAmount −= commission                                                // :750
// tips disbursed separately as PAYOUT_TYPE.ORDER_TIP
```
where `settleAmount = total_amount` at capture (`user-ordering.class.ts:3472`) **+ discount** for ADMIN offers (`:3543`); and

`calcRazorpayCharges` (`settlement.class.ts:77-91`):
```
base = Σ(RAZORPAY|WALLET PAYMENT amounts) − donation
charge = base × (OUTGOING_CHARGES.description || 3)% × 1.18       // OUTGOING_CHARGES subcategory, :475
```

## 3. Target financial flow (current + where deferred components would enter)

```
Captured Payment (PaymentIntent.amountMinor = grandTotal)
  − PROCESSED refunds
  = grossAmountMinor  (payout pool)                              [IMPLEMENTED P1.7.31]

Commissionable basis = Σ(subtotalMinor − vendor discount)        [IMPLEMENTED P1.7.34]
Commission           = floor(basis × commissionBps / 10000)      [IMPLEMENTED P1.7.34]
  [+ Tax on commission (GST)]                                    [DR-03a — BLOCKED]

Payout-pool adjustments (NONE implemented — all deferred/blocked):
  [+ ADMIN-discount reimbursement]                               [DR-ADMIN-DISCOUNT-REIMBURSEMENT — DEFERRED]
  [− customer GST remittance (taxTotalMinor)]                    [DR-03a — BLOCKED]
  [− gateway/outgoing charge (OUTGOING% + 18% GST)]              [DR-PAYOUT-CHARGE — DEFERRED/partly BLOCKED (GST)]
  [− tips]                                                       [DR-TIP — DEFERRED (not modeled)]
  [− donations]                                                  [DR-DONATION — DEFERRED (not modeled)]
  [− delivery split]                                             [delivery domain — DEFERRED]

Settlement Net (amountMinor) = grossAmountMinor − commission     [current]
Payout = Settlement Net                                          [IMPLEMENTED P1.7.31/32]
```

## 4. Component reconciliation matrix

| Component | Exists in legacy? | Amount source | Commission basis? | Payout impact? | Merchant-owned? | Refund impact | Evidence | Target decision |
|---|---|---|---|---|---|---|---|---|
| Item subtotal | Yes | `base_amount` (pre-discount `Σ finalPrice×qty`) | **IN** | is the pool | Yes | pool ↓ by refund | `settlement.class.ts:47`; `usercart.class.ts:122-127` | **IMPLEMENTED** (`subtotalMinor`) |
| Vendor discount | Yes | `discount.amount` (MERCHANT offer) | **SUBTRACTED** | reduces revenue | — | basis frozen | `settlement.class.ts:48` | **IMPLEMENTED** (P1.7.34) |
| ADMIN discount | Yes | `discount.amount` (ADMIN offer) | **NOT subtracted** | **+reimbursed** to pool | platform-funded | see §5 | `:48`; `user-ordering.class.ts:3543` | **DEFERRED** (DR-ADMIN-DISCOUNT-REIMBURSEMENT) |
| Customer tax/GST | Yes | `gstTaxes` (CGST/SGST/GST) | EXCLUDED | **−deducted** from payout (platform remits) | No (collected for govt) | — | `settlement.class.ts:744`; `user-ordering.class.ts:2060-2069` | **BLOCKED** (DR-03a) |
| Delivery fee | Yes | `surCharges.Delivery`, split user/merchant/amealio | EXCLUDED | delivery-split | mixed | — | `cart.class.ts:1152`; dunzo | **DEFERRED** (delivery domain) |
| Tip | Yes | `tip.amount` | EXCLUDED | separate payout (ORDER_TIP); subtracted from body | recipient/merchant | refundable w/ order | `settlement.class.ts:739`,`741` | **DEFERRED** (DR-TIP; not in target Order) |
| Donation | Yes | `donation.amount` | EXCLUDED | −deducted; transferred to charity | No (charity `UDBHAV_ACCOUNT`) | — | `settlement.class.ts:740`; `razorpay.class.ts:863-921` | **DEFERRED** (DR-DONATION; not in target Order) |
| Gateway/payment charge | Yes (bundled into outgoing) | — | EXCLUDED | in `calcRazorpayCharges` | — | net of donation | `settlement.class.ts:81-83` | **DEFERRED** (part of DR-PAYOUT-CHARGE) |
| Payout/outgoing charge | Yes | `OUTGOING_CHARGES.description`% (def 3) + 18% GST | EXCLUDED | **−deducted** from payout | merchant bears it | — | `settlement.class.ts:77-91,475` | **DEFERRED/BLOCKED** (config rate + GST) |
| Service/platform fee | Partial | order `feeTotalMinor` (target); legacy `surCharges` | EXCLUDED | not specially handled | — | — | target `Order.feeTotalMinor`; no legacy ordering payout use | **DEFERRED** (no proven payout rule) |
| Other deduction (penalty/chargeback/manual/`blockSettlement`) | Partial | `blockSettlement` (exclude flag); commented manual paths | — | exclude-only | — | — | `settlement.class.ts:46`; `manual-settlement.class.ts` (commented) | **DEFERRED** (no clean model) |

## 5. ADMIN-funded discount reimbursement (DR-ADMIN-DISCOUNT-REIMBURSEMENT — DEFERRED)

Per Phase 6, evidence for each question:
1. **Funder:** platform (ADMIN-settlement offer). VERIFIED (`offer.settlementType = 'ADMIN'`).
2. **Merchant reimbursed:** yes. VERIFIED — `settleAmount += discount.amount` (`user-ordering.class.ts:3543`).
3. **Represented where:** fused into `settleAmount` (the payout pool); **not a separate field**. VERIFIED.
4/5. **In settlement/payout pool:** yes. VERIFIED.
6. **Before/after commission:** before (inflates `settleAmount`; commission then deducted; commission on the full base for ADMIN). VERIFIED.
7. **Equals discount:** yes (`+= discount.amount`). VERIFIED.
8. **Exceptions:** SPLIT never assigned (treated as VENDOR). VERIFIED.
9. **Refund impact:** **UNRESOLVED edge.** Refund excludes the ADMIN discount from the customer refund (`order-cron.class.ts:665` `settleAmount − (ADMIN ? discount : 0)`). For a **partial** refund the target equivalent `(captured − refund) + discount` equals legacy `total + discount − refund` (consistent). For a **fully-refunded but COMPLETED** ADMIN order, legacy would leave the reimbursement (`settleAmount = discount`) whereas the target's `net>0` filter excludes it — a divergence. This clawback edge is **not conclusively established**.
10. **Separate component:** no (fused). VERIFIED.

**Decision:** the happy-path/partial-refund treatment is proven (add `discountTotalMinor` to the payout pool for ADMIN offers, before commission), but the full-refund-on-completed-order clawback is ambiguous → **DEFERRED** as `DR-ADMIN-DISCOUNT-REIMBURSEMENT`. If implemented later: add a `Settlement.adminDiscountReimbursementMinor` (separate auditable component, cleaner than legacy's fused `settleAmount`) contributing to the payout pool; resolve the full-refund clawback rule first.

## 6. Gateway / payment-processing charges (part of DR-PAYOUT-CHARGE)

Legacy bundles payment-gateway cost into the **outgoing charge** (`calcRazorpayCharges`, `settlement.class.ts:77-91`): `(Σ RAZORPAY/WALLET payment − donation) × OUTGOING%(def 3) × 1.18`, **deducted from the merchant payout**. Known at settlement time (from `transactionDetails`), not at capture. The **rate** comes from an `OUTGOING_CHARGES` subcategory (config not in the target), and it carries an **18% GST** (DR-03a). **DEFERRED/BLOCKED** — do not hardcode Razorpay rates or the 3%/18%. The merchant bears this charge (VERIFIED direction), but the rate source + GST require owner input.

## 7. Payout / outgoing charges (DR-PAYOUT-CHARGE — DEFERRED)

Same `calcRazorpayCharges` deduction (§6) — a single "outgoing charge" bundles gateway + payout-transfer cost, borne by the merchant, deducted from settlement, recorded only in aggregate (not a separate settlement field). RazorpayX per-payout fees are **not separately modeled** in legacy ordering. **DEFERRED** with owner decision on the charge rate + GST; no live RazorpayX/webhook contract invented.

## 8. Tips (DR-TIP — DEFERRED)

Legacy: `tip.amount` on the order; **excluded from commission** (confirmed P1.7.34); subtracted from the order-body payout and **disbursed separately** as `PAYOUT_TYPE.ORDER_TIP` (recipient/merchant-owned); refunded with the order. **The target Order has no tip field** — tips are not modeled. **DEFERRED** (needs an Order tip amount + a tip-payout path). No change to the P1.7.34 "tips excluded from commission" determination.

## 9. Donations (DR-DONATION — DEFERRED)

Legacy: `donation.amount`; **excluded from commission**; a **pass-through to a charity** account (`UDBHAV_ACCOUNT`) via a Razorpay transfer (`razorpay.class.ts:863-921`); subtracted from the merchant payout (merchant never keeps it); netted out of the gateway-charge base. **Not merchant-owned.** **The target Order has no donation field.** **DEFERRED** (needs a donation amount + charity-transfer model). Do not create donation accounting now.

## 10. Other deductions / adjustments

No clean legacy deduction model beyond `blockSettlement` (an exclude flag) and commented-out manual-settlement paths. No penalties/chargebacks/manual-adjustment domain is cleanly established for the ordering payout. **DEFERRED** — do not create a generic "miscellaneous adjustment" field.

## 11. Refund interaction (summary)

- **Commission basis:** frozen / refund-independent (VERIFIED P1.7.34) — unchanged; **no clawback**.
- **Payout pool (`grossAmountMinor`):** reduced by PROCESSED refunds (current target) — matches legacy `settleAmount` reduction.
- **Post-settlement refund:** no retroactive settlement change (P1.7.31/32); clawback = DR-COMM-CLAWBACK (DEFERRED).
- **Per-component:** tip refunds with the order (deferred with tips); donation not refunded to merchant (deferred); outgoing/gateway charge recomputed on the paid amount (deferred); ADMIN reimbursement full-refund edge (§5, deferred).

## 12. Target financial-model decision

**No new fields added in this slice.** The correct future design (when the deferred components are unblocked) is **A + provider-reconciliation**: **separate, additive `Settlement`-level components** for each verified deduction (`adminDiscountReimbursementMinor`, `taxOnCommissionMinor`, `gatewayChargeMinor`/`payoutChargeMinor`, `tipMinor`, `donationMinor`) so the Settlement remains an auditable artifact where `net = gross + reimbursements − commission − taxOnCommission − charges − passthroughs`, with provider-sourced charges reconciled from provider records (not recomputed with hardcoded rates). Tips/donations additionally require **Order-level** amount fields (they originate on the order) — hence those are gated on modeling them on the Order first. This is documented, not implemented, because each component is individually deferred/blocked (§4).

## 13. Financial invariants (target, current + future)

Current (tested): `Σ items = grossAmountMinor`; `commissionMinor = floor(commissionBasisMinor × commissionBps/10000)`; `amountMinor = gross − commission`; refunds ≤ captured; basis ≥ 0; commission ≤ basis; net ≤ 0 non-payable; no negative payout; merchant isolation. Future (when components land): `net = gross + Σ reimbursements − commission − taxOnCommission − Σ charges − Σ passthroughs`; each component individually reconciles to its source; no double deduction; passthroughs (tip/donation) never counted as merchant revenue.

## 14. Decisions

- **RESOLVED (confirmation):** the current target model (gross = net-of-refund captured; commission on the P1.7.34 basis; net = gross − commission) is correct/minimal; **no additional payout deduction is implementable now without guessing**.
- **BLOCKED — OWNER/DATA:** DR-03a (GST — customer-GST remittance from payout, GST-on-outgoing-charge, GST-on-commission); DR-02b/c/d/e (historical migration only).
- **DEFERRED (with named owner decisions):** DR-ADMIN-DISCOUNT-REIMBURSEMENT (add discount to payout for ADMIN offers; resolve full-refund clawback); DR-PAYOUT-CHARGE (gateway/outgoing-charge rate + GST); DR-TIP (model tips on Order + separate payout); DR-DONATION (model donation + charity transfer); DR-COMM-CLAWBACK; DR-SETTLE-CANCELLED-PARTIAL (delivery).

## 15. Deferred items

ADMIN-discount reimbursement; gateway/outgoing/payout charges; tips; donations; customer-GST remittance; GST-on-commission (DR-03a); post-settlement clawback; delivery-split/cancelled-Dunzo; per-restaurant settlement window; auto-settlement cron; live RazorpayX HTTP; historical financial migration.

## 16. Recommended P1.7.36

**Tip & donation Order-model foundation** — the two clearly-scoped, GST-independent components that are blocked only by missing Order fields. Add additive `Order.tipMinor`/`donationMinor` (+ the passthrough semantics: excluded from commission — already VERIFIED — and from merchant revenue; donation → charity payout; tip → recipient payout), so a later settlement slice can deduct them correctly. This is the smallest unblocked forward step. Alternatively, escalate **DR-03a (GST)** to the owner to unblock the tax-dependent components (customer-GST remittance, GST-on-commission, GST-on-outgoing-charge) which currently gate most of the remaining payout economics.
