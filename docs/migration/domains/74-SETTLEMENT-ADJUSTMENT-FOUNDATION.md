# P1.7.44 — Canonical Settlement Adjustment Foundation

## Status

Implemented as the additive settlement-adjustment foundation. Initial business consumers are limited to `ORDER_REFUND` and `TIP_REFUND`.

## Purpose

`Settlement` is a historical accrual and `Payout` is a disbursement record. Neither is rewritten when a later refund changes the merchant's economic position. `SettlementAdjustment` is the append-only ledger that records that later debit/credit.

A positive adjusted position remains payable to the merchant. A negative adjusted position is recoverable from the merchant and is intentionally not converted into a separate receivable/debt model in this phase.

## Contract

Each adjustment records:

- settlement and merchant ownership
- explicit adjustment type and direction
- positive integer minor-unit amount and currency
- immutable idempotency key
- applicable order/payment/tip/refund source references
- creation timestamp and optional reason

The database enforces:

- immutable rows via the existing `amealio_prevent_mutation()` trigger
- positive adjustment amounts
- non-empty currency/idempotency values
- source/type consistency for the two approved refund types
- one adjustment per order `Refund`
- one adjustment per `TipPayment`
- foreign-key preservation of settlement and source records

The repository is idempotent: replaying the same idempotency key with the same economics returns the original adjustment; reusing it for different economics is rejected.

## Position semantics

```text
adjustedAmountMinor
  = Settlement.amountMinor
  + Σ(CREDIT adjustments)
  − Σ(DEBIT adjustments)

payableAmountMinor    = max(adjustedAmountMinor, 0)
recoverableAmountMinor = max(-adjustedAmountMinor, 0)
```

Historical `Settlement.amountMinor` is never mutated.

## Explicitly deferred

This foundation does **not** encode or calculate:

- gateway/outgoing charges
- GST remittance
- donations
- delivery-person allocation
- ADMIN-funded reimbursement
- generic miscellaneous/penalty adjustments
- receivable/debt collection
- post-settlement payout clawback execution

Those require their own forensic reconciliation and owner decisions before becoming adjustment producers.
