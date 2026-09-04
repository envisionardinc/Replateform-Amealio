# 79 — Staff RBAC Application Rollout

## Status

**In progress — application enforcement is being rolled out domain by domain.**

This document records the target RBAC application boundary. It does not create new business permissions or invent legacy role semantics.

## Current foundation

The target has one staff authorization mechanism: `JwtStaffGuard` authenticates staff and establishes a server-derived `StaffPrincipal`; `StaffAuthorizationGuard` evaluates `@PlatformOnly`, `@MerchantScoped`, `@RequireStaffRoles`, and `@RequireStaffPermissions`. Staff roles are `SUPER_ADMIN`, `MERCHANT_OWNER`, and `MERCHANT_STAFF`. Merchant scope comes from the authenticated principal, not from request data.

The rollout must extend this mechanism rather than introduce a second Admin/Merchant permission system.

## Reality check

The replatform branch contains substantial Admin/Merchant application services, but many capabilities are not yet exposed as HTTP controllers. Therefore RBAC cannot honestly be described as “applied everywhere” yet. The correct sequence is:

1. protect every existing staff-facing HTTP route;
2. retain service-level authorization as defense in depth;
3. add authorization metadata as each domain controller is introduced;
4. migrate the legacy fine-grained permission catalogue only after its concrete role/action mapping is forensically established.

## First enforced surface: Global Item Catalogue

The recovered Global Catalogue contract is platform-owned for administration and merchant-scoped for materialization.

| Capability | Boundary | Enforcement |
|---|---|---|
| Create global catalogue | Super Admin/platform | `JwtStaffGuard` + `StaffAuthorizationGuard` + `@PlatformOnly` |
| Create global category | Super Admin/platform | `JwtStaffGuard` + `StaffAuthorizationGuard` + `@PlatformOnly` |
| Create global item | Super Admin/platform | `JwtStaffGuard` + `StaffAuthorizationGuard` + `@PlatformOnly` |
| Copy global item into merchant menu | Merchant Owner/Staff | `JwtStaffGuard` + `StaffAuthorizationGuard` + merchant role metadata; service verifies merchant/restaurant scope |

Materialization deliberately does not use `@MerchantScoped` against `restaurantId`: a restaurant ID is not a merchant ID. The service resolves the restaurant and verifies that it belongs to the authenticated merchant.

## Next rollout order

### 1. Merchant onboarding / management

When controllers are exposed, enforce Super Admin-only creation/provisioning/activation where legacy evidence establishes platform ownership, and confine merchant staff to their own merchant resources. Request-supplied `merchantId` must never widen scope.

### 2. Merchant catalogue/menu

Apply staff authentication and tenant isolation to menu, section/category, item, variant, channel configuration, and merchant-local catalogue operations.

### 3. Global Experience Catalogue

Preserve the recovered distinction between platform reusable experience/media content and merchant-scoped operational experiences. Platform administration remains Super Admin scoped; merchant cloning/materialization remains tenant scoped. Propagation/versioning semantics remain deferred until legacy evidence resolves them.

### 4. Restaurant configuration and seating

Protect restaurant configuration, tables/seating, and related writes with the same staff authentication and tenant isolation boundary.

### 5. Operational domains

Apply the same mechanism to ordering, offers, payments/refunds, settlement, and delivery as their staff-facing controllers are introduced. Financial actions require explicit role/permission mapping before destructive or irreversible operations are enabled.

## Permission-key policy

The existing `staff.read` and `staff.write` keys remain foundation/test permissions only. They are not a business permission catalogue.

**Forensic result (doc 81):** legacy `vendorPermission` / `superAdminPermission` trees are unfinished UI + persisted schema. Backend enforcement is coarse `VendorUser.role` (`vendor` | `superadmin`). There is no VendorUser→role assignment FK and AddRole does not POST checkbox values.

Therefore:

- do **not** invent domain permission keys from UI checkbox labels;
- Admin/Merchant HTTP authorization for verified parity uses coarse `@PlatformOnly` / `@RequireStaffRoles` plus service-level merchant scope;
- finishing a fine-grained catalogue is a future product capability, not legacy parity.

## Security invariants

1. Authentication is required for staff business routes.
2. Platform-owned operations cannot be performed by merchant staff.
3. Merchant staff cannot cross merchant boundaries.
4. Request data cannot grant authority.
5. Service-layer ownership checks remain even when controller guards are present.
6. `SUPER_ADMIN` platform scope is not an implicit act-as-merchant capability.
7. No new business role or permission is invented merely to make a route pass authorization.

## Acceptance gate

A staff-facing domain is RBAC-integrated only when the route is authenticated, appropriate authorization metadata is present, unauthorized role access is rejected, cross-merchant access is rejected, service ownership checks remain intact, positive cases are tested, and the legacy authorization rule is traced or explicitly marked as an owner decision.

## Current gate

**🟢 Global Item Catalogue:** controller-level RBAC wired; service-level scope checks retained.

**🟢 Legacy RBAC linkage/enforcement forensic (doc 81):** complete — coarse role mapping only; fine-grained tree activation deferred.

**🟡 Merchant/Admin domain controllers:** onboarding, catalog, platform-catalog, and merchant experience HTTP surfaces are staff-authorized; additional operational domains still need controllers as they are exposed.

**🟡 Global Experience Catalogue platform HTTP:** merchant experience surface exists; Super Admin reusable experience/media catalogue still requires legacy trace + platform routes.

**🟡 Staff role-management HTTP:** Role/RolePermission storage exists; CRUD/assignment surface not yet reconciled to legacy role-management APIs.
