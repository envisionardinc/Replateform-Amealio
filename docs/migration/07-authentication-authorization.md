# 07 — Authentication & Authorization

Identity, authentication strategies, session/token handling, roles, and authorization enforcement across the platform. Primary source: `amealio-vendordashboard/src/authentication.ts`, `src/app.hooks.ts`, and per-service hooks.

## 1. Two authentication services (dual-stack)

| Service | Mount | Entity | Consumers |
|---------|-------|--------|-----------|
| Consumer | `/authentication` | `User` (via `user-service`) | consumer web app, delivery app |
| Vendor/Admin | `/vendorauthentication` | `VendorUser` | admin + merchant portal |

Both are configured in `src/authentication.ts`; JWT settings come from `authentication.*` and `vendorauthentication.*` config blocks (`AUTHENTICATION_*`, `VENDORAUTHENTICATION_*`).

## 2. Strategies

### Consumer `/authentication`
- `jwt` (`JWTStrategy`) — registered.
- `local` (`LocalStrategy`) — registered.
- `phone` (`MyLocalStrategy`, custom `getEntityQuery`) — registered.
- `facebook` (`FacebookStrategy`, Graph API) — registered.
- `GoogleStrategy` / `CustomStrategy` exist but are **not registered**; OAuth handled via `expressOauth()` + config.

### Vendor `/vendorauthentication`
- `jwt`, `local`, `phone` (as `LocalStrategy`).

### Active auth service class
- `PlainRevokableAuthService` (in-process revoked-token map). `RedisAuthService` exists but is **not wired** — token revocation is process-memory only (does not survive restarts / scale horizontally). **Migration concern.**

## 3. Login methods (by client)

| Method | Flow | Backend |
|--------|------|---------|
| Phone OTP | request OTP → verify | `/send-otp`, `/verify-otp`, `/otp-authentication`, `strategy: 'phone'` |
| Google / Apple / Facebook | Firebase popup → social sign-in | `/social-sign-in`, `/social-sign-up` |
| WhatsApp magic-link | `/whatsapp-auth` → deep link → exchange code → optional `strategy: 'jwt'` | `/whatsapp-auth` (+ `/verify`), WhatsApp login models |
| Guest | browse + `guest/cart`; login modal on gated actions | `/guest/cart`, `/temp-user` |
| Merchant | mobile/email + password/OTP with `portal` header | `POST /vendorauthentication` |
| Super-admin | `POST /admin/auth` (portal `ADMIN`) then OTP step | `/admin/auth` |
| Delivery driver | OTP with `deliveryPerson: true`, `portal: MERCHANT` | `/otp-authentication` + JWT over socket |

## 4. Tokens & sessions

| Token | Creation | Expiry config |
|-------|----------|---------------|
| Consumer access | in `/authentication` after-create hook | `AUTHENTICATION_JWTOPTIONS_EXPIRESIN` |
| Refresh | `permission: "refresh"` token | `MOBILETOKENEXPIRY` |
| Short/admin (unverified) | issued on 409 | `SHORTTOKENEXPIRY` |
| Unregistered/guest | — | `UNREGISTEREDUSERTOKENEXPIRY` (exact flow **`UNKNOWN — REQUIRES REVIEW`**) |

- **Session storage:** `Session` collection (`user_id`, `access_token`, `refresh_token`, `expires_at`, ~30-day, TTL index). Refresh via `/get-refresh-token`.
- **Token transport (consumer web):** raw JWT in `Authorization` header (not `Bearer`); Feathers client also syncs `feathers-jwt` in `localStorage`.
- **Cross-service trust:** the **Nest tracking service verifies JWTs with a shared `JWT_SECRET`** issued by Feathers; it issues no tokens itself. The signing algorithm is `HS256`; the trust relationship/secret rotation story is a **migration concern**.

## 5. Roles & permissions

| Role | Where | Notes |
|------|-------|-------|
| Consumer (`user`) | `User.role` set to `user` on signup | lightweight; no RBAC matrix |
| `vendor` (merchant) | `VendorUser.role` | subject to `role` (RBAC) `vendorPermission` tree |
| `superadmin` | `VendorUser.role` | `superAdminPermission` tree; socket `superAdmins` channel |
| Delivery person | `deliverypersons` | authenticated via consumer OTP path with `deliveryPerson` flag |

- **RBAC model:** `role` (`role-management`) holds granular boolean permission trees per `vendor_id`/`restaurant_id` for both vendor and super-admin scopes (100+ flags).
- **Guest vs registered vs verified:** consumer app gates actions on token presence and `user_verified`; there is no consumer permission matrix.

## 6. Authorization enforcement

- **Global hook** (`src/app.hooks.ts`): if a raw `Authorization` token is present (not `Bearer`, not ONDC, not `ALEXA_VOICE_TOKEN`), verify via consumer auth and reject blocked users.
- **Portal header** (`ADMIN`/`MERCHANT`/`ANY`): enforced **only** in vendor authentication, mapping host → expected role. Not applied to general API routes.
- **Per-service `authenticate('jwt')`** hooks on many (not all) services; numerous public endpoints exist (restaurant search, guest cart, ONDC callbacks).
- **Superadmin gates**: several services check `role === 'superadmin'`; superadmin can impersonate a vendor via `vendorAccess`.
- **No centralized policy layer**: authorization is scattered across per-service hooks and role-string comparisons.

## 7. Security observations (for the target)

- Token revocation is in-process only (no shared store) — **won't scale**; consider a proper token/session store.
- Raw (non-`Bearer`) `Authorization` header convention is non-standard.
- Committed secrets in reference env files (auth secrets, OAuth keys) must be rotated and never carried forward.
- Dual auth stacks (`/authentication` + `/vendorauthentication`) with overlapping strategies should be unified behind one identity model with role/tenant claims in the target (design in `docs/architecture/`).
- Enum-encoded permissions and role-string checks should become an explicit, testable authorization model.

**`UNKNOWN — REQUIRES REVIEW`:** exact guest token issuance; full permission-flag catalogue and their enforcement points; whether any endpoints rely on the unregistered/short token beyond the unverified-signup flow.
