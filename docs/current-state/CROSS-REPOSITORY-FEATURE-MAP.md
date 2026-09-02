# Cross-Repository Feature Map

Traces major customer-facing capabilities through the connected platform.

---

## 1. Restaurant Discovery & Search

```
Customer: amealio_web_app
  /home, /search, /food/:id, mood/craving/curation pages
    ↓ REST
Backend: amealio-vendordashboard
  /listRestaurant, /listRestaurantCard, /searchGlobal, /searchRestaurantCard
  /restaurant, /restaurantCard, /user/moods, /user/cravings, /user-curation
    ↓ MongoDB
Data: restaurant, restaurantCard, mood, sub-category, reels
    ↓ Optional
AI: amealio-homepage-v2-rag-server POST /recommendations (homepage2 only)
```

**Merchant dependency:** Restaurant profile, subscription listing flags, menu availability  
**Admin dependency:** Mood/curation/subcategory taxonomy, media catalogues  
**Status:** IMPLEMENTED

---

## 2. Menu Browse & Item Customization

```
Customer: /restaurant/:ID/food/menu/v1 → MainMenu
    ↓
  /user/menu, /v2/user/menu, /user/items, /user/menu-category
    ↓
Backend: vendor-items, menu-category services
    ↓
Data: vendoritems (VendorItems), menu, menu-category, cart (modifiers in item schema)
```

**Merchant:** `/itemavailablitydashboard`, `/menusetup-dashboard` → `/vendor-items`, `/menu-category`  
**Admin:** `/admin/items`, chain catalogue  
**Status:** IMPLEMENTED

---

## 3. Cart & Checkout (Ordering)

```
Customer: /restaurant/:ID/food/cart → Cart
         /restaurant/:ID/food/ordercheckout → OrderCheckout
    ↓
  POST /user/cart, POST user-ordering, POST /user/checkout
  PATCH updateTransaction, GET razorpay
    ↓
Backend: ordering, usercart, razorpay, wallet, transactional
    ↓
Data: user-cart, ordering, transactional, payments
    ↓
Integration: Razorpay payment gateway
    ↓
Real-time: Socket ordering service (order track)
```

**Order types:** DINEIN, TAKEAWAY, CURBSIDE, SKIPLINE, DELIVERY, CATERING (orderingSlice ORDER_TYPE_MAP)  
**Merchant:** `/orderdashboard`, order accept/reject/status  
**Admin:** `/superadminallorders`  
**Status:** IMPLEMENTED

---

## 4. Delivery Order Fulfillment

```
Customer: order track + live map
    ↓
Backend: ordering, delivery-persons, dunzo, porter-*, delivery-estimate
    ↓
Rider app: amealio-self-delivery-app
  GET orders/delivery-persons, PATCH status, Socket assign_delivery_person
    ↓
Location: amealio-nestjs-backend /tracking updateLocation
```

**Status:** IMPLEMENTED (multi-provider: own riders, Dunzo, Porter)

---

## 5. Waitlist Seating

```
Customer: /restaurant/:id/seating/waitlist → NewSeatingResquest
    ↓ POST /diner (service_type: SEATING)
Backend: diner service, diner-cron
    ↓
Data: Diner collection
    ↓ Socket diner_trigger
Customer track: /seating/track/:dinerId
    ↓
Merchant: /seatingdashboard → assign table, update status
    ↓
Subscription: table_management.table_setup (table status sync via cron)
```

**Status:** IMPLEMENTED

---

## 6. Reservation Seating

```
Customer: /restaurant/:id/seating/reservation
    ↓ GET /restaurant-availability/:id
    ↓ POST /diner (service_type: RESERVATION, reservationTime)
Backend: diner, manage-reservation-block, restaurant-availability
    ↓
Merchant: /reservationdashboard, /manage-block-reservation-calendar
```

**Status:** IMPLEMENTED

---

## 7. Celebrations (Experience Subcategory)

```
Customer: /experience (Celebrations tab) → Celebrations.jsx
    ↓ GET /user/experience?pageType=EXPERIENCES&subCategory=
Backend: user-experience.class.ts
    ↓
Data: Experience (filtered by subCategory → Sub Category)
    ↓
Customer book: /restaurant/:ID/experiences/:expId/booking
    ↓ POST /userExpRequest
Backend: expRequests, experience
    ↓
[Optional food] /user/exp-cart → /user/exp-checkout
[Optional seating] linked Diner via exp_request_id
    ↓
Payment: razorpay/wallet → transactional
    ↓ Socket expRequest
Customer track: /experiences/:expId/track/:requestId
    ↓
Merchant: /experienceDashboard/*
Admin: /admin/experience, media catalog
```

**Status:** IMPLEMENTED (UI label "Celebrations" ≠ separate backend entity)

---

## 8. Platform Events & Vendor Ticketed Events

```
Platform events:
  Customer /experience/events/:eventId
    ↓ /user_exp_events, /exp_events
  Admin /admin/exp-events

Vendor events:
  Customer /restaurant/:ID/experiences or legacy event routes
    ↓ POST /user/event-handler (RSVP or TICKET_BOOKED)
  Backend: events, event-handler
  Merchant: /event, /event/add-event
  Admin: /superadminrestaurantevents
```

**Status:** IMPLEMENTED

---

## 9. User Authentication & Profile

```
Customer: /login, /signup, /enterotp, WhatsApp auth
    ↓ /authentication, /otp-authentication, /whatsapp-auth
Backend: authentication.ts, user-service
    ↓
Data: User Service collection, session, user-profile
    ↓
Profile: /profile/new, preferences, favorites, saved addresses
```

**Merchant:** /vendorauthentication, /vendor-user  
**Admin:** /admin/auth  
**Status:** IMPLEMENTED

---

## 10. ONDC Marketplace (IN market, DEFERRED for replatform)

```
Customer: /ondc/* (gated by REACT_APP_COUNTRY=IN)
    ↓ /buyerApp/*, /ondc/restaurant, /ondc/user/*
Backend: ondc/* services (30+ paths)
    ↓
Data: ondc-* models (cart, order, restaurant, settlements)
Admin: SuperAdminONDC components
```

**Status:** DEFERRED — EXISTING INTEGRATION (see DEFERRED-ONDC.md)

---

## 11. Wallet & Settlements

```
Customer: wallet payment at checkout
    ↓ /wallet, /payment/wallet
Merchant: settlement reports, withdraw-request
Admin: /admin/wallet, /admin/transfer-money, settlement-process cron
    ↓
Data: wallet, settlement, settlement-record, transactional
Integration: RazorpayX
```

**Status:** IMPLEMENTED

---

## 12. Support Tickets

```
Customer: /raiseTicket, /view-raise-ticket/:ID
    ↓ GET /ticket (list works)
    ↓ POST CREATE_TICKET — PARTIAL (URL constant missing in urls.js)
Merchant: /vendoruseropenissues → /vendor/ticket
Admin: /openissuesusers, /openissuesvendors → /admin/ticket
```

**Status:** PARTIAL (customer create ticket)

---

## 13. Notifications

```
Backend: notifications, inAppNotification, push-notification helper
    ↓ FCM (Firebase), SMS (msg91), Email, WhatsApp
Cron: sms-template, notification-template, email-template (scheduled)
Customer: in-app notification slice
Merchant: notification bell in dashboard App.js
```

**Status:** IMPLEMENTED

---

## 14. Community, Bytes, Reels

```
Customer: /community, /bytes, home reels strip
    ↓ /user/reels, /reels, /user/visited-restaurants
Backend: reels service, user-analytics
Merchant: /merchant/reels
Admin: /admin/reels
```

**Status:** IMPLEMENTED

---

## Dependency Count

| Trace | Repositories involved |
|-------|----------------------|
| Core dining (menu→order→pay) | web_app, vendordashboard, (razorpay) |
| Seating | web_app, vendordashboard, dashboardmvp |
| Celebrations | web_app, vendordashboard, dashboardmvp, (rag-server for discovery only) |
| Delivery | web_app, vendordashboard, self-delivery-app, nestjs-backend |
| ONDC | web_app, vendordashboard, dashboardmvp |

**Cross-repository capabilities identified:** 14 major traces (above)
