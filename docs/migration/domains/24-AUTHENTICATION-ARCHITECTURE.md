# 24 — Authentication Architecture & Migration Decision (P1.7.1A)

**Architecture & decision task only. Authentication is NOT implemented here.** No login/logout/refresh/OTP/social/reset endpoints, no user/password/session/token migration, no schema/migration change, no production/MongoDB access. Builds on P1.7.1 ([22](./22-IDENTITY-ANALYSIS.md)) with source re-confirmed.

## 1. Executive decision summary

- **Recommended target: Option C** — a **single canonical Identity domain with distinct authentication principals/credentials**: consumer `User` (cross-tenant) and staff `StaffMember` (merchant/admin, tenant-scoped), sharing one authorization model (roles/permissions + claims). This **matches the already-approved P1.5 schema** (which deliberately separates `User` from `Merchant`/`StaffMember`/`Role`) and the evidenced reality (materially different consumer vs vendor/admin auth). We do **not** force one `User` table, and we do **not** reproduce the legacy `/authentication` + `/vendorauthentication` split as a permanent design — the *split of principals* is preserved, the *legacy mechanism/quirks* are not.
- **Merchant ≠ Admin:** kept distinct via `StaffMember.staffRole` (`MERCHANT_OWNER`/`MERCHANT_STAFF` vs `SUPER_ADMIN`) + tenancy scope, not a shared "vendor==admin".
- **Consumer authentication is schema-sufficient** (P1.5 `User`+`Session`); **staff/admin authentication needs schema additions** (staff credentials + staff sessions) — a documented future migration that **blocks staff-auth implementation** (not consumer-auth).
- **OD-11 does not affect authentication.**
- Several legacy quirks are classified **MUST NOT PRESERVE** (security bugs); a few need **OWNER DECISION** (password reset scope, cutover compatibility, permission enforcement).

## 2. Source evidence (re-confirmed)
- Consumer raw `Authorization` (not Bearer): `amealio_web_app/src/common/utility/guestAuth.js` ("Attach the Feathers JWT as a raw Authorization value (not Bearer)").
- `/get-refresh-token`: **no client usage** found in consumer or admin (`amealio_web_app/src`, `amealiodashboardmvp-/client/src`) — likely unused (UNKNOWN).
- Portal header from hostname: `amealiodashboardmvp-/client/src/store/actions/authAction.js` (`portal: host.includes("admin") ? "ADMIN" : …`; admin OTP uses `portal:"ADMIN"`).
- Vendor auth **after-hook is empty/commented** (`amealio-vendordashboard/src/authentication.ts` ~L412–426) → no session/refresh, no blocked/verified check for vendors.
- `Session` references **`User` only** (`src/models/session.model.ts` `user_id ref:"User"`, `refresh_token` unique, TTL on `expires_at`).
- Backend/consumer/admin details per [22-IDENTITY-ANALYSIS](./22-IDENTITY-ANALYSIS.md) (file-cited).

## 3. Authentication behavior matrix

| Dimension | Consumer | Merchant | Admin |
|-----------|----------|----------|-------|
| Identity entity | `User` (`user-service.model.ts`) | `VendorUser` (`vendor-user.model.ts`) | `VendorUser`, `role=superadmin` |
| Auth endpoint | `/otp-authentication`, `/social-sign-in`, `/whatsapp-auth`; `/authentication` (jwt completion) | `/vendorauthentication` | `/admin/auth` (2-step OTP) or `/vendorauthentication` + `portal:ADMIN` |
| Strategy | phone-OTP (primary), social (Google/Apple/FB), WhatsApp magic-link, guest | `phone` + password | admin OTP; or phone |
| Password handling | bcryptjs (`hashPassword`); OTP-first so rarely used | bcryptjs | bcrypt compareSync (`admin-auth.class.ts`) |
| JWT/session model | JWT (`authentication.secret`) + **Session** row (30-day, TTL) | JWT (`vendorauthentication.secret`); **no session** | JWT minted with **`authentication.secret`** (mismatch) |
| Refresh behavior | refresh token issued + `/get-refresh-token` (client usage UNKNOWN) | **none** | none |
| Logout | client-only (+ socket); `/logout` verifies with wrong secret, no revocation | client-only `localStorage.clear()` | same + idle UI |
| Role | `user` | `vendor` | `superadmin` |
| Permission | none consumer-side | `role-management` trees (enforcement **UNKNOWN**) | `superAdminPermission` (enforcement **UNKNOWN**) |
| Portal | not used | `MERCHANT` (hostname) | `ADMIN` (hostname) |
| Route protection | soft (`useRequireAuth` modal; `ProtectedLayer` no redirect) | hard (`PrivateRoute`) | hard (`AdminPrivateRoute`, 30-min idle) |
| Client storage | `userDetails` + `feathers-jwt`; raw header | `userData`; raw header (axios default) | `userData`; raw header |
| Account status | `user_verified`, `user_blocked`; blocked check via global hook (raw consumer JWT only) | `blocked.isBlocked`; **no global blocked check found** (UNKNOWN) | same as merchant |
| Password reset | OTP + `/reset-password`; `/forgot-password` is a **stub** | OTP + `/reset-password` (`strategy:vendor-user`) | UNKNOWN |
| Phone verification | OTP (`send-otp`/`verify-otp`) sets `user_verified` | OTP for vendor | admin OTP |
| Social login | Google/Apple/Facebook (Firebase) | none | none |
| Unknowns | `/get-refresh-token` real usage; hardcoded subject path | vendor blocked-check; refresh usage | admin-secret mismatch impact |
| Migration concerns | OTP re-onboarding; raw→Bearer; social linking | credential migration; no session today | secret mismatch; distinct admin path |

## 4. Legacy architecture (summary)
Two Feathers auth services in one backend: `/authentication` (entity `User`, `PlainRevokableAuthService`, jwt/local/phone/facebook) and `/vendorauthentication` (entity `VendorUser`, stock service, jwt/local/phone). Consumer gets refresh+Session; vendor/admin do not. Portal header (hostname) gates vendor vs admin. Roles: user/vendor/superadmin; permission trees exist but enforcement is UNKNOWN. Full detail: [22](./22-IDENTITY-ANALYSIS.md).

## 5. Legacy quirks classification

| Quirk | Class | Note |
|-------|-------|------|
| Raw `Authorization` JWT (no Bearer) | **B — MUST NOT PRESERVE** | Target uses `Bearer`; a cutover shim MAY temporarily accept raw header (**C — owner** for the shim window) |
| Consumer refresh/session behavior | **A — PRESERVE capability** | Keep refresh + server-side session (reimplemented cleanly), not the exact impl |
| Vendor lack of session/refresh | **B — MUST NOT PRESERVE** | Staff get sessions/refresh in target |
| Hardcoded JWT subject (unverified 409) | **B — MUST NOT PRESERVE** | Security bug |
| Secret mismatches (admin-auth uses `authentication.secret`) | **B — MUST NOT PRESERVE** | One consistent signing strategy |
| Logout secret mismatch + no revocation | **B — MUST NOT PRESERVE** | Target revokes sessions on logout |
| Stub `forgot-password` | **B — implement properly** / **C — owner** (reset in scope?) | — |
| Facebook hardcoded token | **B — MUST NOT PRESERVE** | Security |
| Portal header behavior | **B — MUST NOT PRESERVE (as header hack)**; the admin/merchant *distinction* is **A — PRESERVE (via role claims)** | — |
| `query.role === "vendor"` no-op | **B — MUST NOT PRESERVE** | Bug |
| Uncertain RBAC enforcement | **D — UNKNOWN** → **C — owner decision** for target permission model | Do not invent |
| Missing vendor JWT blocked check | **B — MUST NOT PRESERVE the gap** | Target enforces blocked for all principals |
| `/get-refresh-token` client usage | **D — UNKNOWN** | Confirm before assuming any client depends on it |

None are silently fixed or reproduced here.

## 6. Target Identity architecture (Option C — recommended)
- **Principals:** `User` (consumer, cross-tenant) and `StaffMember` (merchant/admin, `merchantId`-scoped for staff; platform-scoped for super-admin). Both are "identities"; they are distinct principals with distinct credential/auth methods.
- **Why not Option A (fully separate domains):** duplicates authorization/session plumbing; the platform shares one authz model. **Why not Option B (single User with personas):** contradicts the approved P1.5 model (separate `User`/`StaffMember`) and the evidence (different entities, credentials, tenancy, verification); risks conflating cross-tenant customers with tenant-scoped staff and complicates ownership/security. **Option C** matches evidence + approved schema, keeps security boundaries, and supports future service extraction (identity module can host both principals or split later at a seam).

## 6b. Options comparison (summary)

| Criterion | A separate domains | B unified User+personas | **C unified identity, distinct principals** |
|-----------|--------------------|-------------------------|---------------------------------------------|
| Evidence fit | partial | poor (one entity ≠ reality) | **strong** |
| Security boundaries | strong | weaker (persona mixing) | **strong** |
| Migration complexity | high (3x) | medium but risky merge | **medium, aligned to schema** |
| Authorization reuse | low | high | **high** |
| Merchant ownership | ok | muddled | **clean (tenancy scope)** |
| P1.5 schema fit | ok | **conflicts** | **matches** |
| Modular monolith / extraction | ok | ok | **best** |

## 7. Target authentication architecture (conceptual)
- **Access token:** short-lived JWT, **`Bearer`**, claims `{ sub, actorType: CUSTOMER|STAFF|SUPER_ADMIN, roles[], merchantId?, restaurantScope?[] }`. Proposed lifetime **~15 min (PROPOSED — requires approval)**.
- **Refresh token:** opaque, stored **hashed** server-side (P1.5 `Session.refreshTokenHash`), **rotated on use**, revocable. Proposed lifetime **~30 days (PROPOSED)** (mirrors legacy consumer 30-day session).
- **Session:** server-side row per active refresh/device (revocation source of truth) — replaces in-memory `PlainRevokableAuthService`.
- **Logout:** deletes/revokes the session; refresh no longer valid.
- **Token rotation:** refresh rotation with reuse detection (proposed).
- **Password credential:** bcrypt (existing hasher). **External/social:** credential-link records (future). **Device/session tracking:** optional per-session device metadata.
- Multiple auth methods (password, OTP, social) resolve to the **same principal + session** issuance.

## 8. Target authorization architecture
Cleanly separate: **Identity** (who the principal is) · **Authentication** (proof) · **Authorization** (roles/permissions) · **Resource ownership** (tenancy scope).
- **Consumer access:** `CUSTOMER`; owns own resources; cross-tenant.
- **Merchant access:** staff role + `merchantId` scope (+ optional restaurant scope) via `Role`/`RolePermission`.
- **Admin access:** `SUPER_ADMIN` platform scope; auditable **act-as-merchant** replaces legacy `vendorAccess` impersonation.
- **Resource-level authz:** enforced by tenancy scoping (`merchantId`/`restaurantId`) + role/permission checks (the P1.6 `RolesGuard` is the seam).
- **Permission-tree enforcement is UNKNOWN in the baseline → preserved as UNKNOWN**; the detailed permission model is an **owner decision**, not invented here.

## 9. Merchant / Admin boundary (critical pre-Merchant-migration decision)
- **They are distinct** (evidence): the `portal` header enforces `superadmin↔ADMIN` and `vendor↔MERCHANT`; super-admin can impersonate a vendor (`vendorAccess`); admin login has a separate 2-step path. So admin is **not** just "a merchant."
- **Target:** `StaffMember.staffRole` distinguishes `MERCHANT_OWNER`/`MERCHANT_STAFF` (tenant-scoped by `merchantId`) from `SUPER_ADMIN` (platform-scoped, no merchant tenancy; audited act-as-merchant). This is the boundary Merchant/Location migration must rely on.

## 10. Token / session model vs P1.5 (see also §14)
- Consumer: P1.5 `User` (+ `passwordHash`, `isVerified`, `isBlocked`) and `Session` (`userId`, `refreshTokenHash`, `expiresAt`) are **sufficient** for consumer auth.
- Staff/admin: `StaffMember` has **no credential fields** and `Session` references **`User` only** → staff auth needs schema additions (see §14).

## 11. User migration strategy (FUTURE — conceptual; nothing migrated)
- **Mapping:** legacy `User` → target `User`; legacy `VendorUser` → `StaffMember` (+ `Merchant`). A person who is both consumer and staff becomes **two principals** (expected; not a conflict).
- **Duplicate identities / account linking:** same phone as both `User` and `VendorUser` is allowed across the two principal types; explicit **account linking is an owner decision**.
- **Uniqueness:** `User(phoneCountryCode,phone)` and `User.email` unique (P1.5); staff uniqueness handled on `Merchant`/`StaffMember`.
- **Passwords:** bcrypt hashes are re-verifiable, **but bcrypt compatibility ≠ identity migration**. Recommended: **staged migration + first-login credential validation** (verify against legacy hash on first login, rehash into target) for password users; **OTP users re-verify via OTP**; **forced reset** as fallback. **OWNER DECISION** on first-login vs forced-reset.
- **Sessions/tokens:** **not migrated** — users re-authenticate.
- **Account state / roles / ownership:** carry `isBlocked`/verification; map roles to target; attach staff to `Merchant`.

## 12. Cutover strategy (FUTURE — conceptual)
- **Phase 1:** legacy authentication remains authoritative (no target auth in prod).
- **Phase 2:** target Identity/auth runs in parallel behind an **anti-corruption / compatibility layer** (accepts legacy raw-header tokens where needed; translates claims) — no client change yet.
- **Phase 3:** migrate clients per surface (consumer → merchant → admin), switching to Bearer + target flows.
- **Phase 4:** retire legacy `/authentication` + `/vendorauthentication` and the shim.
- The ACL/shim is where raw-header acceptance and legacy token translation live temporarily.

## 13. Frontend implications (planning only — no frontend change)
- **Consumer web:** raw header → **Bearer**; preserve OTP/social/WhatsApp/guest flows; add refresh handling; standardize 401 behavior; keep guest browsing.
- **Merchant portal:** replace `portal` header with **role claims**; password login; add refresh/session; hard route protection by role.
- **Admin portal:** 2-step admin login; `SUPER_ADMIN` role claim; idle timeout; act-as-merchant UI (audited).
- All: consistent token storage, logout (server revoke), refresh, unauthorized handling, role/portal→role-based routing.

## 14. PostgreSQL / Prisma implications (NO change made)
- **Consumer auth: schema sufficient** (P1.5 `User` + `Session`).
- **Staff/admin auth: schema additions required (future, reviewed migration):**
  1. **Staff credentials** — `StaffMember` has no `passwordHash`/credential fields (add a field or a `Credential` table).
  2. **Staff sessions** — `Session.userId` references `User` only; staff refresh/session needs support (e.g. a polymorphic principal reference or a separate `StaffSession`).
  3. Optional: social-credential link table; per-session device metadata.
- **Impact:** these **block staff/admin authentication implementation** until a reviewed migration adds them; they do **not** block consumer authentication or this decision. **No Prisma change is made in P1.7.1A** (report only, per the rules).

## 15. Blockers
- Staff/admin auth schema additions (§14) — required before staff-auth implementation.
- Permission-tree enforcement model — UNKNOWN in baseline; owner decision required before authorization beyond role checks.
- Password/identity migration approach — owner decision.

## 16. UNKNOWNs (preserved)
- `/get-refresh-token` real client usage; hardcoded-subject path intent; missing vendor blocked-check intent; admin-secret-mismatch impact; whether any client relies on the raw-header convention long-term; exact permission enforcement.

## 17. Owner decision register

| Ref | Decision | Status |
|-----|----------|--------|
| AUTH-D1 | Unified identity, **distinct principals** (Option C) | **PROPOSED — recommended** |
| AUTH-D2 | Merchant vs Admin are **distinct** (staffRole + scope) | **PROPOSED — recommended** |
| AUTH-D3 | Token model: short JWT (Bearer) + rotating hashed refresh + server session | **PROPOSED** (lifetimes need approval) |
| AUTH-D4 | Password/identity migration: staged + first-login validation vs forced reset | **OWNER DECISION REQUIRED** |
| AUTH-D5 | External/social login migration + account linking | **OWNER DECISION REQUIRED** |
| AUTH-D6 | Permission enforcement model (beyond role checks) | **UNKNOWN → OWNER DECISION** |
| AUTH-D7 | Legacy compatibility window (raw-header shim, parallel run) | **OWNER DECISION REQUIRED** |
| AUTH-D8 | Staff credential + staff session schema additions | **BLOCKED — requires reviewed Prisma migration** |
| AUTH-D9 | Password reset in initial scope | **OWNER DECISION** |
| — | OD-11 relevance to auth | **DECIDED: none** |

## 18. Recommended next implementation step
Implement **consumer authentication first** (schema-sufficient): password + OTP-issued session/refresh on `User`, Bearer tokens, `RolesGuard` populated by a verified principal — behind a feature flag, no production cutover — pending approval of AUTH-D1/D2/D3. Defer **staff/admin authentication** until the schema additions (AUTH-D8) are approved and migrated in a dedicated reviewed step. Do **not** start Merchant/Location until AUTH-D2 (merchant/admin boundary) is confirmed.

---

**OD-11:** Authentication depends only on booleans (`isVerified`/`isBlocked`) and string roles — **OD-11 remains untouched and does not block the authentication architecture.**

**Scope honored:** no authentication implemented; no user/password/session/token migration; no schema/migration change; no other domain; no frontend change; no production/MongoDB access; no deferred repos; no guessed OD-11/owner decisions.
