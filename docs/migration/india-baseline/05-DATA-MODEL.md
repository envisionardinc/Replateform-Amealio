# 05 — Data Model (MongoDB, as-is)

The only data owner in the baseline is **`amealio-vendordashboard`** (MongoDB via Mongoose 5). Frontends hold no data. Goal: understand what the data **represents**, and separate the **business entity** from the **legacy database structure**. **No PostgreSQL design here.**

- Models: `amealio-vendordashboard/src/models/*` — **171 files**. Connection: `src/mongoose.ts` (`mongoose.connect(app.get('mongodb'))`).
- Collection names derive from Mongoose pluralization unless overridden; **several contain spaces** (e.g. `Sub Category` → `sub categories`). Exact live names **UNKNOWN — REQUIRES REVIEW**.

## 1. Business entities vs legacy structures

| Business entity (what it means) | Legacy structure(s) (how it's stored) | Notes |
|---------------------------------|----------------------------------------|-------|
| Customer | `users` (`user-service.model.ts`), `userprofiles`, `userstats` | Preferences/notification prefs embedded as loose objects |
| Merchant/Vendor account | `vendorusers` (`vendor-user.model.ts`) | Embedded `subscription {ordering,seating,event}`; `blocked`, `flaggedLogs[]` |
| Staff role / permissions | `roles` (`role-management.model.ts`) | Deep `vendorPermission`/`superAdminPermission` boolean trees (100+ flags) |
| Restaurant/venue | `restaurants` (`restaurant.model.ts` **+** `extendedRestaurant.model.ts`, same collection) | `strict:false`; weekday hours as `monday..sunday` objects; many `Sub Category` refs; `location` 2dsphere |
| Restaurant discovery card | `restaurantcards` (`restaurantCard.model.ts`) | **Denormalized duplicate** of restaurant fields |
| Menu | `menus` (`menu.model.ts`) | Embedded `categories[].item[]` (denormalized structure) |
| Menu category | `menucategories` | Tax/charge config, cross-selling |
| Menu item | `vendoritems` (`vendor-items.model.ts`) | **No `restaurant_id`** (linked via `Menu.restaurant`); per-channel blocks (`dine_in`,`take_away`,…), `size[]`, `addOns[]`, day-wise availability |
| Order | `orderings` (`ordering.model.ts`) | `order_items[]` embedded; numeric `order_status`/`order_type`/`payment_status` (env-driven) |
| Cart | `carts` (`cart.model.ts`, structured) **and** `user_carts` (`user-cart.model.ts`, legacy) | Two parallel cart models |
| Payment | `payments` (`payments.model.ts`, `strict:false`) | Gateway payloads embedded |
| Wallet | `wallets` (`wallet.model.ts`) | KYC/PIN fields; `role` numeric enum |
| Ledger transaction | `transactionals` (`transactional.model.ts`) | `transaction_type` enum; `t_type` numeric enum; heavy indexing |
| Settlement / payout | `settlements`, `settlementrecords`, `settlementprocesses` | `payout_type`, `settle_payment_status` numeric enums |
| Withdrawal | `withdrawrequests` | status enum PENDING…REJECTED/HOLD |
| Refund | `refunds` (`refund.model.ts`; **also registered by `resetSettlements.model.ts`** — duplicate model name) | status enum |
| Seating/Reservation visit | `diners` (`diner.model.ts`) | `service_type` SEATING/RESERVATION; `diner_status` enum; `auditLogs[]` |
| Experience | `experiences` (`experience.model.ts`) | `packages[]`; soft-delete named `isDelete` |
| Experience booking | `exprequests` (`expRequests.model.ts`) | `transactionDetails[]` refs |
| Event | `events` (`events.model.ts`) | nested `table_setup` floors/seats |
| Event ticket | `tickets` (`ticket.model.ts`) | |
| Offer/coupon | `offers` (`offers.model.ts`) | `coupon_code` unique; geo; scope arrays |
| Notification template | `notifications` (`notifications.model.ts`) | `flow_id`, `notificationType` 0/1/2 |
| Per-user notification | `notification-models` (`notification-records.model.ts`) | `user_id` has **no `ref`** |
| Session | `sessions` (`session.model.ts`) | TTL index; refresh/access tokens |
| Address | `addresses` (`address.model.ts`) | **No `user_id`** (linked from `User.addressLocations[]`) |
| Delivery task | `deliveries` (`deliveries.model.ts`) | refs order/restaurant/user |
| Taxonomy | `categories`, `sub categories`, `cusines`, `food types`, `uoms` | Global reference data |
| ONDC entities | `ondc_*` (15 models) | Protocol-shaped documents |

## 2. Relationships & references (Mongoose `ref`)

- Ownership spine: `VendorUser` → `restaurant` (`vendor_id`) → `Menu` (`restaurant`,`vendor_id`) → `menuCategory` → `vendorItems`.
- Transactions: `ordering`(`user_id`,`vendor_id`,`restaurant_id`) → `transactional` → `settlement`/`settlementRecord`.
- Consumer: `User` → `wallet`, `session`, `cart`/`ordering`, favourites arrays (`favourites`→restaurant, `offerFav`→Offers, `eventFav`→events, `itemFav`→vendorItems).
- Experience/seating: `expRequest`→`Experience`,`Diner`,`ordering`,`transactional`; `Diner`→`ordering` (`cross_ref_id`).
- **Broken/inconsistent ref strings** (population may silently fail): `"User Service"` vs model `User` (`diner.model.ts`), `"events"` vs `Events`, `"offers"` vs `Offers`, `"Restaurant"` vs `restaurant`, `"SubCategory"` vs `Sub Category`. `refPath` misused as a literal string in `cart`/`wallet`/`payments`.

## 3. Embedded documents (denormalized)
Order/cart line items; restaurant weekday hours & feature/config blocks; item per-channel pricing & `size[]`/`addOns[]`; RBAC permission trees; gateway payloads; `auditLogs[]`; event table/floor setup; ONDC protocol docs.

## 4. Indexes / unique / constraints (observed)
| Model | Index / constraint |
|-------|--------------------|
| `restaurant` | `vendor_id`, `Sub Category` refs, `location: 2dsphere` |
| `session` | `refresh_token` unique, `user_id`, **TTL** on `expires_at` |
| `ordering` | `user_id`,`vendor_id`,`restaurant_id`,`order_type`,`order_status`,`payment_status`,`porterJobId` |
| `transactional` | many single-field indexes |
| `offers` | `coupon_code` unique |
| WhatsApp login models | unique + TTL on codes/tokens |
- No DB-level foreign keys (Mongo). Compound indexes for common query patterns largely absent — **UNKNOWN — REQUIRES REVIEW**.

## 5. Status / lifecycle fields
- `ordering.order_status` (numeric, env-driven), `orderStatus` (string) — see [07](./07-BUSINESS-RULES.md).
- `diner.diner_status` (`PENDING/NOTSEATED/SEATED/REJECTED/COMPLETED/CANCELLED`).
- `withdrawRequest.status`, `refund.status`, `settlement.settle_payment_status`, experience/exp-request statuses.
- **Numeric enum values are resolved from environment variables** (`config/default.js`, e.g. `ORDERSTATUS_*`, `PAYMENTSTATUS_*`, `T_TYPE_*`) and are **UNKNOWN — REQUIRES REVIEW** (empty in `.env.example`).

## 6. Audit, soft-delete, historical records
- **Audit:** Mongoose `{ timestamps: true }` on most models (`createdAt`/`updatedAt`); embedded `auditLogs[]` on `ordering`/`Diner`/offers.
- **Soft-delete:** inconsistent — `is_deleted`, `deleted`, `isDeleted`, `isDelete`, `isArchive`; some core collections (`ordering`, `Diner`) lack any flag.
- **Historical records:** `paymentLogs`, `settlementrecords`, session TTL expiry, activity trackers (`activitytrackers`, `videoactivitytrackers`, `pagestats`).

## 7. Business-entity vs legacy-structure conclusions
- The **business truth** is a fairly conventional multi-tenant food/dining domain (merchant→restaurant→menu/item; customer→order/wallet/settlement; seating/experience/event; promotions; notifications).
- The **legacy structure** obscures it via: `strict:false`, shared collections (`restaurants`, `exp_events`), duplicate model names (`refund`), denormalized duplicates (`restaurantCard`), missing/broken refs, inconsistent tenancy naming (`vendor_id`/`vendorId`), env-driven numeric enums, and inconsistent soft-delete.
- Understanding the data therefore requires **model + client-usage + sampled documents**, not schema alone. (Prior canonical-entity analysis: `docs/migration/04-database-inventory.md`. Target modeling is out of scope here.)
