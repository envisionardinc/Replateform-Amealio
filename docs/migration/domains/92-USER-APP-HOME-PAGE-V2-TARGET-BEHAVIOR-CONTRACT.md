# 92 — User App + Home Page V2 Target Behavior Contract

**Status:** CONTRACT + first consumer slice  
**Date:** 2026-09-04  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [90](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md), [88](./88-MERCHANT-ORDER-MANAGEMENT-TARGET-BEHAVIOR-CONTRACT.md), [91](./91-SELF-DELIVERY-TARGET-BEHAVIOR-CONTRACT.md), [25](./25-CONSUMER-AUTHENTICATION.md)  
**Filename note:** `92-ORDER-VERTICAL-IMPLEMENTATION-NOTES.md` is the order-vertical impl log. This file is the **user-app / Home Page V2** contract (requested name kept).

Legacy and industry are **evidence**. This is the proposed **consumer experience** target.

---

## 0. Three layers (do not collapse)

| Layer | What it is | Authority for first slice |
| ----- | ---------- | ------------------------- |
| **CURRENT AMEALIO BASELINE (Home Page 1)** | `/home` moods/cravings/curations + `/food` restaurant cards + restaurant/menu/cart/checkout | **Preserve capability.** First Nest home is the **canonical restaurant list**, not a RAG home. |
| **HOME PAGE V2** | `/homepage2` conversational recommendations via **external** `*-recommendation-api.amealio.com` / `api-homepage-v2-prod.amealio.com`. RAG server **not in this workspace**. | **Layer on top** of canonical discovery. `RecommendationProvider` port (OD-8). **Not** the default home. |
| **FUTURE ENHANCEMENTS** | Geo ranking, OTP/social, guest cart, offer browse, experiences booking, scheduled order, tax/fee engine, sockets | Do not invent in this slice |

**Hard rule:** Home Page V2 work must not remove or replace Home Page 1 discovery. V2 is an optional feed adapter, never hard-wired into restaurant/menu/cart components.

---

## 1. Method

1. **L1** — Traced `amealio_web_app` routes (`routes-manager/index.js`), `MainHomeScreen`, `HomePage.js`, `HomePage2`, restaurant/menu/cart/checkout/track. `amealio-vendordashboard` Feathers user-moods / user/menu / user/cart. `amealiodashboardmvp-` is merchant-only. `Amealio-Homepage-V2-RAG-Server` is **not in this workspace**.
2. **L2** — Consumer dining apps: public menu browse, location denial fallback, closed-store handling, server price at cart, idempotent checkout, payment verify, empty/error/loading states.
3. **L3/L4** — Matrix + contract. Auto-resolved where evidence + amealio intent agree.

---

## 2. L1 — Legacy consumer reality

### 2.1 Surfaces (amealio_web_app)

| Step | Legacy route | Data |
| ---- | ------------ | ---- |
| Auth | `/login`, OTP `/otp-authentication`, social, WhatsApp | Raw JWT in `Authorization` (not Bearer) |
| Home 1 | `/home` `MainHomeScreen` | moods, cravings, curations, experiences, bytes, visited |
| Food discovery | `/food/:id?` | `POST listRestaurantCard` (lat/long required) |
| Home V2 | `/homepage2` | External POST `/recommendations` (query, user_id, session, city) |
| Location | `useLocation.js` | GPS → Google geocode; deny → `'Permission Denied'`; reels fallback Pune |
| Search | `/search`, `POST /searchGlobal` | restaurant / item / experience |
| Restaurant | `/restaurant/:ID` | `GET listRestaurant/{id}` |
| Menu | `/restaurant/:ID/food/menu/v1` | `GET /user/menu` |
| Item | `/restaurant/:ID/food/itemdetails/:itemId` | `GET /vendor-items/{id}` + client modifiers |
| Cart | `/food/cart` | `GET/POST /user/cart` (server totals); guest `POST guest/cart` |
| Offers | restaurant tickets; v1 checkout **no coupon UI** | Usage++ at apply on legacy path (doc 90 CORRECT) |
| Checkout | `/food/ordercheckout` | `POST user/checkout` then Razorpay / pay-at-site / direct UPI |
| Confirm/track | `/food/ordertrack/:id` | `GET user-ordering/{id}` + sockets |
| History | `/order-history` | `GET user-ordering?status=HISTORY` |

Price: menu from server; cart **server-authoritative** for logged-in; guest may fall back to client totals.

### 2.2 Home Page V2 (forensic)

- Client: `homepage2ChatApi.js`. Ranks **off-box**. Cards: restaurants, items, experiences, bytes, events, recipes.
- Payload does **not** send dietary prefs (stored on user, used for menu personalization and home-strip filters, not the RAG POST).
- Default `/home` does **not** call the recommendations API. V2 is a **separate route + FAB**.
- Moods/cravings/curations ranking is Mongo `$geoNear` + taxonomy in Feathers — **not RAG**.

### 2.3 Target backend already GREEN (do not reimplement)

| Capability | Target API | Auth |
| ---------- | ---------- | ---- |
| Consumer password session | `/api/v1/auth/consumer/*` | public + Bearer |
| Cart | `/api/v1/cart` | consumer JWT |
| Checkout (idempotent) | `/api/v1/checkout` | consumer JWT + `Idempotency-Key` |
| Pay verify / webhook | `/api/v1/payments/verify`, `…/razorpay/webhook` | HMAC |
| My orders | `/api/v1/me/orders` | consumer JWT |

Staff catalog/restaurant HTTP remains **staff-only**. That is correct for writes. Consumers had **no** read API — that is the gap this contract opens.

---

## 3. L2 — Industry (evidence, not authority)

| Practice | Implication |
| -------- | ----------- |
| Browse without login | Public restaurant/menu reads |
| Location deny / stale | City or last-known; do not block the entire home |
| Closed / unpublished | Hide or 404; do not take cart |
| Item 86 / unpublished | Show unavailable; reject add-to-cart server-side |
| Reprice at cart/checkout | Never trust client totals (already 90) |
| Idempotent checkout + payment verify | Already 90 |
| Empty/error/loading | Explicit UI, retry |
| Personalized home fallback | Canonical list if recs fail |
| Recs explainability | Optional “why”; do not block order |
| A11y | Labels, focus, errors as text |

---

## 4. L3 — Gap matrix

| Behavior | LEGACY | INDUSTRY | TARGET | CLASS |
| -------- | ------ | -------- | ------ | ----- |
| Token | Raw JWT | Bearer | Nest Bearer (doc 25) | **CORRECT** |
| OTP / social | Primary | Common | Password now; OTP/social **FUTURE** | **FUTURE** |
| Guest browse | Yes | Yes | Public discover APIs | **PRESERVE** |
| Guest cart | Yes | Common | Auth-required cart (exists) | **FUTURE** (guest) |
| Home 1 taxonomy | Moods/cravings/curations | Editorial rails | Keep product; Nest list is **canonical restaurants** until taxonomy APIs exist | **PRESERVE** / **FUTURE** taxonomy HTTP |
| Home V2 RAG | External chat | Recs layer | `RecommendationProvider` port; **not default home** | **PRESERVE** layering / **FUTURE** adapter |
| Geo / distance | Required for food list | Common | Optional `city`/`q`; no geo engine yet | **IMPROVE** (don’t block) |
| Location deny | Weak fallback | City picker | Home still lists ACTIVE restaurants | **IMPROVE** |
| Unavailable restaurant | Partial | Hide/404 | `ACTIVE` + not deleted only | **IMPROVE** |
| Temp closed / hours | Inconsistent | Hours + closed | `status !== ACTIVE` → 404; hours **FUTURE** | **IMPROVE** |
| Scheduled order | Partial | Common | **FUTURE** | **FUTURE** |
| Unpublished item | Publication gate exists | Hide | Consumer sees `isPublished` only | **PRESERVE** |
| Modifier / add-on UI | Client assemble | Server validate | Cart uses variantId; add-on pricing **FUTURE** | **IMPROVE** |
| Price change | Server cart | Reprice | Existing cart/checkout reprice | **PRESERVE** |
| Expired promo / min order | Checkout coupon | Server | Existing offer engine | **PRESERVE** |
| Delivery fee / tax engine | Server splitTaxes | Server | 0 unless configured — no invented rates | **FUTURE** |
| Tip | On cart | Optional | checkout `tipMinor` | **PRESERVE** |
| Cart expiry | Weak | TTL | **FUTURE** | **FUTURE** |
| Checkout / pay retry | UI flag | Idempotency | Keys + HMAC (90) | **CORRECT** |
| Pay OK / order delayed | Stranded INITIAL | Reconcile | Capture promotes PENDING (90) | **CORRECT** |
| Status freshness | Sockets | Poll + push | GET `/me/orders/:id`; sockets **FUTURE** | **IMPROVE** |
| Offline | Poor | Retry | Client retry on discover/cart | **IMPROVE** |
| Empty search / no restaurants | Copy | Empty state | Empty state + retry | **IMPROVE** |
| Recs fallback | Home 1 still works | Fallback | Canonical feed if V2 absent | **PRESERVE** |
| Dietary prefs | Menu filter + home strips | Filters | **FUTURE** (no Nest prefs API) | **FUTURE** |
| A11y / loading / error | Mixed | Required | Required on first web slice | **IMPROVE** |

---

## 5. Auto-resolved

| Topic | Resolution | Why |
| ----- | ---------- | --- |
| Default home | **Canonical restaurant discovery**, not RAG | Home 1 must survive; RAG repo missing (OD-8) |
| Catalog reads for consumers | **New public read HTTP** over existing Prisma catalog | Staff catalog stays write/tenant; not a second catalog |
| Auth | Nest consumer password + Bearer | Doc 25; OTP FUTURE |
| Money | Existing cart/checkout/PaymentService | Doc 90 |
| Guest cart | Not in first slice | Would invent a second cart |
| V2 in components | **Forbidden** | Cards call discover/cart APIs only |

---

## 6. Target contract (consumer experience)

### 6.1 First bounded slice (this implementation)

```
Public discover (ACTIVE restaurants, published items)
→ optional login (Bearer)
→ restaurant + menu
→ item (published)
→ cart (server prices)
→ checkout (Idempotency-Key; COD or PREPAID)
→ GET /me/orders/:id
```

Home Page V2 chat is **not** the first-slice home. UI may later mount a V2 panel that calls `RecommendationProvider`. Until the external engine is behind that port, the home feed `source` is `CANONICAL`.

### 6.2 Consumer discover APIs (new; reuse repositories)

| Method | Path | Auth | Behavior |
| ------ | ---- | ---- | -------- |
| GET | `/api/v1/discover/home` | Public | Canonical feed `{ source: 'CANONICAL', sections }` |
| GET | `/api/v1/discover/restaurants` | Public | ACTIVE, not deleted; optional `city`, `q` |
| GET | `/api/v1/discover/restaurants/:id` | Public | 404 if missing/deleted/not ACTIVE |
| GET | `/api/v1/discover/restaurants/:id/menu` | Public | published items + variants; 404 if restaurant not discoverable |
| GET | `/api/v1/discover/items/:id` | Public | 404 if unpublished/deleted |

Staff `/api/v1/catalog/*` is unchanged.

### 6.3 Existing APIs used as-is

Auth, cart, checkout, payments/verify, `/me/orders`. No second payment or order graph.

### 6.4 Home Page V2 layering

```
DiscoveryFeedProvider.getHomeFeed(ctx)
  → CanonicalRestaurantFeedProvider   // default, this slice
  → RecommendationProvider            // FUTURE; OD-8; must not be imported by UI cards
```

If a RecommendationProvider is added later, failed/empty recs **fall back** to canonical restaurants. Dietary explainability is FUTURE.

### 6.5 Alignment with 88 / 90 / 91

No conflict: consumer never writes kitchen statuses; prepaid kitchen visibility remains PENDING after capture; delivery remains 91.

---

## 7. Owner decisions (do not guess)

1. **OD-8 / RecommendationProvider** — external RAG repo still absent. Do not vendor a fake LLM.
2. **OD-COP-UNPAID-TTL** — unpaid INITIAL expiry (doc 90).
3. **Guest cart** — when to add Nest guest carts.
4. **OTP/social as primary login** — password is the Nest credential today.
5. **Default home = taxonomy rails vs restaurant grid vs V2 chat** — first slice = canonical grid so Home 1 is not deleted.

---

## 8. Missing target APIs (dependencies — not silently invented)

| Need | Status |
| ---- | ------ |
| Geo `listRestaurantCard`, distance sort | Missing — FUTURE |
| `user-moods` / cravings / curations HTTP on Nest | Missing — FUTURE (Home 1 taxonomy) |
| RecommendationProvider + RAG | Missing repo — FUTURE |
| Public offer catalog | Missing — coupon only at checkout |
| Guest cart | Missing |
| Consumer addresses | Missing |
| Experience booking | Staff config only |
| Tax / delivery-fee engine | Missing (0 unless later configured) |
| Dietary preference API | Missing |
| OTP / social / WhatsApp | Missing (doc 25) |

---

## 9. First-slice app location

`apps/web` (`@amealio/web`) — Vite + React. Target-architecture Next.js + `packages/ui` remains **FUTURE** (doc 06 / 23). This app is the first **working** consumer against Nest `/api/v1`, not a visual rewrite of CRA.

Screens: session, home (canonical), restaurant/menu, item, cart, checkout, order status. Loading / empty / error / retry on each.
