# 04 — Backend / API Inventory

All backend logic lives in **`amealio-vendordashboard`** (source repo for every row below). It exposes **~419 Feathers mount paths** across **155 service modules** (`src/services/index.ts`) plus `/authentication` and `/vendorauthentication` (`src/authentication.ts`).

## Conventions (apply to all services)
- **Transport:** REST (`app.configure(express.rest())`) + Socket.IO (`src/app.ts`). API prefix `app.get("api")` is read but **not applied** to routing in-app (effective prefix likely added by a proxy — **UNKNOWN — REQUIRES REVIEW**).
- **Methods:** Feathers `find/get/create/patch/update/remove`; many action services are `create`-only.
- **Request/response structure:** Feathers conventions — `find` returns a paginated envelope `{ total, limit, skip, data: [...] }` (paginate config `PAGINATE_DEFAULT`/`PAGINATE_MAX`, `config/default.js`); `get/create/patch` return the entity. Bodies/entities are **Mongoose-shaped** (see [05](./05-DATA-MODEL.md)); there are almost no formal DTOs (`class-validator` largely commented, e.g. `src/services/vendor-items/vendor-item.dto.ts`), so request/response schemas are **model-derived, not formally specified** — **UNKNOWN — REQUIRES REVIEW** for exact contracts.
- **Errors:** custom `AmealioError { name, message, code, className, errors }` (`src/helpers/amealio-error.ts`).
- **Auth/authz:** see [10](./10-AUTHENTICATION-AUTHORIZATION.md); global token check in `src/app.hooks.ts`.

> A complete row-per-endpoint contract for all ~419 mounts is not formally defined in source (Mongoose-driven, role-variant services). This inventory documents the **major domains and representative endpoints** with the requested attributes and cites files for tracing. The authoritative path list is `src/services/index.ts`.

## Domain API inventory

Legend: **M** method(s); **AuthN** authentication; **AuthZ** authorization; **DB** primary collections; **Down** downstream integrations; **FE** frontend consumers.

### Authentication & identity — `src/authentication.ts`, `src/services/{send-otp,verify-otp,social-sign-up,whatsapp-auth,refresh-token,logout}`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/authentication` | create, remove | Consumer login/logout (jwt/local/phone/facebook) | strategy in body | — | `users`, `sessions` | MSG91 (reactivation OTP) | web |
| `/vendorauthentication` | create | Merchant/admin login | strategy + `portal` header | role vs portal | `vendorusers` | — | admin/merchant |
| `/send-otp`,`/verify-otp` | create | OTP issue/verify | public | — | `users`/`vendorusers` | MSG91/WhatsApp/email | web, admin/merchant, (delivery) |
| `/otp-authentication` | create/patch/get | OTP-based auth flow | public→jwt | — | `users` | MSG91 | web, (delivery) |
| `/social-sign-in|up` | create | Google/Facebook | provider token | — | `users`, `wallets` | Firebase/FB Graph | web |
| `/whatsapp-auth` (+ `/verify`) | create + GET | WhatsApp magic-link | code exchange | — | whatsapp login models | MSG91 WhatsApp | web |
| `/get-refresh-token` | create | Refresh access token | refresh JWT | — | `sessions` | — | web |

### Users — `src/services/user-service/**`, `src/services/{userDelete,userupi,invite-friend,referral*}`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | FE |
|----------|---|---------|-------|-------|----|----|
| `/user-service` | CRUD | Consumer profile | jwt | self | `users`,`userprofiles` | web |
| `/admin/user-service`,`/admin/user-report` | find/get | Admin user ops/reports | jwt | superadmin | `users` | admin |
| `/delete-user`,`/userDelete` | create | Account deletion/retention | jwt | self | `users`,`userdeletes` | web |
| `/address` | CRUD | Addresses | jwt | self | `addresses` (linked via `User.addressLocations`) | web |
| `/referralprogram`,`/referralcode`,`/validatereferralcode` | CRUD | Referrals | jwt/public | — | `referral_programs`,`referral codes` | web, admin |

### Restaurants & discovery — `src/services/restaurant/**`, reference services
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/restaurant`,`/restaurant/updte` | CRUD | Restaurant mgmt | jwt | vendor/superadmin | `restaurants` | S3 (media) | admin/merchant |
| `/listRestaurant`,`/searchRestaurant(Card)`,`/searchGlobal`,`/filter-restaurant` | find | Discovery/search (geo) | public/jwt | — | `restaurants`,`restaurantcards` | Google Maps, geolib | web |
| `/restaurant-availability`,`/checkOpen`,`/restaurant-status` | get/find | Open/availability | public | — | `restaurants`,`managehoursofoperations` | — | web, merchant |
| `/restaurantInfo` | get | AI restaurant info | jwt | — | `restaurants` | **AI (external, UNKNOWN)** | web |
| taxonomy: `/category`,`/subcategory`,`/cusine`,`/foodtype`,`/uom`,… | CRUD | Reference data | jwt/public | superadmin (write) | `categories`,`sub categories`,… | — | both |

### Menu, items, catalogue — `src/services/{menu,menu-category,vendor-items,combo,catalogue}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | FE |
|----------|---|---------|-------|-------|----|----|
| `/menu`,`/merchant/menu` | CRUD | Menus | jwt | vendor | `menus` | admin/merchant |
| `/menu-category` (+`/v2`,`/user`,`/vendor`,`/admin`) | CRUD | Categories | jwt | vendor/superadmin | `menucategories` | both |
| `/vendor-items` (+`/v2`,`/items`,`/uploadItems`) | CRUD | Items, per-channel pricing/availability | jwt | vendor/superadmin | `vendoritems` | admin/merchant |
| `/user/menu`,`/v2/user/menu`,`/user/items`,`/recommended-items` | find | Consumer menu | public/jwt | — | `menus`,`vendoritems` | web |
| `/resetsoldout` | patch | Reset sold-out | jwt | vendor | `vendoritems` | merchant |

### Cart & orders — `src/services/{usercart,ordering,payment-transactions}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/guest/cart` | CRUD | Guest cart | public (guest token) | — | `carts` | integration svc (avail) | web |
| `/user/cart`,`/user/checkout`,`/usercart` | CRUD/create | User cart & checkout | jwt | self | `carts`,`user_carts` | integration svc | web |
| `/user-ordering` | create | Place order | jwt | self | `orderings`,`transactionals` | Razorpay, integration svc | web |
| `/ordering` | find/patch + events | Merchant order mgmt (emits `order_trigger`,`assign_delivery_person`) | jwt | vendor / superadmin via `vendorAccess` | `orderings` | Dunzo/Porter, integration svc | admin/merchant |
| `/order-availability|charges|detail`,`/orderSettle`,`/updateTransaction` | create/get | Availability, surcharges, settlement, txn update | jwt | self/vendor | `orderings`,`transactionals` | Razorpay | web, merchant |
| `/merchant/ordering`,`/merchant/order-hold`,`/merchant/direct-merchant-payment` | CRUD | Merchant ops | jwt | vendor | `orderings` | Razorpay | merchant |
| `/admin/orders`,`/admin/order-reports` | find | Admin order reporting | jwt | superadmin | `orderings` | — | admin |

### Seating / reservation — `src/services/diner/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | FE |
|----------|---|---------|-------|-------|----|----|
| `/diner`,`/user/diner` | CRUD + events | Seating/reservation requests (`diner_trigger`) | jwt | self | `diners` | web |
| `/vendor/diner`,`/table/diner`,`/dinerstatus` | CRUD | Merchant seating ops, table assign | jwt | vendor | `diners`,`diner statuses` | merchant |
| `/Admin/diner`,`/admin/diner-report` | find | Admin seating | jwt | superadmin | `diners` | admin |
| `/cron/diner` | internal | Time-based transitions | internal | — | `diners` | — |

### Experiences & events — `src/services/{experience,expRequests,events,event-handler}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/experience`,`/user/experience`,`/vendor/experiences`,`/admin/experience` | CRUD | Experience catalog | jwt | role-scoped | `experiences` | S3 | both |
| `/expRequest`,`/userExpRequest` | CRUD + `requestUpdate` | Experience booking | jwt | self/vendor | `exprequests`,`transactionals` | Razorpay | web, merchant |
| `/events`,`/vendor/events`,`/admin/events` | CRUD | Vendor events | jwt | role-scoped | `events` | — | both |
| `/event-handler` (+ `/user`,`/vendor`,`/admin`,`/bulk`) | CRUD + `event_trigger` | Event RSVP/tickets | jwt | role-scoped | `eventhandlers`,`tickets` | — | both |

### Payments, wallet, settlement — `src/services/{wallet,razorpay,razorpayx-service,transactional,settlement*,withdraw-request,refund}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/razorpay`,`/razorpay-webhook` | create/POST | Payment order + webhook | jwt / webhook sig | self | `payments`,`transactionals` | **Razorpay** | web |
| `/razorpayx-service` | create | Payouts | jwt | superadmin | `settlements` | **RazorpayX** | admin |
| `/wallet`,`/wallet_kyc`,`/closeWallet` | CRUD | Wallet + KYC | jwt | self | `wallets` | MSG91 (KYC OTP) | web |
| `/transactional`,`/payment/wallet`,`/txn-report` | CRUD/find | Ledger, wallet pay | jwt | self/vendor | `transactionals` | — | both |
| `/settlement`,`/settlement_process`,`/settlement_record`,`/manualSettlement` | CRUD | Settlement batching | jwt | superadmin | `settlements`,`settlementrecords` | RazorpayX | admin |
| `/withdraw-request`,`/admin/withdraw-request` | CRUD | Merchant withdrawals | jwt | vendor/superadmin | `withdrawrequests`,`wallets` | RazorpayX | merchant/admin |
| `/refund`,`/refundReports` | CRUD/find | Refunds | jwt | superadmin | `refunds` | Razorpay | admin |

### Promotions — `src/services/{offers,promotionsvideo,referral*}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | FE |
|----------|---|---------|-------|-------|----|----|
| `/offers` (+ `/user`,`/user/filter-offers`,`/vendor`,`/admin`,`/offer/details`) | CRUD | Offers/coupons | jwt/public | role-scoped | `offers` | both |
| `/promotions-Video`,`/promotions-event` | CRUD | Promo media | jwt | vendor/superadmin | `promotionsvideos` | both |

### Notifications & chat — `src/services/{notifications,sms,msg91,email,inAppNotification,chat}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/notifications` (+ admin/vendor) | CRUD | Push dispatch | jwt | role-scoped | `notifications`,`notification-models` | **FCM** | both |
| `/sms`,`/msg91`,`/non-user-sms` | create | SMS/OTP | jwt/public | — | templates | **Twilio/MSG91** | both |
| `/email` | create | Email | jwt | — | templates | **SendGrid/SES** | both |
| `/inAppNotification`,`/user/inAppNotif` | CRUD | In-app + broadcasts | jwt | superadmin (broadcast) | `inappnotifications` | — | both |
| `/chat` | create + `created` | Chat | jwt | participants | `chats` | — | both |

### Delivery (orchestration only; tracking is external/deferred) — `src/services/{delivery-persons,delivery-partners,dunzo,logistics}/**`
| Endpoint | M | Purpose | AuthN | AuthZ | DB | Down | FE |
|----------|---|---------|-------|-------|----|------|----|
| `/delivery-persons`,`/orders/delivery-persons` | CRUD/find | Self-delivery fleet & assigned orders | jwt | vendor/(driver) | `deliverypersons`,`orderings` | integration svc | merchant, (deferred driver app) |
| `/dunzoOrders`,`/dunzoWebHook`,`/dunzoStatus` | create/POST | Dunzo tasks + webhook | jwt/webhook | vendor | `dunzodeliveries` | **Dunzo** | merchant/admin |
| `/logistics/porter/*` | create | Porter booking | jwt | vendor | `porterbookingjobs` | **Porter** (API + browser automation) | merchant |
| `/logistics/delivery/estimate`,`/user/delivery-estimate` | create | Delivery estimate/availability | jwt/public | — | — | **integration svc** (⇢ deferred Nest?) | web, merchant |

### POS — `src/services/pos/**`, `src/helpers/petpooja.ts`
| Endpoint | M | Purpose | Down |
|----------|---|---------|------|
| `/admin/pos`,`/merchant/pos/:action`,`/pos/webhook/:posId/:action`,`/pos/api/:posId/:action` | CRUD/POST | Petpooja menu/order sync + webhooks | **Petpooja** |

### ONDC — `src/services/ondc/**`, `src/ondc.ts`
| Endpoint | M | Purpose | Down |
|----------|---|---------|------|
| `/ondc/*` (30+): `on_search`,`on_select`,`on_init`,`on_confirm`,`on_status`, buyer cart/order/delivery/issue, admin restaurants/orders/disputes, RSF settle/report/recon | create/POST | ONDC/Beckn protocol | **ONDC micro-server** (`ONDC_MICRO_SERVER_URL`) |

### Admin & platform — `src/services/{role-management,vendor-access,pageStats,errorHandler,getAppVersion,...}`
| Endpoint | M | Purpose | AuthZ | DB |
|----------|---|---------|-------|----|
| `/role-management` (+ admin variants) | CRUD | RBAC permission trees | vendor/superadmin | `roles` |
| `/vendorAccess` | CRUD | Superadmin impersonation | superadmin | `vendoraccesses` |
| `/errorHandler` | create | Global error logging | internal | `errors` |
| `/getAppVersion` | get | App version/force-update | public | `appversions` |

## Notes / review items
- `/waiters` service defined but **not registered** (orphan); `payment-transactions` (`PAYMENTS_SERVICE`) is internal (not HTTP-mounted).
- Duplicate `app.configure()` for some services in `src/services/index.ts` (harmless).
- Formal request/response schemas are **not** defined per endpoint (Mongoose-driven) — a target API contract must be derived from models + client usage (`amealio_web_app/src/common/api/urls.js`, admin/merchant action creators).
