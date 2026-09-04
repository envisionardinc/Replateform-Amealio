# 27 — Staff/Admin Authentication (P1.7.1E)

> **Status:** IMPLEMENTED — local/dev only, feature-flagged, **no production cutover**.
> **Scope:** password-based staff/admin authentication on top of the P1.7.1D identity schema. **No** RBAC/permission enforcement, **no** act-as-merchant, **no** legacy data migration, **no** frontend changes, **no** Prisma schema change.
> **Upstream (authoritative):** [22-IDENTITY-ANALYSIS.md](./22-IDENTITY-ANALYSIS.md), [24-AUTHENTICATION-ARCHITECTURE.md](./24-AUTHENTICATION-ARCHITECTURE.md), [25-CONSUMER-AUTHENTICATION.md](./25-CONSUMER-AUTHENTICATION.md), [26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md](./26-STAFF-ADMIN-AUTHENTICATION-DESIGN.md).
> **Consumer authentication (P1.7.1B) is unchanged.**

---

## 1. Scope

Implements the approved staff/admin authentication slice: **password login, short-lived Bearer access JWT, rotating server-side refresh sessions (hashed, replay-detected, revocable), logout, authenticated `/me`, blocked/deleted enforcement, merchant scope, and SUPER_ADMIN recognition** — all behind the `STAFF_AUTH_ENABLED` flag, local/dev only.

**Explicitly out of scope (deferred):** staff registration, OTP, phone-only/social/WhatsApp/MFA, password reset, email/phone verification, RBAC/permission enforcement (P1.7.1F), act-as-merchant, and any VendorUser/admin **data migration**.

## 2. Target architecture

```
StaffMember ── credentials ─▶ StaffCredential (PASSWORD: bcrypt secretHash)
     │
     └──────── sessions ────▶ StaffSession (hashed rotating refresh, revoke = delete)

login/refresh/logout/me  ──▶ StaffAuthController (/api/v1/auth/staff/*)
                                 │
                                 ├─ StaffAuthService (orchestration + status enforcement)
                                 ├─ StaffAccessTokenService  (HS256 Bearer JWT; dedicated secret + aud=amealio-staff)
                                 ├─ StaffRefreshTokenService (rotate/replay/revoke)
                                 ├─ StaffMemberRepository    (StaffMember + StaffCredential reads)
                                 └─ StaffSessionRepository   (StaffSession CRUD)
   protected routes ─▶ JwtStaffGuard ─▶ request.staffPrincipal
```

New module `apps/api/src/modules/identity/staff-authentication/`. Distinct from the consumer authentication module; both reuse the shared `PasswordHasher` (bcrypt) from `IdentityModule`. **The consumer `Session`/`User` path is untouched.**

### Mandatory StaffSession preflight (result)

`StaffSession` (P1.7.1D) has `{ id, staffMemberId, refreshTokenHash @unique, expiresAt, createdAt }` — structurally identical to the already-validated consumer `Session`, which implements logout/revocation/replay purely by **deleting the row** (no `revokedAt` column). Therefore staff sessions safely support rotation, revocation, replay detection, logout, and refresh-after-logout rejection **without any schema change**. **Preflight PASSED — Prisma schema unchanged.**

## 3. Legacy behavior — rejected vs preserved

**Preserved (semantically):** password login (bcrypt), login by email or phone, blocked/deleted enforcement, merchant scoping of staff, the Consumer ≠ Merchant Staff ≠ Platform Admin distinction.

**Rejected (MUST NOT PRESERVE):** the legacy portal-header as a security mechanism; admin tokens minted with the **consumer** secret; hardcoded JWT secrets/subjects; stateless refresh; raw `Authorization` token format. The target uses a **dedicated staff secret** and `Authorization: Bearer <jwt>` only.

## 4. Staff login

`POST /api/v1/auth/staff/login` with `{ email | phone, password }`. Flow: resolve StaffMember by identifier (non-deleted) → verify bcrypt password → enforce `status = ACTIVE` → issue tokens. Returns access + refresh tokens and a **non-credential** staff view.

**Uniform failure (no account enumeration):** unknown identifier, ambiguous identifier (see §15), missing credential, and wrong password all return **401 `Invalid credentials`**. A **blocked** account (valid password) returns **403**; a **deleted** account is excluded at lookup and returns **401**.

## 5. JWT (access token)

Short-lived HS256 Bearer JWT signed with a **dedicated** `STAFF_JWT_ACCESS_SECRET` and `audience: amealio-staff` (so a consumer token can never verify on the staff path and vice versa). Claims (minimal, no PII/secrets):

```json
{ "sub": "<staffMemberId>", "actorType": "STAFF", "staffRole": "MERCHANT_OWNER|MERCHANT_STAFF|SUPER_ADMIN", "mid": "<merchantId|null>", "typ": "access", "iss": "amealio", "aud": "amealio-staff" }
```

`mid` (merchant scope) is derived **server-side** from the StaffMember record; it is never accepted from request input.

## 6. Refresh rotation

`POST /api/v1/auth/staff/refresh` with `{ refreshToken }`. Token format `<sessionId>.<rawSecret>` (32 random bytes hex). Only `sha256(rawSecret)` is persisted in `StaffSession.refreshTokenHash`; the raw secret is never stored. On a valid, non-expired session with the current secret (constant-time compare), the secret is rotated (new hash + sliding expiry) and a new access token is issued.

## 7. Replay detection

Presenting a previously valid but now non-current secret for an existing session is treated as **replay**: the session is immediately **revoked (row deleted)** and the request returns **401**. The subsequently rotated token is then also invalid. Malformed tokens, missing/unknown sessions, and expired sessions all return 401 (expired/replayed sessions are deleted).

## 8. Logout

`POST /api/v1/auth/staff/logout` with `{ refreshToken }` deletes the referenced `StaffSession` (server is the source of truth). Refresh after logout returns 401. Logout is **idempotent** (204 even if already revoked or the token is unparaseable).

## 9. Blocked / deleted enforcement

- **Login:** requires the StaffMember to exist, be non-deleted, and be `ACTIVE`. Blocked → 403; deleted → 401.
- **Refresh:** after rotating, the identity is re-loaded; deleted/absent → 401 (+ session revoked), blocked → 403 (+ session revoked). A blocked/deleted account cannot keep refreshing.
- **Guard (`/me` and future protected routes):** re-loads the StaffMember on every request and rejects deleted or non-`ACTIVE` staff with 401. This is **not** a token blacklist — it reads the principal's current record; already-issued access tokens otherwise rely on the short TTL.

## 10. Merchant scope

The authenticated `StaffPrincipal` exposes `{ staffMemberId, actorType: 'STAFF', staffRole, merchantId | null }`. Merchant staff carry their associated `merchantId`; SUPER_ADMIN carries `null`. Merchant scope is always server-derived. **No** location scope, multi-merchant membership, merchant switching, or act-as is implemented.

## 11. SUPER_ADMIN

Recognized via the approved `StaffMember` model: `staffRole = SUPER_ADMIN` with `merchantId = NULL`. No `PlatformAdmin`/`SuperAdmin` model is created, no act-as claims or session fields are added.

## 12. Endpoint contracts

Base: `/api/v1/auth/staff` (gated by `StaffAuthEnabledGuard`; when `STAFF_AUTH_ENABLED=false` all routes 404).

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/login` | `{ email? , phone?, password }` | 200 `{ accessToken, refreshToken, tokenType:"Bearer", expiresIn, staff:{ id,name,email,phone,merchantId,staffRole,status } }` | 400 invalid input · 401 invalid credentials · 403 blocked |
| POST | `/refresh` | `{ refreshToken }` | 200 `{ accessToken, refreshToken, tokenType, expiresIn }` | 400 · 401 invalid/expired/replayed/deleted · 403 blocked |
| POST | `/logout` | `{ refreshToken }` | 204 (no content) | 400 |
| GET | `/me` | — (`Authorization: Bearer <jwt>`) | 200 `{ id,name,email,phone,merchantId,staffRole,status }` | 401 missing/invalid/blocked/deleted |

No endpoint returns credential material (`secretHash`/`passwordHash`) or refresh secrets. No staff registration endpoint exists.

## 13. Configuration

Environment-driven (dev placeholders only; real secrets are infra-managed and never committed):

| Var | Default (dev) | Purpose |
|---|---|---|
| `STAFF_JWT_ACCESS_SECRET` | `dev-only-staff-access-secret-change-me` | staff access-token secret (**not** the consumer secret) |
| `STAFF_JWT_ACCESS_TTL_SECONDS` | `900` | access-token lifetime |
| `STAFF_REFRESH_TTL_DAYS` | `30` | refresh session lifetime |
| `STAFF_AUTH_ENABLED` | `true` (local/dev) | feature flag; disabled → routes 404 |

Added to `env.validation.ts`, `.env`, `.env.example`, `.env.test`. Production remains unconfigured (no cutover).

## 14. Security model

- Passwords: bcrypt (`bcryptjs`, shared hasher). Only the hash is stored; plaintext exists only for the transient request. Credential records are never returned or logged.
- Refresh secrets: only `sha256` hashes persisted; constant-time comparison; rotation + replay-revoke.
- Token boundary: dedicated secret + `aud=amealio-staff` ⇒ consumer/staff tokens are mutually non-interchangeable (verified by tests).
- Transport contract: `Authorization: Bearer <jwt>` only; the legacy raw-header format is rejected.
- No account enumeration: unknown/ambiguous/wrong-password failures are indistinguishable (uniform 401).

## 15. Password migration boundary

**No** VendorUser/admin credentials are migrated; **no** legacy hashes are copied; **no** MongoDB is read. Authentication operates only against `StaffCredential` rows already present in PostgreSQL. Tests create controlled synthetic fixtures. The model supports a future staged bcrypt validation/rehash, which is a separate controlled phase (AUTH-D4).

## 16. Test coverage

**34 new tests, all green** (full suite 85 → **119**):

- **e2e** (`test/staff-auth.e2e-spec.ts`, 23): merchant-staff login, SUPER_ADMIN login, phone login, uniform unknown/wrong-password failure, blocked (403), deleted (401), no credential exposure; `/me` accept + missing/malformed/raw rejection, SUPER_ADMIN null scope, consumer-JWT→staff and staff-JWT→consumer rejection, blocked/deleted rejected at guard; refresh rotate, replay-revoke, missing session, expired session, blocked/deleted cannot refresh; logout + refresh-after-logout + idempotent logout; refresh-secret-hash-only + bcrypt-hash-format security invariants.
- **unit** — `staff-refresh-token.service.spec.ts` (6): issue/rotate/replay/malformed/missing/expired/revoke; `staff-access-token.service.spec.ts` (5): claims, SUPER_ADMIN null scope, tamper reject, and both cross-secret rejections.

A **live smoke** run (`node dist/main.js`, dev DB) confirmed login→/me→refresh-rotate→replay-401→logout→refresh-401 and cross-guard 401s end-to-end.

## 17. Known limitations

- **Login-identifier uniqueness (O1 open):** `StaffMember.email`/`phone` are **not** unique in the schema. Login resolves to exactly one non-deleted match; an **ambiguous** identifier (>1 match) is treated as an authentication failure rather than authenticating an arbitrary account. A uniqueness constraint is deferred to O1.
- Guard performs a per-request StaffMember read for immediate blocked/deleted enforcement (intentional; not a token blacklist).
- No refresh-token reuse grace window; strict single-use rotation.

## 18. Deferred capabilities

Staff registration, OTP/phone-only/social/WhatsApp/MFA, password reset, email/phone verification, RBAC/permission enforcement (P1.7.1F), act-as-merchant (audited, future), legacy credential/data migration, and frontend cutover.

## 19. P1.7.1E completion criteria

- ✅ Mandatory StaffSession preflight performed — revocation safe without schema change.
- ✅ Password login, Bearer JWT, rotating hashed refresh, replay detection, logout/revocation, `/me`, blocked/deleted enforcement, merchant scope, SUPER_ADMIN recognition implemented (local/dev, flagged).
- ✅ Dedicated staff secret boundary; legacy raw-header/consumer-secret/stateless behavior rejected.
- ✅ Comprehensive unit + e2e + security tests (34 new; suite 119/119). Build/lint/format ✓. `prisma validate` ✓; `migrate status` up to date. **Prisma schema/migrations unchanged.**
- ✅ Consumer authentication (P1.7.1B) unaffected; no RBAC/act-as/data-migration/frontend changes.
