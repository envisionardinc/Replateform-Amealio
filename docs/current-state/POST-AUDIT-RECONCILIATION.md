# Post-Audit Reconciliation — Amealio Replatforming

> **Type:** READ-ONLY reconciliation & planning checkpoint. **No** implementation, schema, migration, application, frontend, or Python-service changes were made.
> **Authoritative current-state source:** the forensic audit on `cursor/current-state-forensic-audit-07fc` (PR #21), docs under `docs/current-state/` (inspected, not merged).
> **Replatform state reconciled:** completed work through **P1.7.1E** (staff/admin auth), plus P0–P1.7 design/foundation docs and the P1.5 Prisma schema.
> **Purpose:** reconcile prior migration assumptions against the audited reality and record what remains valid, what is now invalid/incomplete, and what must be migrated next — **without deciding final architecture**.

---

## 1. Executive summary

The forensic audit confirms the platform is a **connected multi-repository system** whose system of record is the `amealio-vendordashboard` Feathers.js + MongoDB monolith (**~423 REST paths, ~169 Mongo models, Socket.IO, ~18 cron jobs**), fronted by three web clients (customer, merchant+admin, rider), plus **two satellite services**: a NestJS/PostgreSQL **GPS tracker** and a Python **FastAPI RAG discovery** service.

Most prior replatform discovery (P0–P1.4) was **directionally correct and remains valid** — it correctly identified the backend/clients, the seating (`Diner`), celebrations-are-Experiences, events, wallet, settlement, and delivery domains, and correctly deferred ONDC. The completed build work is a **thin but sound slice**: a normalized PostgreSQL foundation (P1.4/P1.5) for the *core dining/payments/delivery/seating* skeleton, a NestJS app foundation (P1.6/P1.6.1), and **identity/authentication only** (P1.7.1B consumer + P1.7.1E staff/admin, local/dev).

**Three material corrections** emerge from the audit:

1. **The AI/RAG repository is now known and authoritative.** Prior docs recorded the recommendations engine as *"external, repo not present, UNKNOWN — requires review"* (`REPOSITORY_LANDSCAPE.md`). The audit identifies it as **`amealio-homepage-v2-rag-server`** (FastAPI, 8-stage pipeline, Mongo `$vectorSearch`, remote LLM). It **must not be rewritten**; the replatform integrates via its HTTP contract.
2. **Seating/table modeling in the target is incomplete vs the real `Diner` domain.** The target `SeatingRequest` enum lacks `INITIAL`, and the model omits the audited cross-links (`exp_request_id`, `order_id`), wait-time/ETA/`shareLink`, occasion, and the **cron-driven table-status sync** against **subscription-embedded** `table_setup`.
3. **Whole domains have no target schema yet:** Experiences/Celebrations (`Experience`/`expRequest`), Events/Tickets (`Events`/`eventHandler`/`exp_events`), discovery content (reels, moods, cravings, curations), support tickets, POS, and ONDC (deferred). These were flagged OWNER-DECISION/deferred in P1.2 and now need explicit design phases.

**Net:** no prior *decision* is invalidated, but several *scope and schema* assumptions are **incomplete** and must be revised before the corresponding domains are built. The immediate safe next slice is **P1.7.1F — staff/admin RBAC/permission enforcement** on the already-present `Role`/`RolePermission` tables, which is self-contained and unblocked.

---

## 2. Current production architecture (from audit)

| Layer | Repository | Tech | Role |
|---|---|---|---|
| **Backend (system of record)** | `amealio-vendordashboard` | Feathers v4 + Express + Mongoose/MongoDB, Socket.IO, node-cron | ~423 REST paths, ~169 models, real-time + background jobs; auth `/authentication` (customer), `/vendorauthentication` (merchant), `/admin/auth` (admin) |
| **Customer web** | `amealio_web_app` | React 18 CRA, Redux Toolkit | discovery, ordering, seating, celebrations/experiences, profile, `/homepage2` AI chat |
| **Merchant + Admin web** | `amealiodashboardmvp-` | React 16 SPA, Redux | **both** merchant and superadmin UIs (role/host separated) |
| **Rider app** | `amealio-self-delivery-app` | Next.js 15 PWA | OTP login, order fulfillment, GPS |
| **GPS microservice** | `amealio-nestjs-backend` | NestJS 11 + PostgreSQL (TypeORM) | driver location only (`locations` table); `/tracking` WS. **Not** the main backend |
| **AI discovery** | `amealio-homepage-v2-rag-server` | Python 3.11 FastAPI | `POST /recommendations`, 8-stage RAG pipeline, Mongo `$vectorSearch`, remote LLM, `user_memory` |
| **Replatform target** | `replateform-amealio` | NestJS 10 + Prisma + PostgreSQL 16 (monorepo) | this repo |

Integrations (21): MongoDB, Razorpay, RazorpayX, Firebase FCM + Dynamic Links, Google Maps, Google OAuth, WhatsApp auth, MSG91/SMS, email, Dunzo, Porter, OSRM, POS (PetPooja), ONDC (deferred), PostHog, GA4/Meta Pixel, OpenAI/DeepSeek/Bedrock, AWS Personalize (offline), Socket.IO, PostgreSQL (GPS). Background: ~18 cron jobs (diner, session-automate, settlement, notification templates, rating aggregation, wallet monthly reset, order/experience status).

---

## 3. New replatform architecture currently implemented

| Area | State | Evidence |
|---|---|---|
| Monorepo (Turbo + npm workspaces), `apps/api` NestJS 10 | IMPLEMENTED | P1.6/P1.6.1 (`architecture/23-TURBOREPO-MONOREPO.md`) |
| PostgreSQL 16 + Prisma 5 foundation; migrations; seed; validation suite | IMPLEMENTED | P1.5 (`database/19,20`) |
| Relational schema skeleton (see §12) — 57 models, 30 enums | IMPLEMENTED (schema) | `prisma/schema.prisma` |
| Consumer authentication (register/login/refresh/logout/me), Bearer JWT + rotating hashed refresh | IMPLEMENTED (local/dev, password only) | P1.7.1B (`domains/25`) |
| Staff/admin identity schema (`StaffMember`/`StaffCredential`/`StaffSession`, nullable-merchant SUPER_ADMIN) | IMPLEMENTED | P1.7.1D (`domains/26 §24`) |
| Staff/admin authentication (login/refresh/logout/me, dedicated JWT, replay-detected refresh, blocked/deleted enforcement) | IMPLEMENTED (local/dev) | P1.7.1E (`domains/27`) |
| Everything else (discovery, menu, cart, checkout, payments, orders, tracking, delivery, seating behavior, celebrations, events, wallet behavior, notifications behavior, settlements behavior, admin, RBAC enforcement, integrations, realtime) | **NOT STARTED** | — |

**Reality:** the target is an **identity/auth service on a broad relational skeleton**. No business-domain behavior, no real-time layer, no integrations, and no data migration exist yet.

---

## 4. Prior migration assumptions that remain VALID

1. **Backend = `amealio-vendordashboard`** (Feathers + MongoDB), system of record — correctly identified (`REPOSITORY_LANDSCAPE.md`, `01-reference-inventory.md`).
2. **Client split** (customer web / merchant+admin web / rider app) — correct.
3. **Celebrations are Experiences** (no separate `Celebration` entity) — P1.2 already modeled this (`14-CAPABILITY-MATRIX.md §7`); audit confirms.
4. **Seating core = `Diner`** with SEATING vs RESERVATION and a status machine + cron — P1.2/P1.3 identified it; audit confirms.
5. **Payments via Razorpay + a two-step transaction update; RazorpayX payouts; wallet + settlement** — modeled in P1.4 (Payment/Transaction/Settlement/Wallet) and confirmed.
6. **ONDC deferred** — correct (`DEFERRED-ONDC.md`; target has no ONDC models).
7. **GPS is a narrow satellite** (`amealio-nestjs-backend`, PostgreSQL) — correct.
8. **Distinct auth principals** (consumer `User` vs staff `StaffMember` vs SUPER_ADMIN) and **distinct legacy auth endpoints** (`/authentication` / `/vendorauthentication` / `/admin/auth`) — correct (AUTH-D1/D2; audit role matrix).
9. **Subscription is the master merchant-config store gating features** — P1.3/P1.4 noted it; audit strongly confirms (embedded config drives all gates).
10. **Money as integer minor units, named enums, soft-delete, audit/ledger discipline** — P1.4 conventions remain appropriate for the audited financial flows.
11. **Multi-provider delivery unified as orders** (own riders + Dunzo + Porter) — P1.3 mapping holds; target `DeliveryPartner`/`DeliveryTask` skeleton is compatible.
12. **P1.7.1E is accepted and correct** for the local/dev password auth slice; nothing about the audit invalidates it.

---

## 5. Prior migration assumptions that are INVALID or INCOMPLETE

| # | Prior assumption | Audit reality | Classification |
|---|---|---|---|
| I1 | Recommendations/AI engine is **external, repo not present, UNKNOWN** (`REPOSITORY_LANDSCAPE.md` open Q3) | Repo is **`amealio-homepage-v2-rag-server`** (FastAPI), fully audited; must **not** be rewritten | **INVALID** — repo now known + authoritative |
| I2 | Only **6 repositories** in scope (RAG absent from the workspace/landscape enumeration) | **7 app-relevant repos** incl. the RAG server | **INCOMPLETE** — landscape must add the RAG repo |
| I3 | Target `SeatingRequest` status set = PENDING/NOT_SEATED/SEATED/REJECTED/COMPLETED/CANCELLED | `Diner` lifecycle also includes **`INITIAL`**; enum name is `NOTSEATED` (no underscore) in legacy | **INCOMPLETE** — missing `INITIAL`; enum-name normalization must be intentional/documented |
| I4 | Seating captured by a single `SeatingRequest` row + normalized `RestaurantTable` | `Diner` carries **cross-links** (`exp_request_id`, `exp_id`, `order_id`, `cross_ref_id`, `preOrder`), wait-time/ETA (`track_location`, `travelMode`), `occasion`, `isWalkIn`/`pointOfEntry`, `shareLink`; **table status is synced by cron** against **subscription-embedded** `table_setup` | **INCOMPLETE** — target seating model under-specified |
| I5 | Table/seating "concepts" = PARTIAL (`14-CAPABILITY-MATRIX §4`) | Table management is **IMPLEMENTED** via embedded `subscription.table_setup` (floors/seats/tables) + cron status | **INCOMPLETE** — understated; normalization vs embedded-config tension unresolved |
| I6 | Experiences/Events treated as OWNER-DECISION and **not yet designed** in the target schema | Both are **live production domains** (`Experience`/`expRequest`, `Events`/`eventHandler`/`exp_events`) with pricing, packages, capacity, food-included/extras, refunds | **INCOMPLETE** — no target schema exists; whole design phase required |
| I7 | `Subscription` modeled as a thin row + `config Json?` | Subscription is a **massive nested document** driving **all** feature gates, table setup, auto-cancel timers, distance/lead-time rules | **INCOMPLETE** — feature-gate + table-setup semantics not yet designed |
| I8 | Backend path count ~392 (`REPOSITORY_LANDSCAPE.md`) | **~423** REST paths; ~169 Mongo models | **INCOMPLETE** — counts refreshed (also many v1/v2/legacy duplicates) |
| I9 | Consumer auth = general "authentication" capability | Legacy consumer auth is **OTP-first + social + WhatsApp**; target implemented **password-only** | **INCOMPLETE** (by design) — OTP/social/WhatsApp deferred, must be tracked |
| I10 | Admin auth ≈ merchant auth | Admin logs in by **`userId` + password + OTP** and mints tokens with a **cross-wired consumer secret** (defect); admin **impersonation** (`vendor-access`) is a live capability | **INCOMPLETE** — admin OTP + audited impersonation not yet in target |
| I11 | Delivery/GPS repos "deferred / class B" | Delivery (own/Dunzo/Porter) + live GPS are **integral production capabilities** of the ordering flow | **INCOMPLETE** — deferral is phasing, not absence; dependencies must be preserved |
| I12 | Discovery = restaurant/menu browse | Discovery also includes **moods, cravings, curations, reels/bytes**, and the AI chat — none modeled in target | **INCOMPLETE** — content/discovery domain unscoped |

---

## 6. Capability parity matrix

Legend: **IMPLEMENTED** / **PARTIAL** / **NOT STARTED** / **DEFERRED** / **UNKNOWN**. "Schema PARTIAL" = a relational skeleton exists in `prisma/schema.prisma` but no application behavior.

| Capability | Production (audit) | New platform | Notes |
|---|---|---|---|
| Customer authentication | IMPLEMENTED (OTP/social/WhatsApp/pwd) | **PARTIAL** | P1.7.1B password-only; OTP/social/WhatsApp/reset NOT STARTED |
| Merchant authentication | IMPLEMENTED | **PARTIAL** | P1.7.1E password login (local/dev); onboarding gate NOT STARTED |
| Admin authentication | IMPLEMENTED (`userId`+pwd+OTP) | **PARTIAL** | SUPER_ADMIN principal exists; admin OTP + impersonation NOT STARTED |
| Restaurant discovery | IMPLEMENTED | **NOT STARTED** | `Restaurant` schema exists; no discovery API |
| Conventional search | IMPLEMENTED | **NOT STARTED** | `/searchGlobal` etc. unmodeled |
| AI discovery / HomePage2 | IMPLEMENTED (Python) | **NOT STARTED** | Integrate via RAG HTTP contract; **do not rewrite** |
| Restaurant / menu | IMPLEMENTED | **Schema PARTIAL** | Menu/MenuItem/variants/add-ons/channel-config modeled; no behavior |
| Cart | IMPLEMENTED | **Schema PARTIAL** | Cart/CartItem modeled; guest-vs-user identity transition unmodeled |
| Checkout | IMPLEMENTED | **NOT STARTED** | multi-order-type checkout unmodeled |
| Payments | IMPLEMENTED (Razorpay) | **Schema PARTIAL** | PaymentIntent/Attempt/WebhookEvent/Transaction modeled; no gateway integration |
| Orders | IMPLEMENTED | **Schema PARTIAL** | Order/OrderItem/OrderStatusEvent modeled; numeric legacy status mapping (OD-11) unresolved |
| Real-time order tracking | IMPLEMENTED (Socket.IO) | **NOT STARTED** | no realtime layer in target |
| Delivery | IMPLEMENTED (own/Dunzo/Porter) | **Schema PARTIAL** | DeliveryPartner/Person/Task modeled; no provider adapters |
| Seating (waitlist) | IMPLEMENTED | **Schema PARTIAL (incomplete)** | SeatingRequest missing `INITIAL` + cross-links + ETA/shareLink |
| Reservation | IMPLEMENTED | **Schema PARTIAL** | SeatingRequest RESERVATION + ReservationBlock modeled; availability engine NOT STARTED |
| Table management | IMPLEMENTED (embedded) | **Schema PARTIAL (mismatch)** | RestaurantTable/SeatingArea normalized vs legacy embedded `table_setup` + cron |
| Celebrations / experiences | IMPLEMENTED | **NOT STARTED (no schema)** | no `Experience`/`expRequest` models |
| Events | IMPLEMENTED | **NOT STARTED (no schema)** | no `Events`/`eventHandler`/`exp_events` |
| Tickets / RSVP | IMPLEMENTED | **NOT STARTED (no schema)** | capacity counters (`leftOverRSVP`/`leftOverTB`) unmodeled |
| Food included vs extras | IMPLEMENTED | **NOT STARTED** | experience packages + exp-cart/checkout unmodeled |
| Profile / preferences | IMPLEMENTED | **Schema PARTIAL** | UserProfile modeled; preferences/favorites behavior NOT STARTED |
| Wallet | IMPLEMENTED | **Schema PARTIAL** | Wallet/WalletEntry modeled; monthly-reset + KYC behavior NOT STARTED |
| Notifications | IMPLEMENTED (FCM/SMS/email) | **Schema PARTIAL** | Template/Request/Delivery/DevicePushToken modeled; senders + template crons NOT STARTED |
| Settlements | IMPLEMENTED | **Schema PARTIAL** | Settlement/SettlementItem/Payout/Withdrawal modeled; settlement engine NOT STARTED |
| Admin | IMPLEMENTED | **NOT STARTED** | oversight/taxonomy/impersonation unmodeled |
| Merchant configuration (subscription) | IMPLEMENTED (embedded) | **Schema PARTIAL (thin)** | thin `Subscription` + `config Json?`; feature-gate semantics unmodeled |
| RBAC | Schema exists; enforcement PARTIAL | **Schema PARTIAL** | Role/RolePermission + StaffRole exist; **enforcement = P1.7.1F (next)** |
| Integrations (21) | IMPLEMENTED | **NOT STARTED** | only `WebhookEvent` model; no adapters |
| ONDC | IMPLEMENTED (IN) | **DEFERRED** | correctly out of scope |

---

## 7. Cross-repository dependency matrix (must be preserved during migration)

| # | Dependency | Direction | Preserve |
|---|---|---|---|
| 1 | Customer web → backend REST | `web_app → vendordashboard` | all core flows |
| 2 | Customer web → backend Socket.IO | `web_app → vendordashboard` | diner/order/expRequest realtime |
| 3 | Merchant+admin web → backend REST + Socket | `dashboardmvp → vendordashboard` | ops + realtime |
| 4 | Rider app → backend | `self-delivery → vendordashboard` | orders + rider profile |
| 5 | Rider app → GPS service | `self-delivery → nestjs-backend` | `/tracking` WS location broadcast |
| 6 | Customer web → RAG | `web_app → rag-server` | `POST /recommendations`, history |
| 7 | RAG → MongoDB (read + `user_memory` write) | `rag-server → Mongo amealio` | vector search + memory |
| 8 | Celebrations UI → Experience API → Sub Category taxonomy | admin-configured | subcategory filter |
| 9 | Seating UI → Diner API → `subscription.table_setup` | merchant-configured | table truth |
| 10 | Experience booking → expRequest → optional Diner + ordering | cross-domain links | referential behavior |
| 11 | Order checkout → Razorpay → `updateTransaction` → transactional | two-step | payment sequencing |
| 12 | Delivery order → own/Dunzo/Porter → delivery-persons | provider abstraction | unified as orders |
| 13 | Merchant onboarding → subscription → feature gates | config-driven | gate all availability |
| 14 | Admin taxonomy (moods/categories/exp-events) → discovery | admin → customer | discovery inputs |
| 15 | Notification crons → FCM/SMS/email | system → all apps | scheduled comms |
| 16 | Settlement cron → wallet/transactional → RazorpayX | system → payouts | merchant payouts |
| 17 | Session-automate cron → restaurant availability | system → gates | open/close sessions |
| 18 | Event booking → Events → eventHandler → payment → transactional | cross-domain | ticket/RSVP + capacity |
| 19 | ONDC buyer UI → ONDC services → shared payments/notifications | deferred | isolation + shared infra |
| 20 | Firebase dynamic links → diner/expRequest `shareLink` | share/deep-link | link generation |
| 21 | Google Maps → customer track + rider nav + discovery | integration | location |
| 22 | Role-management schema → backend hooks | RBAC | partial UI enforcement |
| 23 | Admin `vendor-access` → merchant impersonation | support ops | audited act-as (future) |
| 24 | POS webhook → ordering status → customer track | integration | order state |
| 25 | App-version gate (`getAppVersion`) → rider bootstrap | blocking | version gating |

---

## 8. Critical business rules to preserve

**Seating:** `service_type` SEATING vs RESERVATION; `Diner` status `INITIAL→PENDING→NOTSEATED→SEATED→COMPLETED|REJECTED|CANCELLED`; table status `OCCUPIED` on SEATED / `AVAILABLE` on terminal states (cron-synced, **not** transactional with the diner PATCH); walk-in distance limit (default 10000m); reservation min/max party, lead time, cut-off, block calendar; auto-cancel timers differ for open vs closed restaurant.

**Ordering/payments:** order-type gating via subscription; order auto-cancel cron; numeric `order_status` enum (rider `5=on the way`, `6=delivered`); Razorpay + `updateTransaction` two-step; POS webhook status updates; refund records in `transactionDetails`; gateway/outgoing charges tracked.

**Experiences/events:** `expRequest` status `INITIAL→PENDING→NOTSEATED→SEATED→GETTING_PREPARE→SERVED→COMPLETED|REJECTED|CANCELLED|PAYMENT_UPDATE`; `minSeats`/`maxSeats`/`allowSingleBooking`; `is_food_included` vs separate menu; experience refunds + status cron; `blockSettlement`; event `RSVP` vs `TICKET_BOOKED`; capacity decrement (`leftOverRSVP`/`leftOverTB`) with race risk; RSVP auto-accept; ticket payment required.

**Financial/temporal:** payment method + status enums platform-wide; wallet **monthly balance reset** (1st of month); settlement daily 04:00 + user-delete + experience status; rating aggregation (hourly/4h); session-automate (open/close); split payment (`pendingAmount`).

**Auth/tenancy:** role-based auth paths; merchant onboarding gate (`have_vendor_submitted_details`); superadmin-only admin routes; data scoped by `vendor_id`/`restaurant_id`; ONDC cancel commission 5% + refund delay 3 days (deferred but existing).

---

## 9. Seating migration constraints

- **First-class domain**, not a simple reservation table. Must model: waitlist + reservation + walk-in; the full `Diner` lifecycle (incl. `INITIAL`); party composition (adult/kids/high-chair/handicap); seating preferences + occasion; wait-time + ETA tracking (`track_location`, `travelMode`); `shareLink` (Firebase dynamic link).
- **Cross-links are load-bearing:** `exp_request_id`, `exp_id`, `order_id`, `cross_ref_id`, `preOrder` — seating can be created by an experience booking and linked to an order. The target `SeatingRequest` currently has **none** of these.
- **Table setup is subscription-embedded** (`floors[]`/`seat[]`/`table[]`, plus event `general_rooms`/`banquet*`). Target normalizes to `RestaurantTable`/`SeatingArea`; the migration must preserve semantics and the **cron-driven table-status sync** (`AVAILABLE`/`OCCUPIED`), which is **not transactional** with the diner update.
- **Config-enforced rules** (distance, auto-cancel open/close, reservation lead/cut-off, block calendar) live in subscription and must be represented wherever table setup lands.
- **Realtime:** `diner_trigger` Socket.IO event drives the customer track screen — a target realtime equivalent is required.
- Target enum gap: add `INITIAL`; decide and document `NOTSEATED` vs `NOT_SEATED` naming (legacy uses `NOTSEATED`).

---

## 10. Celebrations / Experience / Event migration constraints

- **No single "Celebration" entity.** Preserve the taxonomy: **Experience** (subcategory-filtered = customer "Celebrations"), **expRequest** (booking), **Occasions** (`expType SPECIAL|CURATED`), **exp_events / ExpEventManagement** (platform taxonomy/festivals), **Events + eventHandler** (vendor RSVP/ticketed).
- Experience model carries: `packages[]` (adult/kids counts), `adultPrice`/`kidsPrice`/`Occasion_price`/`Listing_price`, `totalSeats`/`minSeats`/`maxSeats`/`seatsBooked`/`seatsLeft`, `allowSingleBooking`, `is_food_included`, menu lists (`isStandardMenu`/`isCustomMenu`/`isPackage`), `subCategory`, `shareLink`.
- **Food included vs extras** branches checkout: package food vs `/experience-menu` + `/user/exp-cart` + `/user/exp-checkout` linked to `expRequest`.
- **expRequest dual order refs** (`order_id` / `exp_order_id`) must stay in sync; optional `diner_id` (seating) + `experienceId`.
- Events: `event_type` RSVP vs TICKET_BOOKED; capacity `leftOverRSVP`/`leftOverTB` decrement (race-prone); `min/max_people_per_booking`; online events (`eventLink`/`eventPassword`); offline event `table_setup`; auto-accept.
- Payments/refunds/cancellation + status/auto-cancel crons + `blockSettlement`.
- **Target has no schema for any of this** — a dedicated design phase (mirroring the P1.7.1C→E pattern) is required before implementation.

---

## 11. AI Discovery migration constraints

- **Existing production capability — do NOT rewrite.** Repo `amealio-homepage-v2-rag-server` (FastAPI, port 8000). Consumed by `amealio_web_app /homepage2`.
- **Preserve the HTTP contract:** `POST /recommendations` (body `{ query, user_id, session_id, current_area/city/lat/lon, top_k, concierge_context }`, no `Authorization`), section-typed cards (`restaurants/items/bytes/events/recipes`), `follow_up_suggestions`, and `GET /recommendations/history`.
- **Preserve behavior:** 8-stage pipeline; parallel Mongo `$vectorSearch` across 5 collections with area→city→none location fallback; dietary contract filters; profile/craving/mood ranking boosts + allergy penalty; concierge memory + chat-history persistence to `user_memory`; domain guardrail + offline LLM fallback.
- **Hard dependencies that cannot move now:** MongoDB `$vectorSearch` + prebuilt `"vector index"` on pre-embedded catalog docs; remote LLM HTTP contract; `user_memory` write format; the ~2,900-line tuned Python ranking/retrieval logic.
- **Replatform role:** integrate via a NestJS proxy/adapter to the Python service; treat PostgreSQL/vector migration as a much-later, separately-reviewed effort. **Security note:** the production endpoint is currently **unauthenticated** (JWT middleware only on legacy `main.py`) — an owner decision on auth is required before exposing any proxy.

---

## 12. MongoDB → PostgreSQL migration constraints (flag only; no schema decisions here)

Where the audit shows prior PostgreSQL assumptions may be **insufficient**:

| Area | Concern |
|---|---|
| **Embedded subscription config** | thin target `Subscription{config Json?}` cannot yet express feature gates, table setup, auto-cancel/distance/lead-time rules as first-class, queryable structures |
| **Embedded table setup** | `floors/seats/tables` (+ event rooms/banquet) live inside subscription; normalization to `RestaurantTable`/`SeatingArea` must preserve status-sync semantics |
| **Ordering embedded structures** | `ordering` embeds items/modifiers/payment/delivery/diner cross-refs + **numeric** status enum (OD-11 mapping unresolved) |
| **Experience packages** | nested `packages[]` + pricing tiers + menu lists have no target model |
| **Event seating** | offline-event `table_setup` duplicates the seating structure; capacity counters need atomic decrement |
| **User memory / vector search** | Mongo-only (`user_memory` + `$vectorSearch`); not portable to Postgres without an embedding/index strategy |
| **Cross-domain references** | `Diner ↔ expRequest ↔ ordering`, `expRequest.order_id/exp_order_id`, `experienceId/diner_id` — relational FKs must encode these safely |
| **Payment records** | `transactional` + `payments` + `refund` + gateway/outgoing charges; two-step Razorpay update sequencing |
| **Settlement records** | `settlement`/`settlement-record`/`resetSettlements` + `blockSettlement` + monthly wallet reset + RazorpayX payouts |

**Do not design the final schema in this task.** These are inputs to future per-domain design phases.

---

## 13. API migration constraints

- ~**423** Feathers paths, many with **v1/v2/legacy duplicates** (e.g. `/user/menu` vs `/v2/user/menu`, `/vendor-items` vs `/v2/vendor-items`, legacy vs new ordering/seating/experience UI routes) — disambiguate canonical vs legacy before mapping.
- **Distinct business capabilities** must map to target modules (auth, discovery, menu, ordering, payments, seating, experiences, events, wallet, settlement, delivery, notifications, admin, taxonomy).
- **Behavior hidden in hooks/helpers/crons** (Feathers service hooks, `helpers/*`, cron classes) — the REST surface understates the logic; migration must extract rules from hooks (e.g. `updateTableStatusInSubscription`, `experienceRefund`, `orderCancelCron`).
- **Socket.IO equivalents required** for `diner_trigger`, `ordering`, `expRequest`, delivery `assign_delivery_person`, and ONDC events (deferred).
- Auth endpoints intentionally triple (`/authentication`, `/vendorauthentication`, `/admin/auth`) — the target's principal split already honors this.

---

## 14. Real-time / Socket.IO migration constraints

- Customer + merchant + rider clients depend on **both REST and Socket.IO**; the target currently has **no realtime layer**.
- Events to preserve: `diner_trigger`/`diner_creation`/`diner_request_count` (seating), `ordering`/`order_trigger`/`order_update` (orders), `expRequest` patches (experiences), `assign_delivery_person`/`update_location` (delivery), and GPS `/tracking` `updateLocation`/`locationUpdated` (NestJS service).
- The GPS service already uses PostgreSQL + a `pg_notify` listener for location broadcast — a reusable pattern reference.
- A target realtime transport (WebSocket/Socket.IO gateway) and event-contract compatibility are prerequisites for order-tracking and seating parity.

---

## 15. Cron / background-job migration constraints

~18 jobs to reproduce (schedules matter): diner cron (*/1 min: auto-cancel, wait-time, notifications), session-automate (*/1 min), SMS/push/email template crons, order-status (05:00) + order-cancel (*/4 min), settlement + user-delete + experience-status (04:00), rating aggregation (hourly/4h), **wallet monthly reset (1st of month)**, vendor reminders/notifications, view-count resets. **Disabled/commented** in production: ONDC refund cron, referral cron, some order/event crons — confirm intent before porting. Cron-enforced rules are **business-critical** (table status, auto-cancel, settlements) and must not be lost to a naive REST-only migration.

---

## 16. Integration constraints

Preserve/plan adapters for: **Razorpay** (+ webhook signature) & **RazorpayX** (payouts); **Firebase FCM** + **Dynamic Links** (`shareLink`); **Google Maps** (+ **OAuth** social login); **WhatsApp auth**; **MSG91/SMS** + email; **Dunzo** + **Porter** + **OSRM** (delivery/routing); **POS** (PetPooja webhook/API); **PostHog/GA4/Meta Pixel** (analytics); **OpenAI/DeepSeek/Bedrock** + **AWS Personalize** (RAG, offline); **Socket.IO**; **ONDC** (deferred). Target currently has only a `WebhookEvent` model and provider-port *conventions* (P1.6) — no live adapters. Provider abstraction (ports/adapters) from P1.6 is the right seam.

---

## 17. Security / authorization constraints

- **Preserve semantically:** distinct principals + endpoints; tenant scoping by merchant/restaurant; merchant onboarding gate; superadmin-only admin surface; audited admin **impersonation** (`vendor-access`) as a future explicit act-as (per doc 26 §14).
- **Do NOT preserve (defects):** portal-header as a security mechanism; admin tokens minted with the consumer secret; hardcoded secrets/subjects; stateless refresh; raw `Authorization` header — all already rejected by P1.7.1B/E.
- **RBAC:** legacy `role-management` has rich `vendorPermission`/`superAdminPermission` trees but **enforcement is PARTIAL** (backend hooks; coarse frontend guards). The target has `Role`/`RolePermission` + coarse `StaffRole`; **enforcement is not yet built** → this is **P1.7.1F** and depends on the AUTH-D6 permission-catalogue owner decision.
- **RAG endpoint is unauthenticated** in production — an owner decision is required before any target proxy exposes it.

---

## 18. Unknowns that still require owner decisions

Carried from prior phases and reaffirmed by the audit:

1. **AUTH-D6** — staff/admin permission catalogue + enforcement model (blocks RBAC / P1.7.1F fine-grained authz).
2. **O1** — staff login-identifier uniqueness scope (email/phone global vs per-merchant).
3. **AUTH-D4** — staff password migration (staged first-login vs forced reset).
4. **AUTH-D7** — legacy token compatibility window (recommended: hard cutover).
5. **AUTH-D9** — staff password reset in initial scope.
6. **OD-11** — legacy **numeric** order/payment status enum → named-enum mapping (blocks Orders/Payments/Wallet data migration).
7. **Consumer OTP/social/WhatsApp** scope + provider ownership (MSG91, Google, WhatsApp).
8. **Subscription config** target representation: normalized tables vs JSON vs hybrid (drives feature gates + table setup).
9. **Table setup** modeling: keep embedded vs normalize to `RestaurantTable`; how to preserve cron status-sync.
10. **Experiences/Events** design: entity boundaries, packages/pricing, capacity atomicity, food-included branching.
11. **AI discovery** target strategy: proxy Python vs partial port; auth for the recommendations endpoint; who maintains embeddings/vector index.
12. **Realtime transport** choice + Socket.IO event-contract compatibility.
13. **Admin impersonation** (act-as) product requirements + audit fields.
14. **ONDC** re-entry timing (deferred) + shared payment/settlement handling.
15. **Delivery provider** scope in first wave (own riders vs Dunzo/Porter) + GPS service reuse vs re-implementation.

---

## 19. Recommended migration sequencing (proposal only; no decisions made)

Grounded in the audit dependencies and current target state:

1. **P1.7.1F — Staff/admin RBAC & permission enforcement** on existing `Role`/`RolePermission` (self-contained; unblocked except AUTH-D6 catalogue). **← recommended next slice.**
2. **Consumer auth completion** (OTP/social/WhatsApp/reset) — owner-scoped; independent of business domains.
3. **Merchant/restaurant + subscription foundation** — resolve subscription/feature-gate + table-setup modeling (unblocks seating, ordering, experiences). Design phase first (P1.7.1C-style), then schema, then behavior.
4. **Menu/catalog** — depends on merchant/restaurant.
5. **Ordering + payments + realtime tracking** — depends on menu + subscription gates + OD-11 mapping + a realtime transport; integrate Razorpay + webhook.
6. **Delivery** — depends on ordering; reuse/adapt the GPS service; provider adapters (own → Dunzo/Porter).
7. **Seating (Diner)** — depends on subscription table-setup + realtime; restore full lifecycle + cross-links + cron status-sync.
8. **Experiences/Celebrations + Events/Tickets** — depends on seating + ordering + payments (cross-links); dedicated design phase.
9. **Wallet + settlements + notifications crons** — cross-cutting financial/comms; depends on payments/orders.
10. **Discovery/content** (moods/cravings/curations/reels) + **AI proxy** integration.
11. **Admin oversight + taxonomy + impersonation (audited act-as)**.
12. **ONDC** (deferred) — last, if/when re-scoped.

Each step should follow the proven **design → schema → implementation → test** cadence (as P1.7.1C→D→E did), remain feature-flagged and reversible, and preserve the §7 dependencies and §8 rules.

---

## 20. P1.7.1E status and implications for next phase

- **P1.7.1E is ACCEPTED and unchanged** by this reconciliation. Staff/admin password auth (local/dev) is correct and complete for its slice: dedicated-secret Bearer JWT, rotating replay-detected refresh on `StaffSession`, blocked/deleted enforcement, SUPER_ADMIN via nullable `merchantId`. 119/119 tests, no schema change.
- **Implication:** the authentication *foundation* is sufficient to proceed to **authorization enforcement (P1.7.1F)** — the natural, self-contained next slice that consumes the already-present `Role`/`RolePermission` tables without new domains or schema risk. Its only external dependency is the **AUTH-D6** permission-catalogue owner decision; a coarse `staffRole`-based enforcement can ship first and refine later.
- **Boundary reminder:** business-domain migration (merchant/subscription, ordering, seating, experiences, events, discovery, AI, delivery) remains **NOT STARTED** and each requires its own design phase informed by this reconciliation.

---

## Appendix — Reconciliation provenance

- **Audit docs inspected (not merged), branch `cursor/current-state-forensic-audit-07fc`:** `CURRENT-STATE-REALITY-BASELINE.md`, `REPOSITORY-MAP.md`, `CROSS-REPOSITORY-FEATURE-MAP.md`, `SCENARIO-MATRIX.md`, `API-INVENTORY.md`, `DATA-MODEL-INVENTORY.md`, `BUSINESS-RULE-INVENTORY.md`, `SEATING-DEEP-DIVE.md`, `CELEBRATIONS-DEEP-DIVE.md`, `AI-DISCOVERY-DEEP-DIVE.md`, `UNKNOWN-AND-GAPS.md`, `DEFERRED-ONDC.md`.
- **Replatform docs/artifacts reviewed:** `docs/migration/` (P0 governance, `01–10` discovery, `india-baseline/14-CAPABILITY-MATRIX.md` etc., `REPOSITORY_LANDSCAPE.md`, `SOURCE_REPOSITORIES.md`, `target-architecture/*`, `database/*`, `application/21`, `domains/22–27`, `MIGRATION_STATUS.md`), and `prisma/schema.prisma` (57 models, 30 enums).
- **No** application, schema, migration, frontend, or Python-service files were modified.
