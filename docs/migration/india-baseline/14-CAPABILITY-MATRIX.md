# 14 — India Baseline Capability Matrix

**Task:** P1.2 — define exactly what "India baseline restored" means. **Analysis & specification only** — no code, schema, data migration, or production changes. Evidence source: P1.1 docs ([01](./01-SYSTEM-OVERVIEW.md)–[13](./13-MIGRATION-IMPLICATIONS.md)) and the cited source files. Every capability is evidence-backed; nothing is invented.

## Legends

**Existence status** (does it exist today?): `IMPLEMENTED` · `PARTIAL` · `REFERENCE-ONLY` · `NOT-IMPLEMENTED` · `UNKNOWN`

**Baseline classification** (is it part of the initial India baseline?):
1. **REQUIRED** — EXISTING AND REQUIRED for baseline
2. **PARTIAL** — EXISTING BUT PARTIALLY IMPLEMENTED
3. **OPTIONAL** — EXISTING BUT OPTIONAL for the initial baseline
4. **NON-BASELINE** — REFERENCE / not part of baseline (incl. deferred repos, external repos)
5. **DEPRECATED** — legacy, superseded
6. **OWNER-DECISION** — UNKNOWN / requires owner decision

Repos: **VD** = `amealio-vendordashboard` (backend), **WEB** = `amealio_web_app` (consumer), **DASH** = `amealiodashboardmvp-` (admin+merchant). Full acceptance criteria for REQUIRED capabilities: [15](./15-BASELINE-ACCEPTANCE-CRITERIA.md).

---

## 1. Identity & Access

| Capability | Status | Baseline | Repos | Source files | DB entities | Ext deps | Maturity | Complexity |
|-----------|--------|----------|-------|--------------|-------------|----------|----------|-----------|
| Registration (phone OTP / social / WhatsApp / guest) | IMPLEMENTED | REQUIRED | VD, WEB | `src/authentication.ts`, `services/{social-sign-up,whatsapp-auth,otp-authentication}`; WEB `SignUp.js`, `UserLogin.js` | `users`,`tempusers`,whatsapp-login | MSG91, Firebase | High | High |
| Login (consumer / merchant / admin) | IMPLEMENTED | REQUIRED | VD, WEB, DASH | `src/authentication.ts`; WEB `App.js`; DASH `authAction.js` | `users`,`vendorusers`,`sessions` | MSG91 | High | High |
| Logout | IMPLEMENTED | REQUIRED | VD, WEB, DASH | `services/logout`, `PlainRevokableAuthService` | `sessions` | — | Medium | Medium |
| Password / reset | IMPLEMENTED | REQUIRED (merchant) / OPTIONAL (consumer, OTP-first) | VD, DASH | `services/{forgot-password,reset-password,change-password,vendor-change-password}` | `users`,`vendorusers`,`changepasswords` | MSG91/email | Medium | Medium |
| Profile | IMPLEMENTED | REQUIRED | VD, WEB, DASH | `services/user-service`, `user/profiles`; WEB `AmealioProfilePageRoute.jsx` | `users`,`userprofiles` | — | High | Medium |
| Roles | IMPLEMENTED | REQUIRED | VD, DASH | `src/authentication.ts` (portal), `models/role-management.model.ts` | `vendorusers.role`,`roles` | — | Medium | Medium |
| Permissions (RBAC) | IMPLEMENTED | REQUIRED | VD, DASH | `models/role-management.model.ts`, `services/role-management` | `roles` (permission trees) | — | Medium | High |
| Session / token behavior | IMPLEMENTED | REQUIRED | VD, WEB, DASH | `src/authentication.ts`, `models/session.model.ts`, `services/get-refresh-token` | `sessions` | — | Medium | High |

**Business rules:** blocked-user rejection, social-account guard, reactivation, unverified-409, session TTL — [07](./07-BUSINESS-RULES.md). **Open Q:** guest/temp-user token flow (`UNKNOWN`); in-process revocation won't scale.

## 2. Consumer

| Capability | Status | Baseline | Repos | Source files | DB entities | Ext deps |
|-----------|--------|----------|-------|--------------|-------------|----------|
| Home / discovery (moods/cravings/curations) | IMPLEMENTED | REQUIRED | WEB, VD | WEB `MainHomeScreen.jsx`; VD `services/{mood,cravings,user-curation}` | `moods`,`cravings` | recommendations API (ext) |
| Search | IMPLEMENTED | REQUIRED | WEB, VD | WEB `GlobalSearch.jsx`; VD `searchGlobal`,`searchRestaurant(Card)` | `restaurants`,`restaurantcards` | Google Maps |
| Restaurant discovery | IMPLEMENTED | REQUIRED | WEB, VD | `listRestaurant`,`filter-restaurant` | `restaurants` | Google Maps |
| Restaurant details | IMPLEMENTED | REQUIRED | WEB, VD | WEB `NewRestaurantDetails`; VD `restaurant` | `restaurants` | — |
| Menu browsing | IMPLEMENTED | REQUIRED | WEB, VD | WEB `MainMenu`; VD `user/menu`,`v2/user/menu` | `menus`,`vendoritems` | — |
| Cart | IMPLEMENTED | REQUIRED | WEB, VD | WEB `cartManager.js`; VD `user/cart`,`guest/cart` | `carts` (`user_carts` legacy) | integration svc (avail) |
| Checkout | IMPLEMENTED | REQUIRED | WEB, VD | WEB `OrderCheckout.jsx`; VD `user/checkout`,`order-charges` | `orderings`,`transactionals` | Razorpay |
| Order placement | IMPLEMENTED | REQUIRED | WEB, VD | VD `user-ordering` | `orderings` | Razorpay |
| Order history | IMPLEMENTED | REQUIRED | WEB, VD | WEB `/order-history`; VD `ordering` (find) | `orderings` | — |
| Order tracking (status) | IMPLEMENTED | REQUIRED | WEB, VD | WEB `OrderTrackScreenNew.jsx`; VD `ordering` events | `orderings` | — |
| Order tracking (live GPS map) | PARTIAL | PARTIAL | WEB | WEB live-tracking socket | — | **live-tracking socket / integration svc (deferred/ext)** |
| Favorites | IMPLEMENTED | OPTIONAL | WEB, VD | `User.favourites/*Fav`; `/favourites` | `users` arrays | — |
| Profile (consumer) | IMPLEMENTED | REQUIRED | WEB, VD | WEB `AmealioProfilePageRoute.jsx` | `users`,`userprofiles`,`addresses` | — |
| Notifications (in-app/push) | IMPLEMENTED | REQUIRED | WEB, VD | `inAppNotification`, FCM | `notifications`,`inappnotifications` | FCM |
| Community / Bytes(reels) | IMPLEMENTED | OPTIONAL | WEB, VD | WEB `Community.jsx`,`MainBytesScreen.jsx`; VD `reels`,`user/community` | `reels`,`chats` | — |
| Wallet page | UNKNOWN | OWNER-DECISION | WEB, VD | API `wallet`,`payment/wallet`; no dedicated web route | `wallets` | — |

## 3. Restaurant / Merchant

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Restaurant onboarding | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/mapsetup`+subscription pickers; VD `restaurant`,`restaurantchain` | `restaurants`,`vendorusers` |
| Restaurant profile | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/editrestaurantdetails`; VD `restaurant` | `restaurants` |
| Locations (geo) | IMPLEMENTED | REQUIRED | DASH, VD | `restaurant.location` 2dsphere | `restaurants` |
| Operating hours | IMPLEMENTED | REQUIRED | DASH, VD | `models/manage-hours-of-operation`; `restaurant.monday..sunday` | `restaurants`,`managehoursofoperations` |
| Availability (open/session) | IMPLEMENTED | REQUIRED | VD | `restaurant-availability`,`checkOpen`,`session-automate` | `restaurants` |
| Menu management | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/menusetup-dashboard`; VD `menu`,`merchant/menu` | `menus` |
| Categories | IMPLEMENTED | REQUIRED | DASH, VD | `menu-category` | `menucategories` |
| Products / items | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/additemavailablity`; VD `vendor-items` | `vendoritems` |
| Modifiers / options (add-ons) | IMPLEMENTED | REQUIRED | DASH, VD | `vendorItems.addOns`, size/channel blocks | `vendoritems` |
| Pricing (per channel) | IMPLEMENTED | REQUIRED | DASH, VD | `vendorItems` channel blocks; `order-charges` | `vendoritems`,`menucategories` |
| Availability management (sold-out) | IMPLEMENTED | REQUIRED | DASH, VD | `resetsoldout`; item `availability` | `vendoritems` |
| Order management | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/orderdashboard`; VD `ordering`,`merchant/ordering` | `orderings` |
| Reservation management | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/reservationdashboard`; VD `vendor/diner` | `diners` |
| Customer management | PARTIAL | OPTIONAL | DASH, VD | DASH vendor views; VD `admin/user-service` | `users` |
| Promotions (merchant) | IMPLEMENTED | OPTIONAL | DASH, VD | DASH `/offer`; VD `vendor/offers` | `offers` |
| Reporting (merchant) | IMPLEMENTED | OPTIONAL | DASH, VD | DASH `/reportdashboard`; VD `*Reports` | operational |
| Settlements / earnings / withdrawals | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/mainsettlementsvendor`,`/earnings`; VD `settlement*`,`withdraw-request` | `settlements`,`withdrawrequests` | 
| Staff & roles | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/rolemanagement`,`/staffmanagement`; VD `role-management` | `roles`,`vendorusers` |

## 4. Dining / Reservations

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Restaurant discovery (for dining) | IMPLEMENTED | REQUIRED | WEB, VD | (see Consumer) | `restaurants` |
| Table / availability concepts | PARTIAL | PARTIAL | VD | `models/seating-area`,`waiter`; `diner` | `seating areas`,`diners` |
| Reservations (create) | IMPLEMENTED | REQUIRED | WEB, VD | WEB `NewSeatingResquest.jsx`; VD `user/diner` (RESERVATION) | `diners`,`managereservationblocks` |
| Reservation lifecycle | IMPLEMENTED | REQUIRED | VD | `diner` status machine; `cron/diner` | `diners`,`diner statuses` |
| Cancellation | IMPLEMENTED | REQUIRED | VD | `diner` status CANCELLED | `diners` |
| Confirmation | IMPLEMENTED | REQUIRED | VD | `diner_trigger`, auto-accept rules | `diners` |
| Dining notifications | IMPLEMENTED | REQUIRED | VD | notifications + `diner_trigger` | `notifications` |

## 5. Orders

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Cart | IMPLEMENTED | REQUIRED | WEB, VD | `user/cart`,`guest/cart` | `carts` |
| Order creation | IMPLEMENTED | REQUIRED | WEB, VD | `user-ordering` | `orderings` |
| Order lifecycle / status | IMPLEMENTED | REQUIRED | VD | `ordering.hooks.ts`, env `ORDERSTATUS_*` | `orderings` |
| Order history | IMPLEMENTED | REQUIRED | WEB, VD | `ordering` (find) | `orderings` |
| Cancellation | IMPLEMENTED | REQUIRED | VD | `cancelCron`, `order-cancel-substitution` | `orderings` |
| Refunds | IMPLEMENTED | PARTIAL/OPTIONAL | VD | `refund` service/model | `refunds` | Razorpay |
| Order notifications | IMPLEMENTED | REQUIRED | VD | `order_trigger`,`pending_notification` | `notifications` |
| Merchant order management | IMPLEMENTED | REQUIRED | DASH, VD | `merchant/ordering`,`order-hold` | `orderings` |

## 6. Payments

| Capability | Status | Baseline | Repos | Source files | DB entities | Ext deps |
|-----------|--------|----------|-------|--------------|-------------|----------|
| Payment initiation | IMPLEMENTED | REQUIRED | WEB, VD | WEB `useAmealioRazorpay.js`; VD `razorpay` | `payments`,`transactionals` | Razorpay |
| Payment confirmation | IMPLEMENTED | REQUIRED | VD | `razorpay-webhook`, `updateTransaction` | `payments`,`transactionals` | Razorpay |
| Payment failure | IMPLEMENTED | REQUIRED | WEB, VD | WEB payment-failure routes; VD status | `payments` | Razorpay |
| Refunds | IMPLEMENTED | OPTIONAL | VD | `refund` | `refunds` | Razorpay |
| Webhooks | IMPLEMENTED | REQUIRED | VD | `/razorpay-webhook` | `payments` | Razorpay |
| Payment status | IMPLEMENTED | REQUIRED | VD | `PAYMENTSTATUS` (env) | `payments`,`transactionals` | — |
| Transaction records (ledger) | IMPLEMENTED | REQUIRED | VD | `models/transactional` | `transactionals` | — |
| Wallet | IMPLEMENTED | OPTIONAL | WEB, VD | `wallet`,`payment/wallet` | `wallets` | MSG91 (KYC) |
| Settlement / payout | IMPLEMENTED | REQUIRED (merchant) | DASH, VD | `settlement*`, RazorpayX | `settlements` | RazorpayX |

## 7. Celebrations (Experiences)

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Celebration discovery | IMPLEMENTED | OWNER-DECISION | WEB, VD | WEB `V2Experience`; VD `user/experience` | `experiences` |
| Celebration creation | IMPLEMENTED | OWNER-DECISION | DASH, VD | DASH `/experienceDashboard`; VD `vendor/experiences` | `experiences` |
| Celebration management | IMPLEMENTED | OWNER-DECISION | DASH, VD | `admin/experience`,`expFilters` | `experiences` |
| Celebration-related ordering | IMPLEMENTED | OWNER-DECISION | WEB, VD | `expRequest`,`transactional` | `exprequests` |
| Celebration-related reservations | IMPLEMENTED | OWNER-DECISION | VD | `expRequest`→`Diner` | `diners`,`exprequests` |
| Celebration/event workflows | IMPLEMENTED | OWNER-DECISION | VD | `expRequests` status sync; cron | `exprequests` |

> Existence is proven; **whether Celebrations are in the *first* baseline wave is an owner decision** (implemented, but potentially deferrable). Distinct from "not implemented".

## 8. Events

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Event creation | IMPLEMENTED | OWNER-DECISION | DASH, VD | `vendor/events`; `models/events` | `events` |
| Event discovery | IMPLEMENTED | OWNER-DECISION | WEB, VD | WEB `/experience/events/:eventId`; VD `user/filterEvents` | `events` |
| Event management | IMPLEMENTED | OWNER-DECISION | DASH, VD | `admin/events`,`event-handler` | `events`,`eventhandlers` |
| Attendee concepts (RSVP) | IMPLEMENTED | OWNER-DECISION | VD | `event-handler`,`event_trigger` | `eventhandlers` |
| Event ordering | IMPLEMENTED | OWNER-DECISION | VD | `event-handler` + `transactional` | `eventhandlers`,`transactionals` |
| Event payments | IMPLEMENTED | OWNER-DECISION | VD | Razorpay + `transactional` | `transactionals` | 

## 9. Ticketing

> Evidence check (not assumed): **event tickets** exist (`models/ticket`, `event-handler`, public QR pages DASH `/ticketbooked/:id`, `/experience/ticket/:id`). Validation/capacity/seating-for-tickets are **not clearly evidenced**.

| Capability | Status | Baseline | Repos | Source files |
|-----------|--------|----------|-------|--------------|
| Ticket types | PARTIAL | OWNER-DECISION | VD | `models/ticket`,`event-handler` |
| Ticket purchase | IMPLEMENTED | OWNER-DECISION | WEB, VD | event booking + payment |
| Ticket issuance | IMPLEMENTED | OWNER-DECISION | DASH, VD | `ticket`; DASH QR ticket pages |
| QR code | IMPLEMENTED | OWNER-DECISION | DASH | `/ticketbooked/:id`, `qrcode` dep |
| Ticket validation | UNKNOWN | OWNER-DECISION | — | no clear evidence — **UNKNOWN** |
| Capacity | UNKNOWN | OWNER-DECISION | VD | event `table_setup` nested — partial — **UNKNOWN** |
| Seating (for tickets/events) | PARTIAL | OWNER-DECISION | VD | event `table_setup` floors/seats |

## 10. Commerce

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Products / catalog | IMPLEMENTED | REQUIRED | VD, DASH | `vendor-items`,`catalogue`,`category` | `vendoritems`,`catalogues` |
| Cart | IMPLEMENTED | REQUIRED | VD, WEB | (see Orders) | `carts` |
| Checkout | IMPLEMENTED | REQUIRED | VD, WEB | (see Orders) | `orderings` |
| Orders | IMPLEMENTED | REQUIRED | VD, WEB, DASH | (see Orders) | `orderings` |
| Fulfillment | PARTIAL | PARTIAL | VD, DASH | delivery orchestration; dine-in/takeaway | `orderings`,`deliveries` |
| Subscriptions (merchant) | IMPLEMENTED | OPTIONAL | VD, DASH | `subscription*` | `subscriptions` |
| ONDC commerce | IMPLEMENTED | OWNER-DECISION / NON-BASELINE | VD, WEB, DASH | `ondc/*`, `ondc_*` models | `ondc_*` | ONDC micro-server (ext) |

## 11. Promotions

| Capability | Status | Baseline | Repos | Source files | DB entities |
|-----------|--------|----------|-------|--------------|-------------|
| Coupons | IMPLEMENTED | OPTIONAL | VD, DASH, WEB | `offers` (`coupon_code`) | `offers` |
| Discounts | IMPLEMENTED | OPTIONAL | VD | `offers.discount`; order-charges | `offers` |
| Campaigns | PARTIAL | OPTIONAL | VD | `merchant-permotion`,`promotionsvideo` | `merchant-permotions` |
| Eligibility | IMPLEMENTED | OPTIONAL | VD | offer scope (vendor/restaurant/geo/service) | `offers` |
| Redemption | IMPLEMENTED | OPTIONAL | VD | `offerUsedBy` | `offers` |
| Referrals / rewards (loyalty) | PARTIAL | OPTIONAL | VD, WEB | `referralprogram`,`signupReward` | `referral_programs`,`signuprewards` |

## 12. Notifications

| Capability | Status | Baseline | Repos | Source files | Ext deps |
|-----------|--------|----------|-------|--------------|----------|
| Email | IMPLEMENTED | REQUIRED | VD | `/email` | SendGrid / SES |
| SMS | IMPLEMENTED | REQUIRED | VD | `/sms`,`/msg91` | Twilio / MSG91 |
| Push | IMPLEMENTED | REQUIRED | VD | `common/PushNotifications` | FCM |
| In-app | IMPLEMENTED | REQUIRED | VD, WEB, DASH | `inAppNotification` | — |
| WhatsApp | IMPLEMENTED | OPTIONAL | VD | `whatsapp-auth`, WhatsApp templates | MSG91 |
| Order notifications | IMPLEMENTED | REQUIRED | VD | `order_trigger`,`pending_notification` | FCM/MSG91 |
| Reservation notifications | IMPLEMENTED | REQUIRED | VD | `diner_trigger` | FCM/MSG91 |
| Payment notifications | IMPLEMENTED | REQUIRED | VD | notification templates | FCM/MSG91 |

## 13. AI / Personalization

| Capability | Status | Baseline | Repos | Source files | Ext deps |
|-----------|--------|----------|-------|--------------|----------|
| Recommendations (home) | REFERENCE-ONLY | NON-BASELINE (external) | WEB | `homepage2ChatApi.js` (`REACT_APP_RECOMMENDATIONS_API_*`) | **recommendations API — repo not in workspace** |
| Personalization (moods/cravings/curations) | IMPLEMENTED | OPTIONAL | WEB, VD | `mood`,`cravings`,`user-curation` | — |
| Preference management | IMPLEMENTED | OPTIONAL | WEB, VD | `models/user-profile`; `userPreference` | — |
| Recommendation APIs | REFERENCE-ONLY | EXTERNAL DEPENDENCY | WEB | env `REACT_APP_RECOMMENDATIONS_API_*` | external |
| AI restaurant info | PARTIAL | OWNER-DECISION | VD | `/restaurantInfo` (backing AI **UNKNOWN**) | external? |

## 14. Delivery

> **Do not auto-classify the deferred 2026 delivery repos as baseline** (D-011). Backend delivery *orchestration* exists; live tracking + driver app are deferred.

| Capability | Status | Baseline | Repos | Source files | DB entities | Ext deps |
|-----------|--------|----------|-------|--------------|-------------|----------|
| Delivery (order fulfilment) | PARTIAL | PARTIAL | VD, DASH | `delivery-persons`,`dunzo*`,`logistics/porter/*` | `deliveries`,`deliverypersons` | Dunzo, Porter, integration svc |
| Assignment | IMPLEMENTED | REQUIRED (self+3P) | VD | `orders/delivery-persons`,`ordering` | `orderings`,`deliverypersons` | — |
| Driver (app) | REFERENCE-ONLY | NON-BASELINE (deferred) | — | `amealio-self-delivery-app` (deferred) | — | — |
| Tracking (live GPS) | REFERENCE-ONLY | NON-BASELINE (deferred/ext) | — | `amealio-nestjs-backend` (deferred), live-tracking socket | `locations` (PG, deferred) | integration svc |
| Status (delivery) | IMPLEMENTED | REQUIRED | VD | `dunzo-webHook` → `order_status` | `orderings` | Dunzo |
| Delivery notifications | IMPLEMENTED | REQUIRED | VD | notifications on status | `notifications` | FCM |

## 15. Administration

| Capability | Status | Baseline | Repos | Source files |
|-----------|--------|----------|-------|--------------|
| Platform administration | IMPLEMENTED | REQUIRED | DASH, VD | DASH `/superadmin*`; VD `admin/*` |
| Merchant administration | IMPLEMENTED | REQUIRED | DASH, VD | `/superadminallvendors`,`/addvendor*`,`vendorAccess` |
| User administration | IMPLEMENTED | REQUIRED | DASH, VD | `/superadminallusers`; `admin/user-service` |
| Restaurant administration | IMPLEMENTED | REQUIRED | DASH, VD | admin restaurant edit/approval |
| Configuration / reference data | IMPLEMENTED | REQUIRED | DASH, VD | taxonomy/reference services |
| Reporting | IMPLEMENTED | OPTIONAL | DASH, VD | `/superadminreports`, settlement reports |
| Operational controls | IMPLEMENTED | REQUIRED | DASH, VD | approvals, blocking, settlements, payouts |
| ONDC administration | IMPLEMENTED | OWNER-DECISION | DASH, VD | `/superadmin/ondc/*`, `ondc/admin/*` |
| Delivery-partner (Dunzo) admin | IMPLEMENTED | OPTIONAL | DASH, VD | `/superadmindunzo*` |
| POS (Petpooja) admin | IMPLEMENTED | OPTIONAL | DASH, VD | `/superadminposdashboard`, `pos/*` |
| Voice (Twilio) | IMPLEMENTED | OPTIONAL | DASH, VD | `twilio-client`; `/token` |

## 16. Integrations classification

| Integration | Classification | Rationale |
|-------------|----------------|-----------|
| Razorpay | **BASELINE REQUIRED** | Core customer payments |
| RazorpayX | **BASELINE REQUIRED** | Merchant settlements/withdrawals |
| MSG91 | **BASELINE REQUIRED** | OTP login / SMS flows |
| Firebase / FCM | **BASELINE REQUIRED** | Push + social auth |
| AWS S3 | **BASELINE REQUIRED** | Media storage |
| Google Maps | **BASELINE REQUIRED** | Geo discovery/geocoding |
| SendGrid | BASELINE REQUIRED | Transactional email |
| AWS SES | BASELINE OPTIONAL | Duplicate email path |
| Twilio | BASELINE OPTIONAL | SMS (dup) + admin voice |
| Dunzo | BASELINE OPTIONAL | Third-party delivery |
| Porter | BASELINE OPTIONAL | Third-party delivery (brittle automation) |
| Petpooja POS | BASELINE OPTIONAL | POS sync |
| WhatsApp (MSG91) | BASELINE OPTIONAL | WhatsApp login |
| Rebrandly | BASELINE OPTIONAL | Short links |
| OAuth2 provider | UNKNOWN | Purpose/usage unclear |
| Analytics (PostHog/GA4/Meta) | BASELINE OPTIONAL | Client analytics (prod) |
| ONDC micro-server | DEFERRED / OWNER-DECISION | External network; large surface |
| Integration service (delivery) | EXTERNAL DEPENDENCY | Repo not in workspace; ⇢ deferred Nest? UNKNOWN |
| Recommendations API | EXTERNAL DEPENDENCY | Repo not in workspace |
| Live-tracking socket | DEFERRED / EXTERNAL | Delivery GPS (deferred repos) |

---

## Baseline exclusions

**"Not part of baseline" ≠ "Not implemented".** Both lists below are explicit.

### Implemented, but NOT part of the initial baseline (deferred / non-baseline)
- **Delivery driver app** (`amealio-self-delivery-app`) — deferred (D-011).
- **Live GPS delivery tracking** (`amealio-nestjs-backend` + live-tracking socket) — deferred/external.
- **AI recommendations engine** — external repo not in workspace (in-app personalization stays; the engine is external).
- **ONDC** commerce/administration — implemented but **owner-decision** whether in first baseline wave.
- **Legacy duplicates (DEPRECATED):** legacy consumer ordering/experience flows superseded by V2 (`src/screens/ordering` vs `orderingv1`); legacy cart model `user_carts` vs `carts`.

### Not implemented (evidence absent) — mark `UNKNOWN`, do not assume
- **Loyalty program** (points/tiers) beyond referrals/wallet cashback.
- **Ticket validation / hard capacity enforcement** for events.
- **Dedicated consumer wallet page** in the web app.
- **US-market behavior** (Stripe referenced, no code) — out of India baseline.

## Notes
- Numeric enum values (order/payment status/method) are env-driven and **UNKNOWN — REQUIRES REVIEW**; acceptance criteria that reference statuses use behavior, not integers.
- Full behavioral acceptance criteria for REQUIRED capabilities: [15](./15-BASELINE-ACCEPTANCE-CRITERIA.md). Critical journeys: [16](./16-END-TO-END-BASELINE-JOURNEYS.md).
