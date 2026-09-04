# 12 — Gaps & Risks

Observations for the approved baseline (analysis only; **not fixed here**). Evidence cited; unresolved items marked **UNKNOWN — REQUIRES REVIEW**.

## 1. Architectural inconsistencies
- **Dual auth stacks** (`/authentication` + `/vendorauthentication`) with overlapping strategies (`src/authentication.ts`).
- **Role-/version-variant services** (`/user/*`, `/vendor/*`, `/admin/*`, `/v2/*`) instead of one resource + authorization layer (`src/services/index.ts`).
- **Unused API prefix** (`app.get("api")` not applied to routing) — effective prefix external/unknown.
- **Numeric, env-driven enums** for order/payment status/method and `t_type` (`config/default.js`) — magic numbers shared client/server.

## 2. Duplicated functionality
- **Two cart models** (`cart.model.ts` structured vs `user-cart.model.ts` legacy).
- **Restaurant duplication** (`restaurant` vs denormalized `restaurantCard`).
- **Two email providers** (SendGrid + SES) and **two SMS providers** (Twilio + MSG91).
- **Legacy + V2 flows** in the consumer app (ordering, experiences, auth UI).
- **Experience vs Event** overlap; **event ticket vs support ticket** overloaded naming.

## 3. Tightly coupled components
- **Admin + Merchant in one repo** (`amealiodashboardmvp-`), split only by hostname/`portal` header (`client/src/store/actions/authAction.js`).
- **Backend monolith** (171 models, ~155 services) with cross-service coupling and in-process crons (`src/cron.ts`).
- **Porter delivery** coupled to a **headless-browser automation + Redis queue** (`src/services/automation_delivery/porter_automation/`).

## 4. Technical debt
- Admin/merchant on **React 16**, ~4,900-line router (`client/src/store/utils/Routes.js`), per-screen `createTheme`.
- Backend `strict:false` models; duplicate model name `refund` (`refund.model.ts` + `resetSettlements.model.ts`); orphan `/waiters` service.
- Broken/inconsistent Mongoose `ref` strings and `refPath` misuse ([05](./05-DATA-MODEL.md)).
- Mixed JS/JSX, class/function components across frontends.

## 5. Undocumented / unclear behavior
- Numeric enum meanings (env-driven, values absent from source).
- Effective API URL prefix / deployment topology (no orchestration manifest in these repos).
- `MERCHANT` portal check ineffective statement (`query.role === "vendor"`).
- Guest/temp-user token issuance and expiry.
- Backing service for AI recommendations and `/restaurantInfo`.

## 6. Unclear ownership
- **Integration service** (`INTEGRATION_SERVICE_BASE_URL`) vs deferred `amealio-nestjs-backend` — same deployment? **UNKNOWN**.
- **Live-tracking socket** host ownership.
- Whether an older native "DeliveryBoy-App" (referenced in the deferred self-delivery app) was part of the baseline.

## 7. Conflicting implementations
- Consumer app: `webSocket.js` path vs `App.js` Feathers socket default path (admin app has a similar inconsistency).
- Multiple color/token systems in the consumer app; MUI v4 vs v5 across apps.
- `RedisAuthService` (Redis-backed revocation) present but **unused**; active revocation is in-process (`PlainRevokableAuthService`).

## 8. Missing tests
- Backend: `test/` present but coverage appears minimal (Mocha config); no evidence of comprehensive service/hook tests — **UNKNOWN — REQUIRES REVIEW** for true coverage.
- Frontends: CRA test setup exists; no evidence of meaningful suites. Delivery-app has some `tsx --test` tracking tests (deferred repo).
- **Risk:** low automated safety net for behavior-preserving migration.

## 9. Migration risks
- **Financial correctness** (wallet/ledger/settlement/refund/payout) is the highest-stakes area (`src/services/{wallet,settlement*,withdraw-request,refund}`).
- **Realtime + cron contracts** consumed by both frontends must be preserved during cutover.
- **ONDC** protocol surface (external micro-server, its own settlement/reconciliation).
- **Enum mapping** must be resolved before any data migration.
- **Committed secrets** in reference env files (Razorpay/Firebase/Google/MSG91/auth secrets) — rotate; never carry forward.

## 10. Data integrity risks
- No DB-level referential integrity (Mongo); broken refs; missing FKs (`address` no `user_id`; `vendorItems` no `restaurant_id`).
- Shared collections (`restaurants`, `exp_events`) with heterogeneous documents; `strict:false` fields not in schema.
- Inconsistent soft-delete (5 flag styles; some collections none) → data-loss/leak risk on migration.
- Denormalized duplicates can drift (`restaurant`/`restaurantCard`; embedded user snapshots).

## 11. External dependency risks
- **Porter browser automation** (brittle, infra-coupled).
- **ONDC micro-server**, **recommendations API**, **integration service** are **external repos not in the workspace** — hidden dependencies.
- Payment providers (Razorpay/RazorpayX) are revenue-critical single points.

> These are recorded for planning; **no remediation is performed in P1.1**. Prior consolidated risk register: `docs/migration/10-migration-risks.md`.
