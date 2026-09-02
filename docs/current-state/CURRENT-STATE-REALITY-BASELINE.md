# Current-State Reality Baseline — Amealio Platform

**Audit type:** Read-only forensic discovery  
**Date:** 2026-09-02  
**Authority:** Source code across 8 workspace repositories  
**Output location:** `replateform-amealio/docs/current-state/`

---

## Platform Summary

Amealio is a **multi-repository food platform** centered on a **Feathers.js + MongoDB monolith** (`amealio-vendordashboard`) serving three primary web clients:

1. **Customer app** (`amealio_web_app`) — discovery, ordering, seating, celebrations/experiences, profile
2. **Merchant + Admin dashboard** (`amealiodashboardmvp-`) — single SPA with role-separated UIs
3. **Delivery rider app** (`amealio-self-delivery-app`) — order fulfillment + GPS

Supporting services: **RAG recommendations** (Python FastAPI), **driver GPS tracking** (NestJS/PostgreSQL).

### AI Discovery (Home Page 2) — Deep Dive Available

The live conversational discovery stack is **`amealio-homepage-v2-rag-server`**, consumed by **`amealio_web_app` `/homepage2`**. Full forensic detail: **[AI-DISCOVERY-DEEP-DIVE.md](./AI-DISCOVERY-DEEP-DIVE.md)**.

| Attribute | Current-state evidence |
|-----------|------------------------|
| Production entry | `uvicorn app.main:app` on port 8000 |
| Primary API | `POST /recommendations` (+ chat history GET routes) |
| Pipeline | 8-stage: preprocess → understand → embed → parallel vector retrieval → rerank → prompt → LLM → assemble |
| Data | MongoDB `amealio` — restaurants, vendoritems, reels, exp_events, RecipeItem, users, user_memory |
| LLM | Remote HTTP (`OPENAI_API_URL` / DeepSeek-compatible); offline template fallback |
| Embeddings | AWS Bedrock if configured; else deterministic fallback |
| Frontend contract | `REACT_APP_RECOMMENDATIONS_API_BASE` → no Authorization header; `user_id` in body |
| Auth on prod API | **NOT FOUND** (JWT middleware only on legacy `main.py`) |
| AWS Personalize | Offline `/personalize/*` — **not wired into live `/recommendations`** |
| Streaming | **NOT FOUND** |

---

## Status Legend

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Clear source evidence of working code path |
| **PARTIAL** | Some code exists; capability incomplete or inconsistently wired |
| **NOT FOUND** | Reasonably investigated; no implementation |
| **UNKNOWN** | Insufficient evidence |
| **DEFERRED** | Exists but out of replatform critical path (ONDC) |

---

## Repository Summary

| Repository | Purpose | Status |
|------------|---------|--------|
| amealio-vendordashboard | Primary backend API + MongoDB | IMPLEMENTED |
| amealiodashboardmvp- | Merchant + Admin UI | IMPLEMENTED |
| amealio_web_app | Customer UI | IMPLEMENTED |
| amealio-self-delivery-app | Delivery rider UI | IMPLEMENTED |
| amealio-nestjs-backend | Driver GPS microservice | IMPLEMENTED (narrow) |
| amealio-homepage-v2-rag-server | Discovery AI | IMPLEMENTED |
| replatform-amealio | Replatform target | NOT FOUND (empty) |

---

## Capability Status Overview

### Customer (IMPLEMENTED unless noted)

| Domain | Status |
|--------|--------|
| Auth (OTP, social, WhatsApp) | IMPLEMENTED |
| Home/discovery (moods, cravings, curations, bytes) | IMPLEMENTED |
| Search | IMPLEMENTED |
| Restaurant details & menu | IMPLEMENTED |
| Cart & checkout (multi order types) | IMPLEMENTED |
| Order tracking (real-time) | IMPLEMENTED |
| Delivery tracking + live map | IMPLEMENTED |
| Waitlist seating | IMPLEMENTED |
| Reservation seating | IMPLEMENTED |
| Seating track (real-time) | IMPLEMENTED |
| Celebrations discovery & booking | IMPLEMENTED |
| Experience booking with food extras | IMPLEMENTED |
| Platform events & vendor events | IMPLEMENTED |
| Profile, preferences, favorites | IMPLEMENTED |
| Wallet payment | IMPLEMENTED |
| User QR code | IMPLEMENTED |
| ONDC marketplace (IN) | DEFERRED — EXISTING |
| Support ticket create | PARTIAL |
| Restaurant QR scan entry | NOT FOUND |
| Interactive table selection | NOT FOUND |
| Runtime feature flags | NOT FOUND |

### Merchant (IMPLEMENTED unless noted)

| Domain | Status |
|--------|--------|
| Onboarding & subscription config | IMPLEMENTED |
| Menu/category/item management | IMPLEMENTED |
| Order lifecycle management | IMPLEMENTED |
| Seating dashboard (waitlist, reservation) | IMPLEMENTED |
| Table setup & assignment | IMPLEMENTED |
| Experience/celebration management | IMPLEMENTED |
| Vendor events (RSVP, tickets) | IMPLEMENTED |
| Staff & role management | IMPLEMENTED |
| Reports (seating, order, event, experience) | IMPLEMENTED |
| Reservation block calendar | IMPLEMENTED |
| POS integration | IMPLEMENTED |
| Dunzo/Porter logistics config | IMPLEMENTED |
| Fine-grained UI permission enforcement | PARTIAL |

### Admin (IMPLEMENTED unless noted)

| Domain | Status |
|--------|--------|
| User management | IMPLEMENTED |
| Vendor approval & impersonation | IMPLEMENTED |
| Platform taxonomy (moods, categories, exp-events) | IMPLEMENTED |
| Experience & event admin | IMPLEMENTED |
| Order/seating oversight | IMPLEMENTED |
| Settlement & wallet admin | IMPLEMENTED |
| ONDC admin | DEFERRED — EXISTING |
| Support ticket management | IMPLEMENTED |
| Media catalog | IMPLEMENTED |

---

## Role / Authorization Matrix

| Capability | Customer | Merchant | Admin | Delivery Rider |
|------------|----------|----------|-------|----------------|
| Auth endpoint | `/authentication` | `/vendorauthentication` | `/admin/auth` | OTP via `/otp-authentication` |
| JWT required | Most flows | All dashboard routes | All admin routes | Order/profile APIs |
| Role check | User token | vendor OR superadmin+impersonation | superadmin only | delivery_person_id |
| Onboarding gate | N/A | have_vendor_submitted_details | N/A | N/A |
| Granular RBAC | N/A | Schema exists; UI PARTIAL | Schema exists | N/A |
| Seating manage | Own diners | vendor/diner | Admin/diner | N/A |
| Order manage | Own orders | merchant/ordering | admin/orders | orders/delivery-persons |
| Experience manage | Book only | vendor/experiences | admin/experience | N/A |
| Event manage | Book only | vendor/events | admin/events | N/A |
| ONDC | Buyer app | Admin only | admin/ondc | N/A |
| Settlements | N/A | Reports | admin/wallet | N/A |

**Tenant restriction:** Data scoped by vendor_id / restaurant_id on virtually all entities.  
**Location restriction:** Walk-in distance limits from subscription config.

---

## Integration Inventory

| Provider | Purpose | Repository | Status |
|----------|---------|------------|--------|
| **MongoDB** | Primary data store | vendordashboard | IMPLEMENTED |
| **Razorpay** | Payments | vendordashboard, web_app | IMPLEMENTED |
| **RazorpayX** | Payouts | vendordashboard | IMPLEMENTED |
| **Firebase FCM** | Push notifications | web_app, self-delivery-app | IMPLEMENTED |
| **Firebase Dynamic Links** | Share/deep links | vendordashboard | IMPLEMENTED |
| **Google Maps** | Location, maps, geocoding | web_app, self-delivery-app, rag-server | IMPLEMENTED |
| **Google OAuth** | Social login | web_app | IMPLEMENTED |
| **WhatsApp Auth** | Login via WhatsApp | vendordashboard, web_app | IMPLEMENTED |
| **MSG91 / SMS** | OTP and SMS | vendordashboard | IMPLEMENTED |
| **Email service** | Transactional email | vendordashboard | IMPLEMENTED |
| **Dunzo** | Third-party delivery | vendordashboard | IMPLEMENTED |
| **Porter** | Third-party logistics | vendordashboard | IMPLEMENTED |
| **OSRM** | Road routing fallback | self-delivery-app | IMPLEMENTED |
| **POS (PetPooja etc.)** | POS webhook/API | vendordashboard | IMPLEMENTED |
| **ONDC network** | Marketplace protocol | vendordashboard, web_app | DEFERRED — EXISTING |
| **PostHog** | Analytics | web_app, dashboard, self-delivery-app | IMPLEMENTED |
| **GA4 / Meta Pixel** | Marketing analytics | web_app | IMPLEMENTED |
| **OpenAI/DeepSeek/Bedrock** | LLM for RAG | rag-server | IMPLEMENTED |
| **AWS Personalize** | Recommendations training | rag-server | IMPLEMENTED |
| **Socket.IO** | Real-time updates | vendordashboard, all frontends | IMPLEMENTED |
| **PostgreSQL** | Driver GPS only | nestjs-backend | IMPLEMENTED |

**Integration count:** 21 identified (including ONDC as deferred)

---

## Background / Async Processing

| Process | Schedule | Purpose | Status |
|---------|----------|---------|--------|
| Diner cron | */1 min | Auto-cancel, wait time, notifications | IMPLEMENTED |
| Session automate | */1 min | Restaurant session open/close | IMPLEMENTED |
| SMS template cron | :20,:50 | Scheduled SMS | IMPLEMENTED |
| Push notification cron | :10,:40 | Scheduled push | IMPLEMENTED |
| Email template cron | :00,:30 | Scheduled email | IMPLEMENTED |
| Order status cron | 05:00 daily | Order completion | IMPLEMENTED |
| Settlement process | 04:00 daily | Settlements, user delete, experience status | IMPLEMENTED |
| Rating review | hourly | Item rating aggregation | IMPLEMENTED |
| Restaurant rating | every 4h | Restaurant rating aggregation | IMPLEMENTED |
| Order cancel cron | */4 min | Auto-cancel orders | IMPLEMENTED |
| Vendor SMS reminder | */15 min 5-20h | Vendor reminders | IMPLEMENTED |
| Vendor default session | 03:00 daily | Default session settings | IMPLEMENTED |
| Wallet monthly reset | 1st of month | monthBalance = 0 | IMPLEMENTED |
| Vendor daily notification | 23:00 daily | Order summary push | IMPLEMENTED |
| Restaurant view reset | daily/weekly | View counters | IMPLEMENTED |
| ONDC refund cron | 18:00 daily | ONDC refunds | DEFERRED (start commented) |
| Referral cron | */3 min | Referral processing | DISABLED (commented) |
| pg_notify listener | continuous | Location broadcast | nestjs-backend only |

**Webhooks inbound:** `/razorpay-webhook`, `/dunzoWebHook`, `/pos/webhook/:posId/:action`, ONDC `/ondc/on_*`

---

## Final Feature Matrix (Representative)

| Capability | Customer | Merchant | Admin | Repo(s) | API | Data | Integration | Status |
|------------|----------|----------|-------|---------|-----|------|-------------|--------|
| OTP login | ✓ | ✓ | ✓ | web_app, dashboard, BE | /authentication, /vendorauthentication, /admin/auth | User Service, VendorUser | SMS | IMPLEMENTED |
| Restaurant discovery | ✓ | — | — | web_app, BE | /listRestaurantCard, /searchGlobal | restaurantCard | Maps | IMPLEMENTED |
| Menu browse | ✓ | ✓ | ✓ | web_app, dashboard, BE | /user/menu | vendoritems, menu | — | IMPLEMENTED |
| Order & pay | ✓ | ✓ | ✓ | all | /user-ordering, /razorpay | ordering, transactional | Razorpay | IMPLEMENTED |
| Delivery fulfill | — | ✓ | — | self-delivery, BE, nestjs | /orders/delivery-persons | ordering, locations | FCM, Maps | IMPLEMENTED |
| Waitlist | ✓ | ✓ | ✓ | web_app, dashboard, BE | /diner | Diner | Socket.IO | IMPLEMENTED |
| Reservation | ✓ | ✓ | ✓ | web_app, dashboard, BE | /diner, /restaurant-availability | Diner, subscription | — | IMPLEMENTED |
| Table management | — | ✓ | ✓ | dashboard, BE | /subscription/table | subscription.table_setup | — | IMPLEMENTED |
| Celebrations | ✓ | ✓ | ✓ | web_app, dashboard, BE | /user/experience | Experience | — | IMPLEMENTED |
| Experience book | ✓ | ✓ | ✓ | web_app, dashboard, BE | /userExpRequest | expRequest | Razorpay | IMPLEMENTED |
| Vendor events | ✓ | ✓ | ✓ | web_app, dashboard, BE | /events, /event-handler | Events, eventHandler | Razorpay | IMPLEMENTED |
| Platform events | ✓ | — | ✓ | web_app, BE, RAG | /exp_events | exp_events | — | IMPLEMENTED |
| Wallet | ✓ | ✓ | ✓ | web_app, dashboard, BE | /wallet | wallet | Razorpay | IMPLEMENTED |
| ONDC | ✓ | — | ✓ | web_app, dashboard, BE | /ondc/* | ondc-* | ONDC network | DEFERRED |
| AI chat discovery (HomePage2) | ✓ | — | — | web_app, RAG server | POST /recommendations | MongoDB read/write user_memory | Remote LLM, Bedrock embeddings | IMPLEMENTED |
| Support tickets | ✓ | ✓ | ✓ | web_app, dashboard, BE | /ticket | ticket | — | PARTIAL |

---

## Audit Statistics

| Metric | Count |
|--------|-------|
| Repositories analyzed | 8 |
| Application repos with code | 6 |
| Customer features (major) | 28 |
| Merchant features (major) | 22 |
| Admin features (major) | 18 |
| Cross-repository capability traces | 14 |
| Business scenarios documented | 42 |
| Backend REST API paths | 423 |
| MongoDB models | 169 |
| External integrations | 21 (incl. ONDC) |
| IMPLEMENTED (major capabilities) | ~85 |
| PARTIAL | ~12 |
| NOT FOUND | ~8 |
| UNKNOWN | ~10 |
| DEFERRED integrations | 1 (ONDC) |

---

## TOP 50 CURRENT LIVE CAPABILITIES

| Rank | Capability | Actor | Status | Repositories | Evidence |
|------|------------|-------|--------|--------------|----------|
| 1 | Customer OTP authentication | Customer | IMPLEMENTED | web_app, BE | /authentication, OtpScreen |
| 2 | Restaurant discovery & search | Customer | IMPLEMENTED | web_app, BE | /home, /search, /searchGlobal |
| 3 | Menu browse with modifiers | Customer | IMPLEMENTED | web_app, BE | MainMenu, /user/menu |
| 4 | Cart & multi-type checkout | Customer | IMPLEMENTED | web_app, BE | Cart, OrderCheckout, orderingSlice |
| 5 | Razorpay payment | Customer | IMPLEMENTED | web_app, BE | useAmealioRazorpay, /razorpay |
| 6 | Order real-time tracking | Customer | IMPLEMENTED | web_app, BE | Socket ordering, TrackOrder |
| 7 | Waitlist seating request | Customer | IMPLEMENTED | web_app, BE | NewSeatingResquest, POST /diner |
| 8 | Seating real-time track | Customer | IMPLEMENTED | web_app, BE | diner_trigger socket |
| 9 | Reservation booking | Customer | IMPLEMENTED | web_app, BE | /seating/reservation, RESERVATION type |
| 10 | Celebrations discovery | Customer | IMPLEMENTED | web_app, BE | Celebrations.jsx, /user/experience |
| 11 | Experience/celebration booking | Customer | IMPLEMENTED | web_app, BE | /userExpRequest, experience checkout |
| 12 | Vendor ticketed events | Customer | IMPLEMENTED | web_app, BE | /user/event-handler TICKET_BOOKED |
| 13 | Event RSVP | Customer | IMPLEMENTED | web_app, BE | /user/event-handler RSVP |
| 14 | User profile & preferences | Customer | IMPLEMENTED | web_app, BE | /profile/new, user-service |
| 15 | Saved addresses | Customer | IMPLEMENTED | web_app, BE | /address |
| 16 | Favorites | Customer | IMPLEMENTED | web_app, BE | /favourites |
| 17 | Order history | Customer | IMPLEMENTED | web_app, BE | /order-history |
| 18 | Wallet payment | Customer | IMPLEMENTED | web_app, BE | /wallet, /payment/wallet |
| 19 | Delivery order tracking | Customer | IMPLEMENTED | web_app, BE, self-delivery | live tracking socket |
| 20 | Short video (bytes/reels) | Customer | IMPLEMENTED | web_app, BE | /bytes, /user/reels |
| 21 | Mood/craving discovery | Customer | IMPLEMENTED | web_app, BE | /mood/*, /craving/* |
| 22 | AI homepage recommendations | Customer | IMPLEMENTED | web_app, RAG | /homepage2, POST /recommendations |
| 23 | Direct merchant UPI/QR payment | Customer | IMPLEMENTED | web_app, BE | DirectMerchantPaymentPage |
| 24 | WhatsApp authentication | Customer | IMPLEMENTED | web_app, BE | /whatsapp-auth |
| 25 | Merchant onboarding | Merchant | IMPLEMENTED | dashboard, BE | subscription, /restaurant |
| 26 | Merchant order dashboard | Merchant | IMPLEMENTED | dashboard, BE | /orderdashboard, /merchant/ordering |
| 27 | Merchant seating dashboard | Merchant | IMPLEMENTED | dashboard, BE | /seatingdashboard, /vendor/diner |
| 28 | Table setup & assignment | Merchant | IMPLEMENTED | dashboard, BE | subscription.table_setup, diner-cron |
| 29 | Menu item management | Merchant | IMPLEMENTED | dashboard, BE | /vendor-items |
| 30 | Experience management | Merchant | IMPLEMENTED | dashboard, BE | /vendor/experiences |
| 31 | Vendor event management | Merchant | IMPLEMENTED | dashboard, BE | /events, /event-handler |
| 32 | Staff & role management | Merchant | IMPLEMENTED | dashboard, BE | /role-management |
| 33 | Merchant reports | Merchant | IMPLEMENTED | dashboard, BE | /dinerReports, /order/reports |
| 34 | Reservation block calendar | Merchant | IMPLEMENTED | dashboard, BE | /manage-reservation-block |
| 35 | Delivery rider order fulfillment | Rider | IMPLEMENTED | self-delivery, BE | orders/delivery-persons |
| 36 | Live GPS tracking | Rider | IMPLEMENTED | self-delivery, nestjs | /tracking updateLocation |
| 37 | Admin vendor approval | Admin | IMPLEMENTED | dashboard, BE | /admin/vendor-user |
| 38 | Admin vendor impersonation | Admin | IMPLEMENTED | dashboard, BE | /admin/vendor-access |
| 39 | Platform experience admin | Admin | IMPLEMENTED | dashboard, BE | /admin/experience |
| 40 | Platform event taxonomy | Admin | IMPLEMENTED | dashboard, BE | /admin/exp-events |
| 41 | Settlement administration | Admin | IMPLEMENTED | dashboard, BE | /admin/wallet, settlement crons |
| 42 | Push/SMS/email notifications | System | IMPLEMENTED | BE | notification crons, FCM |
| 43 | Session open/close automation | System | IMPLEMENTED | BE | session-automate cron |
| 44 | Auto-cancel seating/orders | System | IMPLEMENTED | BE | diner-cron, orderCancelCron |
| 45 | Rating aggregation | System | IMPLEMENTED | BE | rating-review-cron |
| 46 | Dunzo delivery integration | System | IMPLEMENTED | BE | /dunzoQuote, /dunzoWebHook |
| 47 | Porter logistics integration | System | IMPLEMENTED | BE | /logistics/porter/* |
| 48 | POS webhook integration | System | IMPLEMENTED | BE | /pos/webhook |
| 49 | ONDC marketplace (IN) | Customer/Admin | DEFERRED | web_app, BE | /ondc/* |
| 50 | Support ticket management | All | PARTIAL | web_app, dashboard, BE | /ticket (create URL gap) |

---

## TOP 25 CROSS-REPOSITORY DEPENDENCIES

1. web_app → vendordashboard REST for all core flows
2. web_app → vendordashboard Socket.IO for diner/order/expRequest real-time
3. dashboard → vendordashboard REST + Socket for merchant/admin ops
4. self-delivery-app → vendordashboard for orders and rider profile
5. self-delivery-app → nestjs-backend for GPS broadcast
6. web_app → rag-server for homepage2 AI recommendations
7. rag-server → MongoDB (read) shared with vendordashboard
8. Celebrations UI → Experience API → Sub Category taxonomy (admin-configured)
9. Seating UI → Diner API → subscription.table_setup (merchant-configured)
10. Experience booking → expRequest → optional Diner + ordering links
11. Order checkout → Razorpay → updateTransaction → transactional model
12. Delivery order → Dunzo/Porter/own rider → delivery-persons API
13. Merchant onboarding → subscription model gates all feature availability
14. Admin taxonomy → moods/categories → customer discovery APIs
15. Notification crons → FCM/SMS/email → all apps
16. Settlement cron → wallet/transactional → merchant payouts via RazorpayX
17. Session automate cron → restaurant availability → menu/order/seating gates
18. Event booking → Events config → eventHandler → payment → transactional
19. ONDC buyer UI → ONDC services → separate ondc-* models (shared payments)
20. Firebase dynamic links → diner/expRequest shareLink generation
21. Google Maps → customer track + rider navigation + restaurant discovery
22. Role-management schema → backend hooks (partial frontend enforcement)
23. Admin vendor-access → merchant route impersonation in dashboard
24. POS webhook → ordering status → customer track screen
25. Version gate (getAppVersion) → self-delivery-app bootstrap blocking

---

## TOP 25 UNKNOWN / REQUIRES INVESTIGATION

1. Customer interactive table/seat selection UX
2. QR check-in validation for events/experiences
3. CREATE_TICKET endpoint for customer support
4. PilotRouteGuard production activation scope
5. Voice service (Alexa?) integration consumers
6. In-app chat (/chat) frontend existence
7. Profile valet/circle/rewards backend wiring
8. PreOrder while in waitlist full UX path
9. Catering order type production usage
10. automation_delivery service trigger conditions
11. PetPooja fetchMenu cron production status
12. Referral cron (disabled) — still needed?
13. ONDC refund cron (disabled) — production impact?
14. Multi-profile user switching usage
15. web-merchant service consumer
16. Live streaming customer viewing flow
17. Fine-grained RBAC frontend enforcement completeness
18. US market (REACT_APP_COUNTRY=US) feature parity vs IN
19. Legacy ordering/seating routes — traffic share
20. RAG server auth on production endpoint
21. self-delivery push firebase-config route location
22. Experience expType SPECIAL vs CURATED business differences in production
23. Festival vs exp-events vs Events — operator workflow clarity
24. Donation settlement end-to-end flow
25. POS integration merchant adoption rate

---

## TOP 25 MIGRATION RISKS

1. **subscription embedded config** — massive nested document drives all feature gates
2. **Diner ↔ expRequest ↔ ordering cross-links** — must preserve referential behavior
3. **Dual ordering/seating/experience UI stacks** — unclear which is canonical
4. **423 API paths** — many legacy/v2 duplicates to disambiguate
5. **169 MongoDB models** — complex embedded schemas (subscription, ordering items)
6. **Status enum inconsistencies** — NOTSEATED vs NOT_SEATED string variants
7. **Socket.IO event contracts** — diner_trigger, ordering, expRequest, ondc events
8. **Cron-dependent business rules** — auto-cancel, settlement, session automate
9. **Razorpay + updateTransaction two-step payment** — timing sensitivity
10. **ONDC isolation** — shared payment/notification infrastructure
11. **Celebrations naming** — UI label ≠ backend entity; subcategory taxonomy dependency
12. **Table status sync via cron** — not transactional with diner PATCH
13. **Role-management permissions** — schema rich, enforcement unclear
14. **Multi-provider delivery** — Dunzo + Porter + own riders unified as orders
15. **expRequest dual order_id/exp_order_id** — sync requirement
16. **Feathers service hooks** — business logic scattered across hooks/classes/helpers
17. **Environment-specific hardcoding** — celebration promos, subcategory ID maps
18. **Real-time + REST dual paths** — clients depend on both
19. **Admin impersonation** — vendorAccess pattern for support ops
20. **Wallet monthBalance cron reset** — temporal business rule
21. **Experience food included vs extras** — complex checkout branching
22. **Event capacity counters** — leftOverRSVP/TB race conditions
23. **Guest cart vs user cart** — identity transition on login
24. **Firebase dynamic links** — shareLink generation for diner/expRequest
25. **PostgreSQL location service** — separate from Mongo; driverId as PK limits history

---

## Related Documents

| Document | Contents |
|----------|----------|
| REPOSITORY-MAP.md | Repo roles and relationship diagram |
| AI-DISCOVERY-DEEP-DIVE.md | Home Page 2 RAG/LLM service — full pipeline, API, MongoDB, NestJS constraints |
| SEATING-DEEP-DIVE.md | Seating domain forensic detail |
| CELEBRATIONS-DEEP-DIVE.md | Celebrations/experiences/events detail |
| CROSS-REPOSITORY-FEATURE-MAP.md | End-to-end feature traces |
| SCENARIO-MATRIX.md | 42 business scenarios |
| API-INVENTORY.md | 423 REST paths by domain |
| DATA-MODEL-INVENTORY.md | 169 MongoDB models |
| BUSINESS-RULE-INVENTORY.md | Code-enforced rules |
| DEFERRED-ONDC.md | ONDC integration documentation |
| UNKNOWN-AND-GAPS.md | Gaps, dead code, duplicates |

---

**END OF CURRENT-STATE BASELINE AUDIT**

No implementation changes were made. No application source code was modified.
