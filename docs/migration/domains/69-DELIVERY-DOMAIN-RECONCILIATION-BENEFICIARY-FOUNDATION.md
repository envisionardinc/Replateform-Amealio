# 69 — Delivery-Domain Reconciliation / Beneficiary Foundation (P1.7.41)

> **Type:** FORENSIC / DOMAIN-RECONCILIATION ONLY. **No code, schema, migration, API, or DTO change.** Establishes the authoritative delivery-domain facts needed to later decide whether a delivery person can be a tip beneficiary — without selecting a beneficiary policy.
> **Governing context:** [66](./66-TIP-DONATION-LIFECYCLE-ECONOMIC-CONTRACT.md) (P1.7.37), [67](./67-TIP-DONATION-COLLECTION-CAPTURE-FOUNDATION.md) (P1.7.38, BLOCKED), [68](./68-ORDER-TIP-PAYOUT-ROUTING.md) (P1.7.39, BLOCKED).
> **Baseline:** P1.7.38 `281f05c`, **401/401** (unchanged — forensic only).

Tags: **PROVEN** (target code/schema), **HISTORICAL** (legacy only), **TARGET** (established target policy), **UNKNOWN — OWNER/DATA**.

---

## 1. Executive conclusion

The delivery domain is **fully reconcilable from repository evidence** (this slice is forensically complete), but a **deterministic tip beneficiary is NOT currently possible**, for three independent reasons: (1) the target `DeliveryPerson`/`DeliveryTask` models are **pure, unimplemented scaffolding** — no target code creates, assigns, reads, or completes them, so `deliveryPersonId` is never populated; (2) the target has **no assignment timestamp and no assignment-history/audit model**, and reassignment would overwrite `deliveryPersonId` in place, so the historical beneficiary fact needed for financial reconciliation cannot be preserved; (3) the **beneficiary policy is an unresolved owner decision** — and legacy evidence points *away* from the naive assumption, because the legacy `ORDER_TIP` payout settles to the **vendor (merchant) settlement account** (`vendor_id`/`settlement_account_details`), not to the individual delivery person. Beneficiary routing therefore remains gated by P1.7.38 (collection) and an owner beneficiary decision, plus a future delivery-assignment implementation + history foundation. **No policy was selected and nothing was implemented.**

## 2. Scope

Delivery-domain facts only. Explicitly NOT in scope (hard constraints honored): tip/donation collection or capture, `ORDER_TIP`, payout/beneficiary routing, settlement/commission/`grandTotalMinor`/refund changes. No delivery-assignment model invented; no assumption that `deliveryPersonId` = tip beneficiary; no legacy behavior converted to target policy.

## 3. Target delivery-domain inventory (PROVEN)

Schema (`prisma/schema.prisma`):

| Entity/enum | Location | Fields / values | Notes |
|---|---|---|---|
| `enum DeliveryMethod` | `:209-213` | `SELF_DELIVERY`, `THIRD_PARTY`, `AGENT` | order-level method |
| `enum DeliveryPartnerCode` | `:215-219` | `DUNZO`, `PORTER`, `SELF` | external logistics codes |
| `enum DeliveryTaskStatus` | `:221-228` | `PENDING`,`ASSIGNED`,`PICKED_UP`,`ON_THE_WAY`,`DELIVERED`,`CANCELLED` | task lifecycle (enum only) |
| `model DeliveryPartner` | `:1505-1514` | `code @unique`, `name`, `config`, `tasks[]` | external-provider registry |
| `model DeliveryPerson` | `:1516-1528` | `merchantId?`, `name`, `phone?`, `isOnline`, `deletedAt?`, `tasks[]`, `@@index([merchantId])` | **merchant-scoped** self-delivery identity; **no bank/payout/account field** |
| `model DeliveryTask` | `:1531-1548` | `orderId @unique`, `merchantId?`, `method`, `partnerCode?`, `partnerId?`, `deliveryPersonId?`, `status @default(PENDING)`, `createdAt`, `updatedAt`, `@@index([status])` | **one task per order**; `deliveryPersonId` **nullable**; **no assignment timestamp**, **no history** |
| `Order.deliveryTask` | `:1028` | `DeliveryTask?` (1:1) | back-relation |
| `Order.deliveryMethod` | `:987` | `DeliveryMethod?` | |
| `Merchant.deliveryTasks` | `:366` | `DeliveryTask[]` | |

**Application/API code:** there is **no delivery module** in `apps/api/src/modules/` (modules present: catalog, experience, identity, merchant, offer, onboarding, ordering, payment, reference-data, seating, settlement, subscription, user-profile). The only `delivery*` references in `apps/api/src` are the order money/address fields `deliveryChargeMinor` / `deliveryMethod` / `deliveryAddress` (`order.service.ts:128,179,189,206`; `order.repository.ts:54,207,350,379`; `ordering.types.ts:47,148`) — **not** assignment logic. No service/controller/repository/job/event/seed creates a `DeliveryTask`, populates `deliveryPersonId`, transitions `DeliveryTaskStatus`, or reads a `DeliveryPerson`. **Classification (Phase 4): D — incomplete/unimplemented target model.**

## 4. Legacy delivery-domain inventory (HISTORICAL)

Legacy `amealio-vendordashboard` runs **two parallel delivery modes**:

- **Self-delivery** — `Order.selfDeliveryPerson` (ref → `deliverypersons`), a single field populated when the order reaches `READYTOPICK` (`ordering.class.ts:3485-3493`); a socket event `assign_delivery_person` notifies the assigned person's app (`ordering.class.ts:561,3554-3561`). Population/read helpers: `populateSelfDeliveryPersonIfAssigned` (`ordering.class.ts:509-541`), order-completion cron scans `selfDeliveryPerson` (`order-completion-cron.class.ts:41-51,92-103`), user-ordering populates `selfDeliveryPerson` + `delivery_task` (`user-ordering.class.ts:3012-3013,3074-3075,3721-3731`).
- **Third-party logistics** — `Order.delivery_task` + a Porter/Dunzo automation subsystem (`services/automation_delivery/porter_automation/…`; `DeliveryPartnerCode`/`WebhookProvider.DUNZO`). External dispatch/booking/cancel.

**Legacy tip recipient (HISTORICAL, decisive):** the `ORDER_TIP` payout (`PAYOUT_TYPE.ORDER_TIP`, `settlement.model.ts:77-87`) is created against the **order** (`order_id` required, `settlement.class.ts:167-171`) and settled via a **`tipSettledId`** record whose account fields are `settlement_account_details` + `vendor_id` — the **same vendor settlement-account structure as `ORDER`** (`settlement-process.class.ts:89,172`; `settlement-process-cron.class.ts:68,99`; completion `settleTipAmount` `settlement.class.ts:262-266`). Tip capture flag set from `contextData.tip` (`user-ordering.class.ts:1958-1960,1986-1988`). **⇒ the legacy tip was disbursed to the VENDOR (merchant) payout account, not to the individual delivery person.** Any onward distribution to a self-delivery person is off-platform and not evidenced here.

## 5. Delivery assignment lifecycle (Phase 2 answers)

| # | Question | Target answer | Evidence |
|---|---|---|---|
| 1 | Who creates `DeliveryTask`? | **No one** (no code path) | §3 |
| 2 | When is `deliveryPersonId` populated? | **Never** (no code) | §3 |
| 3 | Which service/API/job assigns? | **None** | §3 |
| 4 | Assignment server-authoritative? | **N/A** (unimplemented) — legacy self-assign was server-side at READYTOPICK | `ordering.class.ts:3485-3493` (HISTORICAL) |
| 5 | Can client/customer/merchant/admin mutate assignment? | No target path exists | §3 |
| 6 | Delivery person self-claim? | No target path; legacy = merchant/system-assigned + socket notify | `ordering.class.ts:3554` (HISTORICAL) |
| 7 | Reassignment possible? | Structurally yes (`deliveryPersonId` mutable) but no code; **would overwrite in place** | `schema.prisma:1541` |
| 8 | Previous assignment retained? | **No** (single nullable FK, no history) | `schema.prisma:1531-1548` |
| 9 | Assignment timestamp? | **No** (only `createdAt`/`updatedAt` on the task) | `schema.prisma:1544-1545` |
| 10 | Assignment history/audit? | **No target model**; legacy order `auditLogs` may capture changes (HISTORICAL) | `ordering.class.ts:3407` |
| 11 | Delivery person unavailable? | Undefined (no code); legacy cron re-derives active orders | `order-completion-cron.class.ts:92-103` (HISTORICAL) |
| 12 | Task cancelled? | `DeliveryTaskStatus.CANCELLED` exists but no transition code | `schema.prisma:227` |
| 13 | After pickup? | `PICKED_UP` enum only, no code | `schema.prisma:223` |
| 14 | After completion? | `DELIVERED` enum only, no code | `schema.prisma:225` |
| 15 | Can `deliveryPersonId` stay null through completion? | **Yes** (nullable; also THIRD_PARTY orders have no person) | `schema.prisma:1541` |
| 16 | More than one delivery person per task/order? | No — single `deliveryPersonId` per task | `schema.prisma:1541` |
| 17 | Task without an order? | No — `orderId` required | `schema.prisma:1533` |
| 18 | Multiple tasks per order? | **No — `orderId @unique`** (1:1) | `schema.prisma:1533` |

## 6. Assignment/reassignment & historical integrity (Phase 6)

`DeliveryTask.deliveryPersonId` is a **mutable, nullable FK** with **no timestamp and no history/audit model** (`schema.prisma:1541-1545`); a reassignment would overwrite the prior value with no record. A completed task therefore **cannot be guaranteed to retain its final/original assigned person** for financial reconciliation. **Conclusion:** the current model **cannot preserve the historical beneficiary fact** a future tip payout would need. An assignment-history (or immutable assignment-at-financial-event) foundation is a **required future foundation** — it is *not* implemented here (not independently required by this forensic slice, and the reconciliation does not depend on it).

## 7. Cancellation / completion behavior
Target: enum values exist (`CANCELLED`/`DELIVERED`) but **no transition logic**. Legacy: completion cron reconciles `selfDeliveryPerson` active-order state (`order-completion-cron.class.ts:92-103`); cancellation/reassignment semantics live in legacy ordering flows (HISTORICAL). No target eligibility rule exists.

## 8. System-boundary analysis (Phase 4)
Delivery orchestration in legacy is **split**: self-delivery (in-platform `deliverypersons` + socket assignment) **and** external logistics (Porter/Dunzo automation + webhooks). The target schema mirrors both (`DeliveryPerson` self + `DeliveryPartner` DUNZO/PORTER/SELF), but **implements neither**. Therefore `DeliveryPerson` is best classified as **(D) an incomplete/unimplemented target model** (with a self-delivery intent) and `DeliveryTask.partner*` as a placeholder projection of an **external provider (B)** that is not yet synchronized. Choosing a single authoritative boundary (in-platform vs external) is itself dependent on the unbuilt implementation + owner intent.

## 9. Beneficiary determinism analysis (Phase 5)

| Candidate | Evidence | Required source fields | Authoritative? | Available at tip-capture time? | Stable after reassignment? | History recoverable? | Cancellation changes eligibility? | Completion changes eligibility? | Safe payout/reversal? |
|---|---|---|---|---|---|---|---|---|---|
| Assigned delivery person | target `DeliveryTask.deliveryPersonId` (unimplemented); legacy `selfDeliveryPerson` (HISTORICAL) | populated + timestamped + immutable assignment | **No** (never populated) | **No** (no collection; assignment happens later at READYTOPICK, not at order/tip time) | **No** (mutable, overwrite) | **No** (no history) | Undefined | Undefined | **No** |
| Restaurant / merchant | legacy `ORDER_TIP` → **vendor** `settlement_account_details`/`vendor_id` (HISTORICAL) | merchant/restaurant settlement account (exists: `Restaurant`, settlement path) | Partially (merchant is authoritative) | Yes (order has merchant) | Yes (order→merchant stable) | Yes | n/a | n/a | Plausible (mirrors ORDER payout) |
| Shared/pooled | none | pool definition | n/a | — | — | — | — | — | — |
| External logistics provider | Porter/Dunzo automation (HISTORICAL) | provider payout contract | No (unmigrated) | No | — | — | — | — | No |
| Other | none | — | — | — | — | — | — | — | — |

**Result:** the only candidate with authoritative, stable, capture-time-available data today is **merchant/restaurant** (and legacy evidence actually settled the tip to the vendor account) — but **selecting it is a policy decision reserved for the owner**, and it is not implementable regardless until collection exists (P1.7.38). The **delivery-person** candidate fails determinism on every axis (unimplemented, unstable, no history, not available at capture time). **No beneficiary is selected.**

## 10. Proven vs historical vs target vs unknown

- **PROVEN (target):** delivery models are schema-only and unimplemented; `DeliveryTask` is 1:1 with `Order`; `deliveryPersonId` is nullable/mutable with no timestamp/history; no code assigns or reads delivery entities.
- **HISTORICAL (legacy):** self-delivery via `Order.selfDeliveryPerson` assigned at READYTOPICK + socket notify; parallel Porter/Dunzo logistics; **`ORDER_TIP` settled to the vendor account** tied to the order.
- **TARGET (established policy):** none for delivery assignment or tip beneficiary.
- **UNKNOWN — OWNER/DATA:** who the tip beneficiary is; whether target self-delivery is in-platform vs external; assignment authority/history requirements; cancellation/reassignment eligibility rules.

## 11. Owner/data decision register (Phase 8)

| Decision | Current evidence | Current answer | Owner required? |
|---|---|---|---|
| Is delivery person target-authoritative? | model exists, no code populates it | **No (unimplemented)** | YES (needs implementation + intent) |
| Who assigns delivery tasks? | no target code; legacy = merchant/system @READYTOPICK | **None (target)** | YES |
| Can delivery tasks be reassigned? | `deliveryPersonId` mutable, no code | **Structurally yes, no history** | YES (define semantics) |
| Is assignment history retained? | no timestamp/history model | **No** | YES (required future foundation) |
| Is delivery person the tip beneficiary? | legacy tip → vendor account (not person) | **unresolved** (evidence points to vendor) | YES |
| Can merchant be beneficiary? | legacy `ORDER_TIP` → `vendor_id` | **unresolved** (most-supported) | YES |
| Can pooled beneficiary apply? | none | **unresolved** | YES |
| Is external logistics involved? | Porter/Dunzo automation (legacy), `DeliveryPartner` (target, unimplemented) | **Yes historically; unimplemented in target** | YES (boundary decision) |
| What delivery event freezes beneficiary eligibility? | no target event | **unresolved** | YES |
| What happens on cancellation/reassignment? | enum only, no logic | **unresolved** | YES |

## 12. Dependency relationship to P1.7.38 and P1.7.39

- **P1.7.38 (collection):** remains **BLOCKED — OWNER/DATA** (doc 67). This slice does **not** collect/capture tips or donations and does not alter that status.
- **P1.7.39 (tip payout routing):** remains **BLOCKED**. This slice confirms the **second** P1.7.39 blocker (beneficiary non-determinism) is real and adds precision: even independent of collection, the delivery domain cannot today supply an authoritative, historically-stable delivery-person beneficiary, and the legacy evidence points to a **vendor** tip recipient — so beneficiary selection is an owner decision, not an inference. This slice creates **no** `ORDER_TIP`, no payout, no `Settlement.payoutType` change, and no settlement/commission/`grandTotalMinor`/refund change.

## 13. Recommended next migration slice

The tip/donation chain has three converging owner-gated blockers (collection, beneficiary policy, refund policy). The single highest-leverage unblock is a **product owner decision packet**: (a) are tips/donations charged, and how (P1.7.38 menu); (b) the tip beneficiary (merchant vs delivery person vs pooled) — with the legacy vendor-account evidence surfaced; (c) tip/donation refund policy. **Do not** start delivery-assignment implementation speculatively. If the owner selects a **delivery-person** beneficiary, the required precursor slice is **P1.7.42 — Delivery Assignment + Assignment-History Foundation** (implement server-authoritative assignment with an immutable assignment-at-financial-event record) before any beneficiary routing. If the owner selects **merchant**, beneficiary routing can reuse the existing settlement/payout path once collection (P1.7.38) exists. Absent an owner decision, the smallest evidence-based action is **none in this domain** — pivot to an unblocked domain (e.g. DR-03a GST once decided, or another commerce area).

## 14. File:line evidence index

- Target schema: `prisma/schema.prisma:209-213` (DeliveryMethod), `:215-219` (DeliveryPartnerCode), `:221-228` (DeliveryTaskStatus), `:230-233` (WebhookProvider incl. DUNZO/PETPOOJA), `:366` (Merchant.deliveryTasks), `:987` (Order.deliveryMethod), `:1028` (Order.deliveryTask), `:1505-1514` (DeliveryPartner), `:1516-1528` (DeliveryPerson), `:1531-1548` (DeliveryTask).
- Target code (no assignment; money/address only): `apps/api/src/modules/ordering/application/order.service.ts:128,179,189,206`; `.../infrastructure/order.repository.ts:54,207,350,379`; `.../domain/ordering.types.ts:47,148`.
- Target payment/settlement anchors (unchanged): `payment.service.ts:43,79`; `refund.repository.ts:318`; `settlement.repository.ts:86-93,130`.
- Legacy self-delivery: `amealio-vendordashboard/src/services/ordering/ordering.class.ts:509-541,561,3404,3485-3561,4021-4034`; `user-ordering.class.ts:1958-1960,1986-1988,3012-3013,3074-3075,3721-3731`; `order-completion-cron.class.ts:41-51,92-103`; `otp-authentication.class.ts:134-137,247`; `enums/orderEnums.ts:63`.
- Legacy tip payout → vendor account: `settlement.model.ts:77-87`; `settlement.class.ts:166-171,248-266`; `settlement-process.class.ts:89,172`; `settlement-process-cron.class.ts:68,99`; `settlement-report.class.ts:88`.
- Legacy external logistics: `amealio-vendordashboard/src/services/automation_delivery/porter_automation/porter/{book,cancel,flow_worker}.py`.

## Validation
No code/schema/API/DTO/migration change. Verified: `tsc --noEmit` clean, lint/format clean, **full suite 401/401**, `git diff` limited to documentation.

---

## P1.7.41 Result

- **Status:** FORENSIC COMPLETE — tip beneficiary remains **BLOCKED — OWNER/DATA** (policy) **+ requires a future assignment/history foundation** (architecture-incomplete for a delivery-person beneficiary).
- **Code changes:** NO
- **Schema changes:** NO
- **Delivery person authoritative:** NO (model exists but is entirely unimplemented — never assigned/read)
- **Assignment authoritative:** NO (no target assignment path exists)
- **Assignment history available:** NO (no timestamp, no history/audit model)
- **Reassignment supported:** UNKNOWN (structurally possible via a mutable FK, but no code and no history — would overwrite)
- **Deterministic tip beneficiary currently possible:** NO
- **Tip beneficiary policy established:** NO
- **P1.7.38 dependency:** BLOCKED (unchanged)
- **P1.7.39 dependency:** BLOCKED (beneficiary non-determinism confirmed)
- **Tests:** 401/401
- **TypeScript:** `tsc --noEmit` clean
- **Lint/format:** clean

### Critical conclusion
The evidence proves the target delivery domain is **schema-only and unimplemented**: `DeliveryTask` is 1:1 with `Order`, `deliveryPersonId` is a nullable, mutable FK with **no assignment timestamp and no history**, and **no code ever creates, assigns, reads, or completes** a delivery task or person — so a delivery-person tip beneficiary cannot be resolved, is not stable across reassignment, and cannot be reconstructed for a past order. Legacy ran self-delivery (`Order.selfDeliveryPerson`, assigned at READYTOPICK) alongside Porter/Dunzo logistics, but the legacy **`ORDER_TIP` payout settled to the vendor (merchant) account** — so even the historical recipient points to the merchant, not the rider. What remains unresolved is entirely **owner/data**: whether tips are collected at all (P1.7.38), who the beneficiary is (merchant vs delivery person vs pooled), and — only if a delivery person is chosen — a server-authoritative assignment + immutable assignment-history foundation.

### Required next action
Obtain an **owner decision packet** covering (a) tip/donation collection (P1.7.38 menu), (b) tip beneficiary identity (surfacing the legacy vendor-account evidence), and (c) refund policy. Do **not** speculatively implement delivery assignment. Only if the owner selects a delivery-person beneficiary does **P1.7.42 — Delivery Assignment + Assignment-History Foundation** become the required precursor; if the owner selects the merchant, tip routing can reuse the existing settlement/payout path once P1.7.38 collection exists.
