# Data Model Inventory — MongoDB (Current State)

**Repository:** `amealio-vendordashboard`  
**ORM:** Mongoose  
**Database name:** `amealio` (confirmed by RAG server settings and platform convention)  
**Model files:** 169 (`src/models/*.model.ts`)

> This documents what the platform **stores today**. No PostgreSQL design included.

---

## Core Domain Entities

### Users & Auth

| Collection (model name) | Key fields | Used by |
|-------------------------|------------|---------|
| User Service | mobile, email, profiles, celebration_subcategory, preferences | web_app, all services |
| user-profile | Multi-profile support | web_app |
| VendorUser | role (vendor/superadmin), restaurant linkage | dashboard, backend |
| session | JWT session tracking | auth |
| temp-user | Pre-registration | onboarding |
| userDelete | Deletion queue | cron |
| role-management | vendorPermission, superAdminPermission matrices | dashboard RBAC |
| vendor-access | Admin impersonation | admin |
| address | Saved addresses | web_app |
| user-cart | Cart state | web_app ordering |
| cart | Legacy/guest cart | web_app |
| userupi | Stored UPI | web_app |
| user-analytics, userStats, user-activity-tracker | Behavior tracking | analytics |
| notifications, notification-records, inAppNotification | Notification state | all apps |
| ticket | Support tickets | web_app, dashboard |
| wallet | Wallet balance, KYC | payments |

### Restaurant & Subscription

| Collection | Key fields | Used by |
|------------|------------|---------|
| restaurant | profile, location, hours, status, views | all |
| restaurantCard | Discovery card projection | web_app home/search |
| subscription | **Master config embed**: seating, ordering, events, experiences, scan_and_pay, ONDC flags | merchant onboarding, all feature gates |
| manage-hours-of-operation | Operating hours overrides | availability |
| manage-reservation-block | Blocked reservation slots | seating |
| seating-area (Seating Area) | Area taxonomy (title, icon) | seating preferences |
| restaurant-tag, restaurant-features, restaurant-chain | Metadata | discovery |
| unregister-restaurant | Offboarding | admin |

**Critical:** `subscription` embeds table_setup (floors, seats, tables), walkin/reservation rules, event_management, experience_management — this is the **primary merchant configuration store**.

### Menu & Catalog

| Collection | Key fields | Used by |
|------------|------------|---------|
| vendoritems / items | Items, modifiers, pricing, availability | ordering |
| menu, menu-category | Menu structure | ordering |
| catalogue, chain-catalogue | Chain-level catalog | admin |
| category, sub-category (Sub Category) | Taxonomy incl. celebration subcategories | experiences, seating areas |
| uom, uom-ratio | Units of measure | items |
| session | Menu session (breakfast/lunch/dinner) | availability |
| combo | Combo meals | ordering |
| review-rating | Reviews | web_app |

### Ordering

| Collection | Key fields | Used by |
|------------|------------|---------|
| ordering | order_status, order_type, items, payment, delivery, diner cross-ref | web_app, dashboard, riders |
| orderMemo | Order notes | merchant |
| transactional | Payment transactions | payments |
| payments, payment-logs | Payment audit | admin |
| refund | Refund records | admin, experiences, ONDC |
| settlement, settlement-record, resetSettlements | Merchant settlements | admin |
| dunzo-deliveries, dunzo-quote, dunzo-payments, dunzoCredit | Dunzo logistics | delivery |
| porter-*, porter-handoff, porter-booking-job, porter-draft, porter-account | Porter logistics | delivery |
| delivery-partners | Partner config | admin |

**Order status:** Numeric enum in `orderEnums.ts` (e.g. 5=on the way, 6=delivered for riders)

### Seating

| Collection | Key fields | Used by |
|------------|------------|---------|
| Diner | service_type (SEATING/RESERVATION), diner_status, table_number, party size, exp/order links | web_app, dashboard |
| Seating Area | Area catalog | preferences |
| subscription.table_setup | Embedded tables/seats/floors | table management |

**Diner status lifecycle:** INITIAL → PENDING → NOTSEATED → SEATED → COMPLETED | REJECTED | CANCELLED

### Experiences & Celebrations

| Collection | Key fields | Used by |
|------------|------------|---------|
| Experience | packages, pricing, seats, food flags (is_food_included), menus, subCategory | celebrations, experiences |
| expRequest | Booking request, payment, status, diner_id, order_id links | booking flow |
| experience-cart | Experience food cart | checkout |
| experience_media, experience-view | Media/view tracking | admin |
| sections, sections-experience | Curated sections | home/discovery |

**Note:** No `Celebration` collection — celebrations are Experience documents.

### Events & Tickets

| Collection | Key fields | Used by |
|------------|------------|---------|
| Events | Ticket/RSVP config, capacity, pricing, table_setup, online link | vendor events |
| eventHandler | event_type (RSVP/TICKET_BOOKED), event_status, payment | bookings |
| ExpEventManagement (exp-events) | Platform event taxonomy | admin |
| exp_events | Platform event instances | web_app events tab, RAG |
| user_exp_event | User-event associations | personalization |
| promotional-event | Promotions | marketing |

### ONDC (DEFERRED)

| Collection | Purpose |
|------------|---------|
| ondc-restaurant, ondc-restaurant-menu, ondc-restaurant-item | ONDC catalog |
| ondc-user-cart, ondc-cart-item, ondc-cart-quote | ONDC cart |
| ondc-user-order | ONDC orders |
| ondc-order-issue | Disputes |
| ondc-settlements, ondc-new-settlements, ondc-settlement_record | Settlements |
| ondc_reconciliation, ondc-snps, ondc-cites | Reconciliation |
| ondc-custom-group | Menu grouping |

### Content & Discovery

| Collection | Purpose |
|------------|---------|
| reels, reels-likes, reels-views, reels-share | Short video |
| mood, mood-management | Mood discovery |
| cravings | Craving discovery |
| media-catalogues | Admin media |
| offers | Promotional offers |
| favourites | User favorites |
| help-and-faq | Help content |
| pageStats | Page analytics |

### Integrations & System

| Collection | Purpose |
|------------|---------|
| razorpay, razorpayx-service | Payment provider state |
| pos | POS integration config |
| email-template, sms-template, notification-template, templates | Communication templates |
| firebasedynamiclinks, shortLinks | Deep links |
| error | Error logging |
| issues, suggestions | Platform issues |
| signupReward, referral-* | Referral program |

---

## Key Relationships

```
VendorUser ──< restaurant ──< subscription (embedded config)
                    │
                    ├──< vendoritems / menu
                    ├──< ordering
                    ├──< Diner
                    ├──< Experience ──< expRequest ──> Diner (optional)
                    │                              ──> ordering (optional)
                    └──< Events ──< eventHandler

User Service ──< ordering, Diner, expRequest, eventHandler, user-cart, wallet
Sub Category ──< Experience.subCategory (celebrations filter)
               ──< subscription.seating_areas
```

---

## Status & Lifecycle Fields (Critical for Migration)

| Entity | Status field | Values |
|--------|--------------|--------|
| Diner | diner_status | INITIAL, PENDING, NOTSEATED, SEATED, REJECTED, COMPLETED, CANCELLED |
| expRequest | status | INITIAL, PENDING, NOTSEATED, SEATED, GETTING_PREPARE, SERVED, REJECTED, COMPLETED, CANCELLED, PAYMENT_UPDATE |
| eventHandler | event_status | PENDING, NOTSEATED, SEATED, REJECTED, COMPLETED, CANCELLED, INITIAL |
| ordering | order_status | Numeric enum (multiple values) |
| Experience | active, isDraft | Boolean flags |
| Events | active | Boolean |

---

## Indexes (Notable)

- `Diner`: vendor_id, restaurant_id, user_id, service_type, diner_status
- `Experience`: name, vendorId, restaurantId, subCategory, expLikes
- `eventHandler`: event_type, event_status, restaurant_id
- Most entities: vendor_id, restaurant_id indexed

---

## Entity Count Summary

| Category | Count |
|----------|-------|
| Total Mongoose models | 169 |
| Core transactional (order, diner, expRequest, eventHandler) | 4 |
| ONDC models | 15+ |
| Logistics models | 10+ |
| Taxonomy/reference | 30+ |

---

## PostgreSQL (Non-Mongo)

| Service | Table | Purpose |
|---------|-------|---------|
| amealio-nestjs-backend | `locations` | Driver GPS (driverId PK, lat, lon, timestamp) |

**Not part of main platform data model.**
