# 06 — Business Domains

Baseline mapped into logical domains. Status per evidence: **IMPLEMENTED** / **PARTIALLY IMPLEMENTED** / **REFERENCE ONLY** / **NOT IMPLEMENTED** / **UNKNOWN**. All backend evidence is in `amealio-vendordashboard` unless noted; frontends are `amealio_web_app` (consumer) and `amealiodashboardmvp-` (admin/merchant).

| Domain | Status | Frontend | Backend (services) | DB entities | Integrations | Key dependencies | Maturity | Known gaps |
|--------|--------|----------|--------------------|-------------|--------------|------------------|----------|------------|
| **Identity** | IMPLEMENTED | both | `/authentication`,`/vendorauthentication`,`/send-otp`,`/verify-otp`,`/whatsapp-auth`,`/social-sign-*` | `users`,`vendorusers`,`sessions`,whatsapp-login | MSG91, Firebase/FB | — | High | Dual auth stacks; in-proc token revocation |
| **Users** | IMPLEMENTED | both | `/user-service`,`/user/profiles`,`/address`,`/userDelete` | `users`,`userprofiles`,`addresses` | — | Identity | High | `address` lacks `user_id` |
| **Restaurants** | IMPLEMENTED | both | `/restaurant*`,`/restaurantCard`,`/restaurantchain` | `restaurants`,`restaurantcards`,`restaurant chains` | Google Maps, S3 | Merchant | High | `strict:false`; restaurant vs card duplication |
| **Restaurant staff** | IMPLEMENTED | admin/merchant | `/role-management`,staff mgmt,`/vendorAccess` | `roles`,`vendorusers`,`vendoraccesses` | — | Merchant | Medium | RBAC as deep boolean trees |
| **Menus** | IMPLEMENTED | both | `/menu`,`/menu-category`,`/vendor-items`,`/combo` | `menus`,`menucategories`,`vendoritems`,`combos` | S3, Petpooja | Restaurants | High | Item lacks `restaurant_id`; deep nesting |
| **Dining (seating)** | IMPLEMENTED | both | `/diner`,`/vendor/diner`,`/table/diner` | `diners`,`diner statuses`,`seating areas` | geolib | Restaurants | High | Diner shared with Reservation |
| **Search / discovery** | IMPLEMENTED | consumer | `/searchRestaurant(Card)`,`/searchGlobal`,`/filter-restaurant` | `restaurants`,`restaurantcards` | Google Maps, geolib | Restaurants | Medium | Mongo/geolib search; no search engine |
| **Reservations** | IMPLEMENTED | both | `/diner` (RESERVATION),`/manage-reservation-block` | `diners`,`managereservationblocks` | — | Dining | Medium | Same entity as seating |
| **Orders** | IMPLEMENTED | both | `/user/cart`,`/user-ordering`,`/ordering`,`/merchant/ordering` | `orderings`,`carts`,`user_carts` | Razorpay, integration svc, Dunzo/Porter | Menus, Payments, Delivery | High | Two cart models; env-driven status codes |
| **Payments** | IMPLEMENTED | both | `/razorpay`,`/wallet`,`/transactional`,`/settlement*`,`/withdraw-request`,`/refund` | `payments`,`wallets`,`transactionals`,`settlements` | **Razorpay/RazorpayX**, MSG91 | Orders | High | Gateway payloads loose; enum codes env-driven |
| **Celebrations (experiences)** | IMPLEMENTED | both | `/experience`,`/expRequest` | `experiences`,`exprequests`,`experience_carts` | Razorpay, S3 | Payments, Restaurants | Medium | Overlaps Events |
| **Events** | IMPLEMENTED | both | `/events`,`/event-handler` | `events`,`eventhandlers`,`exp_events` | — | Celebrations | Medium | `exp_events` shared collection; scraped data |
| **Ticketing** | IMPLEMENTED | both | `/event-handler`,`/ticket` (event); `/help`,`/issues`,`/help-and-faq` (support) | `tickets`,`eventhandlers`; `issues`,`helpandfaqs` | — | Events | Medium | "ticket" overloaded (event vs support) |
| **Seating** | IMPLEMENTED | both | `/diner` (SEATING),`/dinerstatus` | `diners`,`seating areas`,`waiters` | geolib | Dining | High | `waiters` service unregistered (orphan) |
| **Commerce** | IMPLEMENTED | both | ordering, `/offers`, `/subscription*`, `/catering-service`, ONDC | `orderings`,`offers`,`subscriptions`,`ondc_*` | Razorpay, ONDC micro-server | Orders, Promotions | High | ONDC large/cross-cutting |
| **Promotions** | IMPLEMENTED | both | `/offers`,`/referralprogram`,`/referralcode`,`/promotions-Video` | `offers`,`referral_programs`,`referral codes` | — | Orders | Medium | Coupon scoping via arrays/geo |
| **Notifications** | IMPLEMENTED | both | `/notifications`,`/sms`,`/msg91`,`/email`,`/inAppNotification`,`/chat` | `notifications`,`notification-models`,templates | **FCM, Twilio, MSG91, SendGrid, SES** | Identity | High | Two email + two SMS providers |
| **Loyalty** | PARTIALLY IMPLEMENTED | both | referrals/rewards (`/signupReward`,`/refree-service`), wallet cashback | `signuprewards`,`referral_programs`,`wallets` | — | Promotions, Payments | Low–Med | No explicit points/tier loyalty program found — **UNKNOWN** |
| **AI / personalization** | PARTIALLY IMPLEMENTED | consumer | in-app moods/cravings/curations (`/mood`,`/cravings`,`user-curation`); `/restaurantInfo` (AI) | `moods`,`cravings`,`moodmanagements` | **recommendations API (external, REFERENCE ONLY)** | — | Medium | Recommendation engine repo **not in baseline** (`REACT_APP_RECOMMENDATIONS_API_*`) |
| **Delivery** | PARTIALLY IMPLEMENTED | admin/merchant + consumer (track) | orchestration `/delivery-persons`,`/dunzo*`,`/logistics/porter/*`,`/logistics/delivery/estimate` | `deliveries`,`deliverypersons`,`dunzo*`,`porter*` | **Dunzo, Porter, integration svc** | Orders | Medium | **Live GPS tracking + driver app are DEFERRED** (`amealio-nestjs-backend`, `amealio-self-delivery-app`) — external to baseline |
| **Admin** | IMPLEMENTED | admin | `/admin/*`,`/superadmin*`,`/ondc/admin/*`,`/errorHandler` | many | Twilio voice, Dunzo, Petpooja, ONDC | most domains | High (debt-heavy) | ~400+ routes; React 16 |
| **Merchant operations** | IMPLEMENTED | merchant | onboarding, menu, seating, orders, experiences, staff, subscriptions, settlements | `vendorusers`,`restaurants`,`menus`,`orderings`,`settlements` | Razorpay, Petpooja, Porter | Restaurants, Orders | High | Coupled with Admin in one repo |
| **Reporting / analytics** | IMPLEMENTED | admin/merchant | `/reports`,`/admin/reports`,`/*Reports`,`/pageStats`,`/activity-tracker` | operational collections + trackers | exceljs/csv; PostHog/GA4/Meta (client) | most domains | Medium | Reads operational store directly; no warehouse |

## Cross-domain notes
- **Diner** underpins both **Seating** and **Reservations**.
- **Celebrations/Events/Ticketing** overlap (Experience vs Event vs event-ticket vs support-ticket).
- **ONDC** is cross-cutting (Restaurants, Menus, Orders, Payments, Delivery, Admin) with its own entities/settlement.
- **Delivery** and **AI/personalization** are the two domains whose *full* capability depends on components **outside** the baseline (deferred tracker/driver app; external recommendations API) — hence PARTIALLY IMPLEMENTED within the baseline.
