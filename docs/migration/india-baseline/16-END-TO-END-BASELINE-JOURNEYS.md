# 16 — End-to-End Baseline Journeys

The critical user journeys that must work for the India baseline to be considered **restored**. Each journey is evidenced by source in the approved repos (VD = `amealio-vendordashboard`, WEB = `amealio_web_app`, DASH = `amealiodashboardmvp-`). Journeys not supported by evidence are marked accordingly and **not invented**.

Priority: **CRITICAL** (must pass for baseline restored) · **OPTIONAL** (existing; included only if the owner puts it in the wave) · **EXCLUDED** (deferred/non-baseline).

Detailed step evidence: [11](./11-END-TO-END-WORKFLOWS.md). Acceptance: [15](./15-BASELINE-ACCEPTANCE-CRITERIA.md).

## J1 — Consumer registration / login — **CRITICAL**
Guest browse → OTP (or social/WhatsApp) login → session established; guest cart merges on login.
- Evidence: WEB `SignUp.js`,`UserLogin.js`,`cartManager.js`; VD `src/authentication.ts`,`services/{otp-authentication,social-sign-*,whatsapp-auth}`.
- Pass: **AC-C1, AC-C2**.

## J2 — Consumer discovers restaurant — **CRITICAL**
Home (moods/cravings/curations) / search → restaurant results filtered by location.
- Evidence: WEB `MainHomeScreen.jsx`,`GlobalSearch.jsx`; VD `searchGlobal`,`listRestaurant`,`filter-restaurant`.
- Pass: **AC-C3**.

## J3 — Consumer views restaurant / menu — **CRITICAL**
Open restaurant → details/hours/availability → browse menu (categories, items, variants, add-ons, per-channel pricing).
- Evidence: WEB `NewRestaurantDetails`,`MainMenu`; VD `restaurant`,`user/menu`,`vendor-items`.
- Pass: **AC-C4**.

## J4 — Consumer places an order — **CRITICAL**
Add to cart (modifiers) → choose order type → charges/taxes → checkout → payment (Razorpay/wallet) → order created.
- Evidence: WEB `OrderCheckout.jsx`,`useAmealioRazorpay.js`; VD `user/cart`,`user/checkout`,`order-charges`,`user-ordering`,`razorpay`.
- Pass: **AC-C5, AC-C6, AC-I1**.

## J5 — Merchant receives / manages order — **CRITICAL**
New order arrives in real time → accept/prepare/hold/substitute → advance lifecycle → (assign delivery if applicable).
- Evidence: DASH `/orderdashboard`, socket `order_creation`/`order_trigger`; VD `ordering`,`merchant/ordering`,`ordering.hooks.ts`.
- Pass: **AC-M4, AC-B3**.

## J6 — Consumer views order status / history — **CRITICAL**
Live status transitions (realtime) → order visible in history with correct details.
- Evidence: WEB `OrderTrackScreenNew.jsx`; VD `ordering` events + find.
- Note: **live GPS map** portion depends on the deferred tracker/live-tracking socket → that sub-part is **EXCLUDED** from baseline; order-status tracking itself is CRITICAL.
- Pass: **AC-C7**.

## J7 — Restaurant / merchant management — **CRITICAL**
Merchant login → onboard/edit restaurant (info, hours, availability) → manage menu/items/pricing/availability → changes reflected to consumers.
- Evidence: DASH `/mapsetup`,`/editrestaurantdetails`,`/menusetup-dashboard`,`/additemavailablity`; VD `restaurant`,`menu`,`menu-category`,`vendor-items`,`resetsoldout`.
- Pass: **AC-M1, AC-M2, AC-M3**.

## J8 — Reservation workflow — **CRITICAL** (implemented)
Submit waitlist/reservation (party details; reservation date/time honoring blackout) → status lifecycle → seated/completed/cancelled → notifications.
- Evidence: WEB `NewSeatingResquest.jsx`; VD `user/diner`,`vendor/diner`,`manage-reservation-block`,`cron/diner`.
- Pass: **AC-C8, AC-M5**.

## J9 — Celebration workflow — **OPTIONAL** (implemented; owner-decision)
Discover experience → booking stepper (packages/menu) → checkout → payment → expRequest lifecycle → track.
- Evidence: WEB `ExperienceBookingPage.jsx`,`ExpCheckout.jsx`; VD `experience`,`expRequest`.
- Included only if owner puts Celebrations in the wave (see [14](./14-CAPABILITY-MATRIX.md) §7).

## J10 — Event workflow — **OPTIONAL** (implemented; owner-decision)
Discover event → RSVP/book → payment → (ticket issuance + QR).
- Evidence: WEB `/experience/events/:eventId`; VD `events`,`event-handler`,`ticket`; DASH QR ticket pages (`/ticketbooked/:id`).
- Ticket **validation/capacity** are **UNKNOWN** (not evidenced) — excluded unless clarified.

## J11 — Payment workflow — **CRITICAL**
Initiate → confirm (webhook) / fail → transaction ledger recorded → (settlement accrual).
- Evidence: VD `razorpay`,`razorpay-webhook`,`updateTransaction`,`transactional`.
- Pass: **AC-C6, AC-B4, AC-I1**.

## J12 — Notification workflow — **CRITICAL**
Domain event → template resolution → channel dispatch (in-app/push/SMS/email) at baseline trigger points.
- Evidence: VD `notifications`,`sms`,`msg91`,`email`,`common/PushNotifications`; crons `src/cron.ts`.
- Pass: **AC-C9, AC-I2**.

## J13 — Admin operational workflow — **CRITICAL**
Admin login → approve/manage vendors & users → settlements/payouts & withdrawal approvals → configuration.
- Evidence: DASH `/superadmin*`; VD `admin/auth`,`admin/*`,`settlement*`,`admin/withdraw-request`,`vendorAccess`.
- Pass: **AC-A1..A6, AC-M7**.

## Additional evidenced flow
## J14 — Settlement / payout — **CRITICAL** (merchant financial)
Completed order/experience accrues → batch → RazorpayX payout → withdrawal approval.
- Evidence: VD `settlement-process`,`withdraw-request`,`razorpayx-service`, `src/cron.ts`.
- Pass: **AC-M7, AC-A4, AC-I1**.

## Excluded journeys (deferred / non-baseline)
- **Delivery-boy (driver) journey** — `amealio-self-delivery-app` (deferred, D-011).
- **Live GPS tracking journey** — `amealio-nestjs-backend` + live-tracking socket (deferred/external).
- **ONDC buyer journey** — implemented in WEB/VD but **owner-decision** whether in the first baseline wave.
- **AI recommendations journey** — depends on the **external** recommendations API (repo not in workspace).

## Summary

| Journey | Priority |
|---------|----------|
| J1 registration/login | CRITICAL |
| J2 discovery | CRITICAL |
| J3 restaurant/menu | CRITICAL |
| J4 place order | CRITICAL |
| J5 merchant order mgmt | CRITICAL |
| J6 order status/history | CRITICAL (live-GPS excluded) |
| J7 restaurant/merchant mgmt | CRITICAL |
| J8 reservation | CRITICAL |
| J9 celebration | OPTIONAL (owner) |
| J10 event (+ticket) | OPTIONAL (owner); validation/capacity UNKNOWN |
| J11 payment | CRITICAL |
| J12 notification | CRITICAL |
| J13 admin operations | CRITICAL |
| J14 settlement/payout | CRITICAL |

> Baseline "restored" requires **all CRITICAL** journeys to pass ([15 Definition of Done](./15-BASELINE-ACCEPTANCE-CRITERIA.md#definition-of-done--india-baseline)). OPTIONAL journeys enter scope only by owner decision; EXCLUDED journeys must not block it.
