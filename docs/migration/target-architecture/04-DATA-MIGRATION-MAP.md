# 04 — Legacy → Target Data Migration Map (conceptual)

**Conceptual** mapping only. **No final PostgreSQL schema, no table structures, no data migration.** Chain:

```
LEGACY ENTITY / COLLECTION  →  BUSINESS ENTITY  →  TARGET DOMAIN  →  TARGET PERSISTENCE ENTITY (conceptual)
```

Source of truth for legacy structure: P1.1 [05-DATA-MODEL](../india-baseline/05-DATA-MODEL.md). Canonical entity thinking (not schema): [`docs/architecture/postgresql-domain-model.md`](../../architecture/postgresql-domain-model.md) (design, for review).

## 1. Core mapping (representative)

| Legacy collection(s) | Business entity | Target domain | Target persistence (conceptual) |
|----------------------|-----------------|---------------|---------------------------------|
| `users`,`userprofiles`,`userstats` | Customer | Identity/Users | `User`, `UserProfile` |
| `addresses` (no `user_id`) | Address | Users | `Address` (add explicit owner FK) |
| `sessions` | Session | Identity | `Session` |
| `vendorusers` | Merchant + staff | Merchant | `Merchant`, `StaffMember` |
| `roles` (permission trees) | Role/Permission | Identity/Merchant | `Role`, `RolePermission` |
| `restaurants` **+** `restaurant-extended` (shared) ; `restaurantcards` (dup) | Restaurant | Restaurants | `Restaurant` (+ read model, not a source table) |
| `managehoursofoperations`, `restaurant.monday..sunday` | Operating hours | Restaurants | `OperatingHours` |
| `menus`,`menucategories`,`vendoritems`,`combos` | Menu/Item | Menus | `Menu`,`MenuSection`,`MenuItem`,`ItemVariant`,`AddOn`,`Combo` |
| `categories`,`sub categories`,`cusines`,`uoms` | Taxonomy | Catalog | `Category`(self-ref),`Cuisine`,`UnitOfMeasure` |
| `carts` **+** `user_carts` (legacy dup) | Cart | Orders | `Cart`,`CartItem` (unified) |
| `orderings` | Order | Orders | `Order`,`OrderItem`,`OrderStatusEvent` |
| `payments`,`transactionals` | Payment/Ledger | Payments | `PaymentIntent`,`Transaction` |
| `wallets` | Wallet | Payments | `Wallet`,`WalletEntry` |
| `settlements`,`settlementrecords`,`settlementprocesses` | Settlement | Payments | `Settlement`,`SettlementItem`,`Payout` |
| `withdrawrequests` | Withdrawal | Payments | `WithdrawalRequest` |
| `refunds` (+ dup `resetSettlements`) | Refund | Payments | `Refund` |
| `diners`,`seating areas`,`waiters` | Seating/Reservation visit | Reservations | `SeatingRequest`,`SeatingArea`,`Table` |
| `experiences`,`exprequests` | Experience/Booking | Celebrations (owner-decision) | `Experience`,`ExperienceBooking` |
| `events`,`eventhandlers`,`exp_events`(shared),`tickets` | Event/Ticket | Celebrations (owner-decision) | `Event`,`EventTicket` |
| `offers`,`referral_programs`,`signuprewards` | Offer/Referral | Promotions | `Offer`,`Coupon`,`ReferralProgram` |
| `notifications`,`notification-models`,templates | Notification | Notifications | `NotificationTemplate`,`NotificationLog`,`DevicePushToken` |
| `deliveries`,`deliverypersons`,`dunzo*`,`porter*` | Delivery task/partner | Delivery | `DeliveryTask`,`DeliveryPerson`,`DeliveryPartner` |
| `ondc_*` (15) | ONDC protocol entities | ONDC (owner-decision) | separate bounded context |

## 2. Structural issues to resolve during mapping (do not carry forward blindly)

| Issue | Legacy evidence | Target handling (conceptual) |
|-------|-----------------|------------------------------|
| **Shared collections** | `restaurants` (restaurant + restaurant-extended), `exp_events` (exp_events + user_exp_events) | Split by document type into distinct entities; sample real docs first |
| **Duplicate entities** | `restaurant` vs `restaurantCard`; two cart models; duplicate `refund` model name | Single source entity; `restaurantCard` → read model; unify carts; one `Refund` |
| **Embedded structures** | order/cart items, weekday hours, item channel pricing, RBAC trees, gateway payloads, `auditLogs[]` | Normalize the structured parts; keep genuinely document-shaped parts as JSONB (design later) |
| **References** | Mongoose `ref` (`vendor_id`,`restaurant_id`,`user_id`,…) | Explicit foreign keys |
| **Broken references** | `"User Service"` vs `User`, `"events"` vs `Events`, `refPath` literals | Reconcile by value during ETL; do not preserve broken refs |
| **Missing FKs** | `address` no `user_id`; `vendorItems` no `restaurant_id`; `notification-records.user_id` no ref | Add explicit ownership FKs |
| **Legacy fields (drop)** | `strict:false` stray fields; env-driven numeric enums; 5 soft-delete flag styles; denormalized user snapshots on orders | Do **not** survive: map enums to explicit values; single soft-delete convention; reference user by FK |
| **Business-concept fields (keep)** | statuses, amounts (→ minor units), timestamps, tenancy keys, geo, coupon codes, KYC state | Preserve as first-class fields |

## 3. Fields that should NOT survive in the target model
- Env-driven numeric status/type codes (replace with explicit enums — pending enum mapping).
- Duplicate/denormalized copies (`restaurantCard`, embedded `user_details` on orders).
- `strict:false` undeclared fields (audit real documents; drop noise).
- Broken/ambiguous `ref`/`refPath` strings.
- Inconsistent soft-delete flags (collapse to one `deletedAt`).
- Legacy Mongo `_id` retained only transiently as `legacyId` for ETL correlation, then retired.

## 4. Data migration prerequisites (blockers)
- **Enum mapping** (order/payment status/method, `t_type`) must be confirmed before ETL — **UNKNOWN** ([11](./11-OWNER-DECISIONS.md)).
- **Live collection audit** (space-named collections, `strict:false` real shapes) before mapping.
- **Financial reconciliation plan** for wallet/ledger/settlement.

> This is a conceptual map to guide later, review-gated schema design. **No schema or ETL is produced here.**
