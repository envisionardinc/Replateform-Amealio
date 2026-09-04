# 13 — Indexing Strategy (conceptual)

Conceptual indexes based on **actual baseline access patterns** (P1.1 [04-BACKEND-API-INVENTORY](../india-baseline/04-BACKEND-API-INVENTORY.md)/[11-END-TO-END-WORKFLOWS](../india-baseline/11-END-TO-END-WORKFLOWS.md)). Design only. Avoid excessive indexes; each is justified by a query pattern.

| Access pattern (baseline) | Entity | Proposed index | Why |
|---------------------------|--------|----------------|-----|
| Restaurant discovery by location | Restaurant | geospatial index on `geo` (GiST/PostGIS) | `searchRestaurant`, nearby (legacy 2dsphere) |
| Restaurant list by merchant | Restaurant | `(merchantId)` | merchant dashboards |
| Menu retrieval for a restaurant | Menu / MenuItem | `(restaurantId)`, `MenuItem(menuId)` | consumer menu, merchant menu mgmt |
| Item availability | MenuItem | `(restaurantId, availability)` partial | sold-out/available filters |
| Order lookup by id/number | Order | PK + `orderNumber` unique | direct lookup |
| Consumer order history | Order | `(userId, createdAt DESC)` | `/order-history` |
| Merchant order management | Order | `(restaurantId, status)`, `(merchantId, createdAt DESC)` | order dashboards, active orders |
| Order status pipeline | Order | `(status, createdAt)` | crons (auto-cancel/completion) |
| Payment reconciliation | PaymentIntent / Transaction | `(razorpayOrderId)`, `Transaction(orderId)`, `(type, createdAt)` | webhook match, reconciliation |
| Webhook dedupe | WebhookEvent | `(providerEventId)` unique | replay protection |
| Settlement/payout | Settlement | `(merchantId, status)`; Payout `(providerPayoutId)` | payout runs, reconciliation |
| Reservations by restaurant | SeatingRequest | `(restaurantId, status)`, `(restaurantId, reservationAt)` | seating dashboards, upcoming |
| Notifications | NotificationDelivery | `(recipientId, createdAt)`, `(status)` partial | inbox, retry queue |
| Auth | Session | `(refreshTokenHash)` unique, `(userId)`, TTL on `expiresAt` | login/refresh, cleanup |
| Coupons | Coupon | `(code)` unique; CouponRedemption `(couponId, userId)` | redemption, eligibility |
| Delivery | DeliveryTask | `(orderId)` unique, `(status)` | assignment/status |
| Tenancy scoping | merchant-scoped tables | composite indexes **led by tenant key** | RLS/app-scoped queries |

## Principles
- **Composite indexes lead with the tenant key** for merchant-scoped hot paths (e.g. `Order(restaurantId, status)`).
- **Partial indexes** exclude soft-deleted rows (`WHERE deletedAt IS NULL`) and target hot filters (active orders, undelivered notifications).
- **Unique indexes** enforce integrity (order number, coupon code, provider ids, webhook event id, idempotency key).
- **Geo index** for discovery (PostGIS `GiST` or `earthdistance` — decision [18](./18-DATA-MODEL-DECISIONS.md)).
- Add indexes **only** for evidenced query patterns; validate against production query patterns before finalizing (legacy compound indexes were largely absent — **UNKNOWN** real query mix).

No indexes are created in this task.
