# Business Rule Inventory

Rules classified as **CODE-ENFORCED** (logic in services/hooks/cron/models) vs **CONFIG-ONLY** (stored in subscription, enforced at runtime) vs **COMMENT/DOC ONLY**.

---

## Ordering

| Rule | Type | Evidence |
|------|------|----------|
| Order type availability gated by subscription ordering flags | CONFIG-ENFORCED | subscription.model.ts ordering blocks |
| Order auto-cancel after timeout | CODE-ENFORCED | `helpers/orderCancelCron.ts`, cron `canCron` */4 min |
| Order status progression numeric enum | CODE-ENFORCED | orderEnums.ts |
| Rider status 5=on the way, 6=delivered | CODE-ENFORCED | self-delivery-app order-card.tsx |
| Delivery assignment via socket `assign_delivery_person` | CODE-ENFORCED | socket-provider.tsx |
| Cart persisted per user in user-cart collection | CODE-ENFORCED | usercart service |
| Guest cart separate path `/guest/cart` | CODE-ENFORCED | urls.js, usercart service |
| Payment must complete via updateTransaction after Razorpay | CODE-ENFORCED | ordering checkout flow |
| POS webhook updates order state | CODE-ENFORCED | pos/webhook service |

---

## Seating & Reservations

| Rule | Type | Evidence |
|------|------|----------|
| service_type must be SEATING or RESERVATION | CODE-ENFORCED | diner.model.ts enum |
| diner_status enum constrained | CODE-ENFORCED | diner.model.ts + SEATING_STATUS constant |
| Table status AVAILABLE on terminal diner states | CODE-ENFORCED | diner-cron.class.ts updateTableStatusInSubscription |
| Table status OCCUPIED when SEATED | CODE-ENFORCED | diner-cron.class.ts |
| Walk-in max distance default 10000m | CONFIG-ENFORCED | subscription walkin_waitlist.distance |
| Walk-in auto-cancel default 15 min | CONFIG-ENFORCED | subscription + diner-cron |
| Reservation min party default 1 | CONFIG-ENFORCED | subscription reservation.minimum_person |
| Reservation table_kept_for default 15 min | CONFIG-ENFORCED | subscription |
| Reservation block dates honored | CODE-ENFORCED | manage-reservation-block service |
| Auto-cancel differs for open vs closed restaurant | CONFIG-ENFORCED | auto_cancel_open/close_restaurant fields |
| Wait time expiry triggers notifications | CODE-ENFORCED | diner-cron.class.ts |

---

## Experiences & Celebrations

| Rule | Type | Evidence |
|------|------|----------|
| expRequest status enum constrained | CODE-ENFORCED | expRequests.model.ts + EXP_REQUEST_STATUS |
| Experience must have restaurantId | CODE-ENFORCED | experience.model.ts required: true |
| minSeats/maxSeats constrain booking party size | CODE-ENFORCED | experience booking services |
| allowSingleBooking controls single-ticket mode | CONFIG+CODE | experience.model.ts field |
| is_food_included flag drives menu UX | CONFIG-ENFORCED | experience.model.ts, checkout flow |
| Auto-cancel for special/curated experiences | CONFIG-ENFORCED | subscription experience_management |
| Experience refund processing | CODE-ENFORCED | helpers/experienceRefund.ts |
| expRequest cancel cron | CODE-ENFORCED | expRequestStatusCorn.ts |
| Experience status cron (active/expired) | CODE-ENFORCED | helpers/experienceStatusCron.ts |
| Settlement blocked flag on expRequest | CODE-ENFORCED | blockSettlement, blockReason fields |

---

## Events & Tickets

| Rule | Type | Evidence |
|------|------|----------|
| event_type must be RSVP or TICKET_BOOKED | CODE-ENFORCED | event-handler.model.ts enum |
| event_status lifecycle enum | CODE-ENFORCED | event-handler.model.ts |
| leftOverRSVP / leftOverTB capacity decremented on booking | CODE-ENFORCED | event-handler.class.ts |
| min/max people per booking enforced | CODE-ENFORCED | Events model + handler validation |
| RSVP auto-accept when isRSVP_autoAccept | CONFIG-ENFORCED | Events model |
| Ticket payment required for TICKET_BOOKED | CODE-ENFORCED | payment_status on eventHandler |
| Online events require eventLink/eventPassword | CONFIG-ENFORCED | Events model |
| Event auto-cancel cron | CODE-ENFORCED | events-cron.class.ts |

---

## Payments & Refunds

| Rule | Type | Evidence |
|------|------|----------|
| Payment method enum (CASH, UPI, WALLET, cards, etc.) | CODE-ENFORCED | app.get("PAYMENTMETHOD") usage across models |
| Payment status enum PENDING/COMPLETED/CANCELLED/FAILURE | CODE-ENFORCED | models |
| Razorpay webhook signature validation | CODE-ENFORCED | razorpay-webhook service |
| Wallet monthly balance reset | CODE-ENFORCED | cron WalletMonthlyBalance 1st of month |
| Refund transaction type in transactionDetails | CODE-ENFORCED | transactionDetails.type enum |
| Gateway/outgoing charges tracked | CODE-ENFORCED | gatewayCharges, outgoingCharges fields |
| Split payment with pendingAmount | CODE-ENFORCED | expRequest.splitPayment |

---

## ONDC (DEFERRED)

| Rule | Type | Evidence |
|------|------|----------|
| Cancel commission 5% on user cancellation | CODE-ENFORCED | ONDC_CANCEL_COMMISSION_PERCENT constant |
| Refund delay 3 days | CODE-ENFORCED | ONDC_REFUND_DELAY_DAYS constant |
| Inter-participant ratio 97%/3% | CODE-ENFORCED | ONDC_INTER_PARTICIPANT_RATIO constants |
| ONDC refund cron daily 18:00 | CODE-ENFORCED | cron.ts (commented start) |

---

## Merchant & Admin Restrictions

| Rule | Type | Evidence |
|------|------|----------|
| Vendor must complete onboarding before dashboard access | CODE-ENFORCED | PrivateRoute.js have_vendor_submitted_details |
| Superadmin-only admin routes | CODE-ENFORCED | AdminPrivateRoute.js role === superadmin |
| RBAC permission schema defined per feature | CONFIG (schema) | role-management.model.ts |
| Fine-grained UI permission enforcement | PARTIAL | Backend schema exists; frontend guards coarse |
| Feature gates from subscription flags | CONFIG-ENFORCED | services.js Occasion check, subscription checks |
| Admin vendor impersonation via vendor-access | CODE-ENFORCED | vendor-access service, localStorage.vendorId |

---

## Timing & Capacity

| Rule | Type | Evidence |
|------|------|----------|
| Session automate opens/closes restaurant sessions | CODE-ENFORCED | session-automate cron every minute |
| Restaurant daily/weekly view count reset | CODE-ENFORCED | cron restViewDailyCount/WeeklyCount |
| Rating aggregation hourly | CODE-ENFORCED | rating-review-cron |
| Settlement process daily 04:00 | CODE-ENFORCED | settlementCheck cron |
| User deletion processing daily 04:00 | CODE-ENFORCED | userDeleteCron in settlementCheck |
| Vendor SMS reminder */15 5-20h | CODE-ENFORCED | sendSmsVendorReminderCron |
| Referral cron */3 min | CODE-ENFORCED | refCron (commented start) |

---

## Customer Restrictions

| Rule | Type | Evidence |
|------|------|----------|
| ONDC only shown when REACT_APP_COUNTRY=IN | CODE-ENFORCED | shouldShowOndc() in web_app |
| Protected routes require auth | CODE-ENFORCED | ProtectedLayer in routes-manager |
| Max 10 celebration category preferences | CODE-ENFORCED | Celebrations.jsx MAX_CELEBRATION_CATEGORY_SELECTION |
| Mandatory delivery app version gate | CODE-ENFORCED | getAppVersion bootstrap in self-delivery-app |

---

## COMMENT/DOC ONLY (Not Verified as Enforced)

| Rule | Notes |
|------|-------|
| Pilot seating route restrictions | PilotRouteGuard.jsx exists; enforcement in main router UNKNOWN |
| PostHog feature flags | Client supports isFeatureEnabled; no production usage found |
| README push firebase-config route | Referenced in self-delivery docs; route NOT FOUND in repo |

---

## Top 25 Rules That Must Not Be Lost (Migration Critical)

1. Diner service_type SEATING vs RESERVATION distinction
2. Diner status lifecycle and table status sync
3. Subscription-embedded table_setup as source of table truth
4. Walk-in/reservation auto-cancel timers (open vs closed restaurant)
5. manage-reservation-block calendar
6. restaurant-availability computation
7. Order type gating via subscription
8. Order auto-cancel cron behavior
9. Razorpay payment + updateTransaction flow
10. expRequest full status lifecycle including GETTING_PREPARE/SERVED
11. Experience minSeats/maxSeats/allowSingleBooking constraints
12. is_food_included vs separate menu ordering for experiences
13. Event RSVP vs TICKET_BOOKED type distinction
14. Event capacity (leftOverRSVP, leftOverTB) decrement logic
15. Payment method and status enums across all transactional entities
16. Refund transaction recording in transactionDetails
17. Wallet balance and monthly reset
18. Settlement process and blockSettlement on experiences
19. Socket real-time events (diner_trigger, ordering, expRequest, ondc)
20. Session automate (restaurant open/close)
21. Delivery multi-provider (own rider, Dunzo, Porter) assignment
22. Rider order_status 5/6 transitions
23. ONDC cancel commission and refund delay (deferred but existing)
24. Role-based auth paths (authentication vs vendorauthentication vs admin/auth)
25. Merchant onboarding gate (have_vendor_submitted_details)
