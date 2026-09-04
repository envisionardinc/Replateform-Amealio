# 01 — Domain Data Model (conceptual)

**Task:** P1.4 — design the target **PostgreSQL** data model for the approved India baseline. **Design only** — no schema, no migrations, no tables, no data migration, no code. Owner decisions and **OD-11 (enum mapping)** are **not** resolved here.

Basis: P1.1 [05-DATA-MODEL](../india-baseline/05-DATA-MODEL.md), P1.2 [14](../india-baseline/14-CAPABILITY-MATRIX.md)/[15](../india-baseline/15-BASELINE-ACCEPTANCE-CRITERIA.md), P1.3 [04-DATA-MIGRATION-MAP](../target-architecture/04-DATA-MIGRATION-MAP.md)/[02-DOMAIN-BOUNDARIES](../target-architecture/02-DOMAIN-BOUNDARIES.md)/[12-MIGRATION-RISKS](../target-architecture/12-MIGRATION-RISKS.md). Prior design (aligned, for review): [`docs/architecture/postgresql-domain-model.md`](../../architecture/postgresql-domain-model.md).

> **Method:** model **business entities & relationships**, not a 1:1 collection conversion. Entities are included **only** with baseline evidence or a documented architectural reason. Owner-decision domains (Celebrations/Events/Ticketing/ONDC) are **reserved, not designed-in**. Field lists are conceptual (not DDL).

## Global conventions (all entities)
- **PK:** internal UUID (see [03](./03-IDENTIFIER-STRATEGY.md)); legacy `_id` kept transiently as `legacyId` for ETL only.
- **Money:** integer **minor units** + `currencyCode` (never float) — [06](./06-MONEY-PRICING-MODEL.md).
- **Audit:** `createdAt`,`updatedAt`(+`createdBy`/`updatedBy` where an actor exists) — [11](./11-AUDIT-SOFT-DELETE.md).
- **Soft delete:** single `deletedAt` convention where applicable — [11](./11-AUDIT-SOFT-DELETE.md).
- **Tenancy:** `merchantId`/`restaurantId` on merchant-scoped entities — [12](./12-OWNERSHIP-MODEL.md).
- **Enums:** explicit named values; **legacy integer→value mapping is BLOCKED (OD-11)** — [05](./05-ENUM-STATUS-STRATEGY.md).

## Baseline domains & core entities (CORE unless noted)

### Identity & Access
`User` (customer), `UserProfile`, `Session`, `Address`. Merchant identities modeled under Merchant. Evidence: `users`,`userprofiles`,`sessions`,`addresses`.

### Roles / Permissions
`Role`, `RolePermission` (scoped by merchant/restaurant). Evidence: `roles` (`role-management.model.ts`, boolean trees → explicit rows).

### Merchant Accounts / Staff
`Merchant` (vendor account, tenant root), `StaffMember`, `Subscription` (OPTIONAL). Evidence: `vendorusers`,`subscriptions`.

### Restaurants / Locations / Operating hours / Availability
`Restaurant` (venue), `RestaurantChain`, `OperatingHours`, `RestaurantFeature` (from reference lookups). Availability derives from hours + session/open state (no separate table unless needed). Evidence: `restaurants` (+`restaurant-extended`, `restaurantcards` → read model), `managehoursofoperations`.

### Catalog / Menus / Items / Modifiers / Pricing
`Category` (self-ref for sub-categories), `Cuisine`, `UnitOfMeasure` (Catalog); `Menu`, `MenuSection`, `MenuItem`, `ItemVariant`, `AddOnGroup`, `AddOn`, `ItemChannelConfig`, `Combo` (Menus). Pricing lives on `ItemVariant`/`ItemChannelConfig` (minor units). Evidence: `menus`,`menucategories`,`vendoritems`,`combos`,`categories`.

### Cart
`Cart`, `CartItem` (unified; legacy `user_cart` deprecated). Evidence: `carts` + `user_carts`.

### Orders / Order Items / Lifecycle
`Order`, `OrderItem`, `OrderStatusEvent` (+ snapshots). Evidence: `orderings`. Detail: [07](./07-ORDER-DATA-MODEL.md).

### Payments / Transactions / Settlements
`PaymentIntent`, `PaymentAttempt`, `Transaction` (ledger), `WebhookEvent`, `Refund`, `Wallet`/`WalletEntry` (OPTIONAL), `Settlement`, `SettlementItem`, `Payout`, `WithdrawalRequest`, `BankAccount`. Evidence: `payments`,`transactionals`,`wallets`,`settlements`,`withdrawrequests`,`refunds`. Detail: [08](./08-PAYMENT-SETTLEMENT-MODEL.md).

### Reservations
`SeatingRequest` (unified Diner: seating + reservation), `SeatingArea`, `Table`, `ReservationBlock`. Evidence: `diners`,`seating areas`,`managereservationblocks`. Detail: [09](./09-RESERVATION-DATA-MODEL.md).

### Notifications
`NotificationTemplate`, `NotificationRequest` (business trigger), `NotificationDelivery` (per-channel attempt), `DevicePushToken`. Evidence: `notifications`,`notification-models`,templates. Detail: [10](./10-NOTIFICATION-DATA-MODEL.md).

### Promotions (OPTIONAL — baseline-optional)
`Offer`, `Coupon`, `CouponRedemption`, `ReferralProgram` (OPTIONAL). Evidence: `offers`,`referral_programs`. Included as OPTIONAL per [14 §11](../india-baseline/14-CAPABILITY-MATRIX.md#11-promotions).

### Delivery (PARTIAL — orchestration only)
`DeliveryTask`, `DeliveryPerson`, `DeliveryPartner`. **Live GPS tracking + driver app are DEFERRED** (extension seam, [16](./16-FUTURE-EXTENSION-SEAMS.md)). Evidence: `deliveries`,`deliverypersons`,`dunzo*`,`porter*`.

### Administration / Audit-operational
`AdminAction`/`AuditLog` (administrative + status-transition history), `AppVersion`, `ErrorLog` (optional). Evidence: `errors`,`appversions`; audit derived from `auditLogs[]`. Detail: [11](./11-AUDIT-SOFT-DELETE.md).

## Owner-decision domains (RESERVED, not designed-in)
- **Celebrations / Events / Ticketing** — implemented in baseline but first-wave inclusion is owner-decision ([11 OD-1..3](../target-architecture/11-OWNER-DECISIONS.md)). If approved: `Experience`/`ExperienceBooking`, `Event`/`EventTicket` (+ ticket validation/capacity only if OD-3 confirmed).
- **ONDC** — separate bounded context if approved (OD-4).
- **Loyalty (points/tiers)** — not evidenced; **no entity created** (OD-5).

## Entities explicitly NOT created (no evidence / speculative)
- Loyalty points/tier tables (not evidenced).
- Generic "restaurant-system" tables not present in the baseline.
- Delivery tracking/location table in baseline (deferred; seam only).
- ONDC tables in the baseline schema (separate context if approved).

Domain classification summary aligns with P1.3 [02-DOMAIN-BOUNDARIES](../target-architecture/02-DOMAIN-BOUNDARIES.md). ERD: [17](./17-ERD.md).
