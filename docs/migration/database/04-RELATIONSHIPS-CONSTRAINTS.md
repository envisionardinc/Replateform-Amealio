# 04 — Relationships & Constraints (conceptual)

Conceptual relationships, keys, uniqueness, nullability, lifecycle, referential integrity, cascade. Design only. Legacy relationships (weak/broken) called out. Aligns with [`entity-relationship-model.md`](../../architecture/entity-relationship-model.md).

## Major relationships

| Relationship | Cardinality | FK / notes |
|--------------|-------------|-----------|
| Merchant → Restaurant | 1:N | `Restaurant.merchantId` (RESTRICT delete) |
| RestaurantChain → Restaurant | 1:N | `Restaurant.chainId` nullable |
| Restaurant → OperatingHours | 1:N | `OperatingHours.restaurantId` (CASCADE) |
| Restaurant → Menu → MenuSection → MenuItem | 1:N chain | `MenuItem.restaurantId` **explicit** (fixes legacy gap) |
| MenuItem → ItemVariant / ItemChannelConfig / AddOnGroup | 1:N | CASCADE (child config) |
| AddOnGroup → AddOn | 1:N | CASCADE |
| Category → Category | self 1:N | `parentId` nullable (sub-categories) |
| Merchant → Role → RolePermission | 1:N | CASCADE (permissions) |
| Merchant → StaffMember | 1:N | RESTRICT |
| User → UserProfile | 1:1 | `UserProfile.userId` unique |
| User → Address | 1:N | `Address.userId` **explicit** (fixes legacy: no user_id) |
| User → Session | 1:N | CASCADE (on user delete) |
| User → Wallet | 1:1 | `Wallet.userId` unique (OPTIONAL) |
| User/Restaurant/Merchant → Cart | N:1 each | cart references tenant + user/guest |
| Cart → CartItem | 1:N | CASCADE |
| User/Restaurant/Merchant → Order | N:1 each | RESTRICT (never lose orders) |
| Order → OrderItem | 1:N | CASCADE within order aggregate |
| Order → OrderStatusEvent | 1:N | append-only |
| Order → PaymentIntent | 1:N | RESTRICT |
| PaymentIntent → PaymentAttempt | 1:N | CASCADE |
| PaymentIntent/Order → Transaction | 1:N | RESTRICT (ledger immutable) |
| Wallet → WalletEntry | 1:N | append-only |
| Merchant → Settlement → SettlementItem/Payout | 1:N | RESTRICT |
| Wallet → WithdrawalRequest | 1:N | RESTRICT |
| Order/Booking → Refund | 1:N | RESTRICT |
| Restaurant → SeatingRequest | 1:N | RESTRICT |
| SeatingArea → Table | 1:N | CASCADE |
| Offer → Coupon → CouponRedemption | 1:N | redemption references user+order |
| NotificationRequest → NotificationDelivery | 1:N | CASCADE |
| DeliveryTask → Order | 1:0..1 | `DeliveryTask.orderId` unique |

## Uniqueness (conceptual)
- `User(phoneCountryCode, phone)` unique; `User.email` unique (nullable).
- `Merchant.email`/`phone` unique.
- `Order.orderNumber` unique.
- `Coupon.code` unique.
- `Session.refreshTokenHash` unique.
- `WebhookEvent.providerEventId` unique (dedupe).
- `PaymentIntent.razorpayOrderId` unique (where present); `PaymentAttempt.idempotencyKey` unique.
- `UserProfile.userId`, `Wallet.userId`, `DeliveryTask.orderId` unique (1:1).

## Nullability & lifecycle
- Tenancy keys (`merchantId`/`restaurantId`) **NOT NULL** on merchant-scoped entities.
- Money fields NOT NULL with currency; nullable only where legitimately absent.
- Financial/ledger rows **immutable** (no update/delete) — enforce append-only.
- `deletedAt` nullable (soft delete) where applicable — [11](./11-AUDIT-SOFT-DELETE.md).

## Referential integrity / cascade policy
- Default **RESTRICT**; prefer **soft delete** for aggregates with history.
- **CASCADE** only within an aggregate (order→items, cart→items, menuItem→variants, request→deliveries).
- **Never** hard-delete or cascade financial rows (orders, transactions, settlements, refunds).

## Legacy weak/broken relationships to fix
- Add `Address.userId`, `MenuItem.restaurantId`, `NotificationDelivery`→user FK (legacy `notification-records.user_id` had no ref).
- Reconcile broken refs (`"User Service"`→User, `"events"`→Events, `refPath` literals) by value during ETL.
- Split shared collections (`restaurants`, `exp_events`) into distinct entities before FKs apply.

Integrity rules that prevent legacy problems: [15](./15-DATA-INTEGRITY-RULES.md).
