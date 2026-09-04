# 81 — Legacy RBAC Linkage / Enforcement Forensic Trace

> **Type:** FORENSIC / RECONCILIATION. No production behavior is changed by this document alone.
>
> **Purpose:** Trace the actual legacy Admin/Merchant role → permission → enforcement chain before inventing target permission keys or claiming Admin/Merchant RBAC parity.
>
> **Authority:** Direct source in `amealio-vendordashboard` (legacy backend) and `amealiodashboardmvp-` (Merchant + Super Admin UI). Where older migration docs conflict with verified source, this document is the current record.
>
> **Brand:** amealio

## 1. Finding (summary)

Legacy fine-grained `vendorPermission` / `superAdminPermission` trees are **persisted schema + unfinished UI**, not a runtime authorization catalogue.

Verified runtime enforcement is **coarse**:

| Legacy identity field | Verified runtime use |
|---|---|
| `VendorUser.role` = `"vendor"` \| `"superadmin"` | Backend service/hook gates across ordering, catalog, settlement, experience, offers, reports, etc. |
| `VendorUser.permission` (Number) | Super Admin / vendor UI visibility and some auth payload fields — not the nested permission tree |
| `role` collection (`vendorPermission` / `superAdminPermission`) | CRUD via `/role-management`, `/admin/role-management`, `/admin/vendor/role-management`; **not** consulted by backend authorization helpers for business actions |
| FK from `VendorUser` → `role` | **Absent.** `VendorUser` has no `role_id` / role assignment field |

Therefore the target must **not** invent domain permission keys from UI checkbox labels. The evidence-backed mapping is coarse role parity onto the existing staff RBAC foundation.

## 2. Forensic chain (traced)

```text
LEGACY ROLE CREATION
  UI: /rolemanagement, /addrole, /superadmin-role-management
  API: POST /role-management | /admin/role-management | /admin/vendor/role-management
      ↓
PERSISTED ROLE RECORD
  vendor_id, restaurant_id, role_name, description,
  isDefaultRole, isRemovable, active, isVendor,
  vendorPermission{...}, superAdminPermission{...}
      ↓
ROLE ASSIGNMENT TO USER
  NOT FOUND — VendorUser has role:String + permission:Number only
      ↓
EFFECTIVE PERMISSION LOOKUP
  Backend does not load role.vendorPermission for request authorization
      ↓
BACKEND ENFORCEMENT
  authMiddleware / hooks / service classes check VendorUser.role
  ("superadmin" vs "vendor") and merchant/restaurant ownership
      ↓
FRONTEND VISIBILITY
  Nav/route gating uses auth user role / numeric permission;
  AddRole permission checkboxes only console.log — not submitted
```

## 3. Legacy evidence (direct sources)

### 3.1 Role model (permission catalogue shape)

`amealio-vendordashboard/src/models/role-management.model.ts`

- Stores nested boolean trees under `vendorPermission` and `superAdminPermission`.
- Domains include Staff / Offer / Event / Order / Seating / Event Seating Request / Item / User / Super Admin User / Super Admin Vendor / Super Admin Offer / Super Admin Event management.
- Lifecycle fields: `isDefaultRole`, `isRemovable`, `active`, `isVendor`, `vendor_id`, `restaurant_id`.

### 3.2 Role HTTP surfaces

`amealio-vendordashboard/src/services/role-management/role-management.service.ts`

- `/role-management` — vendor restaurant roles
- `/admin/role-management` — Super Admin roles
- `/admin/vendor/role-management` — admin view of vendor roles

These are CRUD surfaces for role documents. They are not a global permission evaluation middleware.

### 3.3 VendorUser identity (actual auth subject)

`amealio-vendordashboard/src/models/vendor-user.model.ts`

- `role: String` — runtime coarse role
- `permission: Number` — numeric flag used in UI/auth payloads
- No relation to the `role` collection

### 3.4 Backend enforcement pattern

Representative checks (non-exhaustive; pattern is consistent):

- `src/helpers/authHelper.ts` — verifies token, loads VendorUser; if `role === "superadmin"` may substitute vendor via `vendor-access` (legacy act-as)
- Hooks/services across menu-category, vendor-items, offers, settlement, experience, diner, reports: `vendorData?.role === "superadmin"` / `"vendor"`

No traced path evaluates `vendorPermission.staffManagement.*` (etc.) inside those authorization gates.

### 3.5 Frontend role creation (permission UI unfinished)

`amealiodashboardmvp-/client/src/components/vendorDashboardComponents/roleManagement/AddRole.js`

- Create payload submits only: `restaurant_id`, `role_name`, `description`, `isDefaultRole`, `isRemovable`
- Permission checkbox `onChange` only `console.log(value.target.value)` — values are not added to form state or POST body

Dashboard Redux actions call the role-management APIs for CRUD, not for per-request permission evaluation.

### 3.6 Legacy “act as merchant” (important boundary)

`authHelper.ts` allows Super Admin with an active `vendor-access` record to operate as that vendor user.

Target policy (docs 79/80 + staff authorization guard): **do not implement act-as-merchant** unless explicitly owner-approved. Documented here as a known legacy capability that remains deferred — not silently reintroduced.

## 4. Target mapping (evidence-backed)

| Legacy verified behavior | Target canonical foundation | Disposition |
|---|---|---|
| `VendorUser.role = "superadmin"` | `StaffMember.staffRole = SUPER_ADMIN`, `merchantId = null` | Map / preserve |
| `VendorUser.role = "vendor"` (owner/staff operator) | `MERCHANT_OWNER` / `MERCHANT_STAFF` with server-derived `merchantId` | Map / preserve (owner vs staff distinction is target enrichment already present) |
| Nested `vendorPermission` / `superAdminPermission` trees | `Role` / `RolePermission` storage already exists | **Defer activation** — no runtime legacy enforcement to port; do not invent keys from UI labels |
| Role lifecycle fields (`active`, `isDefaultRole`, `isRemovable`, restaurant/vendor ownership) | Target Role model + future staff-management surface | Preserve when staff-management HTTP is introduced; lifecycle semantics still require UI/backend create/update evidence beyond checkbox trees |
| Numeric `VendorUser.permission` nav gating | Frontend concern; not backend permission keys | Defer with dashboard recovery; do not encode as StaffPermission keys without further evidence |
| Super Admin act-as via `vendor-access` | Explicitly out of scope | **Owner decision** before any implementation |

Foundation keys `staff.read` / `staff.write` remain **test/mechanism keys only**. They are not a business catalogue.

## 5. Enforcement expectations for current Admin/Merchant HTTP surfaces

Until fine-grained legacy enforcement is proven elsewhere (it is not, in the traced chain):

1. Authenticate with `JwtStaffGuard`.
2. Authorize with `StaffAuthorizationGuard` using `@PlatformOnly` / `@RequireStaffRoles` (coarse).
3. Enforce tenant isolation in services via `StaffPrincipal.merchantId` + restaurant ownership (`MerchantScopeService`).
4. Never trust request-supplied `merchantId` to grant access.
5. Do **not** add `@RequireStaffPermissions('offer.edit')`-style keys derived from the unfinished UI tree.

## 6. What this does / does not close

### Closed by evidence

- Fine-grained permission-key invention from role-management UI labels is **not** required for Admin/Merchant parity with verified legacy backend enforcement.
- Coarse SUPER_ADMIN vs MERCHANT_* mapping is the correct near-term RBAC contract.
- Existing target foundation is the single RBAC system to extend.

### Still open

- Staff-management HTTP surface for Role CRUD + assignment (legacy had role CRUD UI; assignment to VendorUser was incomplete).
- Whether future product wants to **finish** the unfinished fine-grained catalogue as a new capability (product decision — not “parity”).
- Legacy Super Admin act-as-merchant (`vendor-access`) — owner decision.
- Global Experience Catalogue platform HTTP + RBAC (separate vertical; merchant Experience controller already coarse-role protected).

## 7. Updates required to prior docs

- Doc 79: fine-grained catalogue forensic mapping status → **completed for linkage/enforcement; activation deferred**.
- Doc 80: security rule → do not introduce domain keys from UI labels; coarse roles are the verified legacy contract.

## 8. Acceptance for this forensic slice

- [x] Role creation / persistence / assignment / lookup / backend enforcement / frontend visibility traced
- [x] Explicit disposition for fine-grained trees (defer; do not invent)
- [x] Coarse role mapping documented onto existing staff RBAC
- [x] Act-as-merchant identified as owner decision
- [ ] Follow-on: service/controller tenant-isolation tests for existing staff HTTP surfaces (implementation slice)
