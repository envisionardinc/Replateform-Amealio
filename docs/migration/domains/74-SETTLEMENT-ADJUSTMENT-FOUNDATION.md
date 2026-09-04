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
- source/type/direction consistency for the two approved refund types
- one adjustment per order `Refund`
- multiple adjustment rows may reference the same `TipPayment`, because a tip can be partially refunded through multiple provider refund events
- foreign-key preservation of settlement and source records

The repository additionally validates source integrity before insertion:

- `ORDER_REFUND` requires a `PROCESSED` `Refund`, matching `orderId` and `paymentIntentId`, matching currency, and an adjustment amount no greater than the refund amount
- the referenced `PaymentIntent` must belong to the supplied order and use the same currency
- the referenced `Order` must belong to the supplied merchant
- the referenced `PaymentIntent` must have a `SettlementItem` in the supplied settlement, preventing a refund from being attributed to an unrelated settlement
- `TIP_REFUND` requires a positive processed-refund amount already recorded on the `TipPayment`, matching merchant and currency
- cumulative tip settlement adjustments must not exceed the `TipPayment.refundedAmountMinor`; the locked tip row serializes this check against concurrent refund state changes
- the referenced tip's `Order` must belong to the supplied merchant
- the referenced `TipPayment` must have a `SettlementItem` in the supplied settlement
- refund/payment/tip/order source rows are locked during validation where they participate in mutable refund or ownership state, serializing the adjustment decision against concurrent changes

The repository is idempotent: replaying the same idempotency key with the same economics returns the original adjustment; reusing it for different economics is rejected. Tip refund events therefore use distinct idempotency keys while sharing the same `TipPayment` source.

## Persistence boundary

The P1.7.44 migration owns the PostgreSQL table and constraints. The application repository currently accesses this new table through parameterized Prisma SQL (`$queryRaw` / `$executeRaw`) rather than adding a generated Prisma model in this phase.

This is deliberate: it avoids a broad replacement of the large canonical `prisma/schema.prisma` while introducing a financial ledger. Prisma schema/client regeneration can be handled as a separate controlled change after the underlying migration is proven. No existing Prisma models are modified by P1.7.44.

## Position semantics

```text
adjustedAmountMinor
  = Settlement.amountMinor
  + Σ(CREDIT adjustments)
  − Σ(DEBIT adjustments)

payableAmountMinor     = max(adjustedAmountMinor, 0)
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
