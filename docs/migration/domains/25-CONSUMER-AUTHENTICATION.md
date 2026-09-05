# 25 — Consumer Authentication (P1.7.1B)

Implements **consumer** authentication for the target platform, per the approved architecture (AUTH-D1/D2/D3). **Local/development only — no production cutover; the legacy apps are untouched.** No user/password/session/token migration; no schema change.

## 1. Implementation scope
Consumer (principal = `User`) password authentication: **registration, login, access-token issuance, rotating refresh sessions, refresh, logout/revocation, authenticated-principal extraction, account-status (blocked) enforcement, a JWT guard, validation, consistent errors.** Staff/Admin/Merchant auth, OTP, phone-only, social, Facebook, WhatsApp, password reset, and email verification are **deferred** (§15).

## 2. Source evidence
- Consumer credential is bcrypt password (`amealio-vendordashboard` `user-service.hooks.ts` `hashPassword`; `package.json` `bcryptjs`). We implement **password login** (the credential mechanism that needs no OTP/SMS provider). Legacy is OTP-first; OTP is explicitly deferred by scope.
- Legacy raw `Authorization` header (`amealio_web_app/src/common/utility/guestAuth.js`) is **NOT** the target — we use `Bearer` per AUTH-D3.
- Session model (`session.model.ts`) references `User`; P1.5 `Session` mirrors this — appropriate for consumer sessions (not modified for staff).
- Architecture: [24-AUTHENTICATION-ARCHITECTURE.md](./24-AUTHENTICATION-ARCHITECTURE.md); identity foundation: [22](./22-IDENTITY-ANALYSIS.md).

## 3. Target authentication flow
`register` → account created (unverified). `login` (phone+cc or email + password) → access token (Bearer JWT) + refresh token + server-side session. Protected calls send `Authorization: Bearer <access>`. `refresh` rotates the refresh token and issues a new access token. `logout` revokes the session.

## 4. Registration flow
`POST /api/v1/auth/consumer/register` → `RegisterUserUseCase` (P1.7.1): validates phone/email/password, rejects duplicate phone (409), bcrypt-hashes the password, creates the `User` (**unverified** by default). Returns the public user (no credentials). No tokens issued on register (explicit login required).

## 5. Login flow
`POST …/login` with `{ phoneCountryCode, phone | email, password }` → look up the credential record, `bcrypt.compare`. **Unknown account and wrong password return the same `401 Invalid credentials`** (no user enumeration). **Blocked account → `403`.** On success → issue access + refresh tokens + `user`.

## 6. Access-token design
- HS256 **Bearer JWT**; claims = `{ sub: userId, actorType: 'CUSTOMER', typ: 'access' }` (minimum identity; no PII/credentials). Issuer `amealio`, audience `amealio-consumer`.
- Signing secret `JWT_ACCESS_SECRET` (dev-only value; infra-managed in staging/prod). Lifetime `JWT_ACCESS_TTL_SECONDS` (default **900s**, configurable/proposed).
- Verification checks signature, issuer, audience, and `typ`/`actorType`; failures → `401`.

## 7. Refresh-session design
- Server-side `Session` (P1.5): `userId`, `refreshTokenHash` (unique), `expiresAt` (default **30 days**, `REFRESH_TTL_DAYS`). The session row is the **revocation source of truth** (delete = revoke).
- Refresh token format: `<sessionId>.<rawSecret>` (rawSecret = 32 random bytes hex). The server stores **only `sha256(rawSecret)`** — never plaintext. `expiresIn`/access lifetime returned to the client.

## 8. Rotation / replay behavior
On `refresh`: parse token → load session by id → reject if missing/expired (expired also deletes the session) → constant-time compare `sha256(rawSecret)` to the stored hash. **If it matches:** generate a new rawSecret, update the stored hash + sliding expiry (rotate), issue a new access token + new refresh token. **If it does not match (a valid session but a non-current secret = replay of an already-rotated token):** the session is **revoked (deleted)** and the request is rejected `401` — so a stolen/old refresh token cannot be reused, and the legitimate client's next refresh also fails (forces re-login). Verified locally and by e2e.

## 9. Logout behavior
`POST …/logout` `{ refreshToken }` → revokes (deletes) the referenced session (`204`). **Idempotent**: already-revoked/expired/garbage tokens still return `204` without leaking information. A subsequent `refresh` with that token → `401`.

## 10. Account-status behavior
- **Blocked** (`User.isBlocked`) → cannot log in (`403`) and cannot refresh (refresh re-checks and revokes → `403`). Evidence-backed (baseline blocks users).
- **Verification** (`isVerified`) is **not** enforced for password login in this scope (verification is an OTP concern, deferred). New users are created unverified. Documented limitation (§17).
- No new account states invented.

## 11. API contracts (target only — `/api/v1/auth/consumer/*`, Bearer)

| Method | Path | Auth | Request | Success | Errors |
|--------|------|------|---------|---------|--------|
| POST | `/register` | public | `{ phoneCountryCode, phone, email?, password }` | `201 { id, phoneCountryCode, phone, email, isVerified }` | `409` duplicate, `400` invalid |
| POST | `/login` | public | `{ phoneCountryCode?, phone?, email?, password }` | `200 { accessToken, refreshToken, tokenType:'Bearer', expiresIn, user }` | `401` invalid creds, `403` blocked, `400` invalid |
| POST | `/refresh` | public (refresh token) | `{ refreshToken }` | `200 { accessToken, refreshToken, tokenType, expiresIn }` | `401` invalid/expired/revoked/replay, `403` blocked |
| POST | `/logout` | public (refresh token) | `{ refreshToken }` | `204` | (idempotent) |
| GET | `/me` | **Bearer** | — | `200 { id, phoneCountryCode, phone, email, isVerified }` | `401` missing/invalid/expired/raw-header |

All errors use the P1.6 consistent shape. No password hash is ever returned.

## 12. Configuration
`JWT_ACCESS_SECRET` (dev default), `JWT_ACCESS_TTL_SECONDS` (900), `REFRESH_TTL_DAYS` (30), `CONSUMER_AUTH_ENABLED` (feature flag, default true). Validated in `apps/api/src/config/env.validation.ts`. Added to `.env.example` (dev-only). **No production secrets.**

## 13. Security decisions
- Passwords: bcrypt (baseline algorithm); never plaintext, never logged, never returned. Min length 8.
- Access token: short-lived Bearer; minimal claims.
- Refresh token: opaque, **stored only as sha256**, rotated, revocable, replay-detected, constant-time compared.
- Uniform login failure (no enumeration); blocked enforced at login and refresh.
- Legacy raw `Authorization` header is **rejected** (Bearer only).

## 14. Legacy compatibility boundary
The target contract is `Authorization: Bearer <token>`. **No legacy raw-JWT compatibility is implemented.** The consumer web app is **not** connected; a future compatibility/anti-corruption shim (if any) is designed separately (see [24 §12](./24-AUTHENTICATION-ARCHITECTURE.md)). Endpoints are gated by `CONSUMER_AUTH_ENABLED` and mounted only in the target app — no production traffic path.

## 15. Explicitly deferred capabilities
OTP, phone-only login, social/Google/Apple/Facebook, WhatsApp magic-link, password reset, email/phone verification enforcement, and **staff/admin/merchant authentication** (needs schema additions — AUTH-D8) — all deferred to later controlled steps.

## 16. Tests
- **Unit:** `access-token.service.spec.ts` (issue/verify, tampered, wrong-secret, expired), `refresh-token.service.spec.ts` (issue, rotate, replay→revoke, malformed, unknown, expired→revoke, idempotent revoke).
- **e2e** (`test/consumer-auth.e2e-spec.ts`, test DB): registration (valid/duplicate/invalid/no-credential-leak), login (valid/invalid/unknown uniform 401/blocked 403/token issuance), access (Bearer ok, missing/malformed/raw-header 401), refresh (rotate, replay→401+revoke, garbage 401), logout (204, post-logout refresh 401, idempotent), principal (`/me`), security (no password/hash exposure).
- **Full suite: 12 suites / 75 tests passing** (54 prior + 21 new). Also verified live locally (register→login→me→refresh-rotate→replay-401→logout→refresh-401).

## 17. Known limitations
- Password login only (OTP-first legacy flow deferred); new users are unverified and verification is not enforced.
- Access token isn't independently revoked before expiry (short TTL mitigates); revocation is at the refresh-session level.
- No rate limiting/lockout yet (future hardening).
- Staff/admin auth not implemented (schema additions pending, AUTH-D8).

## 18. Next authentication step
Per approval: implement **consumer OTP** (needs an SMS provider port) and/or **password reset** if owner scopes them; then **staff/admin authentication** after the AUTH-D8 schema additions (staff credentials + staff sessions) are approved and migrated. Do not start Merchant/Location until the merchant/admin boundary (AUTH-D2) is confirmed in implementation.

## Scope honored
Consumer auth only; no staff/admin/merchant auth; no OTP/social/WhatsApp/reset; no user/password/session/token migration; no schema/migration change (P1.5 `User`+`Session` reused); no frontend/production/MongoDB; no source-repo change; no deferred repos; OD-11 untouched; no invented permission behavior.
