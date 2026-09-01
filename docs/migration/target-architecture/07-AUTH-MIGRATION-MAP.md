# 07 — Authentication / Authorization Migration Map

Maps the existing auth model to the target. **No authentication implementation changes.** Source of truth: P1.1 [10-AUTHENTICATION-AUTHORIZATION](../india-baseline/10-AUTHENTICATION-AUTHORIZATION.md); target tenancy: [`multi-tenancy.md`](../../architecture/multi-tenancy.md).

## Current → target

| Concern | Current (baseline) | Target (proposed) | Disposition |
|---------|--------------------|--------------------|-------------|
| Consumer auth | Feathers `/authentication` (entity `User`); jwt/local/phone/facebook; raw `Authorization` header | Unified Identity `/auth`; Bearer JWT + claims (`packages/auth`) | **REIMPLEMENT** (preserve login methods) |
| Merchant auth | Feathers `/vendorauthentication` (entity `VendorUser`) + `portal` header | Same identity service; **role claim** replaces portal header | **REIMPLEMENT** |
| Admin auth | `/admin/auth` (portal `ADMIN`) + OTP | Same identity service; `SUPER_ADMIN` role claim | **REIMPLEMENT** |
| Login methods | phone OTP, Google/Apple/Facebook (Firebase), WhatsApp magic-link, guest | preserved (MSG91, Firebase, WhatsApp) | **REIMPLEMENT** (behavior preserved) + **ADAPT** providers |
| Roles | `user`; `vendor`; `superadmin`; (delivery person) | `CUSTOMER`; `MERCHANT_OWNER`/`MERCHANT_STAFF`; `SUPER_ADMIN`; (driver = deferred) | **REIMPLEMENT** |
| Permissions | `roles` boolean trees (`vendorPermission`/`superAdminPermission`) | explicit policy (`RolePermission`) checked centrally | **REIMPLEMENT** |
| JWT | HS256, issuer/audience from env; raw header | Bearer, standard claims incl. `merchantId`/scope | **REIMPLEMENT** |
| Session | `sessions` collection, ~30-day TTL, refresh via `/get-refresh-token` | session/refresh store (shared, not in-process) | **REIMPLEMENT** |
| Token revocation | in-process `PlainRevokableAuthService` (not scalable); unused `RedisAuthService` | shared revocation store | **REPLACE** |
| Service-to-service | shared `JWT_SECRET` with deferred Nest tracker; `INTEGRATON_SERVICE_SECRET_KEY` | explicit service-auth at extraction seams | **REIMPLEMENT** (when services extracted) |

## Target claims model (proposed)
```
{ sub, actorType: CUSTOMER|STAFF|SUPER_ADMIN,
  merchantId?, restaurantScope?: [...], roles: [...], permissions: [...] }
```
- **Customer** tokens: no `merchantId` (cross-tenant).
- **Staff** tokens: `merchantId` + roles/permissions + optional restaurant scope.
- **Super-admin**: platform role; auditable `actAsMerchantId` replaces `vendorAccess` impersonation.
- Replaces dual auth stacks + `portal` header + scattered role-string checks with **one identity + one authorization layer**.

## Preservation requirements (acceptance)
- All baseline login methods keep working (AC-C1, AC-M1, AC-A1).
- Portal boundaries preserved as role checks (AC-A1).
- Blocked-user, reactivation, unverified-409, social-guard rules preserved ([07 business rules](../india-baseline/07-BUSINESS-RULES.md)).
- Error contract preserved (AC-B2).

## Carried-forward unknowns
- Guest/temp-user token flow (`UNKNOWN`).
- Full `AmealioError` code catalogue clients rely on.
- Whether raw-header compatibility must be retained during cutover (shim) — see [05](./05-API-MIGRATION-MAP.md).

**No auth code is written in this task.**
