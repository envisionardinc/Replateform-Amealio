# Scenario Matrix — Current-State Business Scenarios

Format: Actor | Entry | Preconditions | Steps | APIs | Status transitions | Success | Errors

---

## CUSTOMER SCENARIOS

### C-01: OTP Login
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/login` → `/enterotp` |
| Preconditions | Valid mobile number |
| Steps | Enter mobile → receive OTP → verify |
| APIs | `POST /otp-authentication`, `POST /authentication` |
| Success | JWT stored, redirect to intended route |
| Errors | Invalid OTP, expired session |
| Status | IMPLEMENTED |

### C-02: Browse Home & Discover Restaurants
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/home` |
| Preconditions | Location permission (optional) |
| Steps | Load moods, cravings, curations, reels, celebrations strip |
| APIs | `/user-moods`, `/user/cravings`, `/user-curation`, `/user/reels`, `/user/experience` |
| Success | Personalized home content displayed |
| Status | IMPLEMENTED |

### C-03: Search Restaurants
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/search` |
| APIs | `/searchGlobal`, `/searchRestaurantCard` |
| Status | IMPLEMENTED |

### C-04: View Restaurant & Menu
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/restaurant/:ID` → `/food/menu/v1` |
| APIs | `/restaurant`, `/user/menu`, `/user/items` |
| Status | IMPLEMENTED |

### C-05: Add to Cart & Checkout (Takeaway/Dine-in/Delivery)
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | Cart → OrderCheckout |
| Steps | Select order type → add items → tips/donation → pay |
| APIs | `/user/cart`, `POST /user-ordering`, `/user/checkout`, `/updateTransaction`, `/razorpay` |
| Status transitions | order_status progression |
| Success | Order confirmation + track screen |
| Status | IMPLEMENTED |

### C-06: Track Order (Real-time)
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/Profile/track-order`, `/food/ordertrack/:id` |
| APIs | GET ordering, Socket `ordering` |
| Status | IMPLEMENTED |

### C-07: Join Waitlist (Seating)
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/restaurant/:id/seating/waitlist` |
| Preconditions | Restaurant has walkin_waitlist enabled in subscription |
| Steps | Enter party details → submit → track |
| APIs | `POST /diner` (service_type: SEATING) |
| Status transitions | INITIAL → PENDING → NOTSEATED → SEATED → COMPLETED |
| Success | Track screen with wait time |
| Errors | Restaurant closed, distance exceeded, auto-cancel |
| Status | IMPLEMENTED |

### C-08: Make Reservation
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/restaurant/:id/seating/reservation` |
| Steps | Select date/time → party size → submit |
| APIs | `GET /restaurant-availability/:id`, `POST /diner` (RESERVATION) |
| Status | IMPLEMENTED |

### C-09: Track Seating Request
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/restaurant/:id/seating/track/:dinerId` |
| APIs | GET/PATCH `/diner`, Socket `diner_trigger` |
| Status | IMPLEMENTED |

### C-10: Browse Celebrations
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/experience` (Celebrations tab) |
| Steps | Filter by subcategory, date, location, mood |
| APIs | `GET /user/experience?pageType=EXPERIENCES&subCategory=` |
| Status | IMPLEMENTED |

### C-11: Book Celebration/Experience
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/restaurant/:ID/experiences/:expId/booking` |
| Steps | Select package/seats → optional food → pay |
| APIs | `POST /userExpRequest`, `/user/exp-cart`, `/user/exp-checkout`, `/razorpay` |
| Status transitions | expRequest: INITIAL → PENDING → ... → COMPLETED |
| Status | IMPLEMENTED |

### C-12: Track Experience Booking
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/restaurant/:ID/experiences/:expId/track/:requestId` |
| APIs | GET `/userExpRequest`, Socket `expRequest` |
| Status | IMPLEMENTED |

### C-13: Book Vendor Event Ticket
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | Event detail → book |
| APIs | `POST /user/event-handler` (TICKET_BOOKED) |
| Payment | Razorpay/wallet |
| Status | IMPLEMENTED |

### C-14: RSVP to Event
| Field | Value |
|-------|-------|
| Actor | Customer |
| APIs | `POST /user/event-handler` (RSVP) |
| Status | IMPLEMENTED |

### C-15: View Platform Event
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/experience/events/:eventId` |
| APIs | `/user_exp_events`, `/exp_events` |
| Status | IMPLEMENTED |

### C-16: Manage Profile & Preferences
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/profile/new`, `/preferences/*` |
| APIs | `/user-service`, `/userPreference`, PATCH user |
| Status | IMPLEMENTED |

### C-17: ONDC Order (IN only)
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/ondc/*` |
| APIs | `/ondc/user/cart`, `/ondc/user/order`, buyerApp flows |
| Status | DEFERRED — EXISTING |

### C-18: Raise Support Ticket
| Field | Value |
|-------|-------|
| Actor | Customer |
| Entry | `/raiseTicket` |
| APIs | GET `/ticket` works; POST create — **CREATE_TICKET URL undefined** |
| Status | PARTIAL |

---

## MERCHANT SCENARIOS

### M-01: Vendor Registration & Onboarding
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/` login → subscription onboarding flow |
| APIs | `POST /vendor-user`, `POST /vendorauthentication`, `POST /restaurant`, `GET/PATCH /subscription` |
| Success | have_vendor_submitted_details = true → dashboard access |
| Status | IMPLEMENTED |

### M-02: Accept/Reject Order
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/orderdashboard` |
| APIs | PATCH `/merchant/ordering/:id` |
| Status | IMPLEMENTED |

### M-03: Manage Seating Dashboard
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/seatingdashboard` |
| Steps | View pending → assign table → seat → complete |
| APIs | GET/PATCH `/vendor/diner`, `/table/diner` |
| Status | IMPLEMENTED |

### M-04: Add Walk-in Diner
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/quickseat`, `/adddiner` |
| APIs | POST `/diner` (isWalkIn: true) |
| Status | IMPLEMENTED |

### M-05: Configure Tables
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | Subscription table setup screens |
| APIs | `/subscription/table`, PATCH subscription |
| Status | IMPLEMENTED |

### M-06: Manage Menu Items
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/itemavailablitydashboard` |
| APIs | `/vendor-items`, `/menu-category` |
| Status | IMPLEMENTED |

### M-07: Create/Manage Experience (Celebration)
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | Experience dashboard |
| APIs | `/vendor/experiences`, `/experience` |
| Status | IMPLEMENTED |

### M-08: Manage Experience Bookings
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/experienceDashboard/pending` |
| APIs | `/expRequest`, PATCH status |
| Status | IMPLEMENTED |

### M-09: Create Vendor Event
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/event/add-event` |
| APIs | POST `/events` |
| Status | IMPLEMENTED |

### M-10: Manage Event RSVPs/Tickets
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | Event dashboard |
| APIs | `/event-handler`, `/vendor/event-handler` |
| Status | IMPLEMENTED |

### M-11: Staff & Role Management
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/rolemanagement`, `/staffmanagement` |
| APIs | `/role-management`, `/vendor-user` |
| Status | IMPLEMENTED |

### M-12: View Reports
| Field | Value |
|-------|-------|
| Actor | Merchant |
| Entry | `/reportdashboard` |
| APIs | `/dinerReports`, `/order/reports`, `/event/reports` |
| Status | IMPLEMENTED |

---

## ADMIN SCENARIOS

### A-01: Superadmin Login
| APIs | `POST /admin/auth` |
| Status | IMPLEMENTED |

### A-02: Approve Pending Vendor
| Entry | `/superadminallpendingvendors` |
| APIs | PATCH `/admin/vendor-user` |
| Status | IMPLEMENTED |

### A-03: Impersonate Vendor Operations
| Entry | `/superadminseatingdashboard`, vendor routes with vendorAccess |
| APIs | `/admin/vendor-access` |
| Status | IMPLEMENTED |

### A-04: Manage Platform Experiences/Events Taxonomy
| Entry | Experience admin, `/admin/exp-events` |
| Status | IMPLEMENTED |

### A-05: ONDC Admin (settlements, disputes)
| Entry | SuperAdminONDC routes |
| APIs | `/ondc/admin/*` |
| Status | DEFERRED — EXISTING |

### A-06: Manage Users
| Entry | `/superadminallusers` |
| APIs | `/admin/user-service` |
| Status | IMPLEMENTED |

### A-07: Settlement & Wallet Admin
| APIs | `/admin/wallet`, `/admin/transfer-money`, settlement crons |
| Status | IMPLEMENTED |

---

## CROSS-APPLICATION SCENARIOS

### X-01: Experience Booking with Seating
| Flow | expRequest created → linked Diner (diner_id) → merchant assigns table on seating dashboard |
| Status | IMPLEMENTED |

### X-02: Experience Booking with Food Order
| Flow | expRequest → linked ordering (order_id) → kitchen fulfillment |
| Status | IMPLEMENTED |

### X-03: Delivery Order with Live Tracking
| Flow | Customer orders delivery → merchant assigns rider → rider app updates status + GPS → customer track map |
| Repos | web_app, vendordashboard, self-delivery-app, nestjs-backend |
| Status | IMPLEMENTED |

### X-04: Pre-order While in Waitlist
| Flow | Diner.preOrder flag → linked ordering via cross_ref_id |
| Status | IMPLEMENTED (field exists; full UX UNKNOWN) |

### X-05: AI Recommendations on Homepage2
| Flow | web_app homepage2 → RAG server POST /recommendations → MongoDB read |
| Status | IMPLEMENTED |

---

## Scenario Count Summary

| Actor | Scenarios documented |
|-------|---------------------|
| Customer | 18 |
| Merchant | 12 |
| Admin | 7 |
| Cross-application | 5 |
| **Total** | **42** |
