# 01 — Reference Inventory

Read-only inventory of the reference systems that make up the current Amealio India platform. All findings are from static source analysis.

## 1. Repository ↔ role mapping

The task described four reference folders (`admin`, `merchant`, `backend`, `user-web`). The workspace physically contains **six** repositories. The mapping below reflects the observed role of each, with caveats.

| Provided label | Repository | Package | Role (observed) |
|----------------|------------|---------|------------------|
| `references/backend` | `amealio-vendordashboard` | `envisionapp` | **Primary platform backend** (FeathersJS + Express + Socket.IO + MongoDB). Despite the repo name, this is the domain API, not a frontend. |
| `references/user-web` | `amealio_web_app` | `amealio_web_app` | Consumer/diner web app (Create React App, React 18). |
| `references/admin` | `amealiodashboardmvp-` | `Amealio-Dashboard-MVP` | Super-admin console. |
| `references/merchant` | `amealiodashboardmvp-` | `Amealio-Dashboard-MVP` | Merchant/vendor dashboard. **Same repository as `admin`** — the portal is chosen at runtime by hostname (`admin` vs `merchant`) and an HTTP `portal` header. |
| *(present, unlabeled)* | `amealio-nestjs-backend` | `amealio-nestjs-backend` | Delivery-tracking API (NestJS 11 + PostgreSQL + Socket.IO). The **only** existing PostgreSQL component. |
| *(present, unlabeled)* | `amealio-self-delivery-app` | `nextjs-delivery-boy` | Delivery-boy / courier web app (Next.js 15, React 19). |

### Mapping caveats

- **`admin` and `merchant` are the same codebase.** `amealiodashboardmvp-` serves both super-admin and merchant users; there is no separate merchant frontend repository in the workspace. Whether a distinct merchant front-end is intended for the target is **`UNKNOWN — REQUIRES REVIEW`**.
- The four provided labels do not cover the **delivery tracking API** or the **self-delivery app**, both of which are present and integral to the Delivery domain. They are included in this discovery because the consumer app, merchant app, and backend all depend on them.
- Repo names are misleading: `amealio-vendordashboard` is the backend; `amealio-nestjs-backend` is only the delivery-tracking satellite, not the platform backend.

## 2. System-by-system summary

### 2.1 `amealio-vendordashboard` — Platform backend (Feathers, MongoDB)

| Attribute | Detail |
|-----------|--------|
| Framework | FeathersJS 4.5 (Express + Socket.IO), TypeScript, `tsx` runtime |
| Datastore | MongoDB via Mongoose 5; Redis (Porter automation queue only) |
| Surface | **171 Mongoose models**; **~419 service mount paths** across ~150 service modules |
| Auth | Dual: `/authentication` (consumer `User`), `/vendorauthentication` (`VendorUser`) |
| Realtime | Socket.IO channels for users, vendors, super-admins, delivery persons |
| Jobs | Node `cron` jobs (orders, diners, settlements, notifications, ONDC) started after Mongo connects |
| Role | System of record for nearly all platform entities |

### 2.2 `amealio_web_app` — Consumer web app (CRA, React 18)

| Attribute | Detail |
|-----------|--------|
| Framework | Create React App, React 18.2, React Router v6 |
| State | Redux Toolkit + redux-persist; React context for sockets |
| Backend | Feathers client + Socket.IO on `REACT_APP_BASE_URL`; a separate live-tracking socket; a recommendations API; the integration service |
| Capabilities | Discovery/home (moods, cravings, curations, AI recommendations), restaurant browse/menu, ordering (cart/checkout/track), seating/waitlist/reservation, experiences/events, ONDC buyer, wallet, community, Bytes/reels, profile |
| Auth | Phone OTP, Google/Apple/Facebook (via Firebase), WhatsApp magic-link, guest |
| Markets | `REACT_APP_COUNTRY` = `IN` / `US`; environments dev/qa/uat/stage/prod/prod-us |

### 2.3 `amealiodashboardmvp-` — Admin + Merchant portal (CRA, React 16)

| Attribute | Detail |
|-----------|--------|
| Framework | Create React App, React 16, classic Redux + thunk; Express static host (`server.js`) |
| Backend | Feathers client + Socket.IO on `REACT_APP_API_URL`, auth path `vendorauthentication` |
| Roles | `vendor` (merchant), `superadmin` (admin); portal by hostname + `portal` header |
| Merchant | Onboarding, menu/catalog, seating ops, order ops, experiences/events, staff/roles, subscriptions, settlements/withdrawals, reports |
| Admin | Vendor approval/onboarding, ONDC admin, delivery-partner (Dunzo) admin, settlements/payouts, subscriptions, staff/roles, POS, content/curation, reports, Twilio voice calling |
| Scale | Router file (`client/src/store/utils/Routes.js`) ~4,900 lines, ~400+ routes |

### 2.4 `amealio-nestjs-backend` — Delivery tracking API (NestJS, PostgreSQL)

| Attribute | Detail |
|-----------|--------|
| Framework | NestJS 11, TypeORM, Socket.IO (EIO3 compat), Passport JWT, Swagger |
| Datastore | PostgreSQL, `locations` table, `synchronize: true` |
| REST | `GET /delivery/active`, `/delivery/:driverId/current`, `/delivery/:driverId/history` (JWT-guarded) |
| WebSocket | `/tracking` namespace: inbound `updateLocation`, outbound `locationUpdated`, backed by Postgres `LISTEN/NOTIFY` |
| Auth | Verifies JWTs with `JWT_SECRET`; **issues no tokens** — trusts tokens issued by the Feathers backend |

### 2.5 `amealio-self-delivery-app` — Delivery-boy app (Next.js)

| Attribute | Detail |
|-----------|--------|
| Framework | Next.js 15, React 19, Tailwind 4, Zustand, TanStack Query, react-hook-form + zod |
| Backend | Feathers REST/Socket.IO (`NEXT_PUBLIC_API_BASE_URL`) for auth/orders; Nest tracking socket (`NEXT_PUBLIC_LOCATION_TRACKING_URL`) for GPS |
| Capabilities | OTP login (sends `portal: MERCHANT`, `deliveryPerson: true`), accept assignment, ongoing/history orders, live map tracking, online/offline toggle, FCM push |
| Auth | Feathers `otp-authentication` + JWT over socket; shares `JWT_SECRET` with the Nest tracking service |

## 3. System interaction map

```
                +---------------------------+
   Consumer --> |  amealio_web_app (React)  |---\
                +---------------------------+    \
                +---------------------------+     \   REST + Socket.IO
 Merchant/  --> | amealiodashboardmvp-      |------> +-------------------------------+
 Admin          | (admin + merchant)        |        | amealio-vendordashboard       |
                +---------------------------+   /--->|  Feathers + MongoDB (backend) |
                +---------------------------+  /      +-------------------------------+
 Driver    -->  | amealio-self-delivery-app | /            |  issues JWT   ^
                | (Next.js)                 |/             v               | delivery create/
                +------------+--------------+       +---------------------+ | availability (HTTP)
                             |  GPS (updateLocation) | Nest tracking API  | |
                             +---------------------->| PostgreSQL location|<+
                                                     +---------------------+
```

- The **Feathers backend** is the hub; all clients authenticate against it and consume its services.
- The **Nest tracking API** is a satellite: the driver app emits GPS to it; the Feathers backend calls it over HTTP (`INTEGRATION_SERVICE_BASE_URL`) to create tracking records and check delivery availability; consumer/merchant apps subscribe to a live-tracking socket for `locationUpdated`. The exact deployment relationship between `INTEGRATION_SERVICE_BASE_URL`, the live-tracking socket host, and `amealio-nestjs-backend` is **`UNKNOWN — REQUIRES REVIEW`**.

## 4. Technology summary

| Concern | Backend | Consumer web | Admin/Merchant | Delivery app | Tracking API |
|---------|---------|--------------|----------------|--------------|--------------|
| Language | TS | JS | JS | TS | TS |
| Framework | Feathers 4.5 | CRA/React 18 | CRA/React 16 | Next.js 15/React 19 | NestJS 11 |
| Data | MongoDB (Mongoose 5) | — | — | — | PostgreSQL (TypeORM) |
| State/UI | — | Redux Toolkit, MUI v5 + Bootstrap + Tailwind | Redux thunk, MUI v4 + Bootstrap 4 | Zustand, Tailwind 4 | — |
| Realtime | Socket.IO | Socket.IO client | Socket.IO client | Socket.IO client (2 hosts) | Socket.IO |

## 5. Maturity / debt signals

- Backend is a large monolith (171 models, ~419 mount paths) with inconsistent naming, duplicate model registrations, and `strict: false` schemas (see [04](./04-database-inventory.md) and [10](./10-migration-risks.md)).
- Admin/merchant portal is the oldest UI (React 16, ~4,900-line router) with the most technical debt.
- Consumer app runs parallel legacy and "V2" flows for ordering/experiences/auth.
- Delivery app and tracking API are the newest, most cohesive components.
