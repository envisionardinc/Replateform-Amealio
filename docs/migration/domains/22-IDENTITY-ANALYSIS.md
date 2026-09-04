# 22 — Identity: Analysis & Migration (P1.7.1)

First business-domain migration. **Analysis of the approved baseline (read-only) + a minimal, evidence-backed Identity foundation** in the target NestJS app. No production/MongoDB access, no legacy data migration, no invented authentication behavior.

- Source repos inspected (read-only): `amealio-vendordashboard`, `amealio_web_app`, `amealiodashboardmvp-`
- Target: `apps/api` (P1.6) on the P1.5 PostgreSQL/Prisma schema (**unchanged**)

## 1. Source files inspected (key)
- Backend: `src/authentication.ts`, `src/app.hooks.ts`, `src/models/{user-service,vendor-user,session,role-management}.model.ts`, `src/services/user-service/{user-service.hooks.ts,otp-authentication.class.ts}`, `src/services/vendor-user/{vendor-user.hooks.ts,admin-auth.class.ts,vendor-access.class.ts}`, `src/services/{social-sign-up,send-otp,verify-otp,change-password,reset-password,refresh-token,logout}/*`, `src/services/authentication/{plain-auth-service,redis-auth-service,facebook-strategy,custom-strategy}.ts`, `config/default.js`.
- Consumer: `src/App.js`, `src/screens/{login/UserLogin.js,login/LoginOtpScreen.js,signup/SignUp.js}`, `src/common/api/urls.js`, `src/common/utility/{guestAuth.js,jwtSession.js}`, `src/store/slices/userSlice.js`, `src/setup/**/ProtectedLayer.js`, `src/hooks/useRequireAuth.js`.
- Admin/Merchant: `client/src/App.js`, `client/src/store/actions/authAction.js`, `client/src/store/actions/vendorAccessActions.js`, `client/src/config/Keys.js`, `client/src/setup/{PrivateRoute,AdminPrivateRoute}.js`, `client/src/utils/setAuthToken.js`.

## 2. Observed authentication behavior

- **Two backend auth services** (`src/authentication.ts`): `/authentication` (entity `User`, class `PlainRevokableAuthService`, strategies jwt/local/phone/facebook) and `/vendorauthentication` (entity `VendorUser`, stock `AuthenticationService`, jwt/local/phone). `RedisAuthService` and `CustomStrategy` imported but **unused**.
- **Password hashing:** `bcryptjs` via `@feathersjs/authentication-local` `hashPassword('password')` (`user-service.hooks.ts`, `vendor-user.hooks.ts`); compares via `bcrypt.compare`/`compareSync` (change-password, admin-auth).
- **Tokens/sessions:** `createAccessToken(...)`; consumer after-hook issues access + refresh and upserts a 30-day `Session` (`src/models/session.model.ts`, TTL index); `/get-refresh-token` validates the session. **Vendor auth has no equivalent after-hook / refresh.** Token revocation is in-memory only (`plain-auth-service.ts`). Clients send a **raw `Authorization` JWT (not `Bearer`)**.
- **Verification:** OTP via `send-otp`/`verify-otp`/`otp-authentication`; `user_verified` starts `false`, set `true` on verify.

## 3. Observed roles / permissions
- Roles: **`user`** (consumer), **`vendor`** (merchant), **`superadmin`** (admin). `portal` header (`ADMIN`/`MERCHANT`/`ANY`) gates vendor auth (`authentication.ts`).
- RBAC data: `role-management.model.ts` holds deep `vendorPermission`/`superAdminPermission` boolean trees scoped by `vendor_id`(+`restaurant_id`). **How these permissions are enforced on API calls is `UNKNOWN — REQUIRES REVIEW`** (`role-management.hooks.ts` is empty).
- Global blocked-user check applies to **raw consumer JWTs only** (`src/app.hooks.ts`); no equivalent global check for vendor JWTs was found (**UNKNOWN**).

## 4. Consumer vs Merchant vs Admin (differences — not identical)

| Dimension | Consumer | Merchant | Admin |
|-----------|----------|----------|-------|
| Entity | `User` | `VendorUser` | `VendorUser` (`superadmin`) |
| Primary endpoint | `/otp-authentication`, `/social-sign-in`, `/whatsapp-auth` | `/vendorauthentication` | `/admin/auth` (2-step OTP) or `/vendorauthentication` + `portal:ADMIN` |
| Feathers path | `authentication` | `vendorauthentication` | `vendorauthentication` |
| Strategy | OTP / social / WhatsApp | phone + password | admin OTP / phone |
| Portal header | not used | `MERCHANT` | `ADMIN` |
| Token storage (client) | `userDetails` + `feathers-jwt` | `userData` | `userData` |
| Refresh + Session after-hook | yes | **no** | no |
| Route protection | soft (modal via `useRequireAuth`; `ProtectedLayer` doesn't redirect) | hard (`PrivateRoute`) | hard (`AdminPrivateRoute`; 30-min idle) |
| Logout | client-only (+ socket) | client-only `localStorage.clear()` | same + idle UI |

Source API contracts (client-evidenced) are catalogued in the analysis (e.g. `POST /vendorauthentication` → `{ accessToken, VendorUser }` with `portal` header; `GET /otp-authentication?user_id=&OTP=` → user + tokens).

## 5. Compatibility vs P1.4 / P1.5 (current PostgreSQL model)

| Aspect | Status in P1.5 |
|--------|----------------|
| Consumer identity fields (phone+cc, email, passwordHash, isVerified, isBlocked) | **Represented** (`User`); unique `(phoneCountryCode, phone)`, unique `email` |
| Consumer `role` column | **Intentionally absent** — all consumers are `CUSTOMER`; staff/admin roles live on `StaffMember`/`Role` (canonical model). Matches baseline (`User.role` always `'user'`). |
| Sessions | `Session` present (refresh token hash, TTL) — **not implemented** in P1.7.1 (token issuance deferred) |
| Roles/permissions | `Role`/`RolePermission` present; permission-tree **evaluation not implemented** (baseline enforcement UNKNOWN) |
| Merchant/admin identity | `Merchant`/`StaffMember` present — **out of scope** (Merchant domain) |
| Fields NOT carried forward | Feathers-specific artifacts (raw-header convention, hardcoded JWT subject, `PlainRevokableAuthService` in-memory revocation, dual auth stacks) |

**No schema change was required.** No contradiction forced a P1.5 change; therefore P1.5 was **not modified**.

## 6. Target Identity boundary (implemented)

Module `apps/api/src/modules/identity/` with the P1.6 layered direction (controller → application → domain → infrastructure; domain depends on ports, not providers):
- **domain**: `User` entity; value objects `PhoneNumber`, `EmailAddress`; ports `UserRepository`, `PasswordHasher`.
- **application**: `RegisterUserUseCase` (create consumer user; duplicate phone → 409; unverified by default; bcrypt-hash password when supplied), `GetUserUseCase`; `CreateUserDto` (class-validator).
- **infrastructure**: `PrismaUserRepository` (P1.5 `User`), `BcryptPasswordHasher` (bcryptjs — matches baseline algorithm).
- **authorization**: `RolesGuard` + `Principal` + `CurrentUser` decorator, consuming the P1.6 `@Public`/`@Roles`/`@RequireMerchantScope` metadata.

## 7. Authentication security
- Passwords for **new** users are bcrypt-hashed (baseline algorithm). **No passwords/users migrated.** Legacy bcrypt hashes are theoretically re-verifiable by the target (bcrypt is self-describing), but credential migration is **out of scope** and a documented concern (needs a defined strategy + owner sign-off). No password security was weakened; no production credentials created.

## 8. Role / authorization model
- Roles are reproduced as target role strings the guard checks; **legacy→target mapping**: `user`→`CUSTOMER`, `vendor`→`MERCHANT_OWNER`/`MERCHANT_STAFF`, `superadmin`→`SUPER_ADMIN`. The **permission-tree evaluator is intentionally NOT implemented** (baseline enforcement is UNKNOWN — preserving the blocker rather than inventing an RBAC engine).

## 9. OD-11 / enums
- Identity does **not** depend on any OD-11 numeric enum mapping (identity statuses are booleans: `isVerified`, `isBlocked`). **OD-11 remains BLOCKED and untouched.**

## 10. Implemented capabilities & tests

| Capability | Where | Tests |
|-----------|-------|-------|
| Consumer user creation (register) | `application/register-user.use-case.ts` | unit (5): create, unverified default, password hashed, phone normalize, duplicate→409, invalid phone |
| Get user | `application/get-user.use-case.ts` | covered via repo integration |
| User persistence | `infrastructure/prisma-user.repository.ts` | integration (5) vs test DB: defaults, find by phone/id, passwordHash not exposed, unique phone, null-miss |
| Password hashing | `infrastructure/bcrypt-password-hasher.ts` | unit (3): hash/verify, wrong pw, empty hash |
| Value objects | `domain/value-objects/*` | unit (7) |
| DTO validation | `application/dto/create-user.dto.ts` | unit (5) |
| Authorization guard | `authorization/roles.guard.ts` | unit (7): public, 401, no-roles allow, role allow/deny, merchant-scope allow/deny |

**Total: 54/54 tests passing** across 9 suites (32 Identity + 3 app e2e + 5 config + 11 P1.5 DB, plus DTO). Build/lint/format all pass.

## 11. API compatibility
- **No Identity HTTP endpoints were implemented** in P1.7.1 — the baseline auth API is Feathers-specific, dual-stack, and contains documented quirks (raw header, hardcoded subject, `/logout` secret mismatch). Reproducing/replacing it is deferred to a dedicated authentication step, with a compatibility shim if/when cutover is planned. No production applications are affected (no cutover in this phase). Target API contracts will be documented when implemented.

## 12. Blockers / UNKNOWNs / deviations / risks
- **UNKNOWN:** how baseline RBAC permission trees are enforced on API calls; whether vendor JWTs get a blocked-user check; whether `/get-refresh-token` is used by any baseline client; several baseline auth quirks (no-op `query.role`, hardcoded JWT subject, `/logout` wrong secret, stub `forgot-password`, admin-auth secret mismatch, Facebook hardcoded token).
- **Blockers preserved:** authentication (token issuance/verification, OTP, social/WhatsApp) is **not** implemented (would require inventing a target scheme and/or a cutover strategy) — deferred to a dedicated Identity-authentication step; permission-tree evaluation deferred (UNKNOWN); OD-11 untouched.
- **Deviations:** consumer `User` has no `role` column (canonical model; matches baseline behavior) — this is a modeling decision from P1.4, not a new invention. Single Jest test runner (P1.6 rationale).
- **Migration risks:** password/credential migration strategy (P0 when cutover planned); preserving realtime/auth contracts for existing clients; consolidating dual auth stacks into one identity + claims model.

## Scope honored
No Orders/Payments/Catalog/Merchant-Location/Reservations/Notifications/Delivery/Recommendations/ONDC/Loyalty/Celebrations implemented; no frontend migration; no data migration; no source-repo or MongoDB modification; no production access; no deferred repositories; no guessed OD-11/owner decisions; no invented authentication behavior.
