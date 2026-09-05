# 05 — API Migration Map

Maps important legacy APIs (all in `amealio-vendordashboard`) to target APIs. Design only. Legacy surface: P1.1 [04-BACKEND-API-INVENTORY](../india-baseline/04-BACKEND-API-INVENTORY.md).

**Disposition** legend: **RETAIN-TEMP** (keep during cutover via shim) · **ADAPT** (same behavior, new shape/route) · **REPLACE** (new API) · **DEPRECATE** (drop).

> Legacy APIs are Feathers services (REST + Socket.IO) with **model-shaped, largely un-versioned** payloads and role-variant paths (`/user/*`,`/vendor/*`,`/admin/*`,`/v2/*`). Target APIs are NestJS controllers organized by domain with explicit contracts and one authorization layer. Because the two clients depend on current shapes, a **compatibility shim / anti-corruption layer** is recommended during cutover for the highest-traffic APIs.

| Business capability | Current endpoint(s) | Current consumer | Target endpoint · domain | Compatibility need | Transformation | AuthN | AuthZ | Disposition |
|---------------------|---------------------|------------------|---------------------------|--------------------|----------------|-------|-------|-------------|
| Consumer auth | `/authentication`, `/otp-authentication`, `/social-sign-*`, `/whatsapp-auth` | web | `/auth/*` · Identity | High | raw header→Bearer; unify strategies; claims | strategy | — | **REPLACE** (+ RETAIN-TEMP shim) |
| Vendor/admin auth | `/vendorauthentication`, `/admin/auth` | admin/merchant | `/auth/*` (role claims) · Identity | High | portal header→role claim | strategy+portal | role | **REPLACE** (+ shim) |
| Users/profile/address | `/user-service`, `/user/profiles`, `/address` | web | `/users`,`/addresses` · Users | Medium | add address owner | jwt | self | **ADAPT** |
| Restaurant discovery/search | `listRestaurant`,`searchGlobal`,`filter-restaurant` | web | `/restaurants`,`/restaurants/search` · Locations | Medium | consolidate variants | public/jwt | — | **ADAPT** |
| Restaurant mgmt | `/restaurant`,`/manage-hours-of-operation` | merchant/admin | `/restaurants` · Locations | Medium | normalize hours | jwt | vendor/admin | **ADAPT** |
| Menu/items | `/menu`,`/menu-category`,`/vendor-items`,`/user/menu`,`/v2/user/menu` | both | `/menus`,`/items` · Menus | Medium | collapse role/v2 variants; normalize | jwt/public | vendor | **ADAPT** |
| Cart | `/user/cart`,`/guest/cart` | web | `/carts` · Orders | High | unify cart models | jwt/guest | self | **REPLACE** (+ shim) |
| Checkout/order | `/user/checkout`,`/user-ordering`,`/order-charges` | web | `/orders` · Orders | High | explicit status/charges | jwt | self | **REPLACE** (+ shim) |
| Order mgmt/status | `/ordering`,`/merchant/ordering` | merchant | `/orders`,`/merchant/orders` · Orders | High | status machine | jwt | vendor | **ADAPT** |
| Payments | `/razorpay`,`/updateTransaction`,`/transactional` | web | `/payments` · Payments | High | provider port; ledger | jwt | self | **REPLACE** (+ shim) |
| Payment webhook | `/razorpay-webhook` | Razorpay | `/payments/webhook/razorpay` · Payments | High | idempotency/signature | webhook sig | — | **ADAPT** |
| Settlement/withdrawal | `/settlement*`,`/withdraw-request`,`/razorpayx-service` | admin/merchant | `/settlements`,`/withdrawals` · Payments | Medium | explicit payout model | jwt | admin/vendor | **ADAPT** |
| Reservation/seating | `/diner`,`/user/diner`,`/vendor/diner` | both | `/reservations` · Reservations | Medium | unify diner | jwt | self/vendor | **ADAPT** |
| Notifications | `/notifications`,`/sms`,`/msg91`,`/email` | both | `/notifications` · Notifications | Low | provider ports | jwt | role | **ADAPT** (DEPRECATE dup SES/Twilio-SMS) |
| Admin ops | `/admin/*`,`/vendorAccess` | admin | `/admin/*` · Administration | Medium | explicit admin API | jwt | admin | **ADAPT** |
| Reference/taxonomy | `/category`,`/subcategory`,`/uom`,… | both | `/catalog/*` · Catalog | Low | normalize | jwt/public | admin(write) | **ADAPT** |
| Realtime (socket events) | `order_trigger`,`pending_notification`,`diner_trigger`,`requestUpdate`,`chat.created` | both | realtime gateway (same event names) · cross-cutting | High | preserve names/payloads | jwt (socket) | channel | **RETAIN-TEMP** contracts |
| Delivery orchestration | `/orders/delivery-persons`,`/dunzo*`,`/logistics/porter/*` | merchant | `/delivery/*` · Delivery | Medium | partner ports | jwt | vendor | **ADAPT** |
| ONDC | `/ondc/*` | both | separate bounded context (owner-decision) | Medium | — | mixed | — | **RETAIN-TEMP / owner-decision** |
| Legacy/orphan | `/waiters` (unregistered), duplicate configures | — | — | — | — | — | — | **DEPRECATE** |

## APIs that can be retained temporarily / adapted / replaced / deprecated
- **Retain temporarily (shim during cutover):** consumer & vendor auth, cart, checkout/order, payments, realtime event contracts — the highest-coupling, highest-risk client dependencies.
- **Adapt:** users, restaurant, menu, reservations, notifications, admin, taxonomy, delivery, settlement.
- **Replace:** auth (unified identity), cart (unified), order/checkout, payments (ledger + provider port).
- **Deprecate:** orphan `/waiters`, duplicate service registrations, legacy cart/flow endpoints once V2 parity is reached.

## Cross-cutting API decisions (for review)
- Introduce **explicit versioning** (`/v1`) instead of the ad-hoc `/v2/*` and role-variant sprawl.
- Preserve the **`AmealioError` contract** (or documented mapping) so clients handle errors unchanged (AC-B2).
- An **anti-corruption / shim layer** lets the existing clients keep working while backend domains migrate incrementally (no big-bang). Detailed sequence: [10](./10-MIGRATION-SEQUENCE.md).
