# Repository Map — Amealio Current-State Forensic Audit

**Audit date:** 2026-09-02  
**Scope:** All reference repositories in `/agent/repos/`  
**Method:** Source-code inspection only (read-only)

---

## Repositories Discovered

| # | Repository | Role | Status |
|---|------------|------|--------|
| 1 | `amealio-vendordashboard` | **Primary platform backend** (Feathers.js API + MongoDB) | IMPLEMENTED |
| 2 | `amealiodashboardmvp-` | **Merchant + Admin web dashboards** (React SPA) | IMPLEMENTED |
| 3 | `amealio_web_app` | **Customer / User web application** (React CRA) | IMPLEMENTED |
| 4 | `amealio-self-delivery-app` | **Delivery rider PWA** (Next.js) | IMPLEMENTED |
| 5 | `amealio-nestjs-backend` | **Delivery GPS tracking microservice** (NestJS + PostgreSQL) | IMPLEMENTED (narrow scope) |
| 6 | `amealio-homepage-v2-rag-server` | **Food discovery AI / RAG recommendations** (FastAPI + Python) | IMPLEMENTED |
| 7 | `replateform-amealio` | Replatforming target (empty scaffold) | NOT FOUND (no app code) |
| 8 | `/agent` | Agent workspace / orchestration | N/A |

---

## Repository Details

### 1. `amealio-vendordashboard` — Primary Backend

| Attribute | Value |
|-----------|-------|
| **Purpose** | Core Amealio platform API: users, vendors, restaurants, menus, orders, seating, events, experiences, payments, ONDC, logistics |
| **Application** | Feathers v4 REST + Socket.IO monolith |
| **Language** | TypeScript |
| **Framework** | Feathers.js, Express, Mongoose (MongoDB) |
| **Entry point** | `src/index.ts` → `src/app.ts` |
| **Major modules** | 150+ Feathers services registered in `src/services/index.ts` |
| **Data store** | MongoDB (Mongoose models in `src/models/`, 169 model files) |
| **Real-time** | Socket.IO channels (`src/channels.ts`) |
| **Background jobs** | `src/cron.ts` (node-cron) |
| **Auth** | `/authentication` (users), `/vendorauthentication` (merchants), `/admin/auth` (superadmin) |

**Evidence:** `package.json` name `"envisionapp"`, `src/services/index.ts` registers ordering, diner, experience, events, ondc, etc.

**Relationship:** Single source of truth for all business logic. Consumed by `amealio_web_app`, `amealiodashboardmvp-`, `amealio-self-delivery-app`.

---

### 2. `amealiodashboardmvp-` — Merchant + Admin Dashboard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Unified web portal for restaurant operators (merchant) and platform operators (superadmin) |
| **Application** | React 16 SPA (Create React App) |
| **Language** | JavaScript |
| **Entry point** | `client/src/index.js` → `client/src/App.js` |
| **Routing** | `client/src/store/utils/Routes.js` (~4900 lines, 200+ routes) |
| **State** | Redux |
| **Backend target** | `REACT_APP_API_URL` → `https://be.amealio.com` (Feathers backend) |
| **Real-time** | Feathers client + Socket.IO (`vendorauthentication` path) |

**Merchant UI:** `client/src/components/vendorDashboardComponents/`  
**Admin UI:** `client/src/components/superAdminComponents/`

**Route guards:**
- `PrivateRoute` — vendor role + onboarding complete
- `AdminPrivateRoute` — superadmin only
- Host-based routing: `admin` subdomain → admin login

**Evidence:** `client/src/config/Keys.js` `PORTAL = "MERCHANT"`

---

### 3. `amealio_web_app` — Customer Web App

| Attribute | Value |
|-----------|-------|
| **Purpose** | End-customer experience: discovery, ordering, seating, experiences/celebrations, profile |
| **Application** | React 18 CRA |
| **Language** | JavaScript (primary) |
| **Entry point** | `src/index.js` → `src/App.js` |
| **Routing** | `src/setup/routes-manager/index.js` (80+ routes) |
| **State** | Redux Toolkit + redux-persist |
| **Backend target** | `REACT_APP_BASE_URL` (e.g. `dev-be.amealio.com`) |
| **Real-time** | Feathers client + Socket.IO (diner, ordering, expRequest, ondc services) |
| **Secondary APIs** | Recommendation API (`REACT_APP_RECOMMENDATIONS_API_BASE`), integration service |

**Evidence:** `.env-cmdrc` per-environment backend URLs

---

### 4. `amealio-self-delivery-app` — Delivery Rider App

| Attribute | Value |
|-----------|-------|
| **Purpose** | Delivery person operations: OTP login, order list, status updates, live GPS |
| **Application** | Next.js 15 PWA |
| **Language** | TypeScript |
| **Entry point** | `src/app/layout.tsx`, routes under `src/app/(auth)/`, `src/app/(dashboard)/` |
| **Backend target** | `NEXT_PUBLIC_API_BASE_URL` (same Feathers backend) |
| **Location tracking** | Separate NestJS service at `*-be-location.amealio.com/tracking` |

**Evidence:** `src/lib/api/orders-api.ts` calls `orders/delivery-persons`

---

### 5. `amealio-nestjs-backend` — Location Tracking Microservice

| Attribute | Value |
|-----------|-------|
| **Purpose** | Driver GPS tracking only (AR-1344) |
| **Application** | NestJS 11 microservice |
| **Language** | TypeScript |
| **Data store** | PostgreSQL (TypeORM), table `locations` |
| **Entry point** | `src/main.ts` |
| **APIs** | `GET /delivery/active`, `GET /delivery/:driverId/current`, `GET /delivery/:driverId/history` |
| **WebSocket** | `/tracking` namespace — `updateLocation`, `locationUpdated` |

**NOT the main platform backend.** No orders, seating, celebrations, MongoDB, or ONDC.

**Evidence:** Only 19 TypeScript files under `src/`; Swagger title "Delivery Tracking API"

---

### 6. `amealio-homepage-v2-rag-server` — Discovery AI

| Attribute | Value |
|-----------|-------|
| **Purpose** | Conversational food discovery, recommendations (restaurants, items, bytes, events, recipes) |
| **Application** | FastAPI (primary: `src/app/main.py`) |
| **Language** | Python 3.11 |
| **Data store** | MongoDB read-only (`amealio` DB) |
| **External** | OpenAI/DeepSeek LLM, AWS Bedrock, AWS Personalize, Google Maps |
| **APIs** | `POST /recommendations`, chat history, `POST /personalize/*` |

**Evidence:** `src/core/settings.py` — collections: restaurants, vendoritems, exp_events, reels

---

### 7. `replateform-amealio` — Replatform Target

| Attribute | Value |
|-----------|-------|
| **Purpose** | Future replatforming codebase (currently empty) |
| **Contents** | README.md, .gitignore only |
| **Status** | Architecture and discovery phase |

---

## Platform Relationship Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER TOUCHPOINTS                                 │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│  amealio_web_app     │ amealiodashboardmvp- │ amealio-self-delivery-app    │
│  (User / Customer)   │ (Merchant + Admin UI)  │ (Delivery Rider PWA)         │
└──────────┬───────────┴──────────┬───────────┴──────────────┬──────────────┘
           │ REST + Socket.IO       │ REST + Socket.IO         │ REST + Socket
           │                        │                          │
           ▼                        ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              amealio-vendordashboard (Feathers.js + MongoDB)                   │
│  ~423 REST paths │ Socket.IO │ Cron jobs │ Auth (user/vendor/admin)         │
└──────────┬──────────────────────────────────────────────────┬───────────────┘
           │ MongoDB read                                       │
           ▼                                                    ▼
┌──────────────────────────────┐              ┌────────────────────────────────┐
│ amealio-homepage-v2-rag-server│              │ amealio-nestjs-backend          │
│ (Recommendations AI)          │              │ (Driver GPS — PostgreSQL)       │
└──────────────────────────────┘              └────────────────────────────────┘
           ▲
           │ POST /recommendations
           │
    amealio_web_app (/homepage2)
```

---

## Data & API Dependencies Summary

| Repository | Depends On | Provides To |
|------------|------------|-------------|
| `amealio-vendordashboard` | MongoDB, Razorpay, Dunzo, Porter, ONDC network, FCM, SMS, WhatsApp, POS webhooks | All frontends |
| `amealiodashboardmvp-` | vendordashboard API | Merchants, superadmins |
| `amealio_web_app` | vendordashboard API, RAG server, Razorpay, Firebase, Google Maps | End customers |
| `amealio-self-delivery-app` | vendordashboard API, nestjs location service, Firebase | Delivery riders |
| `amealio-nestjs-backend` | PostgreSQL | Delivery tracking consumers |
| `amealio-homepage-v2-rag-server` | MongoDB (read), LLM APIs | User app homepage2 |

---

## Critical Naming Clarifications

| Common assumption | Actual evidence |
|-------------------|-----------------|
| `amealio-vendordashboard` = merchant UI | **Incorrect** — it is the **backend API** |
| `amealiodashboardmvp-` = admin only | **Incorrect** — contains **both merchant and admin** UIs |
| `amealio-nestjs-backend` = main backend | **Incorrect** — delivery GPS microservice only |
| "Celebrations" = separate backend entity | **Incorrect** — customer "Celebrations" maps to **Experience** records filtered by subcategory; no `celebration` service exists |

---

## Evidence Index

- Backend service registration: `amealio-vendordashboard/src/services/index.ts`
- Customer routes: `amealio_web_app/src/setup/routes-manager/index.js`
- Merchant/admin routes: `amealiodashboardmvp-/client/src/store/utils/Routes.js`
- Auth services: `amealio-vendordashboard/src/authentication.ts`
- Cron jobs: `amealio-vendordashboard/src/cron.ts`
