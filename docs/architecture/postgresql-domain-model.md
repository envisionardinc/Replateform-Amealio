# Target PostgreSQL Domain Model (Proposed — For Review)

Status: **DESIGN / FOR REVIEW.** No schema is implemented. This document proposes the canonical Amealio domain model on **PostgreSQL** (system of record) using **Prisma** as the schema/ORM layer. It is derived from the migration discovery (`docs/migration/`), not a 1:1 translation of MongoDB collections.

> Guardrails: no `prisma/schema.prisma` is created; no migrations are generated; Prisma snippets here are **illustrative design excerpts**. India-first — no US-specific behavior. Where source is ambiguous, items are marked **`UNKNOWN — REQUIRES REVIEW`**.

## 1. Modeling method

```
MongoDB collections  →  observed business relationships  →  canonical domain model  →  normalized PostgreSQL schema
```

Principles:
- **Normalize** the relational core (identity, merchant, location, catalog, menu, order, payment, delivery, seating, experience, promotion).
- Use **`JSONB` only** where data is genuinely document-shaped (gateway payloads, per-channel pricing, weekday hours, permission trees, third-party payloads, audit snapshots).
- **Explicit enums** replace env-driven numeric codes (their integer values are **`UNKNOWN — REQUIRES REVIEW`**; enum *names* below are the canonical target).
- **Every table** carries standard audit + soft-delete + tenancy conventions (§3).
- **Separate CORE DOMAIN from MARKET-SPECIFIC CONFIGURATION** (§8) — see also `localization-strategy.md`.

## 2. Bounded contexts → schema modules

Aligns with the target API modules (`docs/architecture/target-repository-structure.md`):

| Context | Core aggregates |
|---------|-----------------|
| Identity | `User`, `UserProfile`, `Session`, `Address`, `Referral*` |
| Merchant | `Merchant` (vendor), `StaffMember`, `Role`, `Permission`, `Organization`, `Subscription` |
| Location | `Restaurant`, `RestaurantChain`, `OperatingHours`, `ReservationBlock`, reference lookups |
| Catalog | `Category`, `Cuisine`, `FoodType`, `UnitOfMeasure`, `Tag` (shared taxonomy) |
| Menu | `Menu`, `MenuSection`, `MenuItem`, `ItemVariant`, `AddOnGroup`, `AddOn`, `Combo`, `ItemChannelConfig` |
| Customer | favourites, reviews, community/media (engagement) |
| Order | `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatusEvent` |
| Payment | `PaymentIntent`, `Transaction` (ledger), `Wallet`, `WalletEntry`, `Settlement`, `Payout`, `WithdrawalRequest`, `Refund`, `BankAccount` |
| Delivery | `DeliveryTask`, `DeliveryPerson`, `DeliveryPartner`, `DeliveryLocation` |
| Reservation/Seating | `SeatingRequest` (unified Diner), `SeatingArea`, `Table` |
| Celebration | `Experience`, `ExperiencePackage`, `ExperienceBooking`, `Event`, `EventTicket` |
| Promotion | `Offer`, `Coupon`, `ReferralProgram`, `Reward` |
| Ticketing | `SupportTicket`, `Issue` (distinct from `EventTicket`) |
| Notification | `NotificationTemplate`, `NotificationLog`, `DevicePushToken` |
| Reporting | read models / materialized views (no new source-of-truth tables) |
| Administration | platform config, reference data, audit |

## 3. Global conventions (applied to every entity)

| Concern | Convention |
|---------|-----------|
| Primary key | `id uuid @id @default(uuid())` (UUID v4/v7). Store legacy Mongo `_id` as `legacyId String? @unique` during migration. |
| Audit | `createdAt`, `updatedAt` (`@updatedAt`), and `createdBy`/`updatedBy` (uuid, nullable) where actor is known. |
| Soft delete | `deletedAt DateTime?` (single canonical convention replacing the 5 legacy flags). Partial indexes exclude soft-deleted rows. |
| Tenancy | `merchantId uuid` on merchant-owned tables; `restaurantId uuid` where restaurant-scoped (see `multi-tenancy.md`). |
| Market | `countryCode` only on entities that are genuinely market-scoped (see §8 and `localization-strategy.md`); India-first default `IN`. |
| Money | integer **minor units** (e.g. paise) + `currencyCode`; never floats. |
| Timestamps | `timestamptz`; app tz India (`Asia/Kolkata`) but stored UTC. |
| Enums | native Postgres enums via Prisma `enum`. |
| Flexible data | `JSONB` columns named explicitly (e.g. `channelPricing Json`, `gatewayPayload Json`). |

Illustrative base pattern (excerpt):

```prisma
// PROPOSED — illustrative only
model Order {
  id           String       @id @default(uuid())
  legacyId     String?      @unique
  merchantId   String
  restaurantId String
  userId       String
  status       OrderStatus  @default(PENDING)
  type         OrderType
  // money in minor units
  subtotal     Int
  taxTotal     Int
  grandTotal   Int
  currencyCode String       @default("INR")
  placedAt     DateTime?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  deletedAt    DateTime?

  merchant     Merchant     @relation(fields: [merchantId],   references: [id])
  restaurant   Restaurant   @relation(fields: [restaurantId], references: [id])
  user         User         @relation(fields: [userId],       references: [id])
  items        OrderItem[]
  statusEvents OrderStatusEvent[]

  @@index([restaurantId, status])
  @@index([userId, createdAt])
  @@index([merchantId, createdAt])
}
```

## 4. Enums (canonical; legacy integer values `UNKNOWN — REQUIRES REVIEW`)

| Enum | Proposed values |
|------|-----------------|
| `OrderStatus` | `INITIAL, PENDING, CONFIRMED, PREPARING, PACKING, READY, ON_THE_WAY, DELIVERED, COMPLETED, CANCELLED, RETURNED` |
| `OrderType` | `DINE_IN, TAKE_AWAY, CURB_SIDE, SKIP_LINE, HOME_DELIVERY, CATERING` |
| `PaymentStatus` | `CREATED, AUTHORIZED, CAPTURED, PARTIALLY_REFUNDED, REFUNDED, FAILED` |
| `PaymentMethod` | `RAZORPAY, WALLET, SCAN_AND_PAY, DIRECT_MERCHANT` |
| `TransactionType` | `PAYMENT, REFUND, WALLET_CREDIT, WALLET_DEBIT, PAYOUT, SETTLEMENT` |
| `DeliveryMethod` | `SELF_DELIVERY, THIRD_PARTY, AGENT` |
| `DeliveryPartnerCode` | `DUNZO, PORTER, SELF` |
| `SeatingType` | `WALK_IN, WAITLIST, RESERVATION` |
| `SeatingStatus` | `PENDING, NOT_SEATED, SEATED, REJECTED, COMPLETED, CANCELLED` |
| `SettlementStatus` | `PENDING, PARTIAL, FAILED, COMPLETED` |
| `WithdrawalStatus` | `PENDING, IN_PROGRESS, COMPLETED, CANCELLED, REJECTED, HOLD` |
| `RefundType` | `ORDER, EXPERIENCE` |
| `ExperienceType` | `SPECIAL, CURATED` |
| `UserRole` | `CUSTOMER` (consumer identity) |
| `StaffRole` | `MERCHANT_OWNER, MERCHANT_STAFF, SUPER_ADMIN` |
| `NotificationChannel` | `PUSH, SMS, EMAIL, WHATSAPP, IN_APP` |
| `OfferSettlementType` | `MERCHANT, ADMIN, SPLIT` |

## 5. Core entities by context (proposed)

### 5.1 Identity
- **User**(id, phone, phoneCountryCode, email?, passwordHash?, role=CUSTOMER, isVerified, isBlocked, defaultAddressId?, walletId?, audit, soft-delete). Unique: (`phoneCountryCode`,`phone`), `email`.
- **UserProfile**(id, userId unique, preferences `JSONB`) — taste/health/nutrition preferences as JSONB.
- **Address**(id, **userId** [FK — fixes missing link], label, line1, line2, city, stateId, pinCode, geo `geography(Point)`, isDefault). Index geo (PostGIS or `earthdistance`).
- **Session**(id, userId, refreshTokenHash unique, accessTokenId, expiresAt) — TTL via scheduled cleanup.
- **Referral**: `ReferralProgram`, `ReferralCode`(unique code), `ReferralRedemption` (see Promotion).

### 5.2 Merchant
- **Merchant**(id, legalName, phone, email, status, organizationId?, razorpayContactId?, audit). Tenancy root.
- **Organization**(id, name) — optional multi-restaurant grouping.
- **StaffMember**(id, merchantId, userRef/credentials, staffRole, roleId?) — merchant staff & super-admins.
- **Role**(id, merchantId?, restaurantId?, name, scope[MERCHANT|ADMIN], isDefault) + **RolePermission**(roleId, permissionKey, allowed) — flatten the legacy `vendorPermission`/`superAdminPermission` trees into rows (or keep as `permissions JSONB` if the flag set is too volatile — **decision `UNKNOWN — REQUIRES REVIEW`**).
- **Subscription**(id, merchantId, restaurantId?, productType[ORDERING|SEATING|EVENT|SCAN_PAY], status, config `JSONB`).

### 5.3 Location
- **Restaurant**(id, merchantId, chainId?, name, geo, addressFields, timezone, currencyCode, status, config `JSONB`, audit). Index: `merchantId`, geo (`GiST`).
- **RestaurantChain**(id, merchantId, name).
- **OperatingHours**(id, restaurantId, dayOfWeek, openTime, closeTime, sessionType) — normalizes the legacy weekday `JSONB` blocks (keep raw override as `JSONB` if needed).
- **ReservationBlock**(id, restaurantId, title, allDay, startAt, endAt).
- Reference lookups (`Accessibility`, `DressCode`, `ParkingType`, `PetAllowance`, `ServiceType`, `SeatingArea`, …) as small tables with `RestaurantFeature`(restaurantId, featureType, featureId) join.
- **Note:** the legacy `restaurantCard` denormalized copy is **not** a source table — replace with a read model / materialized view.

### 5.4 Catalog (shared taxonomy)
- **Category**(id, name, code, type, parentId?) — self-referential to model `Sub Category`.
- **Cuisine**, **FoodType**, **FoodCategory**, **LiquorCategory**, **UnitOfMeasure**(+`UomRatio`), **Tag**, **Mood**, **Craving** — global reference tables.

### 5.5 Menu
- **Menu**(id, restaurantId, merchantId, name, type[STANDARD|CUSTOM], visibility).
- **MenuSection**(id, menuId, categoryId?, name, sortOrder) — replaces embedded `categories[]`.
- **MenuItem**(id, menuId, restaurantId [**add explicit FK**], merchantId, name, type, availability, posItemId?).
- **ItemVariant**(id, itemId, size, uomId, price minor units, pax) — replaces embedded `size[]`.
- **ItemChannelConfig**(id, itemId, channel[OrderType], enabled, priceOverride?, surcharges `JSONB`) — replaces per-channel embedded blocks.
- **AddOnGroup**/**AddOn**(id, itemId/groupId, name, price) — replaces schemaless `addOns[]`.
- **Combo**(id, restaurantId, merchantId, name) + **ComboItem**.
- **ItemAvailabilitySchedule**(itemId, dayOfWeek, windows) — replaces day-wise availability.

### 5.6 Order
- **Cart**(id, userId?, guestToken?, restaurantId, merchantId, type, offerId?, status, addressId?) — single unified cart (replaces `cart` + `user_cart`).
- **CartItem**(id, cartId, itemId, variantId?, quantity, customization `JSONB`, addOns `JSONB`).
- **Order**(see §3 excerpt) + **OrderItem**(id, orderId, itemId snapshot, variantId, quantity, unitPrice, lineTotal, customization `JSONB`).
- **OrderStatusEvent**(id, orderId, status, actor, note, createdAt) — replaces embedded `auditLogs[]`; drives lifecycle history.

### 5.7 Payment
- **PaymentIntent**(id, orderId?/bookingId?, method, status, amount minor, currencyCode, gatewayRef?, gatewayPayload `JSONB`).
- **Transaction**(id, type, userId?, merchantId?, orderId?, amount minor, currencyCode, walletEntryId?, gatewayPayload `JSONB`) — the ledger; append-only.
- **Wallet**(id, userId unique, balance minor, isKyc, isClosed) + **WalletEntry**(id, walletId, direction[CREDIT|DEBIT], amount, refType, refId, balanceAfter).
- **Settlement**(id, merchantId, restaurantId, payoutType, status, amount minor, accountDetails `JSONB`) + **SettlementItem**(settlementId, orderId/experienceId/txnId).
- **Payout**(id, settlementId, provider[RAZORPAYX], providerRef, status, payload `JSONB`).
- **WithdrawalRequest**(id, walletId, userId, amount, status).
- **Refund**(id, type, orderId?/bookingId?, method, status, amount, gatewayPayload `JSONB`).
- **BankAccount**(id, ownerType, ownerId, details encrypted).

### 5.8 Delivery
- **DeliveryTask**(id, orderId unique, method, partnerCode?, status, runner `JSONB`?, pickupGeo, dropGeo).
- **DeliveryPerson**(id, merchantId?, userId?, name, phone, isOnline, currentGeo).
- **DeliveryPartner**(id, code, config `JSONB`).
- **DeliveryLocation**(id, deliveryTaskId, driverId, lat, lon, speed?, heading?, recordedAt) — **time-series** replacement for the Nest `locations` table (retains true history; index `(driverId, recordedAt)`; consider partitioning/retention).

### 5.9 Reservation / Seating (unified `Diner`)
- **SeatingRequest**(id, restaurantId, merchantId, userId?, type[WALK_IN|WAITLIST|RESERVATION], status, partySize, reservationAt?, tableId?, orderId?, details `JSONB`).
- **SeatingArea**(id, restaurantId, name) + **Table**(id, seatingAreaId, code, capacity).

### 5.10 Celebration (Experiences/Events)
- **Experience**(id, restaurantId, merchantId, type, orderType, status) + **ExperiencePackage**(id, experienceId, price, seats).
- **ExperienceBooking**(id, experienceId, userId, status, orderId?, paymentStatus).
- **Event**(id, restaurantId, merchantId, setup `JSONB`) + **EventTicket**(id, eventId, userId, status).
> Boundaries between Experience and Event are **`UNKNOWN — REQUIRES REVIEW`**; modeled as sibling aggregates pending clarification.

### 5.11 Promotion
- **Offer**(id, merchantId?, restaurantId?, scope, isGlobal, discount, serviceTypes `JSONB`, geo, validity) + **Coupon**(id, offerId, code unique, useFrequency) + **CouponRedemption**(couponId, userId, orderId).
- **ReferralProgram**, **ReferralCode**, **Reward**.

### 5.12 Ticketing (support)
- **SupportTicket**(id, userId?/merchantId?, subject, status) + **Issue** + **FaqEntry**. Distinct from `EventTicket`.

### 5.13 Notification
- **NotificationTemplate**(id, key, channel, market?, flowId?, body).
- **NotificationLog**(id, userId?/merchantId?, channel, templateKey, status, refType, refId).
- **DevicePushToken**(id, ownerType, ownerId, token, platform).

## 6. Keys, uniqueness, indexes (highlights)

| Entity | Unique constraints | Key indexes |
|--------|--------------------|-------------|
| User | (`phoneCountryCode`,`phone`), `email` | `isBlocked` |
| Merchant | `email`, `phone` | `organizationId` |
| Restaurant | — | `merchantId`, geo (GiST), `chainId` |
| MenuItem | (`menuId`,`name`) *TBD* | `restaurantId`, `merchantId` |
| Order | `orderNumber` | (`restaurantId`,`status`), (`userId`,`createdAt`), (`merchantId`,`createdAt`) |
| Transaction | `gatewayRef` (where present) | (`userId`), (`orderId`), (`type`,`createdAt`) |
| Coupon | `code` | `offerId` |
| Session | `refreshTokenHash` | `userId`, `expiresAt` |
| SeatingRequest | — | (`restaurantId`,`status`), `reservationAt` |
| DeliveryLocation | — | (`driverId`,`recordedAt`), (`deliveryTaskId`,`recordedAt`) |

Soft-deleted rows excluded via partial indexes: `WHERE "deletedAt" IS NULL`.

## 7. JSONB usage policy

Use `JSONB` **only** for genuinely variable/document-shaped data:
- Order/cart item customizations & add-on snapshots.
- Gateway payloads (`PaymentIntent.gatewayPayload`, `Payout.payload`, `Refund.gatewayPayload`).
- Restaurant/subscription feature-config blobs and raw weekday overrides.
- Third-party payloads (Porter/Dunzo/PetPooja) and ONDC protocol documents.
- Role permission set **if** kept unflattened (decision pending).

Everything with stable structure and query/reporting needs is **relational**.

## 8. CORE DOMAIN vs MARKET-SPECIFIC CONFIGURATION

| Layer | Belongs here | Examples |
|-------|--------------|----------|
| **Core domain** (market-agnostic) | Entities/relationships true in any market | User, Merchant, Restaurant, Menu/Item, Order, Cart, SeatingRequest, Experience, DeliveryTask, Wallet/Transaction/Settlement, Offer |
| **Market-specific configuration** (data, not code) | Values that vary by country/market | `currencyCode`, `countryCode`, tax/GST rules, payment-provider selection, SMS/OTP provider, ONDC participation, supported order types, locale/timezone, KYC requirements |

Rules:
- Market variance is expressed as **configuration/data** (e.g. a `Market` table + per-entity `countryCode`), **not** as branching code paths.
- The initial implementation targets **India (`IN`)** only. **No US-specific behavior** (no Stripe path, no US tax logic) is introduced now. See `localization-strategy.md`.
- ONDC, Razorpay/RazorpayX, MSG91, GST are **India market configuration**, not core.

## 9. Explicitly deferred / for review

- Exact integer↔enum mappings (must be confirmed before ETL).
- Whether RBAC permissions are flattened rows or `JSONB`.
- Experience vs Event boundary and Ticketing overlap.
- Whether `restaurantCard`/denormalized read copies become materialized views.
- ONDC as a separate schema/service vs prefixed tables (leaning separate bounded context).
- PostGIS vs `earthdistance` for geo.
- Time-series strategy for `DeliveryLocation` (partitioning/retention).
- Legacy `_id` retention duration (`legacyId`) post-cutover.
