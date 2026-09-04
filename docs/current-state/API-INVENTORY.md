# API Inventory — Amealio Platform Backend

**Repository:** `amealio-vendordashboard`  
**Total unique REST paths:** 423 (extracted via `app.use()` registration)  
**Protocol:** Feathers.js REST (+ Socket.IO for real-time services)  
**Base URL (production):** `https://be.amealio.com`  
**Auth paths:** `/authentication` (customer), `/vendorauthentication` (merchant), `/admin/auth` (superadmin)

> Feathers exposes standard CRUD on each path: `GET`, `POST`, `PATCH`, `PUT`, `DELETE` unless custom class overrides. Below lists **path + domain + primary callers**.

---

## Authentication & Users

| Path | Domain | Callers | Auth |
|------|--------|---------|------|
| `/authentication` | Customer login/JWT | amealio_web_app | Public create, JWT read |
| `/vendorauthentication` | Merchant login/JWT | amealiodashboardmvp- | Public create, JWT |
| `/admin/auth` | Superadmin login | amealiodashboardmvp- | Public create, JWT |
| `/otp-authentication` | OTP verify | web_app, self-delivery-app | Public |
| `/whatsapp-auth` | WhatsApp OAuth | web_app | Public |
| `/social-sign-in`, `/social-sign-up` | Social auth | web_app | Public |
| `/user-service` | User CRUD | web_app | JWT |
| `/user/profiles` | Multi-profile | web_app | JWT |
| `/user-check`, `/merchant/user-check` | Existence check | web_app, dashboard | Public/JWT |
| `/get-refresh-token`, `/logout` | Token lifecycle | All apps | JWT |
| `/forgot-password`, `/reset-password` | Password reset | All apps | Public |
| `/userDelete`, `/delete-user` | Account deletion | web_app, cron | JWT/admin |

---

## Discovery & Restaurant

| Path | Domain | Callers |
|------|--------|---------|
| `/listRestaurant`, `/listRestaurantCard` | Restaurant discovery | web_app |
| `/searchGlobal`, `/searchRestaurant`, `/searchRestaurantCard` | Search | web_app |
| `/restaurant`, `/restaurantCard`, `/restaurantList` | Restaurant detail/list | web_app, dashboard |
| `/restaurant-availability` | Hours/availability | web_app, dashboard (seating) |
| `/user-moods`, `/user/cravings`, `/user-curation` | Personalization | web_app |
| `/user/reels`, `/reels`, `/vlogs-feed` | Short video | web_app |
| `/user/visited-restaurants` | History | web_app |
| `/user-analytics`, `/pageStats` | Analytics | web_app, admin |
| `/filter-restaurant`, `/convenience` | Filters | web_app |

---

## Menu & Items

| Path | Domain | Callers |
|------|--------|---------|
| `/user/menu`, `/v2/user/menu` | Customer menu | web_app |
| `/user/items`, `/user/menu-category` | Items/categories | web_app |
| `/vendor-items`, `/v2/vendor-items` | Merchant items | dashboard |
| `/menu`, `/menu-category`, `/v2/menu-category` | Menu structure | dashboard |
| `/recommended-items` | Recommendations | web_app |
| `/review-rating`, `/sub-review-rating` | Reviews | web_app, dashboard |

---

## Ordering & Cart

| Path | Domain | Callers |
|------|--------|---------|
| `/user/cart`, `/guest/cart` | Cart | web_app |
| `/user-ordering`, `/ordering` | Orders | web_app, dashboard |
| `/merchant/ordering`, `/merchant/order-hold` | Merchant order ops | dashboard |
| `/user/checkout` | Checkout | web_app |
| `/updateTransaction` | Payment callback | web_app |
| `/order-availability` | Order type availability | web_app |
| `/orders/delivery-persons` | Rider orders | self-delivery-app |
| `/admin/orders`, `/admin-order/reports` | Admin orders | dashboard admin |

---

## Seating & Diner

| Path | Domain | Callers |
|------|--------|---------|
| `/diner` | Diner requests | web_app, dashboard |
| `/user/diner` | User diner scope | web_app |
| `/vendor/diner` | Vendor diner mgmt | dashboard |
| `/Admin/diner`, `/Admin/diner-request` | Admin diner | dashboard admin |
| `/table/diner` | Table calendar view | dashboard |
| `/manage-reservation-block` | Block dates | dashboard |
| `/seatingarea` | Seating area catalog | admin |
| `/dinerReports`, `/admin-dinerReports` | Reports | dashboard |
| `/cron/diner` | Auto-cancel cron | system |
| `voice-get-diner` | Voice integration | UNKNOWN |

**Socket events:** `diner_trigger`, `diner_creation`, `update_location`, `diner_request_count`

---

## Experiences, Celebrations & Events

| Path | Domain | Callers |
|------|--------|---------|
| `/user/experience` | Customer experiences (incl. celebrations filter) | web_app |
| `/experience`, `/vendor/experiences` | Experience CRUD | dashboard |
| `/admin/experience` | Admin experiences | dashboard admin |
| `/userExpRequest`, `/expRequest` | Experience bookings | web_app, dashboard |
| `/user/exp-cart`, `/user/exp-checkout` | Experience food checkout | web_app |
| `/experience-menu` | Experience menus | web_app |
| `/expFilters` | Filters | web_app |
| `/events`, `/vendor/events`, `/admin/events` | Vendor events | dashboard |
| `/event-handler`, `/user/event-handler` | RSVP/tickets | web_app, dashboard |
| `/exp-events`, `/admin/exp-events` | Platform event taxonomy | admin, web_app |
| `/exp_events`, `/user_exp_events`, `/user-exp-events` | Platform events data | web_app, rag-server (read) |
| `/bulk-event-handler` | Bulk operations | dashboard |

**Socket events:** `expRequest` service patches

---

## Payments & Wallet

| Path | Domain | Callers |
|------|--------|---------|
| `/razorpay`, `/razorpay-webhook` | Payments | web_app, system |
| `/razorpayx-service` | Payouts | admin |
| `/wallet`, `/payment/wallet`, `/wallet_kyc` | Wallet | web_app, dashboard |
| `/transactional` | Transaction log | all |
| `/refund`, `/refundReports` | Refunds | admin, dashboard |
| `/settlement`, `/settlement_process`, `/settlement_record` | Settlements | admin, dashboard |
| `/withdraw-request`, `/admin/withdraw-request` | Withdrawals | dashboard |
| `/payment-logs`, `/admin/payment-logs` | Audit | admin |
| `/userupi` | UPI storage | web_app |
| `/restaurant/updte` | Direct merchant UPI/QR | web_app |

---

## Logistics & Delivery

| Path | Domain | Callers |
|------|--------|---------|
| `/dunzoQuote`, `/dunzoOrders`, `/dunzoWebHook` | Dunzo integration | backend, Dunzo |
| `/logistics/porter/*` | Porter integration | backend, dashboard |
| `/logistics/delivery/estimate`, `/merchant/delivery-estimate`, `/user/delivery-estimate` | Delivery quotes | web_app, dashboard |
| `/delivery-persons`, `/user/delivery-persons` | Rider profile | self-delivery-app |
| `/delivery-partners` | Partner config | admin |

---

## ONDC (DEFERRED — see DEFERRED-ONDC.md)

| Path | Purpose |
|------|---------|
| `/ondc/on_search` through `/ondc/on_recon` | ONDC network callbacks |
| `/ondc/restaurant`, `/ondc/user/cart`, `/ondc/user/order`, `/ondc/user/delivery`, `/ondc/user/issue` | Buyer app |
| `/ondc/admin/*` | Admin ONDC management |
| `/ondc/rsf/*` | Reconciliation/settlement |

**Count:** 30+ ONDC paths

---

## POS Integration

| Path | Purpose |
|------|---------|
| `/pos/webhook/:posId/:action` | POS webhooks |
| `/pos/api/:posId/:action` | POS API proxy |
| `/merchant/pos/:action`, `/admin/pos` | POS management |

---

## Admin & Platform

| Path | Purpose |
|------|---------|
| `/admin/restaurant`, `/admin/vendor-user`, `/admin/vendor-access` | Tenant management |
| `/admin/subscription` | Subscription admin |
| `/admin/role-management`, `/role-management` | RBAC |
| `/admin/ticket`, `/ticket`, `/vendor/ticket` | Support tickets |
| `/admin/notifications`, `/notifications` | Push/in-app |
| `/help-and-faq`, `/user/help-and-faq` | Help content |
| `/subscription`, `/subscription/table` | Merchant subscription/onboarding |

---

## Taxonomy & Reference Data

`/category`, `/subcategory`, `/mood`, `/cusine`, `/foodtype`, `/accessibility`, `/dresscode`, `/parkingtype`, `/paymentmethods`, `/country-state-city`, `/uom`, etc.

---

## Cron & System Endpoints

| Path | Schedule | Purpose |
|------|----------|---------|
| `/cron/diner` | */1 min | Seating auto-cancel |
| `/cron/ordering` | (commented) | Order cron |
| `/cron/event-handler` | (commented) | Event cron |
| `/cron/sms-template` | :20,:50 | Scheduled SMS |
| `/cron/notification-template` | :10,:40 | Scheduled push |
| `/cron/email-template` | :00,:30 | Scheduled email |
| `/session-automate` | */1 min | Session open/close |
| `/settlementProcessCron` | 04:00 daily | Settlements |
| `/rating-review-cron` | hourly | Rating aggregation |
| `/getAppVersion` | on-demand | App version gate |

---

## External / Secondary APIs (Non-vendordashboard)

| Service | Base | Paths | Caller |
|---------|------|-------|--------|
| RAG recommendations | homepage-v2-rag-server | `POST /recommendations`, `/personalize/*` | web_app homepage2 |
| Location tracking | nestjs-backend | `GET /delivery/*`, WS `/tracking` | self-delivery-app |

---

## API Count Summary

| Category | Approx. paths |
|----------|---------------|
| Total backend REST paths | 423 |
| ONDC | ~30 |
| Admin-prefixed | ~55 |
| Vendor-prefixed | ~25 |
| User/customer-prefixed | ~40 |
| Logistics (Dunzo/Porter) | ~20 |

**Full path list:** Generated from `amealio-vendordashboard/src/**/*.service.ts` via `app.use()` extraction (audit artifact).
