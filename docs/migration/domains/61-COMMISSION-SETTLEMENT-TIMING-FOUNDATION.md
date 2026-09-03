# 61 — Commission Configuration + `settleAfter` Scheduling Foundation (P1.7.32)

> **Type:** IMPLEMENTATION (bounded foundation) — authoritative commission-rate source + server-derived settlement-window (`settleAfter`) for the P1.7.31 settlement engine. One additive migration.
> **Governing gate:** [56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md](./56-PAYMENT-REFUND-RUNTIME-RECONCILIATION.md) §15/§29 + [60-SETTLEMENT-PAYOUT-FOUNDATION.md](./60-SETTLEMENT-PAYOUT-FOUNDATION.md).
> **Authority:** legacy `amealio-vendordashboard` (`settlement.class.ts`, `restaurant.model.ts`, `sub-category.model.ts`, `user-ordering.class.ts`) + target `prisma/schema.prisma`. Baseline **P1.7.31 `f7a0712`, 378/378 → 385/385**.

Evidence tags: **VERIFIED** (proven in source), **INFERRED** (reasonable from source, not proven), **DEFERRED**, **BLOCKED — OWNER/DATA**.

---

## 1. Scope

Remove the two P1.7.31 limitations: (a) settlement required a **caller-supplied `commissionBps`**, and (b) there was **no settlement-window rule**. This slice makes the commission rate come from **authoritative config** and gates settlement on a **server-derived `settleAfter`** window. No Super-Admin/Merchant/User/Delivery/UI work; no historical financial migration; coupon logic untouched.

## 2. Commission source — legacy evidence (VERIFIED)

- The rate is **restaurant-scoped**: `restaurant.comissionCode` is an ObjectId → `Sub Category`, and `comissionCode.description` is parsed as a numeric **percentage** at settlement time — `settlement.class.ts:45-52` (`totalComission`): `percent = parseFloat(comissionCode?.description || 0); comission = ((orderTotal − discountTotal) × percent) / 100`. Stored on `restaurant.model.ts:610-614`; defaulted from env `COMISSION_CODE` at restaurant creation.
- **Basis (VERIFIED):** `Σ(base_amount) − Σ(vendor-funded discount)` where ADMIN-funded offers are excluded from the discount subtraction (`offerSettlement==='ADMIN' ? 0 : discount.amount`); then **+18% GST** on the commission. Taxes/delivery/tips/donations are **not** in the commission base (they are handled separately in the payout math).
- **Mutable, no snapshot (VERIFIED, = technical debt):** the % is looked up **live** at settlement from the current restaurant/subcategory; a rate change retroactively affects unsettled orders. No order-level commission snapshot; no effective-dating.
- **Multiple models (VERIFIED):** ordering (base_amount), experience (`payment_data.total_amount`), scan-and-pay (**0**). The platform `AMEALIO_COMISSION` env exists but is **unused** in the live path (only commented code).

## 3. Commission source — target decision

**RESOLVED — authoritative source = `Restaurant.commissionBps` (new field, integer basis points), restaurant-scoped** (faithful to legacy scope), replacing legacy's "commission-as-a-subcategory-description string" (technical debt not reproduced). The settlement service **resolves the rate from the restaurant** — callers can no longer supply it (`SettleMerchantInput` no longer has `commissionBps`; `restaurantId` is now **required**, so the rate is unambiguously scoped). Bounds validated `[0, 10000]`; `null ⇒ platform default 0`. The rate is **snapshotted** onto each `Settlement` (`commissionBps`/`commissionMinor`) → historical settlements are stable even if the config changes later (fixes the legacy mutability debt; no effective-dating needed because the snapshot is the record of truth).

**DEFERRED (not reproduced here):**
- **GST-on-commission (+18%)** — a tax rule tied to **DR-03a (India GST components/rates)**, which is **BLOCKED — OWNER/DATA**. Not hardcoded; documented for the GST slice. Tag: INFERRED-legacy / DEFERRED.
- **Precise commissionable BASIS** (legacy = `base_amount − vendor discount`, excluding tax/delivery) — this slice uses the P1.7.31 basis (**net-of-refund captured amount per payment**) and records that the exact commissionable-component breakdown (subtotal vs grand total, vendor-vs-ADMIN offer split) is an owner decision **DR-COMM-BASIS**, because it depends on the blocked GST/fee model. Tag: DEFERRED.

## 4. `settleAfter` — legacy evidence (VERIFIED)

`user-ordering.class.ts:1981-1983`: `contextData.settleAfter = moment().endOf('day').add(2, 'days').toDate()` — **end-of-day + 2 calendar days**, in **Asia/Kolkata** (`process.env.TZ='Asia/Kolkata'` + bare moment; `app.ts:26`/`index.ts:12`). Set **at order creation** (scheduled orders anchor to `later_date`). **N=2 hardcoded**; **no per-merchant window**; **no business-day/holiday logic**. Eligibility (`settlement.class.ts:552-567`) is an **admin date-range** query on `settleAfter` plus `order_status=COMPLETED` + `payment_status=COMPLETED` + `settleInprogress=false` + `settleOrderAmount=false`. Settlement is **admin-triggered** (no auto-cron that batches by `settleAfter <= now`). Refunds/cancellations do **not** change `settleAfter`.

## 5. `settleAfter` — target decision

**RESOLVED window semantics (VERIFIED), improved anchor (documented):**
- **Window:** `settleAfter = 23:59:59.999 IST of (capture-day + N)`, `N = SETTLEMENT_DELAY_DAYS` (env, default **2**, VERIFIED). Calendar days, IST, no business-day logic (none in legacy). Implemented as the pure `computeSettleAfter(capturedAt, N)` (fixed +05:30 offset; no timezone ambiguity; no DST).
- **Anchor:** the **payment capture** instant (earliest `CAPTURED PaymentAttempt.createdAt`) — an authoritative financial event — **not** legacy's order-creation instant (INFERRED technical debt: legacy set `settleAfter` before payment even existed). This is a deliberate, documented improvement.
- **Eligibility:** server-derived; a payment is settleable when `now >= settleAfter`. **No client-supplied date, no caller override.** Premature payments are deterministically excluded. No scheduler/cron introduced (on-demand SUPER_ADMIN run, matching legacy's admin trigger).
- **Per-merchant window:** none (legacy had none) — a per-restaurant override is a deferred owner decision.

## 6. Settlement integration (P1.7.31 preserved)

`SettlementService.settleMerchant(principal, { merchantId, restaurantId })` now: resolves commission from `Restaurant.commissionBps`; validates the restaurant belongs to the merchant; computes each eligible payment's net-of-refund contribution; **filters by `settleAfter`** (`isSettleable(capturedAt, delayDays, now)`); rejects when nothing is settleable; computes `gross`/`commission`/`net` (exact BigInt); creates the settlement + items. **Unchanged:** settle-once idempotency (`SettlementItem.paymentIntentId @unique`), concurrency safety, merchant isolation, refund deduction, zero/negative-net non-payable, payout amount = settlement net, itemization.

## 7. Post-settlement refund determination

**Determination: B — explicitly documented deferred capability.** Legacy evidence (VERIFIED) shows **no** negative settlement adjustment / clawback: `settleAfter` and settlement records are never rewritten by a later refund; ordering refunds are wallet credits only (doc 56 §16). There is **no proven business rule** for a post-settlement clawback in legacy. Therefore this slice **does not** implement clawback (avoiding a speculative receivable/debt system) and preserves P1.7.31's behavior: a refund after settlement processes at the payment layer, the existing settlement is **not** retroactively changed, and the payment is **not** re-settled (its `SettlementItem` persists). The required future model (a negative `SettlementItem`/adjustment) is documented as owner decision **DR-COMM-CLAWBACK**. Tested (no-retroactive-change).

## 8. RazorpayX

Unchanged from P1.7.31/60: the payout provider boundary (`RazorpayxPayoutGateway`) is isolated; **live RazorpayX HTTP is deferred / not production-ready** (dev returns deterministic `pending`). No webhook event names/payloads invented.

## 9. Schema / migration

One additive change: `Restaurant.commissionBps Int?` (migration `20260903030000_p1_7_32_restaurant_commission_bps`, dev+test). `settleAfter` needs **no** persisted field (computed deterministically from the capture timestamp). No existing model redesigned; no data migration.

## 10. Financial invariants (tested)

Commission from authoritative config (not caller); exact BigInt commission; `Σ items = gross`; `net = gross − commission`; payout = net; snapshot stability (later config change doesn't alter a past settlement); settle-once; concurrency-safe; merchant isolation; premature payments excluded; refund deductions; zero-net non-payable.

## 11. Tests

`apps/api/test/settlement-payout.e2e-spec.ts` (rewritten for the new contract; **24 tests**, +7 vs P1.7.31): 3 pure `computeSettleAfter`/`isSettleable` IST-boundary tests; timing (fresh capture not settleable, backdated settleable, partial-eligibility); eligibility + refund deduction/full-refund exclusion; commission from `Restaurant.commissionBps` (exact, default 0, **snapshot stability**, out-of-bounds rejected); ownership (restaurant≠merchant, unknown restaurant, isolation); authorization; settle-once + concurrency; payout lifecycle/failure/idempotency/duplicate-callback/zero-amount; post-settlement refund (no retroactive change). Full suite **385/385** (378 prior − 17 old settlement + 24 new = 385). P1.7.28–30 payment/refund behavior unchanged.

## 12. Decisions

- **RESOLVED:** commission source = `Restaurant.commissionBps` (authoritative, snapshotted); `settleAfter` = end-of-day IST of capture + `SETTLEMENT_DELAY_DAYS` (default 2), capture-anchored, server-derived.
- **BLOCKED — OWNER/DATA:** DR-02b/c/d/e (historical migration only; unaffected here).
- **DEFERRED owner decisions:** DR-03a GST-on-commission; **DR-COMM-BASIS** (precise commissionable basis: subtotal-vs-grand-total, vendor/ADMIN offer split); **DR-COMM-CLAWBACK** (post-settlement refund negative adjustment); per-restaurant settlement-window override.

## 13. Deferred functionality

- GST-on-commission (pending DR-03a).
- Precise commission basis reconciliation (DR-COMM-BASIS).
- Post-settlement refund clawback / negative adjustment (DR-COMM-CLAWBACK).
- Per-merchant/restaurant `settleAfter` override; automatic settlement scheduling/cron.
- Live RazorpayX HTTP + payout webhook route.
- Historical migration of any financial records.

## 14. Recommended P1.7.33

**Order-completion / delivery status → settlement-eligibility gate** OR a focused **DR-COMM-BASIS resolution slice**. Legacy additionally gates settlement on `order_status = COMPLETED` (doc 61 §4) — the target currently gates only on payment capture + `settleAfter`. The smallest next backend slice is to add the **order-completion eligibility condition** (settle only completed orders, matching legacy) using the existing `OrderStatus` lifecycle — additive, no historical migration, reusing the P1.7.28–32 ledger. Alternatively, resolve **DR-COMM-BASIS** (commissionable-component breakdown) once the GST/fee model owner decision is available.
