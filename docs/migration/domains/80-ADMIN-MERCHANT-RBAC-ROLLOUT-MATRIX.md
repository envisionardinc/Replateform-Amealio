# Admin / Merchant RBAC Rollout Matrix

Status: ACTIVE — forensic/reconciliation + implementation gate
Branch: `replatform/backend-consolidation`

## Purpose

Make the existing staff RBAC foundation an application-wide capability without inventing a second authorization model.

## Verified target foundation

- `StaffMember.staffRole` is `SUPER_ADMIN`, `MERCHANT_OWNER`, or `MERCHANT_STAFF`.
- `StaffMember.merchantId` is server-derived scope; platform `SUPER_ADMIN` has `merchantId = null`.
- `Role` / `RolePermission` already provide fine-grained permission storage.
- `StaffPermissionRepository` reads only `allowed=true` permissions per request.
- `StaffAuthorizationGuard` is the reusable enforcement point.
- Domain services remain responsible for resource/restaurant tenant isolation.

## Current rollout

| Surface | Authentication | Coarse RBAC | Resource scope | Status |
|---|---|---|---|---|
| Staff authentication | JWT staff guard | staff identity/status | server-derived | Implemented |
| Merchant onboarding | JWT + authorization guard | platform-only / merchant roles | service enforced | Implemented |
| Global Item Catalogue | JWT + authorization guard | SUPER_ADMIN | platform | Implemented |
| Merchant Menu/Catalog | JWT + authorization guard | MERCHANT_OWNER / MERCHANT_STAFF | restaurant -> merchant | Implemented |
| Merchant Experience | JWT + authorization guard | MERCHANT_OWNER / MERCHANT_STAFF | restaurant -> merchant | Implemented |
| Global Experience Catalogue | TBD after legacy trace | TBD | platform | Next |
| Merchant staff management | Existing Role/RolePermission data; route surface not yet reconciled | TBD | merchant | Next |
| Ordering operations | Existing service foundation | TBD | merchant/restaurant | Next |
| Payment/settlement administration | Existing service foundation | TBD | merchant/platform | Next |

## Security rule

Do not introduce domain permission keys until the legacy permission catalogue is mapped to actual Admin/Merchant actions. `staff.read` and `staff.write` remain foundation/test permissions only.

Do not trust request-supplied merchant IDs to grant scope. Request IDs may only be used to detect a cross-merchant mismatch; authoritative merchant scope comes from the authenticated staff principal and resource ownership checks.

## Implementation gate

A domain is considered RBAC-complete only when:

1. legacy Admin/Merchant authorization behavior has been traced,
2. route authentication is enforced,
3. coarse role boundaries are enforced,
4. fine-grained permission behavior is mapped where legacy evidence requires it,
5. resource tenant isolation is enforced in the application layer,
6. unauthorized and cross-merchant cases are tested,
7. no business rule has been invented to fill an evidence gap.

## Explicit non-goals

- No act-as-merchant capability.
- No replacement permission hierarchy invented from UI labels alone.
- No broad SUPER_ADMIN access added to merchant-facing routes merely for convenience.
- No propagation semantics inferred for Global Experience Catalogue cloning.
