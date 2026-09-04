# 20 — Schema Implementation (P1.5)

What was implemented in the PostgreSQL foundation, deliberate deviations from the P1.4 design, and unresolved/blocked items. **Structural schema only — no legacy data migrated, no integrations implemented, no OD-11/GST values invented.**

Artifacts: `prisma/schema.prisma`, `prisma/migrations/` (`…_init`, `…_constraints_and_immutability`), `prisma/seed.ts`, `tests/schema.test.ts`.

## Implemented entities (baseline CORE + OPTIONAL)

| Domain | Entities |
|--------|----------|
| Identity | `User`, `UserProfile`, `Address`, `Session` |
| Merchant | `Organization`, `Merchant`, `StaffMember`, `Role`, `RolePermission`, `Subscription` |
| Location | `RestaurantChain`, `Restaurant`, `OperatingHours`, `ReservationBlock`, `RestaurantFeature`, `SeatingArea`, `RestaurantTable` |
| Catalog | `Category` (self-ref), `Cuisine`, `UnitOfMeasure` |
| Menu | `Menu`, `MenuSection`, `MenuItem`, `ItemVariant`, `ItemChannelConfig`, `AddOnGroup`, `AddOn` |
| Cart | `Cart`, `CartItem` |
| Orders | `Order`, `OrderItem`, `OrderStatusEvent` |
| Payments | `PaymentIntent`, `PaymentAttempt`, `WebhookEvent`, `Transaction`, `Refund`, `Wallet`, `WalletEntry`, `Settlement`, `SettlementItem`, `Payout`, `WithdrawalRequest`, `BankAccount` |
| Reservations | `SeatingRequest` (unified Diner) |
| Notifications | `NotificationTemplate`, `NotificationRequest`, `NotificationDelivery`, `DevicePushToken` |
| Promotions (optional) | `Offer`, `Coupon`, `CouponRedemption`, `ReferralProgram`, `Favourite` |
| Delivery (orchestration) | `DeliveryPartner`, `DeliveryPerson`, `DeliveryTask` |
| Administration | `AuditLog`, `AppVersion` |

**Not implemented (per approval):** Celebrations/Experiences, Events, Ticketing, ONDC, Loyalty points/tiers (owner-decision / deferred). No speculative tables for delivery live-tracking, driver app, or recommendations ([16](./16-FUTURE-EXTENSION-SEAMS.md)).

## Implemented conventions (from P1.4)
- **UUID PKs** generated in-DB via `gen_random_uuid()` (`@db.Uuid`).
- **Money** = integer minor units (`BigInt`) + `currencyCode` (default `INR`); **no floating-point money columns**.
- **Audit:** `createdAt`/`updatedAt` on entities; `createdBy`/`updatedBy` on `Order`; administrative history via `AuditLog`; lifecycle history via `OrderStatusEvent`.
- **Soft delete:** `deletedAt` on `User`, `Merchant`, `Restaurant`, `Menu`, `MenuItem`, `Address`, `Offer`, `SeatingRequest`, `DeliveryPerson`, `Category`.
- **`legacyId`** (unique, nullable) on key entities for future ETL correlation only (no data migrated).

## Implemented constraints
- **Foreign keys** on all relationships (RESTRICT default; CASCADE within aggregates).
- **Unique:** `User(phoneCountryCode, phone)`, `User.email`, `Merchant.email/phone`, `Order.orderNumber`, `Coupon.code`, `Session.refreshTokenHash`, `PaymentAttempt.idempotencyKey`, `WebhookEvent.providerEventId`, `PaymentIntent.razorpayOrderId`, `Payout.providerPayoutId`, `Wallet.userId`, `UserProfile.userId`, `DeliveryTask.orderId`, `Role(merchantId,name)`, `RolePermission(roleId,permissionKey)`, `RestaurantTable(seatingAreaId,code)`, `Favourite(userId,targetType,targetId)`, `AppVersion(platform,version)`, `DevicePushToken(ownerType,ownerId,token)`.
- **CHECK (custom migration):** non-negative money on Order/OrderItem/ItemVariant/AddOn/PaymentIntent/PaymentAttempt/Transaction/WalletEntry/Refund/Settlement/Payout/WithdrawalRequest/Wallet; **order-total integrity** (`grandTotal = subtotal − discount + tax + fee + delivery`).
- **Append-only immutability (triggers):** `Transaction`, `WalletEntry`, `OrderStatusEvent` reject `UPDATE`/`DELETE`.

## Indexes (evidence-based, [13](./13-INDEXING-STRATEGY.md))
Restaurant `(merchantId)`, `(chainId)`; Order `(restaurantId,status)`, `(merchantId,createdAt)`, `(userId,createdAt)`, `(status,createdAt)`; MenuItem `(restaurantId)`, `(restaurantId,availability)`; SeatingRequest `(restaurantId,status)`, `(restaurantId,reservationAt)`; Transaction `(userId)`,`(merchantId)`,`(orderId)`,`(type,createdAt)`; Session `(userId)`,`(expiresAt)`; NotificationRequest `(recipientId,createdAt)`; NotificationDelivery `(status)`; plus FK-side indexes. (Geospatial index deferred — see deviations.)

## Deliberate deviations from P1.4
1. **Immutability enforced now via DB triggers** (P1.4 said app-level + "optionally DB triggers later"). Implemented early for a safer foundation and to make the guarantee testable.
2. **Reference lookups collapsed:** Accessibility/DressCode/Parking/Pet/ServiceType/SeatingArea reference tables are represented generically via `RestaurantFeature(featureType, featureValue)` instead of many lookup tables (simpler foundation; can be normalized later).
3. **Enums as PostgreSQL enums** for lifecycle statuses (resolves DR-02 mechanism to pg-enum for the foundation; lookup tables can still back extensible sets later). **No legacy numeric→value mapping is encoded (OD-11).**
4. **Geo as `lat`/`lon` floats** (no PostGIS/geo index yet); geospatial indexing (DR-11) deferred to when discovery is implemented.
5. **`RefundType` / `SettlementPayoutType` EVENT/EXP values omitted** (belong to deferred Celebrations/Events) — only baseline values included.
6. **`createdBy`/`updatedBy`** applied to `Order` (not universally) to avoid unnecessary audit columns; `AuditLog` covers administrative actions.
7. **`Organization`** included as an optional grouping table (DR-07a is owner-decision) but is not required by any baseline flow.

## Unresolved / blocked items (carried forward)
- **OD-11 (BLOCKED):** legacy numeric enum mappings (order/payment status, payment method, `t_type`, wallet role). Target enums define **names only**; the legacy-integer→name mapping is **not** encoded and **gates future data migration**. See [05](./05-ENUM-STATUS-STRATEGY.md), [18](./18-DATA-MODEL-DECISIONS.md).
- **DR-03a (BLOCKED):** India GST components/rates — tax stored as amounts; no rates invented.
- **Owner-decision domains (BLOCKED):** Celebrations/Events/Ticketing (OD-1..3), ONDC (OD-4), Loyalty (OD-5), Wallet inclusion scope (OD-6), enterprise Organization tenancy (DR-07a).
- **Open (non-blocking):** enum storage mechanism review (DR-02), geo indexing (DR-11), legacy id retention (DR-01a).

## Validation status
`tests/schema.test.ts` — **11/11 passing** against `amealio_test`: UUID generation, FK enforcement, uniqueness (coupon, user phone), monetary BigInt fidelity, negative-money CHECK, order-total-integrity CHECK, payment idempotency uniqueness, webhook `providerEventId` uniqueness, Transaction append-only (UPDATE+DELETE blocked), soft-delete filtering. Migrations apply cleanly to a fresh DB; `migrate reset` + seed verified; seed idempotent.
