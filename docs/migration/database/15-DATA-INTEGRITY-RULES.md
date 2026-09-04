# 15 — Data Integrity Rules

Target constraints that prevent the legacy problems identified in P1.1 [12](../india-baseline/12-GAPS-RISKS.md) and P1.3 [12](../target-architecture/12-MIGRATION-RISKS.md). Design only (constraints described conceptually, not created).

| Legacy problem | Target rule (conceptual) |
|----------------|--------------------------|
| **Orphan references** (no Mongo FKs; broken refs) | Real **FOREIGN KEYs** on all relationships ([04](./04-RELATIONSHIPS-CONSTRAINTS.md)); ETL rejects/repairs orphans; every merchant-scoped row must resolve to a `Merchant`/`Restaurant` |
| **Duplicate entities** (restaurant vs card; two carts; dup refund model) | Single source entity; UNIQUE constraints; read models are non-authoritative; unify carts/refund |
| **Invalid statuses** | Status columns constrained to explicit enum/lookup values ([05](./05-ENUM-STATUS-STRATEGY.md)); no free-form status; transitions validated in app + recorded as events |
| **Inconsistent ownership** (`vendor_id`/`vendorId` etc.) | Standardized NOT NULL `merchantId`/`restaurantId`; FK to tenant; app-level tenant scoping ([12](./12-OWNERSHIP-MODEL.md)) |
| **Invalid monetary values** (floats/loose) | Integer minor units + `currencyCode` NOT NULL; CHECK `amount >= 0` where applicable; total-integrity check (`grandTotal = subtotal - discount + tax + fee + delivery`) ([06](./06-MONEY-PRICING-MODEL.md)) |
| **Invalid order states** | Separate order/payment/fulfillment status; CHECK/enum; state machine in app; append-only `OrderStatusEvent` |
| **Duplicate payments** | UNIQUE `PaymentAttempt.idempotencyKey`; UNIQUE provider payment id; app idempotent create ([08](./08-PAYMENT-SETTLEMENT-MODEL.md)) |
| **Duplicate webhook processing** | UNIQUE `WebhookEvent.providerEventId`; process-once (idempotent handler) |
| **Immutable financial history mutated** | No UPDATE/DELETE on `Transaction`/`WalletEntry`/settlement records (append-only; enforced by app + review); soft-delete disallowed on ledger |
| **Inconsistent soft-delete** | Single `deletedAt`; partial unique indexes account for it ([11](./11-AUDIT-SOFT-DELETE.md)) |
| **Wallet balance drift** | `WalletEntry.balanceAfter` derived; reconciliation checks balance == sum(entries) ([08](./08-PAYMENT-SETTLEMENT-MODEL.md)) |
| **Broken uniqueness** (coupon, phone, order no.) | UNIQUE constraints: `User(phone+cc)`, `Coupon.code`, `Order.orderNumber`, `Session.refreshTokenHash` |

## Constraint categories (conceptual)
- **Foreign keys** with RESTRICT/CASCADE per [04](./04-RELATIONSHIPS-CONSTRAINTS.md).
- **Unique** constraints (identity, order number, coupon, provider ids, idempotency, webhook event).
- **Check** constraints (money ≥ 0 where valid, total integrity, status ∈ allowed set).
- **NOT NULL** on tenancy, money+currency, timestamps.
- **Append-only** enforcement for ledgers/events (policy + app; optionally DB triggers later).
- **Partial/unique indexes** respecting soft-delete.

## Migration-time validation gates
- Orphan detection (no dangling FKs) before load completes.
- Financial reconciliation (counts, sums, wallet balances) for Payments/Settlement/Wallet.
- Status-value validation (all mapped to allowed enums — blocked on OD-11 for numeric enums).
- Duplicate detection (phones, coupon codes, provider ids).

No constraints are implemented in this task.
