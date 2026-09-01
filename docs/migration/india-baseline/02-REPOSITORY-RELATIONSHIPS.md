# 02 — Repository Relationships

How the three approved repositories interact as one platform. Evidence cited by source file.

## 1. Ownership of functionality

| Functionality | Owner repository | Evidence |
|---------------|------------------|----------|
| Domain data, APIs, business logic, realtime, jobs, integrations | `amealio-vendordashboard` | `src/services/**`, `src/models/**`, `src/app.ts` |
| Consumer/diner experience (discovery, order, seating, experiences, wallet, community) | `amealio_web_app` | `src/setup/routes-manager/index.js`, `src/screens/**` |
| Super-admin console + merchant/vendor dashboard | `amealiodashboardmvp-` | `client/src/store/utils/Routes.js`, `client/src/**` |

The frontends own **UI and journey orchestration only**; all persistence and business rules live in the backend.

## 2. How the applications communicate

- **Transport:** Feathers over **REST** and **Socket.IO**. Backend configures both in `amealio-vendordashboard/src/app.ts` (`app.configure(express.rest())`, `app.configure(socketio(...))`).
- **Consumer → backend:** `amealio_web_app/src/App.js` creates a Feathers Socket.IO client to `process.env.REACT_APP_BASE_URL`; REST via axios (`src/common/api/hooks/apiService.js`) with paths in `src/common/api/urls.js`.
- **Admin/Merchant → backend:** `amealiodashboardmvp-/client/src/App.js` creates a Feathers Socket.IO client to `serverApi` (`REACT_APP_API_URL`, `client/src/config/Keys.js`); REST via axios in action creators (`client/src/store/actions/**`).
- Both frontends attach the JWT (consumer uses a raw `Authorization` header convention; see [10](./10-AUTHENTICATION-AUTHORIZATION.md)).

## 3. Backend / API relationships

- Single backend exposes **~419 mount paths** (`src/services/index.ts`). Role-/audience-specific variants are separate services (`/user/*`, `/vendor/*`, `/admin/*`, `/merchant/*`, `/v2/*`) rather than one resource with an authorization layer.
- Consumer app consumes consumer-facing services (e.g. `user/cart`, `user-ordering`, `user/diner`, `user/experience`, `listRestaurant`); admin/merchant app consumes operator services (e.g. `ordering`, `vendor-user`, `admin/*`, `role-management`). Full inventory: [04](./04-BACKEND-API-INVENTORY.md).

## 4. Authentication relationships

- **Two auth services in one backend** (`src/authentication.ts`):
  - `/authentication` → entity `User` (consumer). Consumed by `amealio_web_app`.
  - `/vendorauthentication` → entity `VendorUser` (merchant/superadmin). Consumed by `amealiodashboardmvp-`.
- The admin/merchant app selects a **portal** by hostname and sends a `portal` header (`ADMIN`/`MERCHANT`/`ANY`) — `client/src/store/actions/authAction.js`; enforced in `src/authentication.ts`.
- Full detail: [10](./10-AUTHENTICATION-AUTHORIZATION.md).

## 5. Shared services & shared data

- **Shared backend services:** both frontends share OTP (`/send-otp`, `/verify-otp`), notifications, chat, restaurant/menu, ordering, and diner services (with role-scoped variants).
- **Shared data (same MongoDB):** consumer and operator apps read/write the **same collections** via the backend — e.g. `ordering`, `Diner`, `restaurant`, `Menu`/`vendorItems`, `Offers`, `Experience`/`Events`, `wallet`/`transactional`. Ownership of writes differs (consumer places orders; merchant transitions them). Data model: [05](./05-DATA-MODEL.md).
- **Shared realtime channels:** users, vendors, superAdmins, delivery persons (`src/channels.ts`).

## 6. Sockets / realtime

- Backend emits service events consumed by both frontends: `ordering` (`order_creation`, `order_trigger`, `pending_notification`), `diner` (`diner_creation`, `diner_trigger`, `update_location`), `expRequest` (`requestUpdate`, `popupNotif`), `event-handler`, `ticket`, `chat` — see `src/channels.ts` and service classes; consumer usage in `amealio_web_app` (`OrderTrackScreenNew.jsx`, `useTrackScreenSocket.js`), admin/merchant usage in `amealiodashboardmvp-/client` socket listeners. Detail: [09](./09-REALTIME-ASYNC.md).

## 7. External service dependencies (backend-owned)

All third-party integrations are owned by the backend (`config/default.js`, `src/common/**`, `src/services/**`): Razorpay/RazorpayX, Twilio, MSG91, SendGrid, AWS SES/S3, Firebase/FCM, Dunzo, Porter, Petpooja, ONDC micro-server, Google Maps, integration service. Frontends call third parties directly only for **client concerns** (Razorpay checkout SDK, Google Maps JS, Firebase auth, analytics). Detail: [08](./08-INTEGRATIONS.md).

## 8. Documented dependency on DEFERRED repositories

Per D-011 the deferred repos are out of baseline, but the baseline references them:
- **Live delivery tracking:** consumer app subscribes to `REACT_APP_LIVE_TRACKING_SOCKET_URL` for `locationUpdated`, and calls `REACT_APP_INTEGRATION_SERVICE_URL` for public track (`amealio_web_app` order-track). The backend calls an **integration service** (`INTEGRATION_SERVICE_BASE_URL`) to create tracking records / check availability (`src/services/ordering/*`, `usercart/*`). Whether this integration service **is** the deferred `amealio-nestjs-backend` is **UNKNOWN — REQUIRES REVIEW**.
- **Impact:** during baseline restoration, real-time GPS tracking is an **external dependency**, not an in-baseline capability.

## 9. Deployment relationships

- **Backend:** `Dockerfile` present; multi-env `start-*` scripts (`package.json`); HTTPS server code is commented (plain `app.listen`); large `.env.example` (~900+ keys).
- **Consumer:** `Dockerfile`, `server.js`; `env-cmd` multi-env build/start scripts; PM2 deploy (`deploy` script).
- **Admin/Merchant:** Express static host `server.js`; `env-cmd`/`.env.*` multi-env; PM2 deploy; local SSL cert support (`.env`).
- No repository contains an orchestration manifest tying all three together (no shared compose/k8s in these repos) — **UNKNOWN — REQUIRES REVIEW** (deployment topology is external).

## 10. Environment relationships

- All three share the environment ladder **dev/qa/uat/stage/prod/prod-us** and the `*-be.amealio.com` backend host family:
  - Consumer `.env-cmdrc` → `REACT_APP_BASE_URL` (e.g. `https://dev-be.amealio.com/`).
  - Admin/Merchant `client/.env.*` → `REACT_APP_API_URL` (e.g. `https://dev-be.amealio.com/`).
  - Backend `.env.*` → `HOST`/`PORT`/`MONGODB`/provider keys.
- `REACT_APP_COUNTRY` = `IN`/`US` exists in both frontends (India-first baseline; US artifacts deferred). Committed secrets exist in these env files (security risk — [12](./12-GAPS-RISKS.md)).

## Relationship summary

```
amealio_web_app ──(authentication, REST+socket)──┐
                                                  ├──► amealio-vendordashboard ──► MongoDB
amealiodashboardmvp- ─(vendorauthentication)──────┘         │  Redis (Porter)
    (portal: ADMIN|MERCHANT)                                └──► external providers + integration svc
                                                                  (integration svc ⇢ deferred Nest tracker?)
```
