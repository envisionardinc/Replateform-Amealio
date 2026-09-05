# 65 — Tip & Donation Order-Model Foundation (P1.7.36)

> **Type:** Data-model foundation (narrow, forensic-first). Adds two canonical customer-funded amounts to `Order` — `tipMinor` and `donationMinor` — as the smallest GST-independent step unblocked from the P1.7.35 payout reconciliation. **NOT a payout rewrite.**
> **Migration:** `20260903050000_p1_7_36_order_tip_donation` (additive only).
> **Governing gate:** [64-PAYOUT-CHARGES-DEDUCTIONS-RECONCILIATION.md](./64-PAYOUT-CHARGES-DEDUCTIONS-RECONCILIATION.md) §8-9,16 (DR-TIP / DR-DONATION).
> **Baseline:** P1.7.34/35 391/391 → **401/401** (+10 focused tests). Settlement economics **unchanged**.

Tags: **VERIFIED**, **DEFERRED**, **BLOCKED — OWNER/DATA**.

---

## 1. Why these fields are being added

P1.7.35 forensically established the legacy merchant-payout pool and found tips and donations are real financial components that the **target `Order` did not model at all** (only `subtotal/tax/discount/fee/delivery/grand`). They were deferred solely because the fields were missing (`DR-TIP` / `DR-DONATION`) — not because of the blocked GST decision (DR-03a). This slice creates the canonical fields so a later settlement slice can deduct/route them correctly, without touching payout economics now.

## 2. Legacy evidence (VERIFIED)

- **Tip:** subtracted from the order-body payout and **disbursed separately** as `PAYOUT_TYPE.ORDER_TIP` (`settlement.class.ts:739,741`); **excluded from commission** (VERIFIED P1.7.34). Recipient/merchant-owned.
- **Donation:** a **charity pass-through** transferred to `UDBHAV_ACCOUNT` via Razorpay transfers (`razorpay.class.ts:863-921`); subtracted from the merchant payout and netted out of the gateway-charge base (`settlement.class.ts:740,81-83`); **excluded from commission**. **Not merchant-owned.**

## 3. Target order-total contract (traced before changing anything)

The DB CHECK `order_total_integrity` (`20260901224600_constraints_and_immutability`) fixes:

```
grandTotalMinor = subtotalMinor − discountTotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor
```

`OrderService.createOrder` derives `grandTotalMinor` from exactly those five components (`order.service.ts:174`), the commission basis reads only `subtotalMinor`/`discountTotalMinor` (`settlement.repository.ts:90-93`), and payment capture uses `order.grandTotalMinor` as the intent amount (`payment.service.ts:43`).

**Determinism conclusion:** adding tip/donation *into* `grand` would require altering the CHECK (i.e. changing total semantics) — explicitly out of scope. The only deterministic implementation that preserves existing totals is to add them as **standalone columns held outside the grand-total equation and outside the basis**. That is what this slice does. No blocker: the existing contract permits the additive-column form without any total-semantics change.

## 4. Field definitions

| Field | Type | Default | In `grand`? | In commission basis? | In payment capture? | Ownership |
|---|---|---|---|---|---|---|
| `Order.tipMinor` | `BigInt` (minor units) | `0` (NOT NULL) | **No** | **No** | No (grand only) | separately disbursable (ORDER_TIP) |
| `Order.donationMinor` | `BigInt` (minor units) | `0` (NOT NULL) | **No** | **No** | No (grand only) | charity pass-through (not merchant revenue) |

Non-null zero matches the existing money-field convention (`subtotalMinor` … `grandTotalMinor` are all `BigInt @default(0)` NOT NULL); no target money column is nullable, so nullability is not introduced.

## 5. Semantic contract (enforced / asserted)

- **Tip** is customer-funded, **not merchant commissionable revenue**, **not in the commission basis**, remains conceptually separately disbursable, introduces **no GST logic**, and does **not** modify payout economics in this slice.
- **Donation** is customer-funded, **not merchant revenue**, **not in commission**, **not merchant payout**, remains conceptually payable to the charity destination, and introduces **no GST logic**.
- Both are validated `>= 0` (`order.service.ts`) and stored as exact `BigInt`.

## 6. Application wiring (no forced API exposure)

Ordering is **service-only** (no REST controller/DTO exists). The fields flow through: `CreateOrderInput.tipMinor?/donationMinor?` (optional, default `0n`) → `OrderService.createOrder` (validation + pass-through, **not** added to `grandTotalMinor`) → `OrderRepository.createOrderWithItems` (persist) → `OrderRecord.tipMinor/donationMinor` (read). No API surface is added merely because the columns exist (per architecture conventions).

## 7. Commission / settlement impact — NONE

The commission basis (`subtotal − vendor discount`), settlement gross (net-of-refund captured grand), commission, and net payout are **unchanged**. Tests assert that a settlement with a large tip + donation produces **identical** `grossAmountMinor`, `commissionBasisMinor`, `commissionMinor`, and `netAmountMinor` as one with none. **P1.7.36 does not change settlement economics.**

## 8. Refund ambiguity (DEFERRED)

The target refund model (`Refund` on `PaymentIntent`, P1.7.29/30) refunds against the **captured `grandTotalMinor`** — which does **not** include tip/donation, so there is currently **no deterministic information** to establish:

- tip refund behavior (full/partial),
- donation refund behavior (charity funds are already transferred out in legacy),
- how a partial order refund apportions to tip/donation.

Legacy fuses tip/donation into `settleAmount`/refund flows in ways tied to the deferred payout wiring. **No refund semantics are invented.** Tip/donation refund treatment is **DEFERRED** until tip/donation are wired into capture/payout.

## 9. Migration / backfill / rollback

`ALTER TABLE "Order" ADD COLUMN "tipMinor" BIGINT NOT NULL DEFAULT 0, ADD COLUMN "donationMinor" BIGINT NOT NULL DEFAULT 0;` — additive only. **Verified against the current dataset:** all **1681** existing `Order` rows received `0/0`; **no existing column, total, or constraint changed**; the `order_total_integrity` CHECK definition is byte-for-byte unchanged. Rollback is a plain `DROP COLUMN` for both (no data dependency, no FK, no CHECK reference).

## 10. Reconciliation result & validation

- `prisma generate` + `migrate deploy` succeed; app type-checks (`tsc --noEmit` clean); lint/format clean.
- New suite `order-tip-donation.e2e-spec.ts` (10 tests) + `ordering-foundation` + `settlement-payout` all green; **full suite 401/401** (was 391).
- Scenarios covered: no tip/donation (backward compat), tip only, donation only, both, explicit zero, negative rejection, BigInt minor-unit precision, commission basis excludes tip & donation, settlement identical with/without tip/donation, pre-existing rows remain `0`.
- `git diff` contains only P1.7.36 changes (schema + ordering domain/service/repo + one migration + one test).

## 11. Deferred / still-blocked

- **DEFERRED:** tip/donation **payout routing** (ORDER_TIP disbursement; charity transfer), tip/donation **capture inclusion**, tip/donation **refund semantics**, whether `grandTotal` should eventually include them (needs the payout/capture decision).
- **BLOCKED — OWNER/DATA:** DR-03a (GST); DR-PAYOUT-CHARGE; DR-ADMIN-DISCOUNT-REIMBURSEMENT (per doc 64) — untouched here.

## 12. Conclusion

**P1.7.36 did NOT change settlement economics.** It is a pure additive data-model foundation: two canonical, commission-excluded, payout-neutral customer-funded fields, backfilled to zero, with no total-semantics, capture, commission, or refund behavior change. The forensic trace confirmed the additive-column form is the only deterministic implementation consistent with the existing order-total contract, so no blocker was raised.
