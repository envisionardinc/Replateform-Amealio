# 85 — Merchant Experience Nest Cutover Path

**Status:** IMPLEMENTED (flag-gated UI bridge + Nest HTTP vertical e2e)  
**Date:** 2026-09-04  
**Target branch:** `replatform/backend-consolidation`  
**UI repo:** `AmealioDashboardMVP-` (Experience workflow only)

## 1. Pre-cutover legacy endpoints (traced)

| METHOD | PATH                                      | UI                                  |
| ------ | ----------------------------------------- | ----------------------------------- |
| POST   | `/vendorauthentication`                   | NewLogin / authAction               |
| GET    | `/experience-media?page&limit&search`     | CloneFolderPopup                    |
| GET    | `/experience-media/:id`                   | CreateExpericence.onCloneFromFolder |
| POST   | `/experience`                             | CreateExpericence tab-1             |
| PATCH  | `/experience/:id`                         | Create/Edit subsequent tabs         |
| GET    | `/experience/:id`                         | EditExpericence load                |
| POST   | `/upload-assets` / `/upload-assets-video` | GeneralInfoExp (unchanged)          |

Auth: raw Feathers JWT in `authorization` header (no Bearer).

## 2. LEGACY → NEST mapping (when `REACT_APP_USE_NEST_EXPERIENCE=true`)

| LEGACY                                  | NEST                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `POST /vendorauthentication` (+ bridge) | also `POST /api/v1/auth/staff/login` → store `nestAccessToken` |
| `GET /experience-media?…`               | `GET /api/v1/platform-experience-catalogue`                    |
| `GET /experience-media/:id`             | `GET /api/v1/platform-experience-catalogue/:id`                |
| `POST /experience`                      | `POST /api/v1/experiences`                                     |
| `PATCH /experience/:id`                 | `PATCH /api/v1/experiences/:id`                                |
| `GET /experience/:id`                   | `GET /api/v1/experiences/:id`                                  |
| upload-assets\*                         | **still legacy** (gap)                                         |

## 3. Client wiring

- `client/src/api/nestExperienceClient.js` — Nest HTTP client + folder→form mapper
- `CloneFolderPopup.js`, `CreateExpericence.js`, `EditExpericence.js`, `useExperienceFormSubmission.js`
- Env: `REACT_APP_USE_NEST_EXPERIENCE=true`, `REACT_APP_NEST_API_URL`, `REACT_APP_NEST_RESTAURANT_ID` (or `localStorage.nestRestaurantId`)

## 4. Explicit non-goals

No server clone/materialize/lineage. No upload-assets migration. No full dashboard rewrite.

## 5. Proof

Nest HTTP e2e: `apps/api/test/experience-merchant-vertical.e2e-spec.ts`
