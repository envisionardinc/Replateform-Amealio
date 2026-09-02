# 26 — Staff/Admin Authentication & Identity Schema Design (P1.7.1C)

> **Status:** DESIGN / ANALYSIS ONLY — nothing implemented, no Prisma change, no migration, no endpoints, no data migration.
> **Purpose:** Resolve **AUTH-D8** ("what identity/auth schema is required for staff/admin?") and the remaining staff/admin identity decisions, producing an **implementation-ready** design that a later, dedicated phase can build in small reviewable steps.
> **Upstream (authoritative):** [22-IDENTITY-ANALYSIS.md](./22-IDENTITY-ANALYSIS.md), [24-AUTHENTICATION-ARCHITECTURE.md](./24-AUTHENTICATION-ARCHITECTURE.md), [25-CONSUMER-AUTHENTICATION.md](./25-CONSUMER-AUTHENTICATION.md).
> **Consumer authentication (P1.7.1B) is DONE and MUST NOT be modified or redesigned here.**

---

## 1. Executive summary

Consumer authentication (P1.7.1B) already runs on the target platform against the **existing** P1.5 `User` + `Session` tables (no schema change). Staff/admin authentication **cannot** reuse that path unchanged, for three concrete, evidence-backed reasons:

1. **No staff credential storage exists.** The target `StaffMember` model has `name/email?/phone?/staffRole/roleId?` and lifecycle timestamps — **no password/secret field** (`prisma/schema.prisma`, `model StaffMember`). Consumer credentials live on `User.passwordHash`, which staff are not.
2. **The session table is bound to consumers.** `model Session` has `userId String @db.Uuid` → `User` with `onDelete: Cascade` (`prisma/schema.prisma`). A `StaffMember` is a **different principal** and cannot own a `Session` row.
3. **SUPER_ADMIN cannot be represented.** `StaffMember.merchantId` is **`String` NOT NULL** with a required `Merchant` relation, yet `enum StaffRole` already includes `SUPER_ADMIN`. A platform admin has **no merchant** → the current model is internally inconsistent for the SUPER_ADMIN principal.

**Recommended target design (AUTH-D8 resolution):**

- **Principals** stay distinct per AUTH-D1/D2: consumer `User` (cross-tenant), `StaffMember` (tenant-scoped merchant staff), and `SUPER_ADMIN` **modelled as a `StaffMember` with `merchantId = NULL`** (platform-scoped) — not a separate table.
- **Credentials → separate `StaffCredential`** table (1 `PASSWORD` row per staff now; extensible to OTP/SSO/MFA later) — keeps secrets off the `StaffMember` entity, mirroring the consumer separation of concerns.
- **Sessions → separate `StaffSession`** table (staff FK, hashed rotating refresh, revocable, expiring) — **does not touch** the working consumer `Session`/P1.7.1B.
- **Account status → `status StaffAccountStatus` (ACTIVE, BLOCKED)** on `StaffMember` + soft-delete via `deletedAt`; blocked staff cannot log in or refresh.
- **Authorization → RBAC** on the **already-present** `Role` + `RolePermission` tables (coarse `staffRole` enum for gating + fine-grained `permissionKey` rows), scoped by merchant. The exact permission catalogue (flattened from the legacy tree) is an owner decision (**AUTH-D6**).
- **Act-as-merchant** (legacy has it) is preserved **semantically** but deferred: modelled later as an **explicit, audited** context (`StaffSession.actAsMerchantId` + `AuditLog` rows), never silently equal to a merchant login.

**Schema delta required later (NOT now):** 2 new models (`StaffCredential`, `StaffSession`), 2 new enums (`StaffAccountStatus`, `StaffCredentialType`), and 3 modifications to `StaffMember` (`merchantId` → nullable, add `status`, add `legacyId`). All additive/backward-compatible in dev. **Prisma schema unchanged in P1.7.1C.**

**AUTH-D8 outcome:** design-complete and implementation-ready; the schema itself still needs **owner approval** before the migration is authored. AUTH-D4/D6/D7/D9 remain owner decisions (recommendations below); AUTH-D5 is defer-able for staff.

---

## 2. Legacy evidence

All evidence is from the three approved India-baseline repos, inspected read-only. No source repo was modified.

### 2.1 Vendor (merchant staff) authentication — `amealio-vendordashboard`

**`VendorUser` model** (`src/models/vendor-user.model.ts`):

| Field | Type | Note |
|---|---|---|
| `email` | String (lowercased) | login identifier (vendor) |
| `password` | String | credential (bcrypt hash) |
| `role` | String | free-text role name |
| `permission` | Number | numeric permission code (opaque) |
| `country_code`, `mobile_number` | String | phone identity |
| `user_verified` | Boolean (default false) | verification flag |
| `is_deleted` | Boolean (default false) | soft-delete |
| `blocked` | object `{ isBlocked, ... }` | block state |
| `userId` | String | **admin** login identifier (see 2.2) |
| `razorpay_contect_id`, `subscription{…}` | mixed | payment/subscription concerns embedded on the identity row |
| `timestamps: true` | — | createdAt/updatedAt |

- **Password hashing:** `bcrypt` (`bcrypt.compareSync`) — see admin path `src/services/vendor-user/admin-auth.class.ts`.
- **JWT issuance / session:** Feathers `/vendorauthentication` (local + JWT strategy) mints a JWT; **no server-side refresh-session rotation** (stateless JWT; "logout" is client-side token disposal). Documented in [22](./22-IDENTITY-ANALYSIS.md)/[24](./24-AUTHENTICATION-ARCHITECTURE.md).
- **Vendor→merchant relationship:** vendor identity is tied to a merchant/restaurant via role scoping (`role-management` `vendor_id` / `restaurant_id`). A vendor operates within a single merchant context.
- **Roles / permissions:** `role-management.model.ts` — `role_name`, `isDefaultRole`, `active`, `isVendor`, and **deep boolean permission trees** `vendorPermission { … }` and `superAdminPermission { … }` (dozens of nested `active_*/inactive_*` booleans, e.g. offers/events/item availability/category/user-management). Scope keys: `vendor_id`, `restaurant_id`.
- **Portal type / portal-header behavior:** the legacy portal distinguishes vendor vs admin via **request/portal context**, not a hardened server claim. Flagged in [24](./24-AUTHENTICATION-ARCHITECTURE.md) as the "portal-header mechanism" that **must not** become the target security mechanism (AUTH-D2 boundary requirement).
- **Authorization enforcement:** where/whether the nested permission tree is actually enforced per route/action is **not provable from source** — treated as UNKNOWN.
- **Security quirks:** payment + subscription fields co-located on the identity row; opaque numeric `permission`; free-text `role`.

### 2.2 Admin authentication — `amealio-vendordashboard` (`admin-auth.class.ts`)

- Admins are **represented in the same `VendorUser` collection** (shared model), logging in with **`userId` + `pwd`** rather than email.
- **Credential check:** `bcrypt.compareSync(params?.query?.pwd, admin.password)` — same bcrypt hashes as vendor.
- **OTP second step:** on password match, a 6-digit `OTP` is generated and stored (`{ OTP, otpTime: Date.now() }`); verify step checks `OTP` + `otpTime >= now-10min`.
- **Token issuance quirk (MUST NOT PRESERVE):** after OTP verify, the admin path calls **`.service("authentication").createAccessToken(...)`** — i.e. it mints the admin token with the **consumer `authentication` service's secret**, not `vendorauthentication`. This cross-wired secret is a legacy defect, not a design to carry forward (corroborates [24](./24-AUTHENTICATION-ARCHITECTURE.md) "secret mismatch" quirk).
- **Admin/merchant separation:** only by convention (`userId` login + `superAdminPermission` tree); no distinct principal type at the schema level.
- **Act-as / impersonation:** the baseline exposes a super-admin "act as a vendor/merchant" capability (vendor-access style). It exists, but is not a hardened, audited security boundary.
- **Session behavior:** stateless JWT; no rotation/refresh-session/replay-detection.

### 2.3 Where admin/vendor is consumed — `amealiodashboardmvp-`, `amealio_web_app`

- The admin dashboard MVP and web app consume the above tokens; they confirm the portal split (admin vs vendor UIs) but add **no additional server-side identity guarantees**. No evidence of refresh rotation, permission-tree enforcement contract, or a hardened act-as audit trail.

---

## 3. Legacy behavior classification

| # | Legacy behavior | Evidence | Classification |
|---|---|---|---|
| L1 | Staff/admin login by **password (bcrypt)** | `admin-auth.class.ts` `compareSync`; `VendorUser.password` | **MUST PRESERVE SEMANTICALLY** (password login stays; hashes re-verifiable) |
| L2 | Vendor login by **email**; admin login by **`userId`** | `vendor-user.model.ts`, `admin-auth.class.ts` | **MUST PRESERVE SEMANTICALLY** (support email/phone/username login identifiers) |
| L3 | **Account block** (`blocked.isBlocked`) and **soft-delete** (`is_deleted`) | `vendor-user.model.ts` | **MUST PRESERVE SEMANTICALLY** (→ `status`/`deletedAt`) |
| L4 | **Roles + permission trees** exist (authorization intent) | `role-management.model.ts` | **MUST PRESERVE SEMANTICALLY** (intent), **MUST NOT PRESERVE** (the nested-boolean shape) |
| L5 | **Merchant scope** via `vendor_id`/`restaurant_id` | `role-management.model.ts` | **MUST PRESERVE SEMANTICALLY** (staff→merchant, future location) |
| L6 | **Super-admin act-as-merchant** capability | vendor-access path | **MUST PRESERVE SEMANTICALLY**, but re-implement as explicit/audited (deferred) |
| L7 | Admin token minted with the **consumer `authentication` secret** | `admin-auth.class.ts` | **MUST NOT PRESERVE** (security defect) |
| L8 | **Stateless JWT, no refresh rotation / no server session / no replay detection** | [22](./22-IDENTITY-ANALYSIS.md)/[24](./24-AUTHENTICATION-ARCHITECTURE.md) | **MUST NOT PRESERVE** (target uses rotating server sessions, per AUTH-D3) |
| L9 | **Opaque numeric `permission`** + free-text `role` | `vendor-user.model.ts` | **MUST NOT PRESERVE** (→ named roles + explicit permission keys) |
| L10 | Payment / subscription / razorpay fields **on the identity row** | `vendor-user.model.ts` | **MUST NOT PRESERVE** (belongs to Merchant/Billing domain, not identity) |
| L11 | **Portal-header** distinguishes admin vs vendor | [24](./24-AUTHENTICATION-ARCHITECTURE.md) | **MUST NOT PRESERVE** as a security mechanism (AUTH-D2); at most **COMPATIBILITY ONLY** during a cutover shim |
| L12 | Admin **OTP** second factor | `admin-auth.class.ts` | **UNKNOWN / OWNER DECISION** — is admin MFA in initial scope? (design keeps it possible via `StaffCredential`) |
| L13 | Exact **permission-tree enforcement per route/action** | not provable | **UNKNOWN / OWNER DECISION** (AUTH-D6) |
| L14 | Legacy JWT **claim set / issuer / audience / expiry** for staff/admin | partial | **UNKNOWN / OWNER DECISION** for any compatibility window (AUTH-D7) |

---

## 4. Target identity architecture

Per AUTH-D1 (one canonical Identity domain) and AUTH-D2 (distinct principals), the target keeps **three principal shapes** sharing **one authorization model** (`Role`/`RolePermission`) and **one token/session pattern** (Bearer JWT + rotating server-side refresh, AUTH-D3):

```
                         canonical Identity domain
   ┌──────────────────────────┬───────────────────────────┬───────────────────────────┐
   │  Consumer  (P1.7.1B DONE) │  Merchant staff           │  Platform admin           │
   │  principal: User          │  principal: StaffMember   │  principal: StaffMember    │
   │  scope: cross-tenant      │  (merchantId = <merchant>)│  (merchantId = NULL)       │
   │  creds: User.passwordHash │  (staffRole = OWNER/STAFF)│  (staffRole = SUPER_ADMIN) │
   │  session: Session(userId) │  creds: StaffCredential   │  creds: StaffCredential    │
   │                           │  session: StaffSession    │  session: StaffSession      │
   └──────────────────────────┴───────────────────────────┴───────────────────────────┘
                          shared: Role + RolePermission (authorization)
                          shared: AuditLog (act-as + security events)
```

- Access token: short-lived Bearer JWT, minimal claims incl. `actorType` (`STAFF` / `SUPER_ADMIN`) and `merchantId` where applicable.
- Refresh: rotating, server-side, hashed secret, replay-detected, revocable — the **same proven pattern** as consumer `RefreshTokenService`, but on `StaffSession`.
- Merchant/admin boundary is enforced by **server-side principal + scope**, never a client portal header (L11).

---

## 5. `StaffMember` design

`StaffMember` = the **staff identity/account**. It holds identity + tenancy + lifecycle, and **references** (does not embed) credentials, sessions, and roles.

| Field | Keep? | Notes |
|---|---|---|
| `id` (uuid PK) | ✅ exists | |
| `merchantId` (FK → Merchant) | ⚠ **change to NULLABLE** | NULL ⇒ SUPER_ADMIN (platform). NOT NULL ⇒ merchant staff. |
| `staffRole` (`StaffRole` enum) | ✅ exists | coarse principal gate: `MERCHANT_OWNER` / `MERCHANT_STAFF` / `SUPER_ADMIN` |
| `roleId` (FK → Role, nullable) | ✅ exists | fine-grained RBAC role |
| `status` (`StaffAccountStatus`) | ➕ **add** | ACTIVE / BLOCKED (see §11) |
| `name` | ✅ exists | display name |
| `email` (nullable) | ✅ exists | login identifier (vendor path) |
| `phone` (nullable) | ✅ exists | login identifier (phone path) |
| `legacyId` (nullable, unique) | ➕ **add** | maps to legacy `VendorUser._id`/`userId` for controlled import/audit; no hash copied |
| `createdAt` / `updatedAt` / `deletedAt` | ✅ exists | lifecycle / soft-delete (DELETED) |

**Attribute placement rationale (what belongs where):**

- **`StaffMember`** — identity + tenancy + lifecycle: `merchantId?`, `staffRole`, `roleId?`, `status`, `name`, `email?`, `phone?`, `legacyId?`, timestamps. *Why:* stable identity that other domains reference; must never carry secrets.
- **`StaffCredential`** — secrets only: `secretHash`, credential `type`. *Why:* isolate sensitive material; supports rotation and multiple methods without touching identity (mirrors consumer separation).
- **`StaffSession`** — live auth sessions: hashed refresh, expiry, revocation, (future) act-as context. *Why:* volatile, revocable, high-churn; distinct lifecycle from identity.
- **`Role` / `RolePermission`** — authorization definitions shared across staff. *Why:* many staff → one role; permissions are policy, not identity.
- **`Merchant`** — tenant/business data (payments, subscription, restaurants). *Why:* remove L10 concerns from the identity row.

**Do not copy `VendorUser` verbatim:** drop `permission:Number`, free-text `role`, `razorpay_*`, `subscription`, `user_verified` (folded into `status`) from the identity row.

---

## 6. Credential design

**Option A — embed on `StaffMember`** (`passwordHash String?`): smallest possible; matches consumer `User.passwordHash`. But locks staff into one method, forces schema change to add OTP/SSO/MFA, and mixes secrets into the identity row read by many callers.

**Option B — separate `StaffCredential`** (recommended): 1..N credentials per staff, one per `type`.

```
StaffCredential
  id             uuid PK
  staffMemberId  uuid FK → StaffMember (onDelete Cascade)
  type           StaffCredentialType   // PASSWORD (now); OTP/SSO/SOCIAL/MFA (future)
  secretHash     String                // bcrypt for PASSWORD; never plaintext
  createdAt / updatedAt
  @@unique([staffMemberId, type])
```

**Recommendation: Option B.** It is only marginally larger than A but (a) keeps secrets off the widely-read identity row, (b) supports the admin OTP path (L12) and future SSO/MFA **without a later identity-table migration**, and (c) is the natural home for per-method rotation. **Required now:** exactly one `PASSWORD` credential per staff. **Future:** additional rows for OTP/SSO/MFA — *designed for, not built.*

---

## 7. Session design

**Option A — generalize the existing `Session`** to a polymorphic principal (`principalType` + `principalId`, drop the hard `User` FK). **Rejected:** it would modify the table P1.7.1B depends on, weaken the consumer `userId` foreign key + cascade, and risk regressing already-shipped consumer auth (explicitly out of scope to modify).

**Option B — separate `StaffSession`** (recommended):

```
StaffSession
  id                uuid PK
  staffMemberId     uuid FK → StaffMember (onDelete Cascade)
  refreshTokenHash  String @unique       // sha256 of rotating secret (same scheme as consumer)
  expiresAt         DateTime
  createdAt         DateTime
  actAsMerchantId   uuid? FK → Merchant  // FUTURE: SUPER_ADMIN act-as context (nullable)
  @@index([staffMemberId]) @@index([expiresAt])
```

**Recommendation: Option B.** It is purely **additive** (consumer `Session` untouched → P1.7.1B safe), keeps clean principal boundaries (a staff session cannot masquerade as a consumer session), and gives a home for the staff-specific **act-as** context. It reuses the **exact** proven consumer mechanics — rotation, sha256-hashed secret, replay detection, revocation, expiry — just keyed to `StaffMember`.

---

## 8. Role / permission design

**Legacy:** free-text `role` + opaque numeric `permission` on the identity, plus a deep boolean tree (`vendorPermission`/`superAdminPermission`) in `role-management`. Enforcement per route/action is **UNKNOWN** (not provable from source).

**Target (recommended): RBAC + explicit permission keys** on the **already-present** tables:

- `Role` (`merchantId?`, `name`, `scope` `MERCHANT|ADMIN`, `isDefault`) — a named role, merchant-scoped or platform (`ADMIN`) scoped.
- `RolePermission` (`roleId`, `permissionKey`, `allowed`) — flattens the legacy nested booleans into stable string keys (e.g. `offers.offline.activate`, `menu.category.deactivate`, `staff.manage`).
- `StaffMember.staffRole` (coarse enum) provides fast principal gating (owner vs staff vs super-admin) independent of the fine-grained catalogue.

So the model is **RBAC (roles) + permission keys**, scoped by merchant, with a coarse principal enum on top. **No hierarchical permission tree** — the legacy tree is *flattened*, not reproduced.

- *What the legacy system does:* stores a nested permission tree; enforcement location UNKNOWN.
- *What the target should do:* define an explicit, enumerable permission catalogue and enforce it in guards, scoped to the principal's merchant.
- The **exact catalogue** (which keys, defaults per role) is **AUTH-D6 (owner decision)**. The **schema is already sufficient** — no new authorization tables required now.

---

## 9. Merchant scope design

Target relationship: `StaffMember → Merchant` (single merchant), with **future** location granularity via `Role.merchantId` (present) — location scope can later be layered without new identity tables.

- **Merchant-wide access:** supported now (staff bound to one `merchantId`; role governs actions).
- **Location-specific access:** **future** — no `Location` tables introduced here; `Role` is already merchant-scoped and can be extended (e.g. a future `restaurantId` on role/assignment). Merchant/Location domain migration is **not** started.
- **Multiple merchants per staff:** **not supported** — no source evidence a `VendorUser` spans merchants; a single `merchantId` (nullable for SUPER_ADMIN) is the minimal correct model. Multi-merchant would need a join table and is explicitly out of scope.

---

## 10. SUPER_ADMIN design

**Option A — `StaffMember` with `merchantId = NULL`** (recommended). **Option B — separate `PlatformAdmin` table.** **Option C — reuse consumer `User`** (rejected: violates AUTH-D2 principal distinction).

**Recommendation: Option A.** The schema already carries `SUPER_ADMIN` in `enum StaffRole`; the only blocker is that `merchantId` is NOT NULL. Making `merchantId` nullable lets a platform admin be a `StaffMember` with `merchantId = NULL` + `staffRole = SUPER_ADMIN`, preserving the conceptual distinction **Consumer ≠ Merchant Staff ≠ Platform Admin** (via principal type + scope, not a duplicate auth stack). Option B would duplicate credential/session/guard plumbing for little gain.

**Act-as boundary (conceptual, not implemented):**

```
Normal identity:   StaffMember{ staffRole: SUPER_ADMIN, merchantId: NULL }
Act-as context:    effective merchantId = <target>  (explicit, time-bounded, audited)
                   → StaffSession.actAsMerchantId = <target>   (future)
                   → AuditLog row: action="act_as.start", actorId=<admin>, targetType="Merchant", targetId=<merchant>, reason=?
```

A SUPER_ADMIN acting as a merchant is **never** silently equal to a merchant login — it is an explicit, audited elevation. See §14. **Not implemented here.**

---

## 11. Account lifecycle

**Enum `StaffAccountStatus` = { ACTIVE, BLOCKED }** on `StaffMember`, plus **`deletedAt`** for the DELETED state (consistent with the model-wide soft-delete convention).

- **ACTIVE** — default; may authenticate/refresh.
- **BLOCKED** — evidenced by legacy `blocked.isBlocked`; **cannot log in or refresh** (checked at login AND at every refresh rotation, matching the consumer blocked-check in P1.7.1B).
- **DELETED** — via `deletedAt` (evidenced by legacy `is_deleted`); excluded from auth.
- **DISABLED** — *not adopted now* (no distinct legacy evidence separating it from BLOCKED). Flagged as an **open question**; can be added later if the owner needs an admin-initiated deactivation distinct from a security block. Not invented speculatively.

**Placement:** status lives on **`StaffMember`** (the identity), because blocking/deletion is an account-level fact enforced across all credentials and sessions. Credentials/sessions do not each carry status; revoking sessions is a separate action (delete `StaffSession` rows), and a blocked account is rejected regardless of session validity.

---

## 12. Password migration strategy

- **Algorithm:** legacy uses **bcrypt** (`bcrypt.compareSync`); the target already uses `bcryptjs` for consumers (P1.7.1B) — **hash-compatible**.
- **Feasibility:** legacy bcrypt hashes **can be validated** in the target without plaintext. Hashes could, in principle, be imported into `StaffCredential.secretHash`.
- **But bcrypt compatibility ≠ identity migration.** Importing hashes still requires deciding *which* legacy identities become staff, mapping merchants, roles, and status.

**Recommendation:** **staged first-login validation** for staff/admin:
1. Import staff **identities** (not necessarily secrets) with `legacyId`, merchant mapping, role, status.
2. On first target login, validate against the (optionally imported) legacy bcrypt hash; on success **re-hash** with the target policy into `StaffCredential(type=PASSWORD)`.
3. **Forced password reset** as the fallback where hashes are not imported or fail policy.

**Do NOT** migrate passwords or copy hashes in this phase. The choice between "import hashes + first-login rehash" vs "forced reset for all staff" is **AUTH-D4 (owner decision)**.

---

## 13. JWT migration strategy

Legacy staff/admin JWTs are unsafe to accept as-is: admin tokens are minted with the **consumer `authentication` secret** (L7), staff use `vendorauthentication`, and the claim set/issuer/audience/expiry are inconsistent and partly unknown (L14). The target token model (AUTH-D3) is deliberately different (short TTL, minimal claims, `actorType`, merchant scope).

**Recommendation:** **hard cutover + staged first-login transition** — do **not** accept legacy staff/admin tokens in the target. If a transition window is unavoidable, permit at most a narrow **anti-corruption adapter** at the edge that exchanges a legacy session for a target login (never trusting the legacy secret/claims directly). The unsafe cross-wired-secret behavior is **not** preserved for convenience. Whether any compatibility window is needed is **AUTH-D7 (owner decision)**.

---

## 14. Act-as-merchant security model

The legacy system **does** support super-admin acting as a merchant (L6), so this is a **preserve-semantically** capability — but re-modelled as an explicit, auditable elevation. **Nothing is implemented here.** If/when built, it must represent:

| Concept | Representation (future) |
|---|---|
| Actor identity | `StaffMember` (SUPER_ADMIN) — the real principal in the JWT `sub` |
| Effective identity / scope | `effectiveMerchantId` — carried as a **distinct** token claim + `StaffSession.actAsMerchantId`, never overwriting `sub` |
| Reason | `AuditLog.reason` |
| Timestamp | `AuditLog.createdAt` (start/stop) |
| Audit event | `AuditLog` rows: `act_as.start` / `act_as.stop` (actor, target Merchant, reason, metadata) — **reuses the existing `AuditLog` model** |
| Session/token context | act-as is bounded to a session/token; ending it (or revoking the `StaffSession`) drops merchant scope |

**Rules:** act-as is never silently equal to a normal merchant login; the token must always reveal both the real actor and the effective merchant; every act-as start/stop is audited. **No tables or code created here** — `AuditLog` already exists; `StaffSession.actAsMerchantId` is a nullable field reserved for the future implementation.

---

## 15. AUTH-D decision status

| ID | Question | Prior status ([24](./24-AUTHENTICATION-ARCHITECTURE.md)) | P1.7.1C outcome |
|---|---|---|---|
| **AUTH-D1** | Unified identity, distinct principals | PROPOSED — recommended | **RESOLVED / APPROVED** (authoritative input). No change. |
| **AUTH-D2** | Merchant vs Admin distinct (role + scope) | PROPOSED — recommended | **RESOLVED / APPROVED**. Realized via `staffRole` + nullable `merchantId`. |
| **AUTH-D3** | Token model (short JWT + rotating hashed refresh + server session) | PROPOSED (lifetimes need approval) | **RESOLVED / APPROVED** (pattern). Applied to `StaffSession`. Lifetimes still owner-tunable (reuse consumer env pattern). |
| **AUTH-D4** | Password/identity migration: staged first-login vs forced reset | OWNER DECISION REQUIRED | **UNRESOLVED — recommend staged first-login validation + forced-reset fallback.** Blocks staff *data migration*, **not** staff-auth implementation (new staff can be created). |
| **AUTH-D5** | External/social login migration + account linking | OWNER DECISION REQUIRED | **UNRESOLVED — defer for staff** (no staff social login in baseline). Not blocking. |
| **AUTH-D6** | Permission enforcement model / catalogue | UNKNOWN → OWNER DECISION | **UNRESOLVED — recommend RBAC + explicit `RolePermission` keys, merchant-scoped.** Schema sufficient; the *catalogue* blocks fine-grained authz, **not** staff login. |
| **AUTH-D7** | Legacy compatibility window / token shim | OWNER DECISION REQUIRED | **UNRESOLVED — recommend hard cutover + staged first-login; no legacy-token acceptance.** Not blocking staff-auth build. |
| **AUTH-D8** | Staff credential + staff session schema additions | BLOCKED — requires reviewed Prisma migration | **DESIGN COMPLETE (this doc) — awaiting owner approval of the schema before the migration is authored.** See §16. |
| **AUTH-D9** | Password reset in initial staff scope | OWNER DECISION | **UNRESOLVED — recommend NOT in the first staff-auth slice** (align with consumer, add later). Not blocking core login. |

No decision is made silently: AUTH-D4/D6/D7/D9 remain **owner decisions** with recommendations above; AUTH-D8 is design-complete pending schema sign-off.

---

## 16. Proposed PostgreSQL schema

ASCII relationship view:

```
Merchant (exists) ─────────────┐
   ▲ (nullable)                │
   │                           │
StaffMember (MODIFY)           │
  id (uuid PK)                 │
  merchantId? ── FK ───────────┘   NULL ⇒ SUPER_ADMIN (platform)
  staffRole (enum)                 roleId? ── FK ──► Role (exists)
  status (enum NEW)                                    └─► RolePermission (exists)
  name, email?, phone?
  legacyId? (unique NEW)
  createdAt/updatedAt/deletedAt
     ├──1:N──► StaffCredential (NEW)      one PASSWORD row now
     │            id, staffMemberId FK, type(enum NEW), secretHash, ts
     │            @@unique(staffMemberId, type)
     └──1:N──► StaffSession (NEW)         rotating hashed refresh
                  id, staffMemberId FK, refreshTokenHash UNIQUE,
                  expiresAt, createdAt, actAsMerchantId? (FK→Merchant, FUTURE)

AuditLog (exists) ◄── act-as + security events (no change needed)
```

**REQUIRED NOW (to support staff/admin auth):**

| Entity | Purpose | Key fields | PK | FKs | Unique | Lifecycle | Security |
|---|---|---|---|---|---|---|---|
| `StaffMember` *(modify)* | staff/admin identity + tenancy | `merchantId?`, `staffRole`, `roleId?`, `status`, `name`, `email?`, `phone?`, `legacyId?` | `id` uuid | `merchantId→Merchant`, `roleId→Role` | `legacyId`; (login-id uniqueness — see open q.) | `createdAt/updatedAt/deletedAt` | no secrets on this row; nullable tenancy = platform admin |
| `StaffCredential` *(new)* | secret storage per method | `type`, `secretHash` | `id` uuid | `staffMemberId→StaffMember` (Cascade) | `(staffMemberId,type)` | `createdAt/updatedAt` | hash only; never returned to clients |
| `StaffSession` *(new)* | rotating refresh session | `refreshTokenHash`, `expiresAt`, `actAsMerchantId?` | `id` uuid | `staffMemberId→StaffMember` (Cascade); `actAsMerchantId→Merchant` (future) | `refreshTokenHash` | `createdAt`, `expiresAt` | sha256 hash; revoke by delete; replay-detected |
| `enum StaffAccountStatus` *(new)* | account state | `ACTIVE`, `BLOCKED` | — | — | — | — | blocked ⇒ no login/refresh |
| `enum StaffCredentialType` *(new)* | credential method | `PASSWORD` | — | — | — | — | extensible |

**FUTURE EXTENSION (designed for, not added now):** `StaffCredentialType` values `OTP`/`SSO`/`SOCIAL`/`MFA`; `StaffSession.actAsMerchantId` usage + act-as `AuditLog` conventions; `StaffAccountStatus.DISABLED`; location-scoped roles; multi-merchant staff join table. **None** are added speculatively in the required-now set.

**Reused as-is (no change):** `Role`, `RolePermission`, `Merchant`, `AuditLog`, and the consumer `User`/`Session`.

---

## 17. Prisma impact

*(Description of what a **future** phase would change in `prisma/schema.prisma`. No change is made in P1.7.1C.)*

- **Models to add:** `StaffCredential`, `StaffSession`.
- **Models to modify:** `StaffMember` — `merchantId String @db.Uuid` → `String? @db.Uuid` (+ relation optional); add `status StaffAccountStatus @default(ACTIVE)`; add `legacyId String? @unique`; add back-relations `credentials StaffCredential[]` and `sessions StaffSession[]`.
- **Relationships to add:** `StaffCredential.staffMember` (Cascade), `StaffSession.staffMember` (Cascade), optional `StaffSession.actAsMerchant` (future).
- **Enums to add:** `StaffAccountStatus { ACTIVE, BLOCKED }`, `StaffCredentialType { PASSWORD }`.
- **Indexes/constraints:** `@@unique([staffMemberId, type])` on `StaffCredential`; `refreshTokenHash @unique`, `@@index([staffMemberId])`, `@@index([expiresAt])` on `StaffSession`; consider `@@index([status])` and a login-identifier uniqueness strategy on `StaffMember`.
- **Migration risks:** making `merchantId` nullable is **backward-compatible** (existing seed staff keep their merchant). New tables/enums are additive. Main risk is the **login-identifier uniqueness** decision (email/phone/userId uniqueness scope — global vs per-merchant) → tie to AUTH-D6/open questions before writing the migration. No destructive change; migration is reviewable and reversible (drop new tables/columns).

> **Prisma schema unchanged in P1.7.1C.** (Verified in §21.)

---

## 18. Future implementation sequence

Recommended order (each step: scope · dependencies · tests · rollback). This **reorders** the sample list so schema lands once and auth is built bottom-up.

1. **Owner approvals** — AUTH-D8 schema sign-off (+ decide AUTH-D4/D6/D7/D9). *Dep:* this doc. *Rollback:* n/a.
2. **Schema migration** — add `StaffCredential`/`StaffSession`/enums; modify `StaffMember`. *Dep:* 1. *Tests:* `prisma migrate`, `db:validate`, existing suite green. *Rollback:* drop new tables/columns (additive).
3. **Domain/ports + repositories** — `StaffMemberRepository`, `StaffCredentialRepository`, `StaffSessionRepository` (Prisma adapters). *Dep:* 2. *Tests:* repo unit tests. *Rollback:* remove modules (no HTTP surface yet).
4. **Staff credential + session services** — bcrypt verify/rehash; rotating hashed refresh + replay detection (reuse consumer pattern). *Dep:* 3. *Tests:* unit (rotate/replay/expiry/revoke). *Rollback:* remove services.
5. **Staff login** — email/phone/userId + password; `status=BLOCKED`/`deletedAt` rejection; issue Bearer JWT (`actorType`, `merchantId?`). *Dep:* 4. *Tests:* login happy/invalid/blocked/disabled. *Rollback:* feature-flag off.
6. **Staff refresh + logout** — `StaffSession` rotation/replay/revocation. *Dep:* 5. *Tests:* refresh rotate/replay/revoked/expired. *Rollback:* flag off.
7. **Staff JWT guard + principal** — populate principal (`staffMemberId`, `actorType`, `merchantId?`, roles). *Dep:* 5. *Tests:* guard accept/reject. *Rollback:* remove guard from routes.
8. **Merchant scope enforcement** — deny cross-merchant access using `principal.merchantId`. *Dep:* 7. *Tests:* unauthorized-merchant-access. *Rollback:* relax guard.
9. **RBAC / permission enforcement** — `RolePermission` keys (after AUTH-D6 catalogue). *Dep:* 8 + AUTH-D6. *Tests:* role/permission authz. *Rollback:* fall back to coarse `staffRole`.
10. **SUPER_ADMIN authentication** — same staff flow with `merchantId = NULL`. *Dep:* 5–9. *Tests:* SUPER_ADMIN login + platform scope. *Rollback:* flag off.
11. **Act-as-merchant (audited)** — `StaffSession.actAsMerchantId` + `AuditLog`; explicit start/stop. *Dep:* 10. *Tests:* act-as audit boundary. *Rollback:* flag off (last, optional).
12. **Controlled staff identity import + cutover** — per AUTH-D4/D7. *Dep:* all above. *Rollback:* keep legacy portal until verified.

Feature-flag staff auth (e.g. `STAFF_AUTH_ENABLED`) exactly like `CONSUMER_AUTH_ENABLED`, so every step is dark-shippable and reversible.

---

## 19. Test strategy

*(Future tests — not written now.)* Unit + e2e coverage for: staff registration/import path · login (happy) · invalid credentials · **blocked** account · disabled/deleted account · JWT validation (valid/expired/tampered/wrong-secret) · merchant scope (in-scope allow / cross-merchant deny) · role authorization · permission-key authorization · refresh rotation · **refresh replay** (revoke on reuse) · logout · revoked session · expired session · **SUPER_ADMIN** login + platform scope · unauthorized merchant access by staff · **act-as audit boundary** (actor≠effective, audit rows emitted, scope drops on stop). Mirror the consumer suites (`consumer-auth.e2e-spec.ts`, `refresh-token.service.spec.ts`) for parity.

---

## 20. Risks

- **R1 — SUPER_ADMIN modelling.** Nullable `merchantId` requires every merchant-scoped query/guard to handle NULL correctly (a NULL-merchant staff must not accidentally pass a merchant filter). *Mitigation:* explicit `actorType=SUPER_ADMIN` gate + tests.
- **R2 — Login-identifier uniqueness.** Legacy allows email (vendor) and `userId` (admin); target must decide global vs per-merchant uniqueness for email/phone. *Mitigation:* resolve before migration (open question O1).
- **R3 — Permission catalogue drift.** Flattening the legacy tree risks missing enforced permissions (enforcement UNKNOWN). *Mitigation:* AUTH-D6 catalogue review with owner; start coarse, refine.
- **R4 — Legacy token/secret defects.** Accepting legacy tokens would import the cross-wired-secret defect (L7). *Mitigation:* hard cutover (AUTH-D7); no legacy-token acceptance.
- **R5 — Act-as misuse.** If act-as is later built without strict audit, it becomes a silent privilege-escalation path. *Mitigation:* mandatory `AuditLog` + distinct effective-scope claim; ship last, flagged.
- **R6 — Scope creep into Merchant/Billing.** Legacy identity row carried payment/subscription (L10); tempting to port. *Mitigation:* keep those out of identity; Merchant/Location not started here.

---

## 21. Open questions

- **O1 (→ AUTH-D6/migration):** Login-identifier uniqueness scope — is `email`/`phone` globally unique across staff, or per-merchant? Does admin `userId` become `email`/`username`?
- **O2 (→ AUTH-D9):** Is staff/admin **password reset** in the first slice, or deferred (as with consumers)?
- **O3 (→ AUTH-D12? new):** Is admin **OTP/MFA** (legacy L12) required at cutover, or a later `StaffCredential` addition?
- **O4 (status):** Is a distinct **DISABLED** state needed (admin-deactivated ≠ security-blocked), or is BLOCKED + `deletedAt` sufficient?
- **O5 (act-as):** Confirm the exact act-as audit fields and whether effective-merchant is a token claim, a session field, or both.
- **O6 (AUTH-D4):** Import legacy bcrypt hashes for first-login rehash, or force reset for all staff?

---

## 22. Explicit non-goals

This phase does **NOT**: implement staff/admin authentication · modify `prisma/schema.prisma` · create migrations · add endpoints/controllers/guards/services · modify consumer auth (P1.7.1B) · modify any frontend · migrate data or copy password hashes · start Merchant/Location or any other business domain · introduce `Location`/multi-merchant tables · implement act-as/impersonation · accept legacy tokens · touch production config/credentials · import from deferred repositories.

---

## 23. P1.7.1C completion criteria

- ✅ Legacy vendor + admin auth re-inspected with file-cited evidence and classified.
- ✅ Target `StaffMember`/credential/session/role/scope/SUPER_ADMIN/status/act-as designs specified.
- ✅ Password + JWT migration strategies recommended (owner decisions flagged).
- ✅ **AUTH-D8** resolved as an implementation-ready design; AUTH-D4/D5/D6/D7/D9 status recorded with recommendations.
- ✅ Conceptual PostgreSQL schema (REQUIRED NOW vs FUTURE) + precise Prisma impact documented.
- ✅ Future implementation sequence + test strategy defined.
- ✅ **No implementation, no schema change, no migration** — verified; `prisma/schema.prisma` and all migrations unchanged.
- ✅ Deliverable committed; status + hub updated (not marked "implementation complete").
