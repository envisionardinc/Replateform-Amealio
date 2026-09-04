# 01 — India Baseline System Overview

**Task:** P1.1 — Deep India Baseline System Analysis. **Analysis only** — no code migrated, copied, merged, rewritten, or redesigned; no database changes; no production access.

**Scope:** the three owner-approved core repositories, treated as **one logical platform**:

| # | Repository | Path | Role | Stack |
|---|------------|------|------|-------|
| 1 | `amealio-vendordashboard` (`envisionapp`) | `/agent/repos/amealio-vendordashboard` | Platform backend / system of record | FeathersJS 4.5 + Express + Socket.IO + MongoDB (Mongoose 5), TypeScript |
| 2 | `amealio_web_app` | `/agent/repos/amealio_web_app` | Consumer/diner web app | CRA / React 18, Redux Toolkit |
| 3 | `amealiodashboardmvp-` | `/agent/repos/amealiodashboardmvp-` | Admin console **and** merchant dashboard | CRA / React 16, Redux + thunk |

**Deferred (out of scope, D-011):** `amealio-nestjs-backend`, `amealio-self-delivery-app`. Referenced in this analysis **only** where their absence creates a documented dependency (live delivery tracking / integration service — see [08](./08-INTEGRATIONS.md), [09](./09-REALTIME-ASYNC.md), [10](./10-AUTHENTICATION-AUTHORIZATION.md)).

## One logical platform

The India baseline is a **single Feathers/MongoDB backend** with **two React frontends** (one consumer, one admin+merchant). Both frontends are thin clients: they hold no database and talk to the same backend over Feathers REST + Socket.IO.

```
   Consumer (amealio_web_app, React 18)        Admin+Merchant (amealiodashboardmvp-, React 16)
              |  authentication (User)                    |  vendorauthentication (VendorUser)
              |  REST + Socket.IO                         |  REST + Socket.IO
              v                                           v
        +-------------------------------------------------------------+
        |   amealio-vendordashboard  (Feathers + Express + Socket.IO) |
        |   ~155 service modules · ~419 mount paths · 171 models       |
        +-------------------------------------------------------------+
              |                         |                     |
              v                         v                     v
          MongoDB (Mongoose 5)     Redis (Porter queue)   External services
                                                          (Razorpay, Twilio, MSG91,
                                                           SendGrid/SES, FCM, Dunzo,
                                                           Porter, Petpooja, ONDC,
                                                           Google Maps, integration svc)
```

Evidence: backend bootstrap `amealio-vendordashboard/src/app.ts` (configures `express.rest()`, `socketio(...)`, `mongoose`, `authentication`, `services`, `channels`); consumer client `amealio_web_app/src/App.js` (`feathers.authentication({ path: "authentication" })`); admin/merchant client `amealiodashboardmvp-/client/src/App.js` (`feathers.authentication({ path: "vendorauthentication" })`).

## Functional ownership (high level)

| Concern | Owner |
|---------|-------|
| All domain data & business logic, APIs, realtime, jobs, integrations | `amealio-vendordashboard` (backend) |
| Consumer/diner UI & consumer journeys | `amealio_web_app` |
| Super-admin console + merchant/vendor dashboard UI & operator journeys | `amealiodashboardmvp-` |

Neither frontend contains business data or server logic; both are API/socket clients. Detailed ownership per capability: [03](./03-FRONTEND-INVENTORY.md), per domain: [06](./06-BUSINESS-DOMAINS.md).

## Key facts (verified)

- Backend: **171** Mongoose model files (`src/models/`), **155** service directories (`src/services/`), ~419 mount paths (`src/services/index.ts` + `src/authentication.ts`).
- **Dual authentication** in one backend: `/authentication` (consumer `User`) and `/vendorauthentication` (`VendorUser`) — `src/authentication.ts`.
- **Two datastores today**: MongoDB (this backend) + PostgreSQL (deferred Nest tracking service, out of baseline).
- **Multi-environment** naming shared across all three repos: `dev/qa/uat/stage/prod/prod-us` pointing at the `*-be.amealio.com` host family.

## Document map (P1.1)

| Doc | Contents |
|-----|----------|
| [02](./02-REPOSITORY-RELATIONSHIPS.md) | How the three repos interact (API, auth, sockets, shared data, deploy/env) |
| [03](./03-FRONTEND-INVENTORY.md) | Routes/screens/journeys per frontend + capability→repo map |
| [04](./04-BACKEND-API-INVENTORY.md) | Backend API/domain inventory (endpoints, auth, DB, integrations, consumers) |
| [05](./05-DATA-MODEL.md) | MongoDB data model; business entity vs legacy structure |
| [06](./06-BUSINESS-DOMAINS.md) | Domain map with implementation status |
| [07](./07-BUSINESS-RULES.md) | Evidenced business rules + source locations |
| [08](./08-INTEGRATIONS.md) | External integrations |
| [09](./09-REALTIME-ASYNC.md) | Sockets, jobs, webhooks, async behavior |
| [10](./10-AUTHENTICATION-AUTHORIZATION.md) | Auth mechanism, roles, permissions, token lifecycle |
| [11](./11-END-TO-END-WORKFLOWS.md) | Actual end-to-end workflows |
| [12](./12-GAPS-RISKS.md) | Gaps, debt, risks |
| [13](./13-MIGRATION-IMPLICATIONS.md) | Migration implications per domain (no target design) |

> Prior discovery (`docs/migration/01`–`10`) covered all reference repos; P1.1 narrows to the approved baseline with traceable source references and treats the three as one platform.
