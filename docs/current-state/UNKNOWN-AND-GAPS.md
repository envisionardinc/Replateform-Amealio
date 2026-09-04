# Unknown Items & Platform Gaps

---

## UI Without Obvious Backend

| UI Feature | Location | Gap |
|------------|----------|-----|
| Customer create support ticket | web_app `/raiseTicket` | `URL.CREATE_TICKET` undefined in urls.js — POST endpoint UNKNOWN |
| Profile payment methods section | web_app profile nav | UI icons present; full backend wiring UNKNOWN |
| Profile valet, circle, rewards | web_app profile | Appear UI-only; backend NOT FOUND in audit |
| Restaurant QR scan entry | web_app `qr_scan.js` | Component exists, **no route registered** |
| Push firebase-config API | self-delivery-app README | Route NOT FOUND in Next.js app directory |
| PostHog feature flags | web_app analytics | Client supports flags; **no production usage** found |
| Occasion merchant feature gate | services.js | Shows `coming_soon` for Occasion — may block UI despite backend existing |

---

## Backend Without Obvious UI

| Backend Feature | Evidence | Gap |
|-----------------|----------|-----|
| Voice services | voice-get-diner, voice-get-restaurant, voice-get-item, voice-get-events, voice-get-offers, voice-user-service | No dedicated voice UI found; likely external/Alexa integration |
| Waiters service | `/waiters` | UI exposure UNKNOWN |
| Chat service | `/chat` | In-app chat UI NOT FOUND in web_app audit |
| Nominations | `/nominations`, `/admin/nominations` | Customer UI NOT FOUND |
| Live streaming activity | `/live-streaming-activity` | Customer viewing UI PARTIAL (subscription config exists) |
| Scraping data | `/scrapingData` | Internal/admin tool UNKNOWN |
| Web merchant | `/web-merchant` | Separate merchant web entry UNKNOWN |
| Automation delivery | `automation_delivery` service | Automated delivery assignment logic; UI UNKNOWN |
| Dunzo merchant settlements | `/dunzoMerchants`, `/dunzoMerchantSettlements` | Admin-only; merchant UI UNKNOWN |
| Referral program full flow | `/referralprogram` | Customer referral UI PARTIAL |

---

## Duplicate / Parallel Implementations

| Domain | Implementations | Notes |
|--------|-----------------|-------|
| Ordering UI | Legacy (`/food/cartpage`, `/food/checkout`) + V1 (`/food/cart`, `/food/ordercheckout`) | Both maintained; V1 is primary |
| Seating UI | Legacy (`/seating`, `/reservation`) + New (`/seating/waitlist`, `/seating/reservation`) | Both routed |
| Experience UI | Legacy (`/restaurant/:id/experience/:id/bookexp`) + V1 (`/experiences/*`) | Both routed |
| Menu API | `/user/menu` + `/v2/user/menu` | V2 is newer |
| Vendor items API | `/vendor-items` + `/v2/vendor-items` | V2 is newer |
| Auth services | authentication + vendorauthentication + admin/auth | By design (separate JWT secrets) |
| FastAPI entry points | homepage-v2-rag-server has `main.py` (legacy) + `src/app/main.py` (production) | Legacy routes commented out |
| Exp events naming | exp-events, exp_events, user_exp_events, user-exp-events | Multiple similar services |

---

## Feature Flags & Conditional Experiences

| Mechanism | Type | Evidence |
|-----------|------|----------|
| REACT_APP_COUNTRY | Build-time | IN vs US — ONDC, payments, localization |
| REACT_APP_ENV | Build-time | Razorpay test/live, analytics |
| subscription.*.value flags | Runtime config | Feature gates per merchant |
| shouldShowOndc() | Runtime | Country check |
| PilotRouteGuard | Code exists | Seating path allowlist; active usage UNKNOWN |
| DEV_QA hardcoded celebration promos | Dev-only | Celebrations.jsx DEV_QA_ENVS |
| services.js Occasion: 'coming_soon' | Static | May hide occasion features |

**No remote feature flag system found in production usage.**

---

## Disabled / Commented Functionality

| Item | Location | Notes |
|------|----------|-------|
| ONDC refund cron start | cron.ts line 176 | `ondcRefundsCronJob.start()` commented |
| Referral cron start | cron.ts line 165 | `refCron.start()` commented |
| Order cron in main job | cron.ts lines 65-67 | order/event/offer crons commented in minute job |
| expRequestCancel in minute job | cron.ts line 68 | Commented |
| uploadAssetsVideo service | services/index.ts line 207 | Commented out |
| Legacy RAG routes | homepage-v2-rag-server main.py | Transcript/search routers commented |

---

## Dead Code / Abandoned Paths

| Item | Evidence |
|------|----------|
| qr_scan.js (RestaurantScan) | No route in routes-manager |
| CREATE_TICKET URL | Referenced but undefined |
| Legacy homepage routes | `/homepage2` coexists with `/home` (both active, not dead) |
| Skillstride RAG legacy app | Separate entry point, not in Docker CMD |

---

## Conflicting Implementations

| Conflict | Details |
|----------|---------|
| "Celebrations" vs "Experiences" vs "Occasions" vs "Events" | Multiple overlapping terms; backend uses Experience/Events/exp_events; UI uses Celebrations label |
| packaging_charges vs packagingCharges | Duplicate fields on Experience model |
| order_id vs exp_order_id on expRequest | Comment says "keep in sync" — dual reference |
| amealio-vendordashboard repo name vs actual role | Named "vendordashboard" but is backend API |

---

## Permission Enforcement Gaps

| Gap | Details |
|-----|---------|
| Backend RBAC schema rich | role-management.model.ts defines granular permissions |
| Frontend route guards coarse | vendor vs superadmin only |
| Per-permission UI hiding | NOT FOUND systematically in merchant components |

---

## Cross-Repository Gaps

| Gap | Details |
|-----|---------|
| nestjs-backend isolation | Only GPS; no shared auth login endpoint (tokens assumed external) |
| RAG server auth | JWT middleware on legacy main.py only; production app unauthenticated |
| Delivery app push config | Documented API route missing |
| Replatform repo | Empty — no migration mapping yet |

---

## TODOs Requiring Investigation

1. Customer table/seat interactive selection — exists in subscription config (`seat_selection_applicable`) but customer UI NOT FOUND
2. QR check-in validation flow for events/experiences — shareLink/viewQRLink exist; scanner validation UNKNOWN
3. PilotRouteGuard production activation
4. PreOrder while in waitlist — full UX path
5. POS integration breadth — which merchants use `/pos/webhook`
6. PetPooja menu fetch — cron references fetchMenu (commented)
7. WhatsApp auth full production flow
8. Multi-profile user switching production usage
9. Catering order type end-to-end flow
10. Donation settlement flow completeness

---

## Summary Counts

| Category | Count |
|----------|-------|
| UI without backend | 7 |
| Backend without UI | 10 |
| Duplicate implementations | 8 |
| Disabled/commented | 6 |
| Dead/orphan code | 3 |
| UNKNOWN requiring investigation | 10 |
