# 04 — Database Inventory

How the platform uses data today, and the **business entities and relationships** underneath. This document deliberately **does not** propose PostgreSQL tables — that is the job of `docs/architecture/`. Here we describe MongoDB usage as-is and extract the entity/relationship truth.

Sources: `amealio-vendordashboard/src/models/*` (171 Mongoose models) and `amealio-nestjs-backend` (one PostgreSQL table).

## 1. Datastores in use

| Store | Where | Role |
|-------|-------|------|
| **MongoDB** (Mongoose 5) | `amealio-vendordashboard` | System of record for nearly all platform entities (171 collections) |
| **PostgreSQL** (TypeORM) | `amealio-nestjs-backend` | Single `locations` table for delivery GPS (satellite only) |
| **Redis** | `amealio-vendordashboard` | Porter delivery browser-automation job queue only; an unused `RedisAuthService` exists. No general cache layer. |

## 2. How MongoDB is used (patterns & implications)

- **Mongoose models = collections.** Collection names are derived from model names via Mongoose pluralization unless overridden. Several models have **names containing spaces** (e.g. `Sub Category` → `sub categories`, `Diner Status` → `diner statuses`) — awkward and must be verified against the live database. **`UNKNOWN — REQUIRES REVIEW`** for exact live collection names.
- **`strict: false` on key models** (`restaurant`, `payment`, `extendedRestaurant`) — documents can carry arbitrary undeclared fields, so schema alone does not describe stored data. Migration must sample real documents.
- **Heavy embedding + denormalization.** Orders, carts, restaurants, items store large nested/embedded sub-objects (line items, per-channel pricing, weekday hours, gateway payloads, audit logs) rather than normalized references.
- **Reference relationships via `ObjectId` `ref`.** Relationships are expressed with Mongoose `ref`/`refPath` and populated in app code — there is **no database-level referential integrity**.
- **Numeric, env-driven enums.** `order_status`, `payment_status`, `order_type`, `payment_method`, wallet `role`, `t_type` etc. store integers whose meaning comes from environment variables (`config/default.js`). The numeric→label mapping is **`UNKNOWN — REQUIRES REVIEW`** (empty in `.env.example`).
- **Inconsistent soft-delete.** Multiple conventions coexist: `is_deleted`, `deleted`, `isDeleted`, `isDelete`, `isArchive` — and some core collections (`ordering`, `Diner`) have no soft-delete flag.
- **Indexes** are mostly single-field (`index: true`); a few compound/geo/TTL indexes exist (see §6).

## 3. Entity inventory by domain (171 models)

Full enumeration is preserved in the source; the grouping below shows the canonical business entities per domain. Model → collection specifics and detailed field profiles are captured from `src/models/*`.

| Domain | Core entities (Mongoose model names) |
|--------|--------------------------------------|
| Identity / Users | `User`, `UserProfile`, `UserStats`, `UserDelete`, `tempUser`, `non-user`, `address`, `Session`, `changePassword`, `signupReward`, `inviteFriend`, `userupi-details`, `user-analytics`, `userActivityTracker`, WhatsApp login (4 models) |
| Merchant / Vendor | `VendorUser`, `vendorAccess`, `vendorChangePassword`, `web-merchant`, `role`, `Organization` |
| Location / Restaurant | `restaurant`, `restaurant-extended`*, `restaurantCard`, `Restaurant Chain`, `Restaurant Type`, `Restaurant Features`, `restaurant-tag`, `unregisterRestaurant`, `manageHoursOfOperation`, `manageReservationBlock`, `Waiters`, `posConfig`, `subscription`, `countryStateCity`, `currency` |
| Catalog / Menu | `Menu`, `menuCategory`, `vendorItems`, `catalogue`, `chaincatalogue`, `Combo`, `Category`, `Sub Category`, `Food Type`, `Food Category`, `Cusine`, `Liquor Category`, `uom`, `uom-ratio`, `templates` |
| Ordering | `ordering`, `ordermemo`, `cart`, `user_cart` |
| Payment / Wallet / Settlement | `payment`, `paymentLogs`, `Payment Method`, `wallet`, `CloseWallet`, `transactional`, `settlement`, `settlementRecord`, `settlementProcess`, `withdrawRequest`, `refund`, `bank-details`, `bankcard-details`, `razorpay`, `razorpayxService`, `dunzoPayments`, `dunzoCredit` |
| Delivery | `Delivery`, `deliveryPartners`, `deliverypersons`, `DeliveryQuote`, `dunzoDeliveries`, `dunzoQuotes`, `porterAccounts`, `porterBookingJobs`, `porterDrafts`, `porterHandoffs` |
| Reservation / Seating | `Diner`, `Diner Status`, `Seating Area` |
| Experiences / Events / Celebration | `Experience`, `experience_cart`, `ExperienceView`, `experience_catalog`, `expRequest`, `Events`, `eventHandler`, `ExpEventManagement`, `exp_events`, `user_exp_events`*, `promotional-event`, `ticket`, `Section`, `Section_Experience` |
| Promotion / Offer | `Offers`, `merchant-permotion`, `promotionsvideo`, `referral_program`, `Referral Code`, `referralService`, `referre-transaction`, `refreeService`, `Donation`, `DonationSettlement` |
| Notification | `notifications`, `notification-model`, `notificationTemplate`, `inAppNotification`, `smsTemplate`, `emailTemplate` |
| ONDC | `ondc_restaurant`, `ondc_restaurant_menu`, `ondc_restaruant_item`, `ondc_user_order`, `ondc_user_cart`, `ondc_cart_item`, `ondc_cart_quote`, `ondc_custom_group`, `ondc_settlement`, `ondc_settlement_record`, `ondc_new_settlement`, `ondc_reconciliation`, `ondc_order_issues`, `ondc_snps`, `ondc_cities` |
| Community / Media | `chat`, `reels`, `reelLikes`, `reelViews`, `reelShare`, `vlogs`, `media-catalogue`, `reviewRating`, `Craving`, `Mood`, `MoodManagement` |
| Reporting / Tracking | `activityTracker`, `videoActivityTracker`, `liveStreamingActivity`, `pageStats`, `misceilaneousTracking` |
| Administration / Reference | `Accessibility`, `Dress Code`, `Located Inside`, `Parking Type`, `Pet Allowance`, `Service Type`, `Services Offered`, sanitization (5), `helpAndFaq`, `issues`, `suggestions`, `shortLinks`, `firebasedynamiclinks`, `uploadAssets`, `appVersion`, `error`, `Cats` |

`*` denotes a model that shares a collection with another model (see §5).

## 4. Business entities & relationships (the underlying truth)

Ownership hierarchy (independent of storage):

```
VendorUser (merchant / superadmin)
  └─ Restaurant            (Restaurant.vendor_id → VendorUser)
       ├─ Menu             (Menu.restaurant → Restaurant, Menu.vendor_id → VendorUser)
       │    └─ MenuCategory (menuCategory.menu → Menu)
       │         └─ VendorItem (vendorItems.category → menuCategory, .menu_id → Menu, .vendor_id → VendorUser)
       ├─ Order            (ordering.vendor_id, .restaurant_id, .user_id)
       ├─ Diner            (Diner.vendor_id, .restaurant_id, .user_id)  [seating + reservation]
       ├─ Experience/Event (Experience.vendorId,.restaurantId; Events.vendor_id,.restaurant_id)
       ├─ Offer            (Offers.vendor_id, .restaurant_id [+ arrays, geo])
       └─ Settlement/Role  (vendor_id, restaurant_id)

User (consumer)
  ├─ Wallet               (wallet.user_id → User)
  ├─ Session              (session.user_id → User; TTL)
  ├─ Cart / Order         (user_id)
  ├─ Address              (linked from User.addressLocations[]; address has NO user_id)
  ├─ Transactional        (transactional.user_id / sender / receiver)
  └─ Favourites           (User.favourites→restaurant, offerFav→Offers, eventFav→events, itemFav→vendorItems)
```

Key financial relationships:

- `ordering` → `transactional` (payment ledger) → `settlement` / `settlementRecord` → RazorpayX payout.
- `wallet` ↔ `transactional` (wallet debit/credit); `withdrawRequest` → payout; `refund` → order/experience.

Delivery relationships:

- `ordering.delivery_task` → `Delivery`; `ordering.selfDeliveryPerson` → `deliverypersons`; Dunzo/Porter models attach to orders; Nest `locations.driverId` correlates to the delivery person (correlation key is **`UNKNOWN — REQUIRES REVIEW`**).

Experience/seating relationships:

- `expRequest` → `Experience`, `Diner`, `ordering`, `transactional`.
- `Diner` → `ordering` (`cross_ref_id`), `Experience`, `expRequest`.

## 5. Data-integrity concerns (must be resolved before/at migration)

1. **Shared collections, multiple models**
   - `restaurant` + `restaurant-extended` → same `restaurants` collection (heterogeneous docs).
   - `exp_events` + `user_exp_events` → same `exp_events` collection.
2. **Duplicate Mongoose model name `refund`** registered by both `refund.model.ts` and `resetSettlements.model.ts` (last load wins; `resetSettlements` also imports a mistyped path).
3. **Broken / inconsistent `ref` strings** vs registered model names, e.g. `"User Service"` vs `User`, `"events"` vs `Events`, `"offers"` vs `Offers`, `"Restaurant"` vs `restaurant`, `"SubCategory"` vs `Sub Category`. Population may silently fail unless overridden in app code.
4. **`refPath` misuse** — `cart`, `wallet`, `payments` pass a literal string to `refPath` rather than a field name; dynamic population likely broken.
5. **Missing foreign keys** — `vendorItems` has no `restaurant_id`; `address` has no `user_id`; `notification-records.user_id` has no `ref`.
6. **Inconsistent tenancy field naming** — `vendor_id`/`vendorId`, `restaurant_id`/`restaurantId`, `user_id`/`userId`.
7. **Inconsistent soft-delete** — five different flags; some core collections lack any.
8. **Env-driven enums** — numeric status/type codes not resolvable from source.
9. **`strict: false`** collections may contain undeclared fields.
10. **Denormalization duplication** — `restaurant` vs `restaurantCard`; embedded `user_details` alongside `user_id` refs.

## 6. Indexes observed

| Model | Index |
|-------|-------|
| `restaurant` | `vendor_id`, multiple `Sub Category` refs, `location: 2dsphere` |
| `session` | `refresh_token` (unique), `user_id`, TTL on `expires_at` |
| `ordering` | `user_id`, `vendor_id`, `restaurant_id`, `order_type`, `order_status`, `payment_status`, `porterJobId` |
| `transactional` | many single-field indexes (`user_id`, `restaurant_id`, `orderId`, `t_type`, …) |
| `offers` | `coupon_code` (unique) |
| WhatsApp login models | unique + TTL indexes on codes/tokens |
| Nest `locations` (PG) | `@Index(['driverId','timestamp'])`, `driverId` primary key |

Compound indexes for common query patterns (e.g. `{restaurant_id, order_status}`) are generally absent — **`UNKNOWN — REQUIRES REVIEW`** against production query patterns.

## 7. "Flexible" (document-shaped) vs relational data

For the future model, the following are genuinely document-shaped (candidate `JSONB`) rather than relational; the rest normalize cleanly. **This is an observation, not a schema decision** (see `docs/architecture/postgresql-domain-model.md`).

| Flexible / JSONB candidates | Strongly relational |
|-----------------------------|---------------------|
| Order/cart line items (`order_items[]`, addons, customizations) | User, VendorUser, Restaurant, Menu, MenuCategory, VendorItem |
| Restaurant weekday hours & feature/config blocks | Order header, Diner, Experience, Offer, Event |
| RBAC permission trees (`vendorPermission`, `superAdminPermission`) | Financial ledger (transactional, settlement, wallet, withdrawRequest, refund) |
| Gateway payloads (`payment_details`, `razorpay_*`, `gatewayResp`) | Delivery, deliverypersons |
| Third-party payloads (`porter_booking`, PetPooja sync) | Category / Sub Category taxonomy |
| User taste/health preferences | Session, address (with proper user FK) |
| Audit log arrays (`auditLogs[]`) | |
| ONDC protocol-shaped documents | |

## 8. Nest PostgreSQL (existing)

```
locations(
  driverId  PK (unique),
  lat float, lon float,
  speed float null, heading float null,
  timestamp timestamptz  -- @CreateDateColumn
)  -- @Index(driverId, timestamp); synchronize: true
```

- Single-row-per-driver semantics (PK is `driverId`) — see history caveat in [03](./03-api-inventory.md).
- `synchronize: true` is unsafe for production and must not be carried into the target.
