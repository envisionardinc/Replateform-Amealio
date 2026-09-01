# 06 — Frontend Migration Map

Maps the two India-baseline clients to the target frontend architecture (`apps/web`, `apps/admin`, `apps/merchant` — Next.js + shared `packages/{ui,design-system,types,validation,auth,config,localization,utils}`). Design only; no frontend changes.

Disposition: **REUSED** · **REFACTORED** · **REIMPLEMENTED** · **DEPRECATED**.

## A. `amealio_web_app` (consumer, CRA/React 18) → `apps/web` (Next.js)

| Aspect | Current | Target | Disposition · why |
|--------|---------|--------|-------------------|
| Routes/screens | React Router v6 (`src/setup/routes-manager/index.js`); dual legacy+V2 flows | Next.js app router; single set of flows | **REFACTORED** (V2 screens portable) + **DEPRECATE** legacy flows |
| Shared components | V2 reusable set (`src/components/AmealioReusableComponents`), payments/maps/singups | `packages/ui` + `packages/design-system` | **REFACTORED** — promote V2 set as seed for shared library |
| State management | Redux Toolkit + redux-persist (`src/store/store.js`) | Keep RTK (or evaluate) in `apps/web` | **REUSED/REFACTORED** |
| API clients | Feathers socket + axios (`src/common/api/urls.js`) | Typed client from `packages/types` against target `/v1` (+ shim) | **REIMPLEMENTED** (client), behavior preserved |
| Authentication | Feathers `authentication`, raw header, localStorage | `packages/auth` (Bearer + claims) | **REIMPLEMENTED** |
| Consumer functionality | discovery/order/seating/experiences/wallet/community/bytes | same journeys (REQUIRED ones first) | **REFACTORED** |
| Design system | MUI v5 + Bootstrap + partial Tailwind + SCSS (mixed) | single token set + `packages/ui` | **REFACTORED** — consolidate |

## B. `amealiodashboardmvp-` (admin+merchant, CRA/React 16) → `apps/admin` + `apps/merchant` (Next.js)

| Aspect | Current | Target | Disposition · why |
|--------|---------|--------|-------------------|
| App split | Single app, portal by hostname/`portal` header (`authAction.js`) | **Two apps**: `apps/admin`, `apps/merchant` (owner-decision D-006) | **REIMPLEMENTED** — split |
| Routes/screens | ~4,900-line router (`client/src/store/utils/Routes.js`), ~400+ routes | Domain-organized routes per app | **REIMPLEMENTED** — React 16 + monolithic router not portable |
| Shared components | `client/src/components/reusableComponents` (~172 files), per-screen `createTheme` | `packages/ui` + shared theme | **REIMPLEMENTED** |
| State management | Redux + thunk | modern state (RTK/query) | **REIMPLEMENTED** |
| API clients | Feathers socket + axios actions | typed client against target `/v1` | **REIMPLEMENTED** |
| Authentication | Feathers `vendorauthentication` + portal header | `packages/auth` (role claims) | **REIMPLEMENTED** |
| Role-specific behavior | vendor vs superadmin via portal | role/permission claims per app | **REIMPLEMENTED** |
| Merchant functionality | onboarding/menu/seating/orders/experiences/staff/settlements | `apps/merchant` | **REIMPLEMENTED** |
| Admin functionality | approvals/ONDC/delivery-partner/settlements/config | `apps/admin` | **REIMPLEMENTED** |
| Twilio voice, misc | `twilio-client` in tables | evaluate; optional | **REFACTORED/OPTIONAL** |

## Shared frontend concerns (both apps)
- **`packages/ui` / `packages/design-system`:** single token source + component library replacing three divergent sets (design inventory: [09-design-system-inventory](../09-design-system-inventory.md)).
- **`packages/types` / `packages/validation`:** shared domain contracts + schemas across apps and API.
- **`packages/auth`:** unified Bearer/claims client used by web/admin/merchant.
- **`packages/localization`:** India-first i18n/format utilities.

## Summary
| Client | Disposition |
|--------|-------------|
| `amealio_web_app` (React 18, V2) | **REFACTORED** into `apps/web`; legacy flows **DEPRECATED** |
| `amealiodashboardmvp-` (React 16) | **REIMPLEMENTED** and **split** into `apps/admin` + `apps/merchant` |

Rationale: the consumer app is modern enough to refactor (V2 components portable); the admin/merchant app's React 16 + ~4,900-line router + per-screen theming is the highest UI debt and is best reimplemented while splitting admin/merchant (subject to owner decision D-006). No frontend code is changed in this task.
