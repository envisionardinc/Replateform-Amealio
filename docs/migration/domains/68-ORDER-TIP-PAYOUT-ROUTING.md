# 68 — Config-Driven Tip Beneficiary Routing (P1.7.39)

> **Type:** IMPLEMENTATION — deterministic routing of collected tips using the P1.7.38 beneficiary-policy snapshot, per the P1.7.42 approved policy. **MERCHANT routing only**; DELIVERY_PERSON and SHARED_POOLED are explicitly BLOCKED (no foundation), never silently routed.
> **Migration:** `20260903070000_p1_7_39_tip_settlement_routing` (additive only).
> **Governing contract:** [70-TIP-DONATION-OWNER-DECISION-PACKET.md](./70-TIP-DONATION-OWNER-DECISION-PACKET.md) (P1.7.42); depends on [71-TIP-COLLECTION-CAPTURE-FOUNDATION.md](./71-TIP-COLLECTION-CAPTURE-FOUNDATION.md) (P1.7.38).
> **Baseline:** P1.7.38 `0534549`, **414/414 → 422/422** (+8 routing tests).

> **Supersession note:** this document previously recorded P1.7.39 as **BLOCKED at the GO GATE** (no collected tip; beneficiary not resolvable). P1.7.38 (collection) and P1.7.42 (approved MERCHANT-configurable policy) resolved both blockers for the MERCHANT branch, which is now implemented.

Tags: **IMPLEMENTED** (MERCHANT), **BLOCKED** (DELIVERY_PERSON / SHARED_POOLED), **DEFERRED** (refund lifecycle).

---

## 1. Approved policy (P1.7.42) & dependency (P1.7.38)

Tip beneficiary is **merchant-configurable** (`MERCHANT` / `DELIVERY_PERSON` / `SHARED_POOLED`), **snapshotted** onto each `TipPayment` at collection (P1.7.38). Routing consumes that snapshot. Only MERCHANT is supportable today (P1.7.41: delivery assignment/history absent; no pool foundation). Tip commission = **0%**. A collected tip is a separate `TipPayment` (CAPTURED, server-verified, `razorpayPaymentId` = provider evidence), financially isolated from order economics.

## 2. Merchant routing implementation

`SettlementService.routeTip(principal, { tipPaymentId })` (SUPER_ADMIN-only):
1. Loads the tip via `SettlementRepository.findRoutableTip` (reads `TipPayment` + its order's `restaurantId` + any existing routing).
2. **Idempotent replay:** if the tip already has an ORDER_TIP settlement item, returns it (`created:false`).
3. **State gate:** only a `CAPTURED` tip is routable (CREATED/FAILED = uncollected; REFUNDED/PARTIALLY_REFUNDED = money returned → rejected; routing never manufactures money).
4. **Beneficiary branch (from the SNAPSHOT):** `MERCHANT` → route; `DELIVERY_PERSON` / `SHARED_POOLED` → deterministic `BadRequestException` (BLOCKED); unknown → reject. Blocked branches **never** fall through to merchant.
5. MERCHANT: `createTipSettlement` creates a dedicated `Settlement(payoutType='ORDER_TIP')` — `grossAmountMinor = amountMinor = tip`, `commissionBps=0`, `commissionBasisMinor=0`, `commissionMinor=0` — plus one `SettlementItem { tipPaymentId, orderId, amountMinor=tip }`.
6. **Idempotency:** `SettlementItem.tipPaymentId @unique` → concurrent/duplicate routing throws P2002, rolls back, and returns the existing settlement.

The `merchantId` on the settlement is taken from the **tip's own record** (server-derived), so cross-merchant routing is impossible by construction.

## 3. Settlement architecture decision (Phase 4)

**Option A (chosen):** a distinct `SettlementItem` representing the tip, inside a dedicated **`ORDER_TIP`** `Settlement`, reusing the entire existing `Settlement`/`SettlementItem`/`Payout` architecture (no parallel payout system). The `SettlementPayoutType.ORDER_TIP` enum value already existed for exactly this (legacy `tipSettledId` settled tips separately to the vendor account — corroborating, not the basis). The reconciliation question is answered: **`SettlementItem.tipPaymentId` → `settlementId`** tells how much tip was collected, which merchant was entitled, and which settlement/payout transferred it. Payout reuses the unchanged `requestPayout` path (an ORDER_TIP settlement is a `Settlement`).

## 4. Beneficiary snapshot integrity (Phase 8, TESTED)

Routing reads `TipPayment.beneficiaryPolicy` (the collection-time snapshot), **never** the merchant's current config. A tip collected under MERCHANT routes to the merchant even if the merchant later reconfigures; a tip whose snapshot is DELIVERY_PERSON is blocked regardless of current config. Historical financial behavior cannot change because configuration changed later.

## 5. State-machine integrity (Phase 9, TESTED)

`CREATED → CAPTURED` (P1.7.38) → **routable** (CAPTURED + MERCHANT + not-yet-routed) → **routed** (an ORDER_TIP `SettlementItem` exists; the `Settlement` then follows the normal `PENDING → COMPLETED` payout lifecycle). No new enum states invented — "routed" is the DB-enforced settlement-item link; the `Settlement`/`Payout` reuse existing statuses. Rejected: uncaptured/failed/refunded → settlement; duplicate settlement (unique); blocked-branch → merchant; cross-merchant (server-derived merchantId).

## 6. Idempotency (Phase 10, TESTED)

DB-enforced boundary: `SettlementItem.tipPaymentId @unique` — the same collected tip can never become two merchant settlement amounts. Duplicate request → idempotent replay; concurrent routing → exactly one settlement (P2002 rollback + replay). Not application-level only.

## 7. Financial isolation (Phase 2/7, TESTED)

Tip routing does not touch `Order.grandTotalMinor`, the order `PaymentIntent`, the commission basis, order commission, or the order settlement. The ORDER_TIP settlement is a separate record; the order settlement (`settleMerchant`) still derives its gross/commission from the order payment only (a tip item carries `tipPaymentId`, not `paymentIntentId`, so it is invisible to the order-settlement eligibility query). Tested: routing a large tip leaves the order settlement gross/basis/commission/net and `grandTotalMinor` identical.

## 8. Zero commission (Phase 6)

The ORDER_TIP settlement is created with `commissionBps=0`, `commissionBasisMinor=0`, `commissionMinor=0`; the merchant nets the full tip. No platform fee, no gateway-fee deduction, no tax/commission manipulation; unrelated order commission is untouched.

## 9. Blocked branches (Phase 7)

- **DELIVERY_PERSON — BLOCKED — DELIVERY ASSIGNMENT FOUNDATION.** Requires an authoritative delivery assignment + immutable assignment-history foundation (P1.7.41 confirmed absent). Routing returns a deterministic blocked error; no `DeliveryTask`/`deliveryPersonId` inference, no assignment/history/payout created.
- **SHARED_POOLED — BLOCKED — POOL ALLOCATION FOUNDATION.** Requires pool membership/allocation/accounting. Deterministic blocked error; no pool/split/allocation created.

## 10. Refund interaction (Phase 11)

Routing requires `CAPTURED`. After routing, the tip stays `CAPTURED`; a later tip refund (P1.7.38 `recordTipRefundState`) flips it to REFUNDED/PARTIALLY_REFUNDED **without** reversing or deleting settlement history — the `CAPTURED → SETTLED → REFUNDED` sequence remains representable. **Dependency for the refund-lifecycle slice:** a post-settlement tip refund needs a merchant clawback/adjustment mechanism against the ORDER_TIP settlement, which does not exist yet. The full refund ledger is out of scope here.

## 11. Authorization (Phase 12)

`routeTip` is SUPER_ADMIN-only (server-authoritative process). The beneficiary comes from the tip snapshot (not a client input); customers cannot select/modify the beneficiary, force any branch, or modify the settlement amount. Merchant config → snapshot at collection → routing consumes the snapshot.

## 12. Migration / rollback

`20260903070000_p1_7_39_tip_settlement_routing` — additive only: `SettlementItem.tipPaymentId UUID` (nullable) + unique index + FK to `TipPayment`. No existing column/constraint/data change; order-settlement items keep using `paymentIntentId`. Rollback: drop the FK + unique index + column. Applied to dev+test.

## 13. Evidence index (file:line)

- Routing: `settlement.service.ts` (`routeTip`); `settlement.repository.ts` (`findRoutableTip`, `createTipSettlement`).
- Reused settlement: `Settlement`/`SettlementItem`/`Payout` (`prisma/schema.prisma:1251-1313`); `SettlementPayoutType.ORDER_TIP` (`:132`).
- Isolation anchors (unchanged): order settlement `settlement.repository.ts:53-105` (filters `paymentIntentId`; tip items excluded); order payment `payment.service.ts:43`.
- Tip snapshot dependency: `TipPayment.beneficiaryPolicy` (P1.7.38, doc 71).

## 14. Validation

`prisma generate` + `migrate deploy` ✓; `tsc --noEmit` clean; lint + format clean; new `tip-routing.e2e-spec.ts` (8: merchant routing + 0% commission + full tip + correct destination + ORDER_TIP identifiable; payout via existing path; idempotent replay + concurrency; **snapshot integrity**; **DELIVERY_PERSON/SHARED_POOLED blocked, no settlement created**; uncaptured/refunded rejected; non-SUPER_ADMIN forbidden; **order-settlement isolation**); **full suite 414/414 → 422/422**; `git diff` scoped to P1.7.39.

---

## P1.7.39 Result

- **Status:** COMPLETE (MERCHANT branch)
- **Merchant routing:** IMPLEMENTED
- **Delivery-person routing:** BLOCKED — DELIVERY ASSIGNMENT FOUNDATION
- **Shared-pooled routing:** BLOCKED — POOL ALLOCATION FOUNDATION
- **Tip beneficiary source:** SNAPSHOTTED POLICY (`TipPayment.beneficiaryPolicy`)
- **Merchant settlement path:** dedicated `Settlement(payoutType=ORDER_TIP)` + `SettlementItem(tipPaymentId)`, reusing the existing settlement/payout architecture
- **Tip settlement component:** `SettlementItem.tipPaymentId @unique` (Option A)
- **Tip commission:** 0%
- **Duplicate routing prevented:** YES (`SettlementItem.tipPaymentId @unique`, DB-enforced)
- **Policy snapshot integrity:** YES
- **Refund interaction:** representable; post-settlement clawback deferred to the refund-lifecycle slice
- **`grandTotalMinor` changed:** NO · **Order PaymentIntent changed:** NO · **Order commission changed:** NO · **Existing order settlement economics changed:** NO
- **Tests:** 422/422 · **TypeScript:** clean · **Lint/format:** clean

### Critical conclusion
A successfully collected **MERCHANT-configured** tip can now be **deterministically routed** into a dedicated `ORDER_TIP` merchant settlement (0% commission, full tip) through the **existing** merchant settlement/payout architecture, driven strictly by the tip's collection-time **snapshot** and idempotent via a DB-enforced unique boundary — while **DELIVERY_PERSON and SHARED_POOLED are explicitly blocked** (deterministic errors, no settlement created) rather than silently redirected. Order economics (`grandTotalMinor`, order payment, commission, order settlement) are provably unchanged.

### Required next action
Do **not** immediately implement DELIVERY_PERSON or SHARED_POOLED routing. Given the MERCHANT branch is complete and no delivery-person/pooled merchant configuration is enabled (the resolver baseline is MERCHANT), the highest-value remaining dependency is the **tip refund lifecycle & reconciliation** — specifically a post-settlement tip clawback/adjustment against the ORDER_TIP settlement (surfaced as a dependency in §10). Select the next slice only after reviewing this result.
