# Multi-Tenancy Model (Proposed — For Review)

Status: **DESIGN / FOR REVIEW.** Defines tenant boundaries for the canonical Amealio model. No implementation. Derived from the observed ownership model in `docs/migration/04-database-inventory.md`.

## 1. Who are the tenants?

The platform is **merchant-multi-tenant**: the **Merchant (vendor)** is the tenant boundary. A merchant owns one or more restaurants; nearly all operational data is scoped to a merchant and (usually) a restaurant.

| Party | Tenancy role |
|-------|--------------|
| **Merchant (vendor)** | Primary tenant. Owns restaurants, menus, orders, staff, settlements. |
| **Restaurant** | Sub-tenant scope within a merchant (most operational data is restaurant-scoped). |
| **Organization** | Optional grouping of merchants (enterprise/chain owner). |
| **Customer (User)** | **Not** a tenant — a cross-tenant actor who transacts with many merchants. |
| **Super-admin** | Cross-tenant platform operator (not a tenant). |
| **Delivery person** | Belongs to a merchant (self-delivery) or a partner; scoped accordingly. |

> Legacy naming used `vendor_id`/`vendorId` and `restaurant_id`/`restaurantId` inconsistently. The target standardizes on `merchantId` and `restaurantId`.

## 2. Tenancy columns

| Column | On entities | Meaning |
|--------|-------------|---------|
| `merchantId` | Restaurant, Menu, MenuItem, Order, Cart, SeatingRequest, Experience, Event, Offer, Settlement, Role, StaffMember, Subscription, DeliveryTask (where merchant-owned) | Owning tenant |
| `restaurantId` | Menu, MenuItem, Order, SeatingRequest, Experience, Event, OperatingHours, ReservationBlock, Offer (when restaurant-scoped) | Sub-tenant scope |
| `organizationId` | Merchant | Optional enterprise grouping |

Cross-tenant entities (**no** `merchantId`): `User`, `UserProfile`, `Address`, `Session`, `Wallet`, global taxonomy (`Category`, `Cuisine`, `UnitOfMeasure`), reference lookups, platform config.

Customer-facing financial objects that touch two parties (e.g. `Transaction`, `Order`) carry both `userId` (customer) and `merchantId`/`restaurantId` (tenant).

## 3. Isolation strategy (recommended)

**Shared database, shared schema, row-level tenancy** (discriminator column), because:
- The current data is a single logical dataset with heavy cross-tenant entities (users, wallets, taxonomy) and cross-tenant reporting.
- Per-tenant schemas/databases would fragment customers, wallets, and platform analytics.

Enforcement layers (defense in depth):
1. **Application scoping** — every merchant-scoped query is filtered by the caller's `merchantId` (from auth claims). A shared data-access layer injects the tenant filter; ad-hoc queries are disallowed.
2. **PostgreSQL Row-Level Security (RLS)** — optional hardening: policies on merchant-scoped tables keyed on a session `app.current_merchant_id` GUC set per request. **Adopt after** app-level scoping is proven. Decision **`UNKNOWN — REQUIRES REVIEW`**.
3. **Super-admin bypass** — an explicit elevated role/claim; impersonation (legacy `vendorAccess`) becomes an auditable "act-as-merchant" grant.

## 4. Auth claims → tenancy

Auth tokens (see `docs/migration/07`) should carry canonical claims in the target:

```
{ sub: <userId|staffId>, actorType: CUSTOMER|STAFF|SUPER_ADMIN,
  merchantId?: <uuid>, restaurantScope?: [<uuid>...], roles: [...], permissions: [...] }
```

- **Customer** tokens have no `merchantId` (cross-tenant).
- **Staff** tokens carry `merchantId` + role/permission set + optional restaurant scope.
- **Super-admin** tokens carry a platform role and may set an `actAsMerchantId` (audited).
- This replaces the legacy dual auth stacks + `portal` header + role-string checks with a single identity model.

## 5. Indexing for tenancy

- Every merchant-scoped hot query gets a **composite index led by the tenant key**, e.g. `Order(restaurantId, status)`, `Order(merchantId, createdAt)`, `MenuItem(restaurantId)`, `SeatingRequest(restaurantId, status)`.
- Partial indexes exclude soft-deleted rows (`WHERE "deletedAt" IS NULL`).

## 6. Cross-tenant concerns

| Concern | Handling |
|---------|----------|
| Customer across merchants | `User` is global; orders/carts reference the merchant they were placed with. |
| Wallet | Global per user; wallet entries reference the counterparty merchant/order. |
| Settlement/payout | Strictly merchant-scoped; never mixes merchants in one payout. |
| Reporting | Super-admin cross-tenant read models; merchant reports filtered by tenant. |
| ONDC | Cross-network channel; kept as a bounded context with its own tenancy mapping. |
| Delivery partners (Dunzo/Porter) | Platform-level integrations; tasks are restaurant/merchant-scoped. |

## 7. Migration implications

- Reconcile inconsistent legacy tenancy fields into `merchantId`/`restaurantId` during ETL.
- Add explicit tenant FKs where legacy lacked them (e.g. `MenuItem.restaurantId`).
- Validate that every merchant-scoped row resolves to a valid merchant before load (orphan detection).

## 8. Open questions — `UNKNOWN — REQUIRES REVIEW`

- Whether RLS is adopted in phase 1 or deferred.
- Whether `Organization` (enterprise) tenancy is in scope for the initial India platform.
- How delivery persons shared across merchants (if any) are scoped.
- Whether customers can be "blocked" per-merchant vs globally (legacy `user_blocked` is global).
