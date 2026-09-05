# 02 — Business Entity ↔ Legacy Collection Mapping

For every major target entity: business meaning, source collection(s)/model(s), repo, baseline-used fields, legacy fields, retain/transform/deprecate, relationship changes, data-quality concerns. Source repo for all data is `amealio-vendordashboard` (VD). Legacy detail: P1.1 [05](../india-baseline/05-DATA-MODEL.md); conceptual chain: P1.3 [04](../target-architecture/04-DATA-MIGRATION-MAP.md).

> **Multiple collections → one business entity** cases are called out explicitly.

## User
- **Meaning:** consumer identity. **Source:** `users` (+`userprofiles`,`userstats`), models `user-service.model.ts`,`user-profile.model.ts`.
- **Baseline fields:** phone, country_code, email, role, is_verified, is_blocked, wallet ref, favourites, default address.
- **Retain:** identity + verification/blocked flags + preferences (→ `UserProfile`). **Transform:** favourites arrays → `Favourite` join; notification-pref objects → structured. **Deprecate:** `strict`-stray fields, duplicated snapshots.
- **Relationship changes:** `Address` gains explicit `userId` (legacy had none). **Data quality:** mixed soft-delete flags (`is_deleted`/`deleted`).

## Merchant (+ Staff)
- **Meaning:** vendor account & staff. **Source:** `vendorusers` (`vendor-user.model.ts`).
- **Multiple→one:** merchant *and* super-admin both live in `vendorusers` (role field). Target splits actor identity from role via claims; `Merchant` = tenant, `StaffMember` = person.
- **Retain:** contact, role, blocked, razorpay contact ids. **Transform:** embedded `subscription{ordering,seating,event}` → `Subscription`. **Deprecate:** `flaggedLogs[]` loose blobs (→ audit).

## Role / Permission
- **Source:** `roles` (`role-management.model.ts`) — deep `vendorPermission`/`superAdminPermission` boolean trees. **Transform:** flatten to `RolePermission(roleId, permissionKey, allowed)`. **Data quality:** 100+ flags; must enumerate.

## Restaurant (+ hours)
- **Meaning:** venue. **Multiple→one:** `restaurants` is shared by `restaurant.model.ts` **and** `extendedRestaurant.model.ts`; `restaurantCard` (`restaurantCard.model.ts`) is a **denormalized duplicate**.
- **Retain:** name, geo, address, timezone, currency, chain, hours, status. **Transform:** weekday `monday..sunday` objects → `OperatingHours`; `selected_*` Sub Category refs → `RestaurantFeature`. **Deprecate:** `restaurantCard` (→ read model), `strict:false` stray fields.
- **Data quality:** heterogeneous docs in one collection (`strict:false`) — must sample.

## Menu / MenuSection / MenuItem / Variant / AddOn
- **Source:** `menus`,`menucategories`,`vendoritems`,`combos`.
- **Multiple→one item concept:** item pricing/availability spread across embedded `size[]`, per-channel blocks (`dine_in`,`take_away`,…), `addOns[]`, day-wise availability. **Transform:** → `ItemVariant`, `ItemChannelConfig`, `AddOnGroup`/`AddOn`, `ItemAvailabilitySchedule`.
- **Relationship changes:** add explicit `MenuItem.restaurantId` (legacy linked only via `Menu.restaurant`). **Deprecate:** embedded denormalized item lists on `Menu.categories[]` (→ `MenuSection`).

## Cart
- **Multiple→one:** `carts` (`cart.model.ts`, structured) **and** `user_carts` (`user-cart.model.ts`, legacy) → single `Cart`/`CartItem`. **Deprecate:** `user_carts`.

## Order
- **Source:** `orderings`. **Retain:** identity, tenancy, type, statuses, amounts, timestamps. **Transform:** embedded `order_items[]` → `OrderItem` (+ snapshot); numeric statuses → explicit (BLOCKED OD-11); `auditLogs[]` → `OrderStatusEvent`. **Deprecate:** embedded `restaurantDetails`/`user_details` snapshots kept only as needed for history. Detail: [07](./07-ORDER-DATA-MODEL.md).

## Payment / Transaction / Settlement
- **Source:** `payments` (`strict:false`),`transactionals`,`wallets`,`settlements`,`settlementrecords`,`withdrawrequests`,`refunds`.
- **Multiple→one:** `refund` model registered twice (`refund.model.ts` + `resetSettlements.model.ts`) → single `Refund`. **Transform:** gateway payloads → `PaymentAttempt.providerPayload` (JSONB); numeric `t_type`/status → explicit (BLOCKED OD-11). Detail: [08](./08-PAYMENT-SETTLEMENT-MODEL.md).

## Reservation
- **Source:** `diners` (`diner.model.ts`), `seating areas`, `managereservationblocks`.
- **One entity, two modes:** `Diner` (`service_type` SEATING|RESERVATION) → `SeatingRequest` with a `type`. **Data quality:** broken ref `"User Service"` vs `User`.

## Notification
- **Multiple→several:** `notifications` (template/config) vs `notification-models` (per-user record) vs `smsTemplate`/`emailTemplate`/`notificationTemplate`. **Transform:** → `NotificationTemplate` + `NotificationRequest` + `NotificationDelivery`. **Data quality:** `notification-records.user_id` has no ref. Detail: [10](./10-NOTIFICATION-DATA-MODEL.md).

## Promotion (OPTIONAL)
- **Source:** `offers`. **Transform:** scope arrays/geo → `OfferScope`; `offerUsedBy[]` → `CouponRedemption`.

## Delivery (PARTIAL)
- **Source:** `deliveries`,`deliverypersons`,`dunzo*`,`porter*`. **Transform:** → `DeliveryTask`/`DeliveryPerson`/`DeliveryPartner`. **Deferred:** GPS `locations` (Nest, out of baseline).

## Cross-cutting data-quality concerns (from P1.1/P1.3)
- Broken/inconsistent `ref` strings and `refPath` literals → reconcile by value.
- Missing FKs (`address`,`vendorItems`,`notification-records`) → add explicit FKs.
- `strict:false` collections → audit real documents before mapping.
- Env-driven numeric enums → **BLOCKED (OD-11)**, do not invent.
- Inconsistent soft-delete → unify.

Migration complexity per entity: [14](./14-DATA-MIGRATION-COMPLEXITY.md).
