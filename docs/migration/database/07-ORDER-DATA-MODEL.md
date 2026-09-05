# 07 — Order Data Model (P0)

Conceptual target model for orders. **P0 migration risk.** Design only. Legacy: `orderings` (`ordering.model.ts`), P1.1 [05](../india-baseline/05-DATA-MODEL.md); risks: P1.3 [12](../target-architecture/12-MIGRATION-RISKS.md).

## Entities (conceptual)

### Order
Business fields: `id`, `orderNumber` (public), `merchantId`, `restaurantId`, `userId` (nullable for guest→converted), `type` (dine_in/take_away/curb_side/skip_line/home_delivery/catering), `status` (lifecycle enum — **name set known, integers BLOCKED OD-11**), `paymentStatus`, `fulfillmentStatus`, money totals (`subtotal`,`taxTotal`,`discountTotal`,`feeTotal`,`deliveryChargeTotal`,`grandTotal` + `currencyCode`), `scheduledFor?`, `placedAt`, timestamps, `deliveryAddressId?`, `deliveryMethod?`.

### OrderItem
`id`, `orderId`, `menuItemId` (ref), **priced snapshot** (`nameSnapshot`, `variantSnapshot`, `unitPrice`, `quantity`, `lineTotal`), `customization` (JSONB), `addOns` (JSONB snapshot). Snapshot preserves history if the catalog changes.

### OrderStatusEvent (audit trail)
`id`, `orderId`, `fromStatus`, `toStatus`, `actorType`, `actorId?`, `reason?`, `createdAt` — append-only; replaces legacy embedded `auditLogs[]`. Drives reliable order history and status timeline (AC-C7).

### Snapshots
- **Pricing snapshot:** captured on `OrderItem` (unit price, tax basis) at placement.
- **Customer snapshot:** minimal (name/phone at time of order) **only if** required for history/receipts — reference `userId` otherwise (avoid legacy full `user_details` duplication).
- **Restaurant snapshot:** capture `restaurantName`/address minimal snapshot for receipts where baseline receipts need it; otherwise reference `restaurantId`.

### Cancellation / Refund
- Cancellation recorded as a status transition (`OrderStatusEvent`) + `cancelReason`, `cancelledBy`, `cancelledAt`.
- Refund modeled in Payments (`Refund` linked to order) — [08](./08-PAYMENT-SETTLEMENT-MODEL.md); order reflects `paymentStatus` change.

### Idempotency
- Optional client `idempotencyKey` on order creation to prevent duplicate orders on retry.

## Status/lifecycle
- **Statuses:** name set inferred (INITIAL, PENDING, CONFIRMED, PREPARING, PACKING, READY, ON_THE_WAY, DELIVERED, COMPLETED, CANCELLED, RETURNED). **Legacy integer→name mapping BLOCKED (OD-11)** — [05](./05-ENUM-STATUS-STRATEGY.md).
- Separate **order status**, **payment status**, **fulfillment status** (legacy conflated numeric fields) for clarity; preserve baseline transitions ([07 business rules](../india-baseline/07-BUSINESS-RULES.md)).

## Historical facts to preserve
- Placed/updated timestamps, status timeline, priced line items, applied offers, payment references, delivery method/partner, final totals — needed for order history (AC-C7) and reconciliation.

## Legacy fields NOT to copy
- Numeric env-driven status integers **as-is** (map to explicit statuses; blocked until OD-11).
- Embedded denormalized `restaurantDetails`/`user_details` blobs (replace with references + minimal snapshots).
- `strict:false` stray fields; loose `transactionDetails`/`porter_booking` blobs (→ typed relations or JSONB where genuinely variable).
- Duplicate/parallel cart embedding (cart is separate; order captures snapshot).

## Migration classification: **CRITICAL** (see [14](./14-DATA-MIGRATION-COMPLEXITY.md))
Blocked on OD-11 enum mapping; requires reconciliation of counts/totals and status distribution vs legacy.
