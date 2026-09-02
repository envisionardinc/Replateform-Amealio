# Celebrations Deep Dive — Current-State Forensic Audit

**Important:** There is **no backend entity named "Celebration"**. Customer-facing "Celebrations" are **Experience records** filtered by experience subcategories. Platform taxonomy uses `exp-events`, `exp_events`, and `Sub Category` collections.

---

## Terminology Map (Source Evidence)

| User-facing term | Backend entity | Collection/Service |
|------------------|----------------|-------------------|
| **Celebrations** (customer app tab) | Experience (subcategory-filtered) | `Experience` model, `/user/experience?pageType=EXPERIENCES` |
| **Events** (customer app tab) | Platform-managed exp events OR vendor Events | `exp_events`, `ExpEventManagement`, `Events` |
| **Occasions** | Experience type SPECIAL or occasion onboarding | `expRequest.expType: SPECIAL\|CURATED` |
| **Experiences** | Experience bookings | `Experience`, `expRequest` |
| **Festivals** | Admin exp-events taxonomy | `/admin/exp-events`, `ExpEventManagement` |
| **Vendor events** (tickets/RSVP) | Events + eventHandler | `Events`, `eventHandler` |

**Evidence:** No `celebration` service in backend grep; `Celebrations.jsx` calls `buildCelebrationListingUrl` with `pageType=EXPERIENCES` and `subCategory` filter.

---

## Customer "Celebrations" Flow

### Discovery

| Step | Implementation | Status |
|------|----------------|--------|
| Experience landing | `/experience` → `V2Experience.jsx` (Celebrations + Events tabs) | IMPLEMENTED |
| Celebration listing | `Celebrations.jsx` — subcategory filters, nearby carousel | IMPLEMENTED |
| Subcategory map | `celebrationSubCategoryUtils.js` — hardcoded title→ID map + API subcategory | IMPLEMENTED |
| API | `GET /user/experience?pageType=EXPERIENCES&subCategory=&dateFilter=` | IMPLEMENTED |
| Preferences | `/preferences/celebrations` — stores `celebration_subcategory` on user | IMPLEMENTED |
| Home strip | `HomeCelebrationsStrip` on main home | IMPLEMENTED |

**Celebration subcategories (hardcoded fallback map):** birthday, anniversary, baby shower, date night special, kitty party, farewell party, friends reunion, team lunch dinner, graduation party

**Evidence:** `celebrationSubCategoryUtils.js` lines 6–16

### Booking / Checkout

| Step | Route | API | Status |
|------|-------|-----|--------|
| Experience details | `/restaurant/:ID/experiences/:expId` | `GET /user/experience` | IMPLEMENTED |
| Booking | `/restaurant/:ID/experiences/:expId/booking` | POST `/userExpRequest` | IMPLEMENTED |
| Cart (food add-ons) | Experience cart flow | `/user/exp-cart` | IMPLEMENTED |
| Checkout | `/restaurant/:ID/experiences/:expId/checkout` | `/user/exp-checkout` | IMPLEMENTED |
| Track | `/restaurant/:ID/experiences/:expId/track/:requestId` | Socket `expRequest` | IMPLEMENTED |

### Tickets & Quantities

Experience model supports:
- `adultPrice`, `kidsPrice`, `Occasion_price`, `Listing_price`
- `totalSeats`, `minSeats`, `maxSeats`, `seatsBooked`, `seatsLeft`
- `allowSingleBooking`
- `packages[]` with adults/kids counts
- `isPackagesProvided`, `is_food_included`

**Single vs multiple ticket:** Controlled by `allowSingleBooking`, `minSeats`, `maxSeats` on Experience — CODE-ENFORCED at booking time (expRequest creation).

**Status:** IMPLEMENTED

### Food Inclusion

| Mode | Field | Status |
|------|-------|--------|
| Food included in package | `is_food_included`, `serveFood`, `packages` | IMPLEMENTED |
| Separate menu ordering | `menuList`, `comboList`, `isStandardMenu`, `isCustomMenu`, `isPackage` | IMPLEMENTED |
| Experience menu API | `/experience-menu` | IMPLEMENTED |
| Cart for extras | `/user/exp-cart` → linked to `expRequest` | IMPLEMENTED |

### QR / Check-in

| Capability | Status | Evidence |
|------------|--------|----------|
| Share link on experience | IMPLEMENTED | `shareLink` on Experience and expRequest |
| View QR link | IMPLEMENTED | `shareLink.viewQRLink` on expRequest |
| QR validation endpoint | UNKNOWN | Not traced in this audit |

### Payment

| Method | Status |
|--------|--------|
| Razorpay | IMPLEMENTED |
| Wallet | IMPLEMENTED |
| Cash/UPI/Pay later | IMPLEMENTED (paymentMethod enum on expRequest) |
| Split payment | IMPLEMENTED (`splitPayment`, `pendingAmount`) |

### Cancellation / Refunds

| Capability | Status | Evidence |
|------------|--------|----------|
| Auto-cancel timers | IMPLEMENTED | subscription `experience_management.offline_experience.special/curated.auto_cancel_*` |
| Manual cancel | IMPLEMENTED | expRequest status → CANCELLED |
| Refund processing | IMPLEMENTED | `refundStatus`, `transactionDetails` type REFUND, `helpers/experienceRefund.ts` |
| Exp request cron | IMPLEMENTED | `expRequestStatusCorn.ts`, referenced in cron (commented in main job) |

---

## Platform Events (`exp_events` / Events)

### Admin-managed platform events

**Model:** `ExpEventManagement` (`exp-events.model.ts`)  
**Types:** From `app.get("EXP_EVENT_TYPE")` enum  
**Service:** `/exp-events`, `/admin/exp-events`, `/user-exp-events`

Used for customer `/experience/events/:eventId` (`EventDetails` component) and RAG recommendations.

### Vendor-managed events (Tickets + RSVP)

**Model:** `Events` (`events.model.ts`)  
**Handler:** `eventHandler` (`event-handler.model.ts`)

| Event type | Enum | Status |
|------------|------|--------|
| RSVP | `event_type: "RSVP"` | IMPLEMENTED |
| Ticket booking | `event_type: "TICKET_BOOKED"` | IMPLEMENTED |

**Event configuration:**
- Pricing: `adult_price`, `child_price`
- Capacity: `total_quantity_TB`, `leftOverTB`, `maxGuest_RSVP`, `leftOverRSVP`
- Per-booking limits: `min_people_per_booking`, `max_people_per_booking`
- Online events: `eventLink`, `eventPassword`, `isOnline`
- Table setup for offline events: `table_setup` (floors, seats) — same structure as subscription
- Auto-accept: `isRSVP_autoAccept`, `auto_accept_pax`

**Event handler status:** PENDING → NOTSEATED → SEATED → COMPLETED | REJECTED | CANCELLED | INITIAL

**Payment on tickets:** `payment_data`, `payment_status`, `transactionDetails` on eventHandler

---

## Experience Types (Merchant)

| Type | Field | Merchant UI |
|------|-------|-------------|
| SPECIAL | `expRequest.expType: "SPECIAL"` | Special experience dashboards |
| CURATED | `expRequest.expType: "CURATED"` | Curated experience dashboards |
| Occasion onboarding | `OccasionEventOnboarding.jsx` | `/special/bookingOccasion/:id` |

**Merchant routes:** `/experienceDashboard/pending|all|special|curated|history`  
**Admin routes:** `/superadmin/experience/events/management`, `ExperienceHomePage.js`

---

## Backend Services Summary

| Service path | Purpose | Status |
|--------------|---------|--------|
| `/experience` | CRUD experiences | IMPLEMENTED |
| `/user/experience` | Customer listing/detail | IMPLEMENTED |
| `/vendor/experiences` | Merchant experience mgmt | IMPLEMENTED |
| `/admin/experience` | Admin experience mgmt | IMPLEMENTED |
| `/userExpRequest` | Customer booking requests | IMPLEMENTED |
| `/expRequest` | Merchant exp request mgmt | IMPLEMENTED |
| `/user/exp-cart` | Experience food cart | IMPLEMENTED |
| `/user/exp-checkout` | Experience checkout | IMPLEMENTED |
| `/experience-menu` | Experience-specific menu | IMPLEMENTED |
| `/events` | Vendor events CRUD | IMPLEMENTED |
| `/event-handler` | RSVP/ticket bookings | IMPLEMENTED |
| `/user/event-handler` | Customer event bookings | IMPLEMENTED |
| `/exp-events` | Platform event taxonomy | IMPLEMENTED |
| `/exp_events` | Platform events data | IMPLEMENTED |
| `/user_exp_events` | User-facing platform events | IMPLEMENTED |
| `/expFilters` | Experience filters | IMPLEMENTED |

---

## expRequest Lifecycle

**Status enum (`EXP_REQUEST_STATUS`):**  
INITIAL → PENDING → NOTSEATED → SEATED → GETTING_PREPARE → SERVED → COMPLETED | REJECTED | CANCELLED | PAYMENT_UPDATE

**Links:**
- `diner_id` → Diner (seating)
- `order_id` / `exp_order_id` → ordering (food)
- `experienceId` → Experience

**Evidence:** `expRequests.model.ts`, `constants.ts` lines 14–25

---

## Merchant Configuration Dependencies

From `subscription.model.ts` — `experience_management`:

| Setting | Affects |
|---------|---------|
| `offline_experience.special/curated` enable flags | Which experience types merchant can offer |
| `table_kept_for`, `minimum_lead` | Booking timing rules |
| `auto_cancel_open/close_restaurant` | Auto-cancel behavior |
| `event_management.offline_event.booking_enabled` | Vendor ticketed events |
| `event_management.offline_event.rsvp` | RSVP with distance/time rules |
| `event_management.offline_event.seat_selection_applicable` | Seat selection for events |

---

## Admin Configuration

| Capability | Route | Status |
|------------|-------|--------|
| Experience management | `/superadmin/experience/*` | IMPLEMENTED |
| Event management | `/superadmineventmanagement` | IMPLEMENTED |
| Media catalog | Experience media admin | IMPLEMENTED |
| Exp events taxonomy | `/admin/exp-events` | IMPLEMENTED |
| Curated sections | Admin experience home | IMPLEMENTED |

---

## Cross-Domain Interactions

```
Customer Celebrations Tab
    → GET /user/experience (subCategory filter)
    → Experience record
    → POST /userExpRequest (booking)
    → [optional] POST /user/exp-cart + /user/exp-checkout (food extras)
    → [optional] linked Diner record (seating)
    → [optional] linked ordering record (food order)
    → Razorpay/wallet payment
    → Socket expRequest updates (track)
    → Settlement/refund via transactional + refund services
```

---

## NOT FOUND / PARTIAL

| Item | Status |
|------|--------|
| Named "Celebration" MongoDB collection | NOT FOUND |
| Dedicated celebration API endpoint | NOT FOUND (uses experience API) |
| Customer create support ticket URL constant | PARTIAL (`CREATE_TICKET` undefined in urls.js) |
| Festival as distinct from exp-events | UNKNOWN (may be exp-events type only) |
| QR check-in validation flow | PARTIAL (links exist; validation logic not fully traced) |

---

## Status Summary

| Capability | Customer | Merchant | Admin | Overall |
|------------|----------|----------|-------|---------|
| Celebration discovery | IMPLEMENTED | N/A | N/A | IMPLEMENTED |
| Celebration booking | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Ticket quantities / limits | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Food included / extras | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Payment | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Cancellation/refund | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Seating linkage | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Platform events (festivals) | IMPLEMENTED | PARTIAL | IMPLEMENTED | IMPLEMENTED |
| Vendor ticketed events | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| RSVP events | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Named "celebrations" backend | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND |
