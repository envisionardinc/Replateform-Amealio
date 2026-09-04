# 10 — Authentication & Authorization

Documented as-is (analysis only; no auth changes). Backend = `amealio-vendordashboard/src/authentication.ts`, `src/app.hooks.ts`, per-service hooks.

## 1. Authentication mechanism
- **Two Feathers auth services in one backend** (`src/authentication.ts`):
  - `/authentication` — entity `User` (consumer). Consumed by `amealio_web_app`.
  - `/vendorauthentication` — entity `VendorUser` (merchant/superadmin). Consumed by `amealiodashboardmvp-`.
- **Strategies (consumer):** `jwt` (`JWTStrategy`), `local`, `phone` (`MyLocalStrategy`), `facebook` (`FacebookStrategy`). `GoogleStrategy`/`CustomStrategy` exist but are **not registered**; OAuth via `expressOauth()`.
- **Strategies (vendor):** `jwt`, `local`, `phone` (as `LocalStrategy`).
- **Active auth service class:** `PlainRevokableAuthService` (in-process revoked-token map). `RedisAuthService` exists but is **not wired** — revocation is process-memory only.

## 2. JWT / session behavior
| Token | Creation | Expiry config |
|-------|----------|---------------|
| Consumer access | `/authentication` after-create hook | `AUTHENTICATION_JWTOPTIONS_EXPIRESIN` |
| Refresh | `permission: "refresh"` token | `MOBILETOKENEXPIRY` |
| Short/admin (unverified) | issued on 409 | `SHORTTOKENEXPIRY` |
| Unregistered/guest | — | `UNREGISTEREDUSERTOKENEXPIRY` (flow **UNKNOWN — REQUIRES REVIEW**) |

- **Session store:** `sessions` collection (`user_id`, `access_token`, `refresh_token`, `expires_at`, ~30 days, TTL index) — `src/models/session.model.ts`. Refresh via `/get-refresh-token`.
- **JWT options:** `HS256`, issuer/audience from config (`AUTHENTICATION_JWTOPTIONS_*`, `VENDORAUTHENTICATION_JWTOPTIONS_*`).
- **Token transport (consumer web):** raw JWT in `Authorization` header (not `Bearer`) — `amealio_web_app` `guestAuth.js`; also syncs `feathers-jwt` in `localStorage` (`App.js`).

## 3. Login flows (by client)
| Method | Backend touchpoints | Client |
|--------|---------------------|--------|
| Phone OTP | `/send-otp`,`/verify-otp`,`/otp-authentication` (`strategy: phone`) | web, admin/merchant |
| Google/Apple/Facebook | `/social-sign-in|up` (Firebase) | web |
| WhatsApp magic-link | `/whatsapp-auth` (+`/verify`) | web |
| Guest | `/guest/cart`,`/temp-user` + login modal | web |
| Merchant | `POST /vendorauthentication` + `portal` header | merchant |
| Super-admin | `POST /admin/auth` (portal `ADMIN`) then OTP | admin |

## 4. Roles & permissions
| Role | Where | Notes |
|------|-------|-------|
| Consumer (`user`) | `User.role` = `user` on signup (`SignUp.js`) | lightweight; no consumer RBAC matrix |
| `vendor` (merchant) | `VendorUser.role` | governed by `role` RBAC `vendorPermission` tree |
| `superadmin` | `VendorUser.role` | `superAdminPermission` tree; socket `superAdmins` channel |
| (delivery person) | `deliverypersons` | authenticated via consumer OTP path with `deliveryPerson` flag — **used by the deferred driver app** |

- **RBAC model:** `roles` (`role-management.model.ts`) — granular boolean permission trees scoped by `vendor_id`/`restaurant_id`.
- **Consumer roles:** guest vs registered vs verified (`user_verified`); gating is token-presence based (`useRequireAuth`, `ProtectedLayer`), not a permission matrix.

## 5. Authorization enforcement
- **Global hook** (`src/app.hooks.ts`): raw `Authorization` token (not `Bearer`, not ONDC, not `ALEXA_VOICE_TOKEN`) → verify via consumer auth, reject blocked users.
- **Portal header** (`ADMIN`/`MERCHANT`/`ANY`): enforced only in vendor auth (`src/authentication.ts`), mapping host → expected role. Not applied to general API routes.
- **Per-service `authenticate('jwt')`** hooks on many (not all) services; many public endpoints exist (restaurant search, guest cart, ONDC callbacks).
- **Superadmin gates** and **impersonation** via `vendorAccess` (`src/services/ordering/ordering.hooks.ts`).
- **No centralized policy layer** — authorization scattered across per-service hooks + role-string comparisons.

## 6. Service-to-service authentication
- **Shared-secret JWT:** the **deferred** Nest tracking service verifies JWTs signed with the same `JWT_SECRET` issued by Feathers (documented dependency; tracker is out of baseline).
- **Integration service:** called with `INTEGRATON_SERVICE_SECRET_KEY` (typo preserved) — `config/default.js`.
- **Webhooks:** Razorpay/Dunzo/Petpooja/ONDC inbound; signature/verification specifics **UNKNOWN — REQUIRES REVIEW** per provider handler.

## 7. Observations (do not change now)
- Token revocation is **in-process only** (no shared store) — won't scale horizontally.
- Raw (non-`Bearer`) `Authorization` header is non-standard.
- Dual auth stacks + `portal` header + role-string checks → a target should consolidate into one identity model with role/tenant claims (future design, not here).
- Committed auth secrets in reference env files must be rotated ([12](./12-GAPS-RISKS.md)).
