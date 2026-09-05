# 12 — Ownership / Multi-Tenancy Model

How restaurants, merchants, staff, and administrators relate, and whether explicit ownership boundaries are needed. Based on the **actual India baseline** (not generic best practice). Aligns with [`multi-tenancy.md`](../../architecture/multi-tenancy.md).

## Evidence-based conclusion
The baseline **is already merchant-multi-tenant**: nearly all operational data is scoped by `vendor_id` (merchant) and often `restaurant_id`; a `portal` header + roles separate merchant vs super-admin; customers are cross-tenant (P1.1 [02](../india-baseline/02-REPOSITORY-RELATIONSHIPS.md)/[05](../india-baseline/05-DATA-MODEL.md)/[10](../india-baseline/10-AUTHENTICATION-AUTHORIZATION.md)). Therefore explicit ownership boundaries are **required by evidence**, not added speculatively.

## Ownership hierarchy
```
Organization? (optional grouping)
   └─ Merchant (tenant root)
        ├─ StaffMember (belongs to Merchant; role/permissions)
        └─ Restaurant (Restaurant.merchantId)
             └─ Menu / MenuItem / Order / SeatingRequest / Offer / Settlement (restaurant/merchant scoped)
User (customer)  → cross-tenant; transacts with many merchants
SuperAdmin       → platform-level; may act-as a merchant (audited)
```

## Tenancy columns
- `merchantId` on merchant-owned entities (Restaurant, Menu, MenuItem, Order, Cart, SeatingRequest, Offer, Settlement, Role, StaffMember, Subscription, DeliveryTask where merchant-owned).
- `restaurantId` where restaurant-scoped (Menu, MenuItem, Order, SeatingRequest, OperatingHours, ReservationBlock, Offer when restaurant-scoped).
- **No** `merchantId` on cross-tenant entities: `User`, `UserProfile`, `Address`, `Session`, `Wallet`, global taxonomy, reference lookups.
- Money entities touching two parties (`Order`, `Transaction`) carry both `userId` and `merchantId`/`restaurantId`.

## Isolation strategy (recommended)
- **Shared database, shared schema, row-level tenancy** (discriminator column) — matches the single-dataset reality with cross-tenant users/wallets/reporting.
- Enforcement: (1) **application scoping** by tenant claim on every merchant-scoped query; (2) optional **PostgreSQL RLS** as later hardening (decision, not baseline-blocking); (3) **super-admin act-as-merchant** replaces legacy `vendorAccess`, audited.
- Standardize legacy `vendor_id`/`vendorId`, `restaurant_id`/`restaurantId` → `merchantId`/`restaurantId`.

## Roles ↔ ownership
- `MERCHANT_OWNER`/`MERCHANT_STAFF` scoped to `merchantId` (+ optional restaurant scope) via `Role`/`RolePermission`.
- `SUPER_ADMIN` platform-scoped; impersonation audited.
- Customers have no tenant scope.

## Not introduced (no evidence)
- `Organization` enterprise tenancy is **optional/owner-decision** (only if multi-restaurant enterprise grouping is in scope).
- Per-tenant schemas/databases (rejected — fragments cross-tenant users/wallets/analytics).

Constraints/indexes reflecting tenancy: [04](./04-RELATIONSHIPS-CONSTRAINTS.md), [13](./13-INDEXING-STRATEGY.md).
