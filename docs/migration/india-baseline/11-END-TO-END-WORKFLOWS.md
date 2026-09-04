# 11 — End-to-End Workflows & Dependency Map

Actual workflows supported by the approved baseline (no invented flows), plus the dependency map (analysis Section 10). Backend = `amealio-vendordashboard`; consumer = `amealio_web_app`; admin/merchant = `amealiodashboardmvp-`. Numeric statuses are env-driven (values **UNKNOWN — REQUIRES REVIEW**).

## Dependency map (Section 10)

### Consumer chain
```
amealio_web_app
  → Feathers authentication (User) / OTP / social / WhatsApp / guest
  → REST + Socket.IO services: listRestaurant, user/menu, user/cart, user-ordering,
      user/diner, user/experience, offers, wallet, razorpay
  → amealio-vendordashboard (services + hooks + crons)
  → MongoDB
  → external: Razorpay (SDK), Google Maps, Firebase, PostHog/GA4/Meta,
      recommendations API*, integration service* / live-tracking socket*  (* external/deferred)
```

### Vendor/Admin chain
```
amealiodashboardmvp- (portal ADMIN|MERCHANT)
  → Feathers vendorauthentication (VendorUser)
  → REST + Socket.IO services: vendor-user, restaurant, menu, ordering, diner,
      events/experiences, role-management, settlement*, admin/*, ondc/admin/*
  → amealio-vendordashboard
  → MongoDB
  → external: RazorpayX, Twilio (voice), Dunzo, Petpooja, ONDC micro-server, S3
```

### Shared dependencies (both chains)
- Same **backend** (`amealio-vendordashboard`) and same **MongoDB**.
- Shared services: OTP (`/send-otp`,`/verify-otp`), notifications, chat, restaurant/menu, ordering, diner (role-scoped variants).
- Shared realtime channels (`src/channels.ts`): users, vendors, superAdmins, delivery persons.
- Shared external providers: MSG91 (OTP), Firebase/FCM (push), Google Maps, integration service.
- **Deferred external dependency:** delivery tracking (integration service + live-tracking socket ⇢ deferred `amealio-nestjs-backend`?), driver app.

## Workflow 1 — Registration → discovery → order → payment
```
Register/login (OTP/social/WhatsApp/guest)  [/authentication, /otp-authentication]
→ discovery (home moods/cravings/curations, search)  [MainHomeScreen.jsx; /searchGlobal, /listRestaurant]
→ restaurant + menu  [/restaurant/:ID; /user/menu, /v2/user/menu]
→ add to cart (guest or user; guest merges on login)  [cartManager.js; /guest/cart, /user/cart]
→ checkout (order type, address/schedule, tips, allergies)  [OrderCheckout.jsx; /user/checkout, /order-charges]
→ payment (Razorpay | wallet | direct merchant)  [useAmealioRazorpay.js; /razorpay, /updateTransaction, /payment/wallet]
→ order created (status PENDING → merchant accept → preparing → ready → [delivery] → delivered → completed)
→ track (order_trigger + external locationUpdated)  [OrderTrackScreenNew.jsx]
```
Evidence: consumer `src/screens/ordering(v1)/**`; backend `src/services/{usercart,ordering}/**`, `ordering.hooks.ts`; crons `src/cron.ts`.

## Workflow 2 — Reservation / seating
```
Restaurant → seating: waitlist | reservation
→ details (party size, kids, high chairs, accessibility, requests; reservation adds date/time)  [NewSeatingResquest.jsx]
→ submit (Diner; service_type SEATING|RESERVATION)  [/user/diner]
→ status PENDING → (geo-fenced arrival) → SEATED/NOTSEATED → COMPLETED|REJECTED|CANCELLED
→ live track (diner_trigger)  [useTrackScreenSocket.js]
```
Rules: auto-accept/min-party from subscription; reservation blackout windows (`manageReservationBlock`); diner cron every minute.

## Workflow 3 — Celebration / experience (and event ticket)
```
Experience listing → details → booking stepper (packages/menu) → summary  [ExperienceBookingPage.jsx]
→ checkout → payment (Razorpay EXPERIENCE flow | wallet)  [ExpCheckout.jsx; /razorpay]
→ expRequest created; status synced with order; settlement (daily 04:00)  [/expRequest]
→ track (requestUpdate)

Event path: /event-handler creates RSVP/ticket → public ticket QR page in merchant app
  (/ticketbooked/:id, /experience/ticket/:id)
```
Evidence: consumer `src/screens/ExperienceCheckout/**`; backend `src/services/{experience,expRequests,events,event-handler}/**`.

## Workflow 4 — Merchant order operations
```
Merchant login (portal MERCHANT)  [/vendorauthentication]
→ order dashboard receives new order (order_creation/order_trigger)  [/ordering]
→ accept / hold / substitute / direct payment  [/merchant/ordering, /merchant/order-hold, /order-cancel-substitution]
→ assign delivery (self | Dunzo | Porter)  [/orders/delivery-persons, /dunzoOrders, /logistics/porter/*]
→ status transitions → settlement accrual (blockSettlement/settlementReady)
```

## Workflow 5 — Admin operations (representative)
```
Super-admin login (portal ADMIN, OTP)  [/admin/auth]
→ approve pending vendors / onboard  [/superadminallpendingvendors, /addvendor*]
→ configure subscriptions; manage ONDC; delivery-partner (Dunzo) admin
→ settlements/payouts (RazorpayX); withdrawal approvals  [/settlement*, /admin/withdraw-request]
→ reports  [/superadminreports, settlement summary]
```

## Workflow 6 — Settlement / payout
```
Order/experience/event completes → amount accrues
→ settlement_process batches records (settlementRecord)
→ daily 04:00 cron initiates RazorpayX payouts, polls status → updates settlement status
→ merchant withdrawal: request → admin approval → RazorpayX IMPS payout (wallet reversal on failure)
```
Evidence: `src/services/settlement-process/settlement-process-cron.class.ts`, `withdraw-request/admin-withdraw-request.class.ts`, `src/cron.ts`.

## Workflow 7 — Notifications (cross-cutting)
```
Domain event → resolve template (notifications.flow_id) → route by channel
  (push FCM / SMS MSG91|Twilio / email SendGrid|SES / WhatsApp MSG91 / in-app)
→ scheduled templates dispatched via cron (SMS 20,50; push 10,40; email 0,30)
```

## Not fully in-baseline (documented dependency)
- **Delivery GPS tracking** (driver emits to Nest `/tracking`; consumer subscribes to live-tracking socket) — the tracker + driver app are **deferred** (D-011). During baseline, real-time GPS is an external dependency; delivery still functions via partner webhooks/status.

> All workflows above are evidenced by the cited source files. Loyalty (points/tiers) and a standalone wallet page are **not** clearly implemented in the baseline web app — see [06](./06-BUSINESS-DOMAINS.md) (`UNKNOWN`).
