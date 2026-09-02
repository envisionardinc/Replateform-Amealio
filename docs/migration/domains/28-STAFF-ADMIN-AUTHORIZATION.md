# 28 — Staff/Admin Authorization Foundation (P1.7.1F)

> **Fulfills the P1.7.1F "docs/27-STAFF-ADMIN-AUTHORIZATION.md" deliverable.** Numbered `28` to avoid colliding with the P1.7.1E authentication doc ([27-STAFF-ADMIN-AUTHENTICATION.md](./27-STAFF-ADMIN-AUTHENTICATION.md)).
> **Status:** IMPLEMENTED — authorization **foundation** only, local/dev, feature-flagged with staff auth. **No** legacy permission-catalogue migration, **no** act-as/impersonation, **no** domain authorization, **no** frontend RBAC, **no** Prisma schema change.
> **Upstream:** P1.7.1E authentication (`27`), P1.7.1C/D identity design/schema (`26`), post-audit reconciliation (`../../current-state/POST-AUDIT-RECONCILIATION.md`).
> **Consumer authentication and P1.7.1E token claims are unchanged.**

---

## 1. Scope

Establishes the reusable authorization primitives that future domain modules compose to protect staff/admin routes:

- an authorization **guard** that composes after `JwtStaffGuard`;
- **decorators**/metadata for role, permission, platform-only, and merchant-scope requirements;
- **permission enforcement** on the existing `Role`/`RolePermission` tables;
- **merchant tenant scoping** derived solely from the authenticated principal;
- **SUPER_ADMIN** platform handling;
- consistent **401 vs 403** semantics.

It is **not** a migration of the legacy `role-management` permission catalogue, **not** authorization across the 423 legacy APIs, and **not** frontend RBAC.

## 2. Authorization architecture

```
Authorization: Bearer <staff JWT>
      │
      ▼
JwtStaffGuard (P1.7.1E)  ── verifies staff JWT, re-loads StaffMember, rejects
      │                     deleted/blocked, sets request.staffPrincipal
      ▼
StaffAuthorizationGuard (P1.7.1F)  ── reads handler/class metadata:
      │   @PlatformOnly · @MerchantScoped · @RequireStaffRoles · @RequireStaffPermissions
      │   → 401 if no principal; 403 if authenticated but not authorized
      ▼
handler (receives @CurrentStaff() StaffPrincipal; scopes data by getEffectiveMerchantId)
```

New files (all under `apps/api/src/modules/identity/staff-authentication/authorization/`):
`staff-authorization.decorators.ts`, `staff-authorization.guard.ts`, `staff-permission.repository.ts`, `merchant-scope.ts`, `staff-permissions.ts` (+ specs). Wired via `StaffAuthModule` (providers + exports).

## 3. Principal

Authorization consumes the existing **`StaffPrincipal`** set by `JwtStaffGuard` — unchanged from P1.7.1E:

```ts
interface StaffPrincipal {
  staffMemberId: string;
  actorType: 'STAFF';
  staffRole: 'MERCHANT_OWNER' | 'MERCHANT_STAFF' | 'SUPER_ADMIN';
  merchantId: string | null; // server-derived; null ⇒ platform (SUPER_ADMIN)
}
```

No new identity model, no new JWT mechanism, and no change to P1.7.1E token claims. Permissions are **not** embedded in the token; they are read per request from the database (like the P1.7.1E status re-check), so role/permission changes take effect without waiting for token expiry.

## 4. Guard

`StaffAuthorizationGuard` runs **after** `JwtStaffGuard` (composition: `@UseGuards(JwtStaffGuard, StaffAuthorizationGuard)`):

1. No `request.staffPrincipal` → **401** (`UnauthorizedException`).
2. `@PlatformOnly` and not SUPER_ADMIN → **403**.
3. `@MerchantScoped` and merchant staff: require `principal.merchantId`; if a request-supplied merchant id is present and differs → **403** (SUPER_ADMIN is not restricted).
4. SUPER_ADMIN (platform superuser) → **allowed** (bypasses role/permission gates).
5. `@RequireStaffRoles` (ANY) not satisfied → **403**.
6. `@RequireStaffPermissions` (ALL) not satisfied → **403**.
7. No authorization metadata → authentication alone suffices (**allowed**).

## 5. Permission mechanism

- Decorator `@RequireStaffPermissions(...keys)` requires the principal's role to grant **ALL** listed keys.
- `StaffPermissionRepository.getPermissionKeys(staffMemberId)` loads `Role → RolePermission` where `allowed = true` (deny-by-default: no role or no granted keys ⇒ empty set ⇒ 403 for any required permission).
- Permission keys are **free-form strings** in `RolePermission.permissionKey`. The mechanism is catalogue-agnostic; it checks required keys against granted keys.
- **Foundation keys** (`staff.read`, `staff.write` in `staff-permissions.ts`) exist **only** to exercise/demonstrate the mechanism in tests/examples. They are **not** the legacy business catalogue.

## 6. Role mechanism

- Decorator `@RequireStaffRoles(...roles)` requires `principal.staffRole` to be one of the listed roles (ANY), using the existing `StaffRole` enum (`MERCHANT_OWNER`/`MERCHANT_STAFF`/`SUPER_ADMIN`).
- Coarse role gating is independent of the fine-grained permission catalogue and needs no DB read.

## 7. Merchant scope

- The **only** trusted scope source is the server-derived `StaffPrincipal.merchantId`. `getEffectiveMerchantId(principal)` returns it (`null` for SUPER_ADMIN); controllers/services MUST scope queries by this value.
- `@MerchantScoped()` confines merchant staff to their own `merchantId`. A request-supplied merchant id (route param → body → query, via `extractRequestedMerchantId`) is inspected **solely to reject** a mismatch — never to grant or widen scope.
- **Not supported (by design):** arbitrary merchant switching, request-supplied merchant override, cross-merchant access, act-as.

## 8. SUPER_ADMIN behavior

- SUPER_ADMIN = `StaffMember` with `staffRole = SUPER_ADMIN` and `merchantId = null` (platform scope).
- Treated as a **platform superuser**: passes `@RequireStaffRoles`/`@RequireStaffPermissions` gates and is the only principal allowed on `@PlatformOnly` routes.
- **Not** confined by `@MerchantScoped` (operates at platform scope). Acting *as* a specific merchant identity (impersonation) is **deferred** — see §11.

## 9. 401 vs 403

| Situation | Status |
|---|---|
| No/invalid/expired staff token; wrong actor type; deleted or blocked staff | **401** (`JwtStaffGuard` / no principal) |
| Authenticated staff lacking required role/permission/platform scope, or cross-merchant access | **403** (`StaffAuthorizationGuard`) |

## 10. Deferred: legacy permission mapping

The legacy `role-management` catalogue (`vendorPermission` / `superAdminPermission` boolean trees; seating/order/experience/event/menu/user-management permissions) is **not mapped** in P1.7.1F and is **pending migration work** (owner decision **AUTH-D6**). This phase deliberately does **not** fabricate business permission names; it ships the reusable mechanism and a minimal foundation key set only. Per-domain permission keys will be introduced with each domain migration.

## 11. Deferred: impersonation / act-as-merchant

Not implemented in P1.7.1F. A SUPER_ADMIN operating *as* a specific merchant (the legacy `vendor-access` capability) must be an explicit, audited elevation (see doc 26 §14: `StaffSession.actAsMerchantId` + `AuditLog`). Merchant scoping here treats SUPER_ADMIN strictly as platform scope.

## 12. Tests

**20 new tests (suite 119 → 139, all green).**

- **Unit** (`authorization/staff-authorization.guard.spec.ts`, 12): 401 no principal; no-metadata allow; role allow/deny; permission allow/deny; ALL-permissions (multi); `@PlatformOnly` (super-admin vs staff); `@MerchantScoped` (match/own/mismatch); request-supplied (query/body) override rejected; SUPER_ADMIN not merchant-restricted; SUPER_ADMIN bypasses role+permission.
- **E2E** (`test/staff-authorization.e2e-spec.ts`, 8, real guards + minted staff JWTs against the test DB): unauthenticated→401; authn + guard composition; role allow/403; permission single+multiple (403 when missing); SUPER_ADMIN platform-only + bypass; merchant scope (own allow, cross-merchant 403, query override 403, default scope); consumer-JWT→staff 401 and staff-JWT→consumer 401; blocked→401 and deleted→401 with a valid token.

Mapped to the required cases: (1) 401, (2) authorized allow, (3) 403, (4) SUPER_ADMIN platform, (5) own scope, (6) cross-merchant denied, (7) request override rejected, (8) missing-metadata behavior, (9) multiple permissions, (10) guard composition, (11) consumer→staff rejected, (12) staff→consumer rejected, (13) blocked, (14) deleted. Existing P1.7.1E tests are unchanged and remain green.

## 13. Validation evidence

- `npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓.
- `npm test` → **139/139** (17 suites): 119 prior + 20 new.
- `prisma validate` ✓; `prisma migrate status` → up to date. **`prisma/schema.prisma` and migrations unchanged.**

## 14. Known limitations & remaining owner decisions

- **AUTH-D6** — legacy permission catalogue + full enforcement model (blocks fine-grained domain authz).
- Permission set is a minimal foundation only; real keys arrive per domain.
- SUPER_ADMIN is a full superuser (bypasses gates); if product requires scoped platform roles, that is a future refinement.
- Act-as/impersonation deferred (owner decision on audit fields).
- Enforcement is **backend-only**; frontend RBAC is out of scope.
- Per-request permission DB read is intentional (immediate revocation) — caching is a possible later optimization.
