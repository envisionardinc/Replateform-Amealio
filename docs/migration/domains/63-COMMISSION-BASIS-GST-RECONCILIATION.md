# 63 — Commission Basis + GST/Economic Reconciliation (P1.7.34)

> **Type:** RECONCILIATION + bounded IMPLEMENTATION — establish the authoritative commissionable basis and correct the target commission calculation; classify GST/fees/clawback. One additive migration.
> **Governing gate:** [61-COMMISSION-SETTLEMENT-TIMING-FOUNDATION.md](./61-COMMISSION-SETTLEMENT-TIMING-FOUNDATION.md) §12/§14 (DR-COMM-BASIS), [62-ORDER-COMPLETION-SETTLEMENT-GATE.md](./62-ORDER-COMPLETION-SETTLEMENT-GATE.md).
> **Authority:** legacy `amealio-vendordashboard` (`settlement.class.ts:45-91,730-750`, `usercart.class.ts:122-127,329-336,785-902`, `user-ordering.class.ts:3472,3522-3547,2060-2069`) + target `prisma/schema.prisma`. Baseline **P1.7.33 `bfe2035`, 387/387 → 391/391**.

Tags: **VERIFIED**, **INFERRED**, **DEFERRED**, **BLOCKED — OWNER/DATA**.

---

## 1. Legacy commission formula (VERIFIED)

`settlement.class.ts:45-52` (`totalComission`), per restaurant batch:

```
commission_incl_gst = ((Σ base_amount − Σ vendor_discount) × rate%) × 1.18
```
- `base_amount` = **pre-discount item subtotal** (`Σ finalPrice × quantity`, `usercart.class.ts:122-127`; copied to the order at checkout) — **excludes** tax, surcharges, delivery, tip, donation.
- `vendor_discount` = `discount.amount` **unless** `offerSettlement === 'ADMIN'` (then 0 → commission on the full pre-discount base).
- `rate` = `restaurant.comissionCode → SubCategory.description` (%), **looked up live** at settlement (mutable, no order snapshot; no effective-dating).
- **+18% GST** on the commission (hardcoded literal; no config).
- **Refund-independent:** `base_amount` is frozen at order creation; partial/full refunds never reduce it. Commission is never recalculated or clawed back after settlement.

## 2. Component inclusion/exclusion matrix (VERIFIED)

| Component | In commission basis? | Evidence |
|---|---|---|
| Item subtotal / `base_amount` | **INCLUDED** (sole positive term) | `totalComission:47` sums `base_amount`; `base_amount` = pre-discount `Σ finalPrice×qty` (`usercart.class.ts:122-127,785`) |
| Vendor-funded discount | **SUBTRACTED** | `totalComission:48` `offerSettlement==='ADMIN'?0:discount.amount` |
| Platform/ADMIN-funded discount | **NOT subtracted** (commission on full base) | same line (ADMIN ⇒ 0) |
| Coupon (offer) discount | Same as its funding party (VENDOR vs ADMIN) | `user-ordering.class.ts:3542-3547` sets `offerSettlement` from `offer.settlementType` |
| Tax / GST (`gstTaxes`) | **EXCLUDED** | not in `totalComission`; `gstTaxes` deducted from payout only (`settlement.class.ts:744`) |
| Delivery fee | **EXCLUDED** | delivery → `surCharges`/`total_amount`, not `base_amount` (`cart.class.ts:1152`) |
| Tip | **EXCLUDED** | not in basis; paid out separately (`PAYOUT_TYPE.ORDER_TIP`) |
| Service/platform fee, `gatewayCharges` | **EXCLUDED** | in `total_amount` / unused by commission |
| Wallet-funded amount | **No effect** | affects gateway-charge calc only |
| Donation | **EXCLUDED** | in payout, not basis |

## 3. Discount funding model (VERIFIED)

`offer.settlementType ∈ {VENDOR, ADMIN, SPLIT}` → order `offerSettlement`. **VENDOR** discount reduces the commission basis; **ADMIN** does not (and legacy reimburses the merchant via `settleAmount += discount.amount`, `user-ordering.class.ts:3543`). **SPLIT** is never assigned in code — stored, treated as VENDOR (INFERRED). Target mapping: `OfferSettlementType.MERCHANT`=legacy VENDOR (subtract), `ADMIN` (don't subtract), `SPLIT`→subtract (treated as MERCHANT).

## 4. Refund ↔ commission (VERIFIED)

Commission basis is **frozen** (refund-independent). Partial refund reduces the merchant **payout pool** (`settleAmount`), never the commission basis. **No commission clawback** exists after settlement (no reversal path in settlement/refund/cron). Fully-refunded orders are typically CANCELLED (excluded by the P1.7.33 COMPLETED gate).

## 5. GST/tax on commission — DR-03a (BLOCKED — OWNER/DATA)

Legacy hard-codes **18%** GST on commission (`settlement.class.ts:51`), with no config/table; it is **bundled into** the commission deducted from payout (not recorded separately). This is India-specific and jurisdiction-dependent. **Not implemented** in the target (no hardcoded rate). Decision required: the GST-on-commission rate/components, whether it is recorded separately, and US-vs-India localization. Status: **DR-03a — BLOCKED — OWNER/DATA**. A separate order-facing customer GST (`gstTaxes`, CGST/SGST/GST, `user-ordering.class.ts:2060-2069`) is distinct and also deferred to the tax slice.

## 6. Commission configuration (from P1.7.32)

Authoritative source = `Restaurant.commissionBps` (P1.7.32), snapshotted onto each `Settlement` (stable if config changes; fixes the legacy live-lookup mutability). This slice keeps that; no effective-dating needed (the snapshot is the record of truth). Scope = restaurant (VERIFIED legacy scope). Bounds `[0,10000]` validated. **RESOLVED.**

## 7. Target implementation (this slice)

The target now charges commission on the **VERIFIED commissionable basis** instead of the tax/delivery-inclusive captured amount:

```
per order:   commissionBasis = subtotalMinor − (offer.settlementType === 'ADMIN' ? 0 : discountTotalMinor)   (clamped ≥ 0)
settlement:  commissionBasisMinor = Σ commissionBasis            (persisted, audit)
             commissionMinor      = floor(commissionBasisMinor × commissionBps / 10000)
             grossAmountMinor     = Σ net-of-refund captured      (= Σ items = payout pool)
             amountMinor (net)    = grossAmountMinor − commissionMinor
```

- Uses existing target fields: `Order.subtotalMinor` (pre-discount item subtotal, P1.7.12), `Order.discountTotalMinor`, `Order.offer.settlementType` (P1.7.22/24). No blocked decision required (GST is a separate deferred layer).
- **Refund-independent basis** (frozen), matching legacy; refunds still reduce the payout pool (`grossAmountMinor`).
- New `Settlement.commissionBasisMinor` persists the basis for auditability (Phase 12).

## 8. Reconciliation invariants (tested)

- `Σ SettlementItem.amountMinor == grossAmountMinor` (payout pool).
- `commissionMinor == floor(commissionBasisMinor × commissionBps / 10000)`.
- `amountMinor == grossAmountMinor − commissionMinor`.
- Commission basis excludes tax/delivery/fees; subtracts VENDOR discount; not ADMIN discount; frozen under refund.
- Refunds ≤ captured; basis ≥ 0; commission ≤ basis; payout non-negative payable (net ≤ 0 → non-payable, P1.7.31); no amount silently lost.
- **Negative-net edge:** if a heavily-refunded COMPLETED order made commission (on the frozen basis) exceed the payout pool, `amountMinor` could be negative; it remains reconcilable (`gross − commission`) and is **non-payable** (payout rejects ≤ 0). A merchant-owes-platform receivable is **DEFERRED** (DR-COMM-CLAWBACK); no debt system built.

## 9. Post-settlement commission clawback — DR-COMM-CLAWBACK (DEFERRED)

Legacy has **no** post-settlement commission reversal/negative adjustment (VERIFIED §4). Target preserves no-retroactive-change (P1.7.31/32). A future negative-`SettlementItem`/adjustment model (for a refund after the merchant is settled) is the documented owner decision. Not implemented (no speculative receivable system).

## 10. Deferred / not reproduced (documented, not implemented)

- **GST-on-commission** (DR-03a BLOCKED).
- **ADMIN-discount payout reimbursement** (legacy `settleAmount += discount`): the target captures the discounted amount and does not reimburse the merchant the ADMIN discount — tied to the platform-funding/fee model; DEFERRED.
- **Payout-pool charges**: gateway/outgoing-charge deduction (`calcRazorpayCharges`, 3% + 18%), tip/donation split — depend on the fee/tip/donation model not in the target Order; DEFERRED.
- **Post-settlement clawback** (DR-COMM-CLAWBACK).
- **Cancelled/Dunzo partial settlement** (DR-SETTLE-CANCELLED-PARTIAL, delivery domain).
- **Historical migration** of any financial records — none.
- **DR-02b/c/d/e** — BLOCKED — OWNER/DATA (historical migration only).

## 11. Schema / migration

Additive only: `Settlement.commissionBasisMinor BigInt @default(0)` (migration `20260903040000_p1_7_34_settlement_commission_basis`, dev+test). No existing model redesigned; no data migration.

## 12. Tests

`apps/api/test/settlement-payout.e2e-spec.ts` (+4; 30 total): commission on **subtotal only, excluding tax/delivery/fees**; **VENDOR discount subtracted** from basis; **ADMIN discount NOT subtracted**; **basis frozen under partial refund** (payout pool shrinks, commission unchanged). Existing commission tests unchanged (their orders have no tax/discount, so subtotal = captured). Full suite **391/391** (387 prior + 4). P1.7.28–33 behavior preserved.

## 13. Decisions

- **RESOLVED:** commissionable basis = `subtotal − vendor-funded discount` (excludes tax/delivery/fees; ADMIN discount not subtracted; refund-independent); persisted as `commissionBasisMinor`; commission computed on it (not the captured amount).
- **BLOCKED — OWNER/DATA:** DR-03a (GST-on-commission rate/components/recording, jurisdiction); DR-02b/c/d/e (historical migration only).
- **DEFERRED:** DR-COMM-CLAWBACK (post-settlement clawback / negative adjustment); ADMIN-discount payout reimbursement; payout-pool charges (gateway/tip/donation); per-restaurant settlement window; DR-SETTLE-CANCELLED-PARTIAL; auto-settlement cron; live RazorpayX HTTP.

## 14. Recommended P1.7.35

**GST / tax-on-commission foundation (DR-03a)** — once the owner provides the India GST rate/components and the jurisdiction model, add a tax boundary that computes GST on commission (recorded separately on the settlement for auditability) and a localization-ready structure (India vs US). This is the last major economic-accuracy item; it is currently BLOCKED — OWNER/DATA and must not be guessed. Alternatively, a **payout-charge model** slice (gateway/outgoing-charge + tip/donation payout deductions) if that fee data is available, or begin **delivery-domain reconciliation** (unblocks DR-SETTLE-CANCELLED-PARTIAL).
