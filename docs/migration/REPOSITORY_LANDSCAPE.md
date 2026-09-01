# Repository Landscape (P0.2)

Read-only inventory and classification of **every repository currently available**, to determine which repositories collectively represent the existing Amealio **India** platform and which contain additional/feature capabilities.

> This analysis does **not** make the final India-baseline determination (blocker **B1**). It presents evidence and a comparison for stakeholder decision. No code was copied, merged, modified, or implemented. All findings are from static, read-only inspection.

- **Date:** 2026-09-01
- **Repositories inspected:** 6 (5 reference/source + 1 target)
- **Related:** [SOURCE_REPOSITORIES.md](./SOURCE_REPOSITORIES.md), discovery [01–10](./README.md), [MIGRATION_STATUS.md](./MIGRATION_STATUS.md)

## Classification legend

| Code | Meaning |
|------|---------|
| A | INDIA BASELINE CANDIDATE — appears to be part of the core India platform |
| B | INDIA BASELINE SUPPORTING REPOSITORY — depended on by the baseline, satellite/adjacent |
| C | FEATURE SOURCE — contains additional capabilities to introduce later |
| D | SHARED / CROSS-CUTTING SOURCE |
| E | LEGACY / DEPRECATED |
| F | UNKNOWN — NEEDS REVIEW |
| — | TARGET (this repository; not a source) |

> Codes are an **analytical proposal**, not the final baseline decision. Several repos carry a primary + secondary code where their role is genuinely ambiguous.

## At-a-glance

| Repository | Role (observed) | Branch @ commit | Commits | Proposed class |
|------------|-----------------|-----------------|---------|----------------|
| `amealio-vendordashboard` | Platform backend (Feathers + MongoDB) | `main` @ `ee674aa57` | 392 | **A** |
| `amealio_web_app` | Consumer web (CRA/React 18) | `main` @ `117f3f6a` | 1909 | **A** |
| `amealiodashboardmvp-` | Admin + Merchant portal (CRA/React 16) | `main` @ `2e09b25d4` | 9081 | **A** |
| `amealio-nestjs-backend` | Delivery tracking API (NestJS + PostgreSQL) | `main` @ `104303d` | 10 | **B** (or C) |
| `amealio-self-delivery-app` | Delivery-boy app (Next.js) | `main` @ `6e3daa7` | 46 | **B** (or C) |
| `replateform-amealio` | **Target platform** (docs only) | `cursor/…-a8e0` | 6 | — |

---

## Per-repository inventory (30-point)

### 1) `amealio-vendordashboard` — Platform backend  · Proposed class: **A**

| # | Field | Finding |
|---|-------|---------|
| 1 | Name | `amealio-vendordashboard` (package `envisionapp`) |
| 2 | Path | `/agent/repos/amealio-vendordashboard` |
| 3 | Branch / commit | `main` @ `ee674aa57` (2026-08-31) · 392 commits |
| 4 | Framework / language | FeathersJS 4.5 (Express + Socket.IO), TypeScript, `tsx` runtime |
| 5 | Frontend app(s) | None (API only) |
| 6 | Backend/API app(s) | The platform domain API — ~419 service mount paths |
| 7 | Database | **MongoDB** (Mongoose 5); Redis (Porter automation queue only) |
| 8 | Major entities/collections | **171 Mongoose models**: `User`, `VendorUser`, `restaurant`, `Menu`, `vendorItems`, `ordering`, `cart`, `transactional`, `wallet`, `settlement`, `Diner`, `Experience`, `Events`, `Offers`, delivery (`deliveries`, `deliverypersons`, Dunzo/Porter), ONDC (15), notifications, etc. |
| 9 | Business domains | All 17 (Identity, Merchant, Location, Catalog, Menu, Customer, Order, Payment, Delivery, Reservation, Celebration, Promotion, Ticketing, Seating, Notification, Reporting, Administration) |
| 10 | Authentication | **Dual**: `/authentication` (consumer `User`), `/vendorauthentication` (`VendorUser`); jwt/local/phone/facebook + OTP/social/WhatsApp/guest; issues JWTs consumed by all clients |
| 11 | Payments | Razorpay + RazorpayX; wallet/ledger (`transactional`); settlements/payouts; refunds; scan-and-pay / direct merchant |
| 12 | Restaurant | Full: `restaurant` (geo, hours, chains, features), search/discovery, availability |
| 13 | Dining | Diner/seating + reservation services; session automation |
| 14 | Orders | Carts + `ordering` lifecycle (all channels), merchant/admin order ops |
| 15 | Reservations | `Diner` with `service_type=RESERVATION`; reservation blocks |
| 16 | Celebrations | Experiences (`Experience`/`expRequest`) + events (`Events`/`eventHandler`) |
| 17 | Events | Vendor events, RSVP, nested table/floor setup |
| 18 | Ticketing | Event tickets (`ticket`) + support (`issues`, `help-and-faq`) |
| 19 | Seating | `Diner` `SEATING` (walk-in/waitlist), tables, geo check-in |
| 20 | Commerce | Ordering, offers, subscriptions, catering, donations, ONDC |
| 21 | Promotions | Offers/coupons, referral programs, rewards, promo videos |
| 22 | Notifications | Push (FCM), SMS (Twilio+MSG91), email (SendGrid+SES), WhatsApp, in-app; template crons |
| 23 | AI/personalization | `/restaurantInfo` (AI info) present; recommendations engine is **external** (`UNKNOWN — REQUIRES REVIEW`) |
| 24 | Restaurant integrations | **Petpooja POS** (`/pos/*`), menu/order sync |
| 25 | Delivery integrations | **Dunzo**, **Porter** (API + headless-browser automation), self-delivery; integration service (delivery create/availability) |
| 26 | Admin | Extensive `/admin/*` and `/superadmin/*` operations, RBAC, ONDC admin |
| 27 | Background jobs | `cron.ts` + `ondc.cron.ts`: orders, diners, settlements, notifications, ratings, wallet reset, ONDC |
| 28 | Webhooks | Razorpay, Dunzo, Petpooja, ONDC protocol callbacks |
| 29 | External services | Razorpay/RazorpayX, Twilio, MSG91, SendGrid, AWS SES/S3, Firebase/FCM, Dunzo, Porter, Petpooja, ONDC micro-server, Google Maps, Rebrandly, integration service |
| 30 | Deployment | Multi-env start scripts; `docker-compose.yml` absent; large `.env.example` (~900+ keys); `Dockerfile` present. HTTPS server code commented (plain listen) |

**Rationale for class A:** system of record and domain API for the India platform; every other client depends on it.

---

### 2) `amealio_web_app` — Consumer web  · Proposed class: **A**

| # | Field | Finding |
|---|-------|---------|
| 1 | Name | `amealio_web_app` |
| 2 | Path | `/agent/repos/amealio_web_app` |
| 3 | Branch / commit | `main` @ `117f3f6a` (2026-08-31) · 1909 commits |
| 4 | Framework / language | Create React App, React 18.2, JavaScript, React Router v6 |
| 5 | Frontend app(s) | Consumer/diner SPA |
| 6 | Backend/API | None (client of Feathers backend) |
| 7 | Database | None (client) |
| 8 | Entities | N/A (consumes backend services) |
| 9 | Business domains | Customer-facing: discovery, restaurant, order, seating, reservation, experiences/events, ONDC buyer, wallet, community, media |
| 10 | Authentication | Phone OTP, Google/Apple/Facebook (Firebase), WhatsApp magic-link, guest; Feathers `authentication` |
| 11 | Payments | Razorpay (`react-razorpay`), wallet, direct merchant; **US Stripe referenced in localization only, no code** |
| 12 | Restaurant | Browse, search, menu, details, reviews |
| 13 | Dining | Seating/waitlist screens |
| 14 | Orders | Cart/checkout/track (legacy + V1 flows) |
| 15 | Reservations | Reservation request + track |
| 16 | Celebrations | Experience booking flows |
| 17 | Events | Events/occasions screens |
| 18 | Ticketing | Experience/event booking (no standalone ticketing UI) |
| 19 | Seating | Waitlist/reservation UI + live track |
| 20 | Commerce | Ordering, experiences, ONDC buyer, wallet |
| 21 | Promotions | Offers/coupons in cart; favourites |
| 22 | Notifications | FCM push, in-app |
| 23 | AI/personalization | Home moods/cravings/curations + **recommendations API** (`REACT_APP_RECOMMENDATIONS_API_*`, external) |
| 24 | Restaurant integrations | Via backend only |
| 25 | Delivery integrations | Live-tracking socket (`REACT_APP_LIVE_TRACKING_SOCKET_URL`), integration-service public track |
| 26 | Admin | None |
| 27 | Background jobs | None |
| 28 | Webhooks | None (payment handled client+backend) |
| 29 | External services | Razorpay, Google Maps, PostHog, GA4, Meta Pixel, Firebase, IP geo, recommendations API |
| 30 | Deployment | `env-cmd` multi-env (dev/qa/uat/stage/prod/**prod-us**); `Dockerfile`, `server.js`; `REACT_APP_COUNTRY` IN/US |

**Rationale for class A:** the India consumer surface; primary end-user app for the India platform.

---

### 3) `amealiodashboardmvp-` — Admin + Merchant portal  · Proposed class: **A**

| # | Field | Finding |
|---|-------|---------|
| 1 | Name | `amealiodashboardmvp-` (package `AmealioDashboardMVP`; client `Amealio-Dashboard-MVP`) |
| 2 | Path | `/agent/repos/amealiodashboardmvp-` |
| 3 | Branch / commit | `main` @ `2e09b25d4` (2026-08-31) · 9081 commits |
| 4 | Framework / language | Create React App, React 16, JavaScript; Express static host (`server.js`) |
| 5 | Frontend app(s) | **Two logical apps in one repo**: super-admin console + merchant/vendor dashboard (portal chosen by hostname + `portal` header) |
| 6 | Backend/API | None (client of Feathers backend) |
| 7 | Database | None (client) |
| 8 | Entities | N/A |
| 9 | Business domains | Merchant ops (onboarding, menu, seating, orders, experiences, staff/roles, subscriptions, settlements, reports); admin (vendor approval, ONDC, delivery-partner, payouts, POS, content) |
| 10 | Authentication | Feathers `vendorauthentication`; roles `vendor` / `superadmin`; admin OTP |
| 11 | Payments | Settlement/withdrawal/earnings views; Razorpay keys present |
| 12 | Restaurant | Restaurant/chain management, edit details |
| 13 | Dining | Seating/pending/reservation/history dashboards |
| 14 | Orders | Order dashboard, request/track, item availability |
| 15 | Reservations | Reservation dashboard + calendar blocks |
| 16 | Celebrations | Experience/curated/special dashboards |
| 17 | Events | Event + offline-event flows |
| 18 | Ticketing | Public QR ticket pages (`/ticketbooked/:id`, `/experience/ticket/:id`) |
| 19 | Seating | Seating ops dashboards, add diner |
| 20 | Commerce | Subscriptions, offers, ONDC admin |
| 21 | Promotions | Offers, referrals, affiliate/referral reward dashboards |
| 22 | Notifications | Notification section; socket events |
| 23 | AI/personalization | Content/curation (moods, reels, templates) admin |
| 24 | Restaurant integrations | POS dashboard (Petpooja) |
| 25 | Delivery integrations | Dunzo delivery settings/statements/settlements; delivery reports |
| 26 | Admin | Extensive super-admin console (~400+ routes) |
| 27 | Background jobs | None (client) |
| 28 | Webhooks | None |
| 29 | External services | Twilio voice (`twilio-client`), PostHog, Razorpay, integration service, Porter API URL, bulk-upload API |
| 30 | Deployment | `env-cmd` multi-env; local SSL cert support; `server.js` static host; PM2 deploy script |

**Rationale for class A:** the India merchant + admin surface. Note the admin/merchant coupling (single repo) is a target-split question (Decision D-006).

---

### 4) `amealio-nestjs-backend` — Delivery tracking API  · Proposed class: **B** (secondary: **C**)

| # | Field | Finding |
|---|-------|---------|
| 1 | Name | `amealio-nestjs-backend` |
| 2 | Path | `/agent/repos/amealio-nestjs-backend` |
| 3 | Branch / commit | `main` @ `104303d` (2026-08-31, merge from `uat`) · **10 commits** |
| 4 | Framework / language | NestJS 11, TypeScript, TypeORM, Socket.IO, Passport JWT, Swagger |
| 5 | Frontend app(s) | None |
| 6 | Backend/API | Narrow delivery-tracking REST + WebSocket |
| 7 | Database | **PostgreSQL** (TypeORM, `synchronize: true`) — the only existing PG component |
| 8 | Entities | Single `locations` table (driverId PK, lat/lon/speed/heading/timestamp) |
| 9 | Business domains | Delivery tracking only |
| 10 | Authentication | Verifies JWT (`JWT_SECRET`); **issues no tokens** (trusts Feathers-issued JWTs) |
| 11 | Payments | None |
| 12–20 | Restaurant/Dining/Orders/Reservations/Celebrations/Events/Ticketing/Seating/Commerce | None |
| 21 | Promotions | None |
| 22 | Notifications | Broadcasts `locationUpdated` (WS) |
| 23 | AI | None |
| 24 | Restaurant integrations | None |
| 25 | Delivery integrations | Core: ingests driver GPS (`/tracking` WS), serves active/current/history |
| 26 | Admin | None |
| 27 | Background jobs | None (pg `LISTEN/NOTIFY`) |
| 28 | Webhooks | None (WebSocket-based) |
| 29 | External services | None (peer of Feathers via shared JWT; likely the `INTEGRATION_SERVICE_BASE_URL` target — `UNKNOWN — REQUIRES REVIEW`) |
| 30 | Deployment | `docker-compose.yml` (Postgres 15); env `DB_*`, `JWT_SECRET`, `PORT`; `synchronize: true` (unsafe for prod) |

**Rationale for class B:** the India platform depends on it for live delivery tracking (referenced by consumer + delivery apps), but it is a small, newer satellite (10 commits) and could equally be treated as a **feature source (C)** or folded into the target delivery module. Its inclusion in the India baseline is a **decision required**.

---

### 5) `amealio-self-delivery-app` — Delivery-boy app  · Proposed class: **B** (secondary: **C**)

| # | Field | Finding |
|---|-------|---------|
| 1 | Name | `amealio-self-delivery-app` (package `nextjs-delivery-boy`) |
| 2 | Path | `/agent/repos/amealio-self-delivery-app` |
| 3 | Branch / commit | `main` @ `6e3daa7` (2026-06-26) · **46 commits**, version `Beta.1.0.6` |
| 4 | Framework / language | Next.js 15, React 19, TypeScript, Tailwind 4, Zustand, TanStack Query |
| 5 | Frontend app(s) | Delivery-boy / courier PWA |
| 6 | Backend/API | None (client of Feathers + Nest tracking) |
| 7 | Database | None |
| 8 | Entities | N/A |
| 9 | Business domains | Delivery fulfilment (driver side) |
| 10 | Authentication | Feathers `otp-authentication` (`deliveryPerson: true`, `portal: MERCHANT`); JWT over socket |
| 11 | Payments | Razorpay keys present (usage minimal) |
| 12–17 | Restaurant/Dining/Orders/Reservations/Celebrations/Events | Order pickup/delivery only |
| 18 | Ticketing | None |
| 19 | Seating | None |
| 20 | Commerce | None |
| 21 | Promotions | None |
| 22 | Notifications | FCM push (assignment), in-app |
| 23 | AI | None |
| 24 | Restaurant integrations | None |
| 25 | Delivery integrations | Core: assignment via Feathers `ordering`; GPS to Nest `/tracking`; order status updates |
| 26 | Admin | None |
| 27 | Background jobs | Client location watcher (throttled emit) |
| 28 | Webhooks | None |
| 29 | External services | Feathers backend, Nest tracking, Firebase/FCM, Google Maps/OSRM, IP geo, PostHog |
| 30 | Deployment | Next.js multi-env (`dotenv -e .env.*`), PWA, standalone build; env `NEXT_PUBLIC_*` |

**Rationale for class B:** operationally part of India delivery (points at India dev/stage backends), but newest/beta and could be a **feature source (C)**. Baseline inclusion is a **decision required**.

---

### 6) `replateform-amealio` — Target platform  · Class: **—** (not a source)

| # | Field | Finding |
|---|-------|---------|
| 1 | Name | `replateform-amealio` (a.k.a. `amealio-platform`) |
| 2 | Path | `/agent/repos/replateform-amealio` |
| 3 | Branch / commit | `cursor/p0-2-repository-landscape-a8e0` (work branch) · 6+ commits |
| 4 | Framework / language | None yet (documentation only) |
| 5–30 | — | **No application** yet. Contains discovery, architecture, and governance docs. Target: monorepo (NestJS API + Next.js apps + PostgreSQL/Prisma). |

**Rationale:** this is the writable **target**, not a migration source. Excluded from A–F classification.

---

## Comparison — which repositories appear to collectively constitute the India baseline

The India platform is **not a single repository**. Functionally it is a set of clients around one backend:

```
                 amealio_web_app (A)          amealiodashboardmvp- (A)
                 consumer surface             admin + merchant surface
                        \                         /
                         \                       /
                          v                     v
                   amealio-vendordashboard (A)  ← system of record (Feathers + MongoDB)
                          ^                     ^
                          |  shared JWT         |  delivery create/availability (HTTP)
                          |                     |
             amealio-self-delivery-app (B) --> amealio-nestjs-backend (B)
             driver app                        delivery tracking (PostgreSQL)
```

| Layer | Repository | Confidence it is India baseline |
|-------|------------|---------------------------------|
| Backend / system of record | `amealio-vendordashboard` | **High** |
| Consumer surface | `amealio_web_app` | **High** |
| Admin + merchant surface | `amealiodashboardmvp-` | **High** |
| Delivery tracking API | `amealio-nestjs-backend` | **Medium** (satellite; could be feature) |
| Delivery-boy app | `amealio-self-delivery-app` | **Medium** (beta; could be feature) |

**Evidence the three core repos are one platform:** all clients authenticate against `amealio-vendordashboard`'s JWTs; both frontends call its services and Socket.IO events; env files across all repos point at the same host family (`*-be.amealio.com`, `dev/qa/uat/stage/prod`). The admin/merchant portal uses `vendorauthentication`; the consumer app uses `authentication` — both provided by the same backend.

---

## INDIA BASELINE — DECISION REQUIRED

> The following requires stakeholder confirmation (blocker **B1**). It is presented as evidence, **not** a decision.

### Candidate repositories (proposed core baseline)
- `amealio-vendordashboard` — platform backend / system of record.
- `amealio_web_app` — consumer surface.
- `amealiodashboardmvp-` — admin + merchant surface.

### Supporting repositories (proposed)
- `amealio-nestjs-backend` — delivery tracking API (PostgreSQL satellite).
- `amealio-self-delivery-app` — delivery-boy app (beta).

### Evidence
- Shared authentication trust: all clients consume Feathers-issued JWTs; Nest verifies the same `JWT_SECRET`.
- Shared backend host family and multi-environment naming across all repos.
- Frontends call the backend's Feathers services and realtime events (orders, diners, experiences, delivery).
- Backend calls an integration service for delivery create/availability that plausibly maps to the Nest tracking service.

### Overlaps
- **Delivery** logic spans `amealio-vendordashboard` (assignment, Dunzo/Porter, self), `amealio-nestjs-backend` (GPS/tracking), and `amealio-self-delivery-app` (driver UI).
- **Admin + Merchant** overlap inside one repo (`amealiodashboardmvp-`), split only by hostname/portal.
- **ONDC** spans backend + consumer web + admin.
- **Two databases** already in production: MongoDB (backend) + PostgreSQL (tracking).
- **Duplicated data** within the backend (`restaurant` vs `restaurantCard`), and dual cart models.

### Gaps
- **No separate merchant frontend repo** (admin + merchant combined).
- **No standalone "Delivery Tracking App"** frontend (capability split across apps).
- **Recommendations / AI engine** is external (`REACT_APP_RECOMMENDATIONS_API_*`) — repo not present.
- **Integration service** (delivery create/availability, public track) — repo not present; relationship to `amealio-nestjs-backend` unconfirmed.
- **ONDC micro-server** — external, repo not present.
- **Native mobile apps** (if any) — not present.

### Dependencies
- All clients → `amealio-vendordashboard` (auth + services + sockets).
- `amealio-self-delivery-app` → `amealio-vendordashboard` (assignments/orders) **and** `amealio-nestjs-backend` (GPS).
- `amealio-vendordashboard` → integration service + ONDC micro-server + payment/SMS/email/POS/delivery providers.
- `amealio-nestjs-backend` ↔ `amealio-vendordashboard` via shared `JWT_SECRET`.

### Unresolved questions (do not guess)
1. Do `amealio-nestjs-backend` and `amealio-self-delivery-app` belong **in** the India baseline (supporting) or are they **feature sources** introduced after baseline?
2. Is the external **integration service** the same deployment as `amealio-nestjs-backend`? If not, is its repo part of the baseline?
3. Is the **recommendations/AI** service in scope for the India baseline, and where is its repository?
4. Is **ONDC** part of the India baseline or a later capability?
5. Should **admin** and **merchant** be one baseline surface (as today) or split in the target?
6. Are there **additional India repos** (mobile, ops tooling, micro-servers) not present in this workspace?
7. What is the **authoritative branch** per repo for the baseline (all currently `main`)?

### Next step
Record the confirmed baseline set and answers to the above as a decision (resolving **B1**) in [DECISIONS.md](./DECISIONS.md), then update [SOURCE_REPOSITORIES.md](./SOURCE_REPOSITORIES.md) and [MIGRATION_STATUS.md](./MIGRATION_STATUS.md). **Do not begin migration until B1 is resolved.**
