# 03 — API Inventory

Read-only inventory of the platform's API surface. The primary API is the FeathersJS backend (`amealio-vendordashboard`); a secondary REST/WebSocket API is the Nest delivery-tracking service (`amealio-nestjs-backend`). There is also an external **integration service** and a **recommendations API** referenced by clients but not present as repositories.

## 1. Transport & conventions (Feathers backend)

| Aspect | Detail | Evidence |
|--------|--------|----------|
| REST | `app.configure(express.rest())` | `src/app.ts` |
| Realtime | Socket.IO via `app.configure(socketio(...))`; channels in `src/channels.ts` | `src/app.ts`, `src/channels.ts` |
| Service count | **~419 unique mount paths** across ~150 service modules | `src/services/index.ts`, `src/services/**` |
| Methods | Feathers CRUD (`find/get/create/patch/update/remove`); many action services are `create`-only | per-service classes |
| API prefix | `app.get("api")` (`API` env, e.g. `api/v1`) is read but **not applied** to routing in-app; effective prefix likely added by a proxy — **`UNKNOWN — REQUIRES REVIEW`** | `src/authentication.ts`, `src/app.ts` |
| Extra Express routers | ONDC router, S3 upload router (`src/utils.ts`), Twilio voice `/token/voice` | `src/app.ts`, `src/middleware` |
| Swagger (non-prod) | static docs at `/amealio-swagger-apidocs` | `src/app.ts` |
| Health/util | `GET /getMemStats` | `src/app.ts` |

> Because mount paths are numerous, services are grouped by domain below with representative paths. Full path enumeration lives in the source (`src/services/index.ts`). Custom/action endpoints are noted where they deviate from CRUD.

## 2. REST services by domain (Feathers)

### Identity & auth
`/authentication` (create/remove), `/vendorauthentication` (create), `/send-otp`, `/verify-otp`, `/otp-authentication`, `/social-sign-up`, `/social-sign-in`, `/forgot-password`, `/reset-password`, `/change-password`, `/vendor-change-password`, `/get-refresh-token`, `/logout`, `/token`, `/validate-token`, `/auth/verify-token`, `/whatsapp-auth` (+ Express `GET /whatsapp-auth/verify`), `/oauth2/authorize`, `/oauth2/user`, `/temp-user`.

### Users
`/user-service`, `/admin/user-service`, `/admin/user-validation`, `/admin/user-report`, `/user-check`, `/check-multiple-user`, `/merchant/user-check`, `/delete-user`, `/userDelete`, `/userTrack`, `/userPreference`, `/user/profiles`, `/user/community`, `/voice-user-service`, `/userStats`, `/user-analytics`, `/userupi`, `/signupReward`, referral services (`/invite-friend`, `/refree-service`, `/referral-service`, `/referralcode`, `/validatereferralcode`, `/referralprogram`, `/user/referralprogram`).

### Vendors / admin staff
`/vendor-user`, `/vendorDetailsByMobile`, `/admin/vendor-user`, `/admin/vendor-report`, `/admin/vendor-access`, `/admin/auth`, `/admin/welcomeVendor`, `/vendor_default_page`, `/merchant-engage`, `/vendorAccess`, `/role-management` (+ `/admin/*`, `/admin/vendor/*`), `/web-merchant`.

### Restaurants & discovery
`/restaurant`, `/restaurant/updte`, `/listRestaurant`, `/restaurant-availability`, `/restaurant-status`, `/checkOpen`, `/check/restaurant-dist`, `/filter-restaurant`, `/convenience`, `/searchRestaurant`, `/voice-get-restaurant`, `/restaurantCard`, `/listRestaurantCard`, `/searchRestaurantCard`, `/restaurantList`, `/searchGlobal`, `/restaurantInfo` (AI info), `/unregister-restaurant`, `/restaurant-tag`, `/restaurantchain`, `/restaurantfeatures`, `/restauranttype`, `/manage-hours-of-operation`, `/manage-reservation-block`, `/session-automate`, `/pageStats`, `/scrapingData`, `/icon-generator`.

### Reference / taxonomy (mostly CRUD lookups)
`/category`, `/vendor-category`, `/subcategory`, `/filterData`, `/cats`, `/cusine`, `/mood`, `/foodtype`, `/foodcategory`, `/liquorcategory`, `/accessibility`, `/dresscode`, `/parkingtype`, `/petallowance`, `/seatingarea`, `/servicesoffered`, `/locatedinside`, `/servicetype`, `/paymentmethods`, `/sanitization*` (5), `/country-state-city`, `/currency`, `/uom`, `/uom-ratio`, `/getAppVersion`.

### Menu, catalogue & items
`/menu`, `/merchant/menu`, `/combo`, `/menu-category` (+ `/v2`, `/user`, `/vendor`, `/admin`, `/menuCategory/order`), `/vendor-items` (+ `/v2`, `/v2/vendor-menu`, `/items`, `/items/details`, `/uploadItems`), `/user/items`, `/user/menu`, `/v2/user/menu`, `/voice-get-item`, `/recommended-items`, `/resetsoldout`, `/catalogue`, `/global-catalogue`, `/chaincatalogue`, `/templates`, `/media-catalogue`.

### Cart & checkout
`/guest/cart`, `/user/cart`, `/user/checkout`, `/usercart`, `/usercart-ref`.

### Orders
`/ordering`, `/user-ordering`, `/order-availability`, `/order-charges`, `/order-detail`, `/orderSettle`, `/updateTransaction`, `/order-cancel-substitution`, `/ordering/view-receipt`, `/merchant/ordering`, `/merchant/order-hold`, `/merchant/direct-merchant-payment`, `/admin/orders`, `/admin/order-reports`, `/vendor/order-reports`, `/admin/dunzoOrders`, `/admin/cancelledOrders`, `/restaurantopen/order`, `/checkDistance`, `/cron/ordering`, `/orderMemo`, `/order/reports`.

### Seating / diner (walk-in, waitlist, reservation)
`/diner`, `/user/diner`, `/vendor/diner`, `/table/diner`, `/voice-get-diner`, `/Admin/diner`, `/Admin/diner-request`, `/admin/diner-report`, `/vendor/diner-report`, `/dinerReports`, `/restaurantopen/diner`, `/cron/diner`, `/dinerstatus`.

### Experiences, events & offers
`/experience` (+ `/user`, `/admin`, `/vendor`, `/expFilters`, `/expReport`, `/experience-menu`), `/expRequest`, `/userExpRequest`, `/admin/expRequest`, `/experience-media`, `/exp_events`, `/user_exp_events`, `/events` (+ `/user/filterEvents`, `/vendor/events`, `/admin/events`, `/events-history`), `/event-handler` (+ `/user`, `/vendor`, `/admin`, `/bulk-event-handler`, `/cron/event-handler`), `/offers` (+ `/user`, `/user/filter-offers`, `/vendor`, `/admin`, `/offer/details`, `/offer-history`), `/promotions-Video`, `/promotions-event`.

### Payments, wallet & settlement
`/wallet`, `/wallet_kyc`, `/admin/wallet`, `/admin/transfer-money`, `/closeWallet`, `/razorpay`, `/razorpay-webhook`, `/razorpayx-service`, `/transactional`, `/ordering-transactionals`, `/admin/transactional`, `/vendor/transactional`, `/payment/wallet`, `/txn-report`, `/settlement`, `/manualSettlement`, `/report/settlement`, `/settlement_process`, `/settlementProcessCron`, `/settlement_record`, `/withdraw-request`, `/admin/withdraw-request`, `/refund`, `/refundReports`, `/payment-logs`, `/bank`, `/bankcard`, `/merchantStatement`, `/vendor/earnings`, `/donation`, `/donationsettlement`, `/organization`, `/subscription*`, `/catering-service`.

### Delivery & logistics
`/delivery-partners`, `/delivery-persons`, `/user/delivery-persons`, `/orders/delivery-persons`, `/dunzoOrders`, `/dunzoWebHook`, `/dunzoStatus`, `/dunzoSettlements`, `/dunzoPayments`, `/dunzoQuote`, `/dunzoTransactions`, `/logistics/delivery/estimate`, `/merchant/delivery-estimate`, `/user/delivery-estimate`, `/logistics/porter/*` (account, book, status, drafts, handoff, login OTP).

### ONDC
30+ mounts under `/ondc/*`: protocol callbacks (`/ondc/on_search`, `/ondc/on_select`, `/ondc/on_init`, `/ondc/on_confirm`, `/ondc/on_status`, …), buyer cart/order/delivery/issue, admin restaurants/orders/disputes, RSF settlement/report/reconciliation.

### POS (Petpooja)
`/admin/pos`, `/merchant/pos/:action`, `/pos/webhook/:posId/:action`, `/pos/api/:posId/:action`.

### Notifications & comms
`/notifications` (+ `/admin`, `/vendor`, `/admin/vendor-notification`), `/sms`, `/admin/sms`, `/non-user-sms`, `/msg91`, `/email`, `/sms-template`, `/notification-template`, `/email-template` (+ `/cron/*-template`), `/inAppNotification`, `/user/inAppNotif`, `/socket-event`, `/chat`.

### Content & media
`/upload-assets`, `/upload-assets-video`, `/upload-multiple-video`, `/upload/reels`, `/reels` (+ `/merchant`, `/admin`, `/restaurant-reels`), `/vlogs-feed`, `/live-streaming-activity`, `/video-activity-tracker`, `/misceilaneous-tracking`, `/firebasedynamiclinks`, `/deeplink`, `/cravings`, `/user-curation`.

### Support, reports, misc
`/ticket` (+ vendor/admin), `/help`, `/issues`, `/help-and-faq`, `/reports`, `/admin/reports`, `/event/reports`, `/offer/reports`, `/favourite/reports`, `/suggestions`, `/nominations`, `/favourites`, `/review-rating`, `/activity-tracker`, `/address`, `/errorHandler`.

> **Orphan / internal:** `/waiters` service is defined but not registered; `payment-transactions` (`PAYMENTS_SERVICE`) is an internal class used by ONDC/refund crons, not HTTP-mounted.

## 3. Realtime (Socket.IO) events — Feathers

Channels defined in `src/channels.ts`: users, vendors, `superAdmins`, delivery-persons. Observed service events consumed by clients:

| Service | Event(s) | Consumers |
|---------|----------|-----------|
| `ordering` | `order_creation`, `order_trigger`, `pending_notification`, `assign_delivery_person`, `update_location`, `delivery_location` | consumer, merchant, delivery apps |
| `user-ordering` | `curb_notification`, `curb_arrival` | merchant app |
| `diner` | `diner_creation`, `diner_trigger`, `update_location` | consumer, merchant apps |
| `user/diner` | `patched` | merchant app |
| `expRequest` | `requestUpdate`, `popupNotif` | consumer, merchant apps |
| `event-handler` | `event_trigger`, `event_request` | merchant app |
| `ticket` | `created` | merchant app |
| `chat` | `created` | merchant app |
| `notifications` | (listen) | merchant app |
| `vendor-user` / `admin/vendor-user` | `adminLogin`, `patched` | merchant/admin app |

## 4. Nest delivery-tracking API (`amealio-nestjs-backend`)

### REST (all JWT-guarded, `@Controller('delivery')`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/delivery/active` | Latest location per driver active in last 5 minutes |
| GET | `/delivery/:driverId/current` | Most recent position for a driver |
| GET | `/delivery/:driverId/history` | Up to `limit` records (default 100), optional `from`/`to` |

Swagger at `/api/docs`.

### WebSocket `/tracking`

| Item | Detail |
|------|--------|
| Inbound | `updateLocation` `{ lat, lon, speed?, heading? }` (guarded by `WsJwtGuard`) |
| Outbound | `locationUpdated` (broadcast) |
| Auth | JWT via `handshake.auth.token`/`query.token`; `driverId` from auth/query/JWT `sub` |
| Backing | Postgres `LISTEN/NOTIFY` on `location_update` → re-broadcast |

**`UNKNOWN — REQUIRES REVIEW`:** `locations.driverId` is the sole primary key (upsert), so persisted history may be one row per driver despite the history endpoint's date-range parameters.

## 5. External APIs referenced by clients (no repo in workspace)

| API | Env var(s) | Used by | Purpose |
|-----|-----------|---------|---------|
| Integration service | `INTEGRATION_SERVICE_BASE_URL` / `REACT_APP_INTEGRATION_SERVICE_URL` | backend, consumer app | `POST /delivery/system/create`, `/delivery/check-availability`, public `GET /delivery/public/track` |
| Recommendations API | `REACT_APP_RECOMMENDATIONS_API_*` | consumer app | AI home recommendations (`POST /recommendations`, `GET /recommendations/history`) |
| Live-tracking socket | `REACT_APP_LIVE_TRACKING_SOCKET_URL` | consumer app | subscribe to `locationUpdated` during delivery |
| ONDC micro-server | `ONDC_MICRO_SERVER_URL` | backend | ONDC protocol relay (`/buyerApp/search`, subscribe, etc.) |

**`UNKNOWN — REQUIRES REVIEW`:** whether the integration service and live-tracking socket are the same deployment as `amealio-nestjs-backend`, or separate services.

## 6. API observations for migration

- The API is **service-oriented and denormalized**: many `/user/*`, `/vendor/*`, `/admin/*`, `/v2/*` variants of the same resource encode role- and version-specific behavior in separate services rather than in a single resource + authorization layer.
- No consistent versioning: `api/v1` config unused; `/v2/*` prefixes appear ad hoc.
- Realtime is first-class and central (orders, diners, experiences, delivery). Any target API must preserve these event contracts or provide a compatibility layer.
- Numeric enums in payloads (`order_status`, `payment_status`, `order_type`, `payment_method`) are environment-driven — client/server share magic numbers; the mapping is **`UNKNOWN — REQUIRES REVIEW`**.
