# 08 — Workflows

End-to-end workflows across the platform, reconstructed from services, hooks, cron jobs, and client flows. Numeric status codes are env-driven; their exact integer values are **`UNKNOWN — REQUIRES REVIEW`** (labels below are inferred).

## 1. Customer: food ordering

```
Browse restaurant → open menu → add items to cart (guest or user)
   → (login gate if guest; guest cart merged on login)
   → choose order type (dine-in / delivery / curbside / skip-line / takeaway / catering)
   → schedule + address + tips/donations + allergies
   → checkout → payment (Razorpay | wallet | scan-and-pay | direct merchant)
   → order created (status PENDING) → merchant accept → preparing → ready
   → [delivery] assign (self / Dunzo / Porter) → out for delivery (status 5) → delivered (6)
   → completed/settled (7)   |  cancelled (8)  |  returned (10)
```

- **Clients:** consumer web app (`user/cart`, `user/checkout`, `user-ordering`, `razorpay`, `updateTransaction`); merchant app for accept/prep/hold/substitute.
- **Realtime:** `ordering` events (`order_creation`, `order_trigger`, `pending_notification`), plus live delivery `locationUpdated`.
- **Jobs:** auto-cancel every 4 min; completion daily 05:00.
- Two parallel ordering UIs (legacy + "V1") exist in the consumer app.

## 2. Customer: seating (walk-in / waitlist) & reservation

```
Restaurant → seating: waitlist | reservation
  waitlist/walk-in: party size, kids, high chairs, accessibility, requests → submit (Diner, service_type SEATING)
  reservation: + date/time slot (respecting manageReservationBlock) → submit (Diner, service_type RESERVATION)
    → status PENDING → (geo-fenced arrival) → SEATED/NOTSEATED → COMPLETED | REJECTED | CANCELLED
    → live tracking via diner_trigger
```

- Auto-accept and minimum-party rules come from restaurant subscription settings.
- Diner cron runs every minute for time-based transitions.

## 3. Customer: experience / event booking

```
Experience listing → details → booking stepper (packages/menu) → summary
  → checkout → payment (Razorpay EXPERIENCE flow | wallet)
  → expRequest created → status synced with order → settlement (daily 04:00)
  → track via requestUpdate
```

- Events (`Events`/`eventHandler`) support RSVP/ticketing with nested table/floor setup; tickets have public QR pages in the merchant app.

## 4. Customer: ONDC buyer

```
ONDC search → menu → cart → checkout (buyerApp select/init/confirm)
  → order status/track via ONDC callbacks (on_status/on_track)
  → settlement + reconciliation (ondc_settlement*, ondc_reconciliation)
```

- Parallel ONDC entities (`ondc_user_cart`, `ondc_user_order`, …) and a dedicated micro-server relay.

## 5. Merchant workflows

| Workflow | Steps | Backend |
|----------|-------|---------|
| Onboarding | map/location setup → subscription selection → restaurant details/T&C → menu setup | `/restaurant`, `/restaurantchain`, `/menu`, `/menu-category`, `/vendor-items` |
| Menu management | categories → items (per-channel pricing/availability) → bulk upload → sold-out toggles | `/menu*`, `/vendor-items*`, bulk upload URL |
| Order ops | accept / prepare / hold / substitute / direct payment / receipt | `/merchant/ordering`, `/merchant/order-hold`, `/order-cancel-substitution` |
| Seating ops | manage waitlist/reservation/table assignment | `/vendor/diner`, `/table/diner` |
| Experiences/events | create experiences/events, manage RSVPs | `/vendor/experiences`, `/events`, `/event-handler` |
| Staff & roles | create roles (permission trees), assign staff | `/role-management`, staff mgmt |
| Subscriptions | manage ordering/seating/event/scan-pay bundles | subscription services |
| Settlements/earnings | view statements, request withdrawals | `/vendor/earnings`, `/merchantStatement`, `/withdraw-request` |
| Reports | order/diner/experience/settlement reports | report services |

## 6. Admin (super-admin) workflows

| Workflow | Steps |
|----------|-------|
| Vendor approval/onboarding | review pending vendors → create/edit vendor step-by-step → configure subscription bundles |
| Vendor impersonation | act as a vendor via `vendorAccess` |
| ONDC administration | merchant/order/settlement/dispute management |
| Delivery-partner admin | Dunzo settings/statements/settlements; delivery reports |
| Settlements/payouts | open items → initiate → payout details; user withdrawal requests |
| Staff & roles | super-admin role management |
| POS | Petpooja POS dashboard/administration |
| Content/config | moods, reels, templates, promo videos, UOM, reference data |
| Reporting | platform, settlement summary, order-settlement reports |
| Voice | Twilio browser calling from admin tables |

## 7. Settlement / payout workflow

```
Order/experience/event completes → amount accrues (settleOrderAmount, blockSettlement flags)
  → settlement_process batches unsettled records (settlementRecord)
  → daily 04:00 cron initiates RazorpayX payouts, polls status → updates settlement status
  → merchant withdrawal: request → admin approval → RazorpayX IMPS payout
       (on failure: wallet reversal)
  → statuses: PENDING/PARTIAL/FAILED/COMPLETED
```

## 8. Delivery workflow (self + third-party)

```
Order needs delivery → deliveryMethod chosen
  SELF_DELIVERY: assign deliverypersons → driver app: on-the-way (5) → delivered (6)
  THIRD_PARTY (Dunzo): create task → webhook status → order_status sync
  THIRD_PARTY (Porter): API booking (+ headless-browser automation via Redis) → status
  Tracking: backend → integration service /delivery/system/create
            driver app → Nest /tracking socket (updateLocation)
            consumer app → live-tracking socket (locationUpdated)
```

## 9. Delivery-boy app workflow (client)

```
OTP login (portal MERCHANT, deliveryPerson true) → online toggle (is_online)
  → receive assignment (socket assign_delivery_person or FCM push) → modal
  → view ongoing (orders/delivery-persons?orderStatus=ONGOING)
  → start (order_status 5) → GPS tracking to Nest /tracking (throttled)
  → delivered (order_status 6, payment_status 1) → stop tracking → history
```

- **`UNKNOWN — REQUIRES REVIEW`:** whether accept is an explicit action or implicit (the modal only offers "Got it"); server auto-assign vs driver-accept semantics.

## 10. Notification workflow

```
Event occurs → resolve template (notifications.flow_id by notificationId)
  → route by channel (push=FCM, SMS=MSG91/Twilio, email=SendGrid/SES, WhatsApp=MSG91, in-app)
  → scheduled templates dispatched via cron (SMS 20,50 * * * * ; push 10,40 ; email 0,30)
```

## 11. Background job schedule (backend)

| Schedule | Job |
|----------|-----|
| `* * * * *` | Diner/seating updates; session automation |
| `*/4 * * * *` | Auto-cancel stale orders |
| `10,40 * * * *` / `20,50 * * * *` / `0,30 * * * *` | Push / SMS / Email template dispatch |
| `0 4 * * *` | Settlement + user-delete + experience status |
| `0 5 * * *` | Order completion |
| `0 * * * *` / `* */4 * * *` | Rating aggregation (item / restaurant) |
| `0 0 1 * *` | Wallet monthly reset |
| `0 */6 * * *` | ONDC catalog search |
| various | ONDC settlement/refund/reconciliation; short-link cleanup |

Gated by `CRON_RUN` (diner + session crons run regardless).
