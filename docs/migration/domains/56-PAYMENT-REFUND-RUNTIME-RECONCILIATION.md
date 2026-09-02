# P1.7.27 Payment / Razorpay / Refund Runtime Reconciliation

> **Type:** DISCOVERY / FORENSIC RECONCILIATION ONLY — no application code, Prisma schema, migration, or tests. Establishes the legacy payment/refund runtime, assesses the (unused) target payment schema, and reconciles the coupon-redemption commit point (OD-REF-1) and the blocked enum decisions (DR-02b/c/d/e).
> **Governing gate:** [55-OFFER-USAGE-FREQUENCY-RECONCILIATION.md](./55-OFFER-USAGE-FREQUENCY-RECONCILIATION.md) (P1.7.26B), [52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md](./52-CART-OFFER-ORDER-RUNTIME-RECONCILIATION.md) (P1.7.23).
> **Authority:** legacy `amealio-vendordashboard` + customer `amealio_web_app` + target `replatform-amealio`. Baseline **P1.7.26B, commit `f3b6efe`, 323/323** (unchanged — documentation only).

---

## 1. Executive Summary

The legacy ordering payment runtime is **client-orchestrated Razorpay** with **no server-side signature verification, no amount/order-id verification, and a webhook handler that is a no-op stub** — payment confirmation is a three-call client sequence (`/razorpay?order` → `/razorpay?payments` → `PATCH /user-ordering`) keyed on a hardcoded `payment_status == 1`. Ordering **refunds are wallet-only** (credit the user `Wallet`; the Razorpay refund API is NOT used for ordering — only Experience/ONDC), triggered by **order cancellation** (`order_status === CANCELLED`), with **≥8 duplicated `RefundOrder` implementations** using **inconsistent amount formulas** and **no idempotency key**. Coupon usage is **double-counted** (coupon-apply + payment-success) and **reversed only on cancellation** (confirming P1.7.23/P1.7.26A). Wallet balance is a **mutable number with no ledger and no locking** (last-write-wins). Settlement is a **deferred (≈T+2) vendor RazorpayX payout** driven by `settleAfter`/`settlementReady` with commission from a restaurant `comissionCode` %.

The **target payment schema already exists and is materially better than legacy** (`PaymentIntent`/`PaymentAttempt` with `idempotencyKey`, an idempotent `WebhookEvent` with `providerEventId @unique`, a `WalletEntry` ledger with `balanceAfterMinor`, explicit `Transaction.direction`, `Refund.status`, `Settlement`/`SettlementItem`/`Payout`), but there is **no payment module** in `apps/api/src/modules/` — it is entirely unwired.

**All numeric legacy enums (`payment_status`, `payment_method`, `t_type`, `WALLET_ROLE`) are `process.env`-injected** (`config/default.js`); the repository defines the **symbolic vocabulary and ordering but not the integers**. Therefore **DR-02b/c/d/e remain `BLOCKED — OWNER/DATA`** — the integer↔name mapping cannot be resolved from source code; it needs the production env file or a database value census. This slice records the exact symbolic sets, the dual/conflicting representations, and the target enums so the mapping can be finalized with owner/data input.

**OD-REF-1 / commit point:** legacy has **no single authoritative commit point** (usage consumed at apply + capture, reversed only on cancel). Recommendation: **keep the P1.7.24 order-placement commit point** until a real, verifiable target payment module (signature-verified capture + idempotent webhooks) exists; revisiting the commit point to payment-capture and adding refund-driven reversal are owner decisions for a later slice.

## 2. Scope and Baseline

In scope: forensic trace of the **ordering** payment/refund/wallet/transaction/settlement runtime; target payment-schema assessment; legacy→target mapping; commit-point + OD-REF-1 reconciliation; DR-02b/c/d/e status. Out of scope / one-line notes only: **ONDC** (separate `payments.model` + Razorpay refund API), **Dunzo** (delivery-status + partial settlement), **Donation** (side-record), **Experience/Event** (parallel Razorpay + `refund.model` paths). No implementation of any kind (Phase-0 constraint).

## 3. Legacy Payment Architecture

Feathers.js services + Mongoose. Payment persistence for ordering lives on the **`transactional`** collection and **embedded on the `ordering` document** (`transactionDetails[]`, `settleAmount`, `payment_status`, `payment_method`) — NOT on the `razorpay.model`/`payment-logs.model` (both are unused `{text:String}` stubs) and NOT on `payments.model` (ONDC only). Key files:

| Concern | File |
|---|---|
| Razorpay order + verify/capture | `src/services/razorpay/razorpay.class.ts`, `razorpay.service.ts` |
| Razorpay webhook (stub) | `src/services/razorpay/webhook.class.ts` |
| Checkout / order create | `src/services/usercart/checkout.class.ts` |
| Payment success/failure semantics | `src/services/ordering/user-ordering.class.ts` |
| transactionDetails + settleAmount | `src/services/ordering/updateTransaction.class.ts` |
| Refund (wallet) | `src/services/wallet/wallet.class.ts`, `src/helpers/autoCancel.ts` (`RefundOrder`) |
| Transaction ledger | `src/models/transactional.model.ts` |
| Wallet | `src/models/wallet.model.ts`, `src/services/wallet/*` |
| Settlement | `src/services/settlement/*`, `src/services/ordering/orderSettle.class.ts` |
| Enum config (env-injected) | `config/default.js` |

## 4. Legacy Payment Lifecycle

```
checkout.class.ts create order (payment_status=PENDING; no Razorpay)
   → POST /razorpay?order=true  (create transactional + Razorpay order; amount×100 paise; notes={orderId})
   → client Razorpay Checkout SDK
   → POST /razorpay?payments=true (payments.fetch → capture if needed; set transactional.payment_captured)
   → POST /updateTransaction ($push transactionDetails, $inc settleAmount, payment_status=COMPLETED)
   → PATCH /user-ordering (payment_status==1 branch: transactionDetails, settleAmount, offerUsedBy++, notifications)
```

Confirmation is **entirely client-driven**; there is no server event that authoritatively marks capture. Evidence: `razorpay.class.ts:644` (create branch), `:834-853` (amount×100), `:955-967` (persist Razorpay ids), `:1251-1253` (`payments.fetch`), `:1394-1397` (`payments.capture`); `updateTransaction.class.ts:155-177`; `user-ordering.class.ts:3381-3548`.

## 5. Payment Methods

| Method | payment_method code (name) | Initiation | Auth/Capture | Verification | Txn record | Wallet | Settlement | Refund | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Razorpay (online) | numeric `RAZORPAY`-family (methods 1–5) | `POST /razorpay?order` | client SDK → server `capture` | fetch/capture (no signature) | `transactional` `transaction_type="RAZORPAY"` | no | yes (vendor payout) | wallet credit on cancel | `razorpay.class.ts:834-967,1251-1397` |
| Pay-at-site / Pay-later | `6` (PAYLATER) | checkout, no Razorpay | none (paid on site) | none | `updateTransaction` `method:"PAYLATER"` | no | yes | n/a | `paymentEnums.ts:8`; web `OrderCheckout.jsx:580-633` |
| Direct-merchant UPI | `11` (DIRECT_MERCHANT) | checkout, `payment_status=INPROGRESS` | merchant verifies UTR/screenshot | manual merchant review (`direct_merchant_payment.status`) | order sub-doc | no | — | — | `checkout.class.ts:380-398,466-529`; `ordering.model.ts:242-258` |
| Wallet | `7` (WALLET) | `payment-through-wallet.class.ts` | debit `Wallet.balance` | balance check | `transactional` `t_type=PAID` | debit | yes | — | `payment-through-wallet.class.ts:115-299` |
| Split (Wallet+Razorpay) | `10` (SPLIT) | `?order` split branch | wallet leg + Razorpay leg | as above | two txns | debit + capture | yes | — | `razorpay.class.ts:739-782`; `user-ordering.class.ts:3387-3451` |
| Cash / external / incash | `0`/`8`/`9` | — | — | — | txn detail branch | — | — | — | `user-ordering.class.ts:3361-3377` |

## 6. Payment Status Model

**Two distinct, co-existing representations** (a genuine conflict to resolve):

1. **Numeric order `payment_status`** (`ordering.model.ts:214-224`, values env-injected via `config/default.js:788-794`): symbolic set `{PENDING, COMPLETED, CANCELLED, FAILURE, INPROGRESS}` (config also defines `REVERSED`, not listed in the ordering enum array but used elsewhere e.g. withdraw/settlement). Written by checkout (PENDING/INPROGRESS) and the `user-ordering` patch; success is a **hardcoded `payment_status == 1`** check (`user-ordering.class.ts:3381-3385`) rather than reading `PAYMENTSTATUS.COMPLETED`.
2. **String Razorpay `PAYMENT_STATUS`** (`src/enums/orderEnums.ts:99`): `{CREATED, AUTHORIZED, CAPTURED, REFUNDED, FAILED}` — the payment-gateway lifecycle used on the newer/ONDC/`transactional.status` side.

**DR-02b implication:** the numeric integers are not in source (env-injected). The target `PaymentStatus` enum (`schema.prisma:71-78` = `CREATED/AUTHORIZED/CAPTURED/PARTIALLY_REFUNDED/REFUNDED/FAILED`) already adopts the **string Razorpay lifecycle**, not the numeric order set. Mapping the legacy numeric `{PENDING, COMPLETED, CANCELLED, FAILURE, REVERSED, INPROGRESS}` onto it is **PARTIAL** and requires owner confirmation (e.g. `COMPLETED→CAPTURED`, `FAILURE→FAILED`, `INPROGRESS→AUTHORIZED?`, `CANCELLED→?`, `REVERSED→REFUNDED?`, `PENDING→CREATED?`).

## 7. Razorpay Integration

Direct SDK/REST calls only; **no webhooks, no polling** for ordering. Instance built per-env from `appVersion.envVar` or `RAZORPAY_API_KEY` (`razorpay.class.ts:38-46`). Create-order: SDK `orders.create` (`:834-853`), donation slice uses raw `POST /orders` with `transfers[]` (`:863-921`). Verify/capture: `payments.fetch` (`:1251-1253`) then `payments.capture(id, amount)` if not captured (`:1394-1397`). Gateway charges (`fee`/`tax`) fetched and `$inc`'d onto `order.gatewayCharges` (`:1288-1298`). **Top-level catch swallows errors** (`:1754-1756`) → orphan `transactional` rows possible on failure.

## 8. Payment Verification

**No `razorpay_signature` HMAC verification exists** (repository-wide: no `validatePaymentVerification`/signature check; the client sends a signature — `amealio_web_app` `useAmealioRazorpay.js:279` — but the backend ignores it). **No amount match, no order-id match.** Only guard: `if (_transactional.payment_captured) throw "Payment already captured"` (`razorpay.class.ts:1238-1240`). This is a **confirmed security/integrity gap** the target must close (the target already provides `PaymentAttempt.razorpayPaymentId @unique`, `idempotencyKey @unique`, and a `WebhookEvent` model to support proper verification).

## 9. Payment Success

Three-step client orchestration (§4). The authoritative writes on success (`user-ordering.class.ts:3386-3548`):
- `transactionDetails[]` push `{paid:true, method:"RAZORPAY"|"WALLET", transactionId, txnId, amount, type:"PAYMENT", paymentType, date}` (`:3457-3471`);
- `settleAmount = total_amount` (`:3472`); `order_status = 0` (or `1` auto-accept, `:3504-3507`);
- **coupon usage**: `$push offerUsedBy {user_id,timestamp}` + `$inc offerUsed` (+ deactivate offer at cap) (`:3522-3541`);
- `offerSettlement = "ADMIN"|"VENDOR"`; ADMIN adds `discount.amount` to `settleAmount` (`:3542-3547`);
- notifications (`:5816+`). `updateTransaction` also `$inc settleAmount` and sets `payment_status=COMPLETED` (`updateTransaction.class.ts:155-177`) and clears the cart (`:94-96`).

## 10. Payment Failure / Retry

On client-signalled failure: `transactionDetails` push `{paid:false, method:"RAZORPAY", type:"PAYMENT"}`, `order_status=0` (`user-ordering.class.ts:3341-3358`); optional transactional update via Razorpay `payment_failed` fetch (`razorpay.class.ts:559-594`). **No automatic reversal** (wallet-refund block is commented out, `:3566-3583`). **Retry** creates a **new `transactional`** each time (`:832`) — **no idempotency key**; the only guard is `payment_captured` on the prior transactional. Auto-cancel of unpaid orders is **commented out** (`order-cron.class.ts:26-27`), so unpaid orders linger at `PENDING`.

## 11. Pay-at-Site

`PAYLATER` (method `6`): order created and confirmed with no Razorpay; `updateTransaction` records `method:"PAYLATER"`; payment collected physically. No capture/verification. Evidence: `paymentEnums.ts:8`, `OrderCheckout.jsx:580-633`.

## 12. SCAN_AND_PAY

A distinct `transaction_type` value (`transactional.model.ts:39-43` enum `["WALLET","RAZORPAY","SCAN_AND_PAY"]`) and its own `PAYOUT_TYPE.SCAN_AND_PAY` / `TICKET_CATEGORY.SCAN_AND_PAY` (config). It is a Razorpay-backed direct-pay-at-restaurant rail (parallel to ordering). Target represents it as `PaymentMethod.SCAN_AND_PAY` + `SettlementPayoutType.SCAN_AND_PAY`. Detailed SCAN_AND_PAY runtime is **out of the ordering baseline** and should be reconciled separately if migrated.

## 13. Wallet

`wallet.model.ts:12-56`: `user_id`/`vendor_admin_id`, `role` (`WALLET_ROLE` numeric `{USER, VENDOR, SUPER_ADMIN}`), **mutable `balance` number** (no ledger collection). Credit/debit via Mongo `$inc` (`wallet.class.ts:77-78` credit, `:230-234` debit with a balance check). **No DB transaction, no locking, no version — last-write-wins** (concurrency-unsafe). Wallet is both a **payment method** (`payment-through-wallet.class.ts`) and the **exclusive refund destination** for ordering. **Target divergence:** target `Wallet` is **USER-only** (`userId @unique`, `schema.prisma:1142-1154`) with a proper **`WalletEntry` ledger** (`balanceAfterMinor`); it has **no VENDOR/SUPER_ADMIN wallet** — vendor money moves through `Settlement`/`Payout` instead. This is the core of DR-02e.

## 14. Transaction

`transactional.model.ts:12-197`. **`transaction_type`** (String: `WALLET`/`RAZORPAY`/`SCAN_AND_PAY`) = payment **rail**. **`t_type`** (Number enum, 16 values) = **ledger category**. They are **distinct fields, both used** (proven: e.g. refund rows set `transaction_type:"WALLET"` + `t_type:REFUND_AND_CANCELLATION`, `wallet.class.ts:81-89`). No explicit credit/debit direction field (inferred from `t_type`/sign/rail). Target normalizes this into `Transaction.type` (`TransactionType`) + explicit `Transaction.direction` (`TransactionDirection`) + `paymentIntentId`/`walletEntryId` links.

## 15. Settlement

Vendor RazorpayX payout, **deferred** (`settleAfter` default ≈ end-of-day + 2 days, `user-ordering.class.ts:1982`); eligibility gated by `settleAfter` window + `payment_status=COMPLETED` + `settleInprogress=false`/`settleOrderAmount=false` (`settlement.class.ts:556-566`). Commission from restaurant `comissionCode.description` % (`:45-52`), minus Razorpay outgoing charges, GST, tips, donations. **Offer effect:** ADMIN-funded offers inflate `settleAmount` by the discount but are excluded from the merchant commission base (`:48-52`; `user-ordering.class.ts:3542-3544`); VENDOR offers reduce the base. Batch pipeline: `settlement-process`/`settlement-record` + crons mark `settleInprogress`/`settleOrderAmount`. `orderSettle.class.ts` is a backfill utility, not a runtime trigger. Target: `Settlement`/`SettlementItem`/`Payout` (RazorpayX), but **no commission or `settleAfter` scheduling fields** yet (gap §29).

## 16. Refund Lifecycle

Ordering refunds are **wallet credits**, not Razorpay refunds. All go through `wallet.create` refund branch (`wallet.class.ts:64-101`) writing a `transactional` with `refund:true`, `transaction_type:"WALLET"`, `t_type:REFUND_AND_CANCELLATION`, `refund_type:<REFUND_TYPE>`. **≥8 duplicated `RefundOrder` implementations** with **inconsistent amount formulas**: `getRefundPayment(order) − donation` (paid txn-line sum; `getPending.ts:14-22`), `settleAmount − ADMIN-discount`, `base_amount`, `total_amount`, or an admin-supplied `amount` — see `autoCancel.ts:331-362`, `orderCancelCron.ts:6-29`, `ordering.class.ts:130-168`, `user-ordering.class.ts:103-127`, `order-cron.class.ts:662-686`, `admin-vendor-ordering.class.ts:63-89`, `cancelledOrders.class.ts:23-51`, `diner-cron.class.ts:989-1018`. Order stores `refund_id → transactional` + `refundCompleted:boolean` (`ordering.model.ts:346-352`). Partial refunds = item cancel/substitute + credit memos. **The `refund` collection** (`refund.model.ts`: `type ORDER/EXPERIENCE`, `refundType WALLET/RAZORPAY`, `status INITIATED/PROCESSED/FAILURE`, `percentage`, `refundedAmount`, `gatewayResp`) is used by **Experience/ONDC, not ordering**. **No retry, no idempotency key**; `refundCompleted` + the `order_status != CANCELLED` transition check are the only guards → duplicate-cancel double-credit risk if a guard is bypassed.

## 17. Cancellation / Refund Relationship

Refund is triggered inside the **cancellation** patch/crons when `order_status → CANCELLED`, `previous != CANCELLED`, and (usually) `settleAmount > 0` (`ordering.class.ts:6365-6375`, `user-ordering.class.ts:6111-6120`, `autoCancel.ts:781-787`, `orderCancelCron.ts` 4-min cron). **Standalone refunds** (item cancel, issue refund, credit memo) do **not** change `order_status` and do **not** reverse coupon usage. This confirms P1.7.25/P1.7.26A: **coupon reversal is cancel-gated, not refund-gated.**

## 18. Coupon Redemption Commit Point

**Legacy:** coupon usage is recorded **twice** — at coupon-apply (`user-offer.class.ts:87,103-107` / `offers.hooks.ts:346-357`, pre-payment) **and** at payment-success (`user-ordering.class.ts:3522-3541`) — and **reversed only on `CANCELLED`** (splice `offerUsedBy` + `offerUsed-1`). There is **no single authoritative commit point** (fragmented + double-count + no idempotency). **Target (P1.7.24/25/26B):** exactly **one `CouponRedemption` at ORDER PLACEMENT**, `ACTIVE→REVERSED` on cancel, usage derived (no counters). **Assessment:** because legacy payment confirmation is client-driven and unverified (§8) and the webhook is a stub (§20/Phase-13), the legacy "payment success" is **not** a trustworthy authoritative event; the target's order-placement commit point is the safer interim invariant until a verifiable payment module exists.

## 19. OD-REF-1 — Refund Reversal

| Q | Legacy behavior | Target recommendation | Owner decision |
|---|---|---|---|
| 1. Redemption authoritative at? | apply + capture (both), reversed on cancel | **Keep ORDER PLACEMENT** (P1.7.24) until verifiable capture exists | Confirm interim; revisit to capture in payment slice |
| 2. Unsuccessful payment creates redemption? | apply-time record persists even if unpaid (leak) | No — but target creates at placement, so an unpaid placed order holds an ACTIVE redemption | Decide reverse-on-payment-failure/expiry (needs payment module) |
| 3. Successful payment creates? | yes (second record) | No-op (already exists from placement) | — |
| 4. Refund reverses redemption? | only cancel reverses; standalone refund does not | **Full refund SHOULD reverse** (release usage) once refund lifecycle exists | BLOCKED on refund lifecycle |
| 5. Only full refunds reverse? | n/a (cancel-gated) | Yes — only full refund reverses | Owner |
| 6. Partial refund effect? | item-cancel refund does NOT touch usage | No reversal on partial refund | Owner |
| 7. Cancel before payment? | order cancelled → usage released | Target: placement→ACTIVE, cancel→REVERSED (works) | — |
| 8. Payment after cancel? | possible (no guard) | Must reject payment on CANCELLED order | Payment module guard |
| 9. Refund after already-REVERSED? | splice by lastIndexOf (fragile) | Idempotent no-op (REVERSED stays REVERSED, P1.7.25) | — |
| 10. Single authoritative permanence event? | **none** (fragmented) | **Order placement now; payment capture later** (verifiable) | The core owner decision |

**OD-REF-1 status: PARTIALLY RESOLVED.** Legacy behavior fully established; the target refund-reversal + commit-point-relocation require a payment/refund module and remain owner decisions.

## 20. DR-02b — Payment Status

**BLOCKED — OWNER/DATA.** Symbolic sets known (numeric `{PENDING, COMPLETED, CANCELLED, FAILURE, REVERSED, INPROGRESS}` + string `{CREATED, AUTHORIZED, CAPTURED, REFUNDED, FAILED}`); integers env-injected (`config/default.js:788-794`), not in repo; a hardcoded `1` = success in code (`user-ordering.class.ts:3384`). Target `PaymentStatus` = `{CREATED, AUTHORIZED, CAPTURED, PARTIALLY_REFUNDED, REFUNDED, FAILED}`. **Required:** production env/DB census of the integers + owner confirmation of the numeric→target semantic mapping (and dual-representation reconciliation). Downstream impact: gates Order/Payment **data migration** (not greenfield writes).

## 21. DR-02c — Payment Method

**BLOCKED — OWNER/DATA.** Three legacy representations: numeric `PAYMENTMETHOD` `{CASH, UPI, PAYTM, DEBITCARD, CREDITCARD, NETBANKING, PAYLATER, WALLET, EXTERNAL, INCASH, SPLIT, DIRECT_MERCHANT}` (12, env-injected, `config/default.js:796-809`), the index array `NEW_PAYMENT_TYPE` (`orderEnums.ts`), and string `transaction_type` `{WALLET, RAZORPAY, SCAN_AND_PAY}`. Target `PaymentMethod` = `{RAZORPAY, WALLET, SCAN_AND_PAY, DIRECT_MERCHANT}` (4) — **card/UPI/netbanking granularity collapses under RAZORPAY**. **Required:** env/DB census of integers + owner decision on whether sub-method granularity (UPI vs card) must be preserved or is acceptable to fold into RAZORPAY. Downstream: gates payment-method data migration.

## 22. DR-02d — Transaction t_type

**BLOCKED — OWNER/DATA.** `t_type` symbolic set (16, env-injected, `config/default.js:937-953`): `{CREDIT_MEMO, DEBIT_MEMO, PAID, TRANSFERRED, REFUND_AND_CANCELLATION, WITHDRAWAL, MONEY_ADDED_TO_WALLET, MONEY_DEBITED_FROM_WALLET, CASHBACK, RECEIVED, DONATION, REWARD, REFERRAL_AMOUNT, WALLET_REFUND, SIGN_UP_REWARD, REWARD_EXPIRED}`. **Distinct** from `transaction_type` (rail: `{WALLET, RAZORPAY, SCAN_AND_PAY}`) and from `PAYOUT_TYPE` `{ORDER, ORDER_TIP, EVENT, SCAN_AND_PAY, EXP}`. Target `TransactionType` = `{PAYMENT, REFUND, WALLET_CREDIT, WALLET_DEBIT, PAYOUT, SETTLEMENT}` (6, semantic) + explicit `direction`. **Many-to-few** mapping; reward/referral/cashback/donation categories are the deferred wallet-economy and have no target home. **Required:** env/DB census + owner mapping of the 16 `t_type` values to the 6 target types (+ which are out-of-baseline).

## 23. DR-02e — Wallet Role

**BLOCKED — OWNER/DATA.** Legacy `WALLET_ROLE` `{USER, VENDOR, SUPER_ADMIN}` (env-injected, `config/default.js:914-918`); wallets exist for consumers, vendors, and admin departmental accounts. Target `Wallet` is **USER-only** (`userId @unique`) with vendor money via `Settlement`/`Payout`. **Required:** owner decision — confirm the target intentionally has **no vendor/admin wallet** (settlement replaces it), or whether vendor/admin wallet balances must be migrated (would need schema work). Downstream: gates Wallet data migration + vendor-balance handling.

## 24. Legacy State Machines

**Order payment (numeric `payment_status`):** `PENDING → INPROGRESS → COMPLETED` (success); `→ FAILURE` (fail); `→ CANCELLED`/`REVERSED` (cancel/refund). Set by checkout + client patch (hardcoded `1`).
**Razorpay (transactional.status / string):** `CREATED → AUTHORIZED → CAPTURED → (REFUNDED)`; `→ FAILED`.
**Refund:** `(none) → refund transactional created → refundCompleted=true` (wallet); `refund.model`: `INITIATED → PROCESSED | FAILURE` (Experience/ONDC).
**Settlement:** `settleAfter reached → eligible → settleInprogress → settleOrderAmount=true (paid) | FAILED`.
**Impossible/race-prone:** payment success after cancellation (no guard); duplicate `transactionDetails` push on repeated `payment_status==1` patch; double wallet credit on duplicate cancel; orphan `transactional` on Razorpay-create failure.

## 25. Duplicate / Race / Idempotency Behavior

| Concern | Legacy | Classification |
|---|---|---|
| Duplicate Razorpay verification | `payment_captured` flag guard | PARTIALLY PROTECTED |
| Duplicate payment webhook | webhook is a stub (no processing) | UNKNOWN / N/A |
| Repeated payment attempts | new `transactional` each time, no key | UNPROTECTED |
| Repeated `payment_status==1` patch | audit dedup only; still pushes txnDetails | PARTIALLY PROTECTED |
| Repeated refund / duplicate cancel | `refundCompleted` + `order_status!=CANCELLED` | PARTIALLY PROTECTED |
| Simultaneous cancel + payment | no guard | UNPROTECTED |
| Payment success after cancel | no guard | UNPROTECTED |
| Refund after already-reversed coupon | `lastIndexOf` splice (fragile) | PARTIALLY PROTECTED |
| Repeated order submission | new order each checkout, no key | UNPROTECTED |
| Wallet concurrent debit/credit | `$inc`, no lock/txn | UNPROTECTED |

Target primitives that close these: `PaymentAttempt.idempotencyKey @unique`, `PaymentAttempt.razorpayPaymentId @unique`, `PaymentIntent.razorpayOrderId @unique`, `WebhookEvent.providerEventId @unique`, `WalletEntry` ledger + `balanceAfterMinor`.

## 26. Financial Invariants

| Invariant | Legacy | Target requirement |
|---|---|---|
| Captured payment not captured twice | PARTIAL (`payment_captured`) | REQUIRED (`razorpayPaymentId @unique` + verified capture) — **GAP: needs module** |
| Refund ≤ captured amount | not enforced | REQUIRED — GAP |
| Refund linked to a payment | order `refund_id → transactional` | `Refund.paymentIntentId` — schema ready |
| Transaction totals reconcile | inferred | `Transaction.direction` + amounts — schema ready |
| Wallet balance = Σ entries | NOT holdable (no ledger) | `WalletEntry.balanceAfterMinor` — schema ready; **must be enforced** |
| Settlement reconciles to source txns | via `settleAmount` | `Settlement`/`SettlementItem` — schema ready; commission field GAP |
| One coupon redemption per order | none (double-count) | `CouponRedemption @@unique([couponId,orderId])` — DONE (P1.7.24) |
| Webhook idempotency | none (stub) | `WebhookEvent.providerEventId @unique` — schema ready |

## 27. Target Payment Schema Assessment

All present and **unused** (no module). Fields per `schema.prisma`:
- **PaymentIntent** (`1055-1072`): `orderId?`, `amountMinor`, `currencyCode`, `status PaymentStatus`, `method PaymentMethod`, `razorpayOrderId @unique`, timestamps; → `attempts`, `transactions`, `refunds`. **Sufficient** for initiation/provider-order/amount/currency/order/status; **no `expiresAt`** (minor gap).
- **PaymentAttempt** (`1074-1087`): `paymentIntentId`, `amountMinor`, `status`, `razorpayPaymentId @unique`, **`idempotencyKey @unique`**, `providerPayload`. **Sufficient** for retries/provider-id/verification payload; **no explicit `failureReason`** (use `providerPayload`/status).
- **WebhookEvent** (`1089-1100`): `provider WebhookProvider`, `providerEventId @unique`, `type`, `payload`, `processingStatus`, timestamps. **Sufficient** for idempotent webhook ingestion (legacy has none).
- **Transaction** (`1102-1123`): `legacyId @unique`, `type TransactionType`, `direction`, `amountMinor`, `userId?`, `merchantId?`, `orderId?`, `paymentIntentId?`, `walletEntryId?`. **Sufficient** as a unified ledger; the 16 legacy `t_type` values must be reduced to the 6 target types (DR-02d).
- **Refund** (`1125-1140`): `orderId?`, `paymentIntentId?`, `method RefundMethod`, `amountMinor`, `status RefundStatus`, `gatewayPayload`. **Supports full/partial** (amountMinor) + provider payload + status; **no `refund_type` business-reason** and **no `percentage`/`refundedAmount`** (gaps §29).
- **Wallet/WalletEntry** (`1142-1171`): USER-only wallet + ledger with `balanceAfterMinor`, `direction`, `refType`/`refId`. **Sufficient** for user wallet; **no vendor/admin wallet** (DR-02e).
- **Settlement/SettlementItem/Payout** (`1173-1213`): merchant/restaurant, `payoutType`, `status`, `amountMinor`, items→order, RazorpayX payout with `providerPayoutId @unique`. **Sufficient** for payout lifecycle; **no commission/`settleAfter` scheduling** fields (gaps §29).

## 28. Legacy → Target Mapping

| Legacy Concept | Legacy Source | Target Model | Target Field | Mapping | Confidence |
|---|---|---|---|---|---|
| Razorpay order id | `transactional.order_id` / `razorpay_order_details` | PaymentIntent | `razorpayOrderId` | direct | CONFIRMED |
| Order amount (rupees ×100) | `transactional.amount` | PaymentIntent | `amountMinor` (paise=minor) | ×100 already legacy; target BigInt minor | CONFIRMED |
| Razorpay payment id | `transactional.payment_id` | PaymentAttempt | `razorpayPaymentId` | direct | CONFIRMED |
| Retry/attempt | new `transactional` per try | PaymentAttempt | (row) + `idempotencyKey` | normalize | PARTIAL |
| Numeric `payment_status` | `ordering.payment_status` | PaymentIntent/Order | `status PaymentStatus` | numeric→string semantic | PARTIAL (DR-02b) |
| `payment_method` (12 codes) | `ordering.payment_method` | PaymentIntent | `method PaymentMethod` (4) | collapse | PARTIAL (DR-02c) |
| `transaction_type` (rail) | `transactional.transaction_type` | PaymentIntent.method / Transaction | rail | maps to method | CONFIRMED |
| `t_type` (16) | `transactional.t_type` | Transaction | `type` (6) + `direction` | many-to-few | PARTIAL (DR-02d) |
| `transactionDetails[]` | embedded on order | Transaction / PaymentAttempt | rows | normalize | CONFIRMED |
| Wallet balance | `wallet.balance` (number) | Wallet | `balanceMinor` + WalletEntry ledger | add ledger | PARTIAL |
| `WALLET_ROLE` USER | `wallet.role` | Wallet | `userId` (user-only) | direct | CONFIRMED |
| `WALLET_ROLE` VENDOR/SUPER_ADMIN | `wallet.role` | — | — | no target wallet | CONFLICT (DR-02e) |
| Refund (wallet credit) | `wallet.create` refund txn | Refund + WalletEntry + Transaction | rows | normalize | PARTIAL |
| `refund_type` (reason) | `transactional.refund_type` | Refund | — | no field | NOT PRESENT |
| Refund/cancel coupling | cancel patch `RefundOrder` | (application) | — | rebuild cleanly | PARTIAL |
| `settleAmount`/`settleAfter` | order fields | Settlement/SettlementItem | `amountMinor` | scheduling lost | PARTIAL |
| Commission (`comissionCode`) | restaurant + settlement calc | — | — | no field | NOT PRESENT |
| `direct_merchant_payment` (UTR/screenshot) | order sub-doc | — | — (method only) | no verification metadata | NOT PRESENT |
| Webhook | stub | WebhookEvent | (all) | build new | CONFIRMED (target only) |
| `offerSettlement` ADMIN/VENDOR | order field | Offer.settlementType (P1.7.22) | stored | already modeled | CONFIRMED |

## 29. Target Gaps

1. **No payment module** — schema fully unwired.
2. **PaymentMethod granularity** — legacy UPI/card/netbanking/paytm/cash/external collapse into `RAZORPAY`/omitted (DR-02c owner decision).
3. **`Refund.refund_type`** (business reason: CANCEL_ORDER/ITEM/SUBSTITUTE/ISSUE) has no field; **no `percentage`/`refundedAmount`**.
4. **Vendor/admin wallet** absent (DR-02e) — target relies on Settlement/Payout.
5. **Settlement commission** + **`settleAfter` deferred-scheduling** + **gateway-charge** fields absent.
6. **`direct_merchant_payment` verification metadata** (UTR, screenshot, merchant QR, review status) has no target home.
7. **PaymentIntent `expiresAt`** / attempt `failureReason` minor gaps.
8. **Refund→coupon-redemption reversal** not modeled (OD-REF-1).
None of these require action in P1.7.27; they scope future slices.

## 30. Required Target Changes

**None in this slice.** For a future payment foundation (P1.7.28+), additive-only changes likely needed: `Refund.reason`/`refundType`; optional `Settlement` commission + `settleAfter`/scheduling; optional `PaymentIntent.expiresAt`; a home for direct-merchant verification metadata. All additive; to be decided in the implementation slice with owner input. **Do not modify schema now.**

## 31. Confirmed Findings

- Legacy ordering payment is **client-orchestrated Razorpay with no server signature/amount/order verification**; webhook is a **no-op stub** (`webhook.class.ts:27-28`).
- Success keyed on **hardcoded `payment_status == 1`** (`user-ordering.class.ts:3384`).
- Ordering **refunds are wallet-only** (`wallet.class.ts:64-101`); Razorpay refund API is **not** used for ordering.
- Refund is **cancel-gated**; **coupon reversal is cancel-gated, not refund-gated**.
- **≥8 duplicated `RefundOrder`** with inconsistent amount formulas; **no idempotency**.
- Wallet balance is a **mutable number, no ledger, no locking**.
- `t_type` (ledger) and `transaction_type` (rail) are **distinct**; both used.
- **All numeric enums are env-injected** (integers absent from source).
- Target payment schema exists, is unused, and is **more robust than legacy**.

## 32. Partial Findings

- DR-02b/c/d/e numeric→target mappings (symbolic sets known; integers + semantic mapping need owner/data).
- OD-REF-1 (legacy known; target commit-point relocation + refund reversal are owner decisions).
- Wallet/refund/settlement normalization onto target models (shape clear; details pending implementation).

## 33. UNKNOWNs

- Concrete integer values for `PAYMENTSTATUS`/`PAYMENTMETHOD`/`T_TYPE`/`WALLET_ROLE` (env/DB only).
- Production distribution of legacy `payment_status`/`payment_method`/`t_type` values (needs a DB census to know which symbolic values are live vs dead).
- Whether SCAN_AND_PAY and vendor/admin wallets are in the India migration baseline (owner scope decision).

## 34. Dependency Graph

| Edge | Type | Evidence |
|---|---|---|
| Order → PaymentIntent | HARD | `PaymentIntent.orderId` |
| PaymentIntent → PaymentAttempt | HARD | FK + cascade |
| PaymentIntent → Transaction | HARD | `Transaction.paymentIntentId` |
| PaymentIntent → Refund | HARD | `Refund.paymentIntentId` |
| Payment(capture) → CouponRedemption | **SOFT / owner-decided** | legacy consumes at capture; target at placement (OD-REF-1) |
| Refund → CouponRedemption | **SOFT / deferred** | legacy: none (cancel-gated); target: OD-REF-1 |
| Order/cancel → CouponRedemption | HARD | P1.7.25 REVERSED |
| Refund → Wallet(Entry) | HARD (legacy) | wallet-credit refunds |
| Transaction → WalletEntry | HARD | `Transaction.walletEntryId` |
| Transaction → Wallet | via WalletEntry | ledger |
| Order → Settlement(Item) | HARD | `SettlementItem.orderId` |
| Settlement → Payout | HARD | FK |
| Settlement → Merchant/Restaurant | HARD | FKs |
| WebhookEvent → PaymentAttempt/Refund | SOFT (target) | provider event drives state (to build) |
| PaymentMethod DIRECT_MERCHANT → verification metadata | UNKNOWN | no target home |
| Wallet → User | HARD | `userId @unique` |
| Wallet(VENDOR/ADMIN) → target | NO TARGET | DR-02e |

## 35. Owner Decisions

| ID | State | What remains | Impact |
|---|---|---|---|
| DR-02b (payment status) | **BLOCKED — OWNER/DATA** | integers + numeric→string semantic mapping + dual-representation | Order/Payment data migration |
| DR-02c (payment method) | **BLOCKED — OWNER/DATA** | integers + granularity-collapse decision | payment-method migration |
| DR-02d (t_type) | **BLOCKED — OWNER/DATA** | integers + 16→6 mapping + out-of-baseline set | Transaction/ledger migration |
| DR-02e (wallet role) | **BLOCKED — OWNER/DATA** | vendor/admin wallet inclusion vs settlement-only | Wallet migration |
| OD-REF-1 (refund reversal) | **PARTIALLY RESOLVED** | commit-point relocation (placement→capture) + full-refund reversal need a payment/refund module | redemption correctness |
| OD-COMMIT-1 (commit point) | **PROPOSED** | keep order placement now; capture later | redemption authority |

## 36. Recommended P1.7.28

**P1.7.28 — Payment Intent & Verified-Capture Foundation (bounded implementation).**
- **Objective:** wire a minimal payment module over the EXISTING target schema: create `PaymentIntent` at checkout, create the Razorpay order, and process a **signature-verified** capture via an **idempotent `WebhookEvent`** ingestion + `PaymentAttempt` (`idempotencyKey`/`razorpayPaymentId @unique`), persisting `PaymentIntent.status` and a `Transaction` (`type=PAYMENT`, `direction=CREDIT`). Close the legacy signature/amount/webhook gaps (§8, §25).
- **Boundary:** **do NOT** move the coupon-redemption commit point (stays order placement, P1.7.24); **no refund, no wallet, no settlement, no payout**; new writes use the **target enums** (so DR-02b/c/d/e — which only block *historical data migration* — are **not** prerequisites for greenfield writes).
- **Dependencies:** target payment schema (present); P1.7.12 ordering (present). **Schema readiness:** sufficient for intent/attempt/webhook/transaction (only optional `expiresAt`/`failureReason` additive tweaks may arise).
- **Owner decisions needed before starting:** confirm **OD-COMMIT-1** (keep placement commit point for now) and the Razorpay verification contract (signature secret handling). DR-02b/c/d/e and OD-REF-1 (refund) are **not** required for this greenfield slice and stay deferred to the refund/settlement + data-migration slices.
- **Why smallest safe slice:** it delivers verifiable payment capture (the missing trustworthy event) without touching money-out (refund/wallet/settlement) or the redemption invariant, and without depending on the blocked data-mapping decisions.

Subsequent order: **P1.7.29** Refund + wallet-credit foundation (resolves OD-REF-1 reversal); **P1.7.30** Settlement/Payout; a separate **data-migration** track resolves DR-02b/c/d/e via env/DB census.

## 37. Evidence Index

- Enums (env-injected): `config/default.js:746-953` (PAYMENTSTATUS 788-794, PAYMENTMETHOD 796-809, T_TYPE 937-953, WALLET_ROLE 914-918, REFUND_TYPE 919-927, PAYOUT_TYPE 895-900); `src/enums/orderEnums.ts` (PAYMENT_STATUS, PAYMENT_TYPES, NEW_PAYMENT_TYPE, REFUND_METHODS); `src/models/ordering.model.ts:214-258` (numeric payment_status/method + direct_merchant), `:346-361` (refund/settle fields).
- Razorpay: `src/services/razorpay/razorpay.class.ts:38-46,644,834-967,1238-1298,1394-1422,1754-1756`; `razorpay.service.ts:17-30`; `webhook.class.ts:27-28`.
- Success/failure: `src/services/ordering/user-ordering.class.ts:3341-3548,5816+`; `updateTransaction.class.ts:94-96,155-177`; `usercart/checkout.class.ts:56-407`.
- Refund/wallet: `src/helpers/autoCancel.ts:331-362,781-806`; `orderCancelCron.ts:6-38`; `src/services/wallet/wallet.class.ts:64-101,230-234`; `getPending.ts:14-22`; `src/models/wallet.model.ts:12-56`; `refund.model.ts:8-54`.
- Transaction: `src/models/transactional.model.ts:39-151`; `payment-through-wallet.class.ts:115-299`; `ordering-transactional.class.ts:158-285`.
- Settlement: `src/services/settlement/settlement.class.ts:45-52,556-566`; `src/services/ordering/orderSettle.class.ts:39-49`; `user-ordering.class.ts:1982,3472,3542-3547`.
- Target schema: `prisma/schema.prisma:71-135,230-240,1055-1213` (enums + PaymentIntent/Attempt/WebhookEvent/Transaction/Refund/Wallet/WalletEntry/Settlement/SettlementItem/Payout).
- Customer app: `amealio_web_app` `useAmealioRazorpay.js:92-316`, `CheckOutPage.js:897-1100`, `OrderCheckout.jsx:580-831`.
