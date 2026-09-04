# 03 — Identifier Strategy

Recommended target identifier strategy. Design only.

## Current (legacy)
- MongoDB `ObjectId` `_id` everywhere; some human strings (`order_id`, `diner_id`, `request_id`, `coupon_code`); external provider ids (`razorpay_order_id`, etc.). Refs are `ObjectId` (no DB FK). See P1.1 [05](../india-baseline/05-DATA-MODEL.md).

## Recommended target

| Concern | Recommendation | Rationale |
|---------|----------------|-----------|
| **Internal PK** | **UUID** (prefer time-ordered, e.g. v7) per entity | Stable, non-guessable, merge-friendly, no cross-service collisions (supports Option-C extraction seams) |
| **Public identifiers** | Separate human-facing codes where the baseline exposes them: `orderNumber` (Order), `couponCode` (Coupon), reservation reference | Preserve baseline UX; don't leak internal PKs |
| **External provider ids** | Store as distinct columns (`razorpayOrderId`, `razorpayPaymentId`, `payoutId`, partner task ids) with unique constraints where 1:1 | Reconciliation & idempotency ([08](./08-PAYMENT-SETTLEMENT-MODEL.md)) |
| **Idempotency ids** | `idempotencyKey` on payment attempts; `providerEventId` (unique) on webhook events | Prevent duplicate charges / webhook replay ([15](./15-DATA-INTEGRITY-RULES.md)) |
| **Legacy correlation** | `legacyId` (unique, nullable) = source Mongo `_id`, **transient** for ETL, retired post-cutover | Enables mapping/reconciliation without preserving Mongo ids forever |

## Per major entity

| Entity | Internal PK | Public id | External id(s) | Idempotency |
|--------|-------------|-----------|----------------|-------------|
| User | UUID | — | Firebase uid (optional) | — |
| Merchant / StaffMember | UUID | — | razorpay contact id | — |
| Restaurant / Location | UUID | (slug optional) | — | — |
| Menu / MenuItem / Variant | UUID | — | POS item id (Petpooja) | — |
| Cart | UUID | guestToken (guest) | — | — |
| Order | UUID | **orderNumber** (retain) | — | client order idempotency key (recommended) |
| OrderItem | UUID | — | — | — |
| PaymentIntent / Attempt | UUID | — | `razorpayOrderId`,`razorpayPaymentId` | **idempotencyKey** |
| WebhookEvent | UUID | — | `providerEventId` (unique) | dedupe on providerEventId |
| Transaction | UUID | txn number (retain if used) | — | — |
| Settlement / Payout | UUID | — | RazorpayX payout id | — |
| Reservation (SeatingRequest) | UUID | reservation reference | — | — |
| Notification (Request/Delivery) | UUID | — | provider message id | dedupe key |
| Event / EventTicket (if baseline) | UUID | ticket code (QR) | — | — |

## Notes / blocked items
- Whether to **retain legacy human ids** (e.g. `order_id` string format) for continuity vs new `orderNumber` scheme is a **decision** ([18 DR-01](./18-DATA-MODEL-DECISIONS.md)); not blocked by OD-11.
- No identifiers are implemented in this task.
