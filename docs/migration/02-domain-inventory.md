# 02 — Domain Inventory

The current platform is organized here into **17 business domains** (the agreed domain list). Each domain lists its purpose, the primary MongoDB entities that back it today, the main features/services, and open questions. This is an inventory of *current behavior*; it is not the target model (see `docs/architecture/`).

Entity names below are Mongoose model names from `amealio-vendordashboard/src/models`. Service paths are Feathers mount points (see [03](./03-api-inventory.md)).

---

## 1. Identity

**Purpose:** Consumer and staff identity, authentication state, sessions, profiles, preferences, referrals.

- **Entities:** `User`, `UserProfile`, `UserStats`, `UserDelete`, `tempUser`, `non-user`, `address`, `Session`, `changePassword`, `signupReward`, `inviteFriend`, WhatsApp login models (`whatsappLoginEvent`, `…ExchangeCode`, `…InitiationCode`, `…MagicToken`), `userupi-details`, `user-analytics`, `userActivityTracker`.
- **Features:** phone-OTP / social (Google, Apple, Facebook) / WhatsApp magic-link / guest login; profile & taste/health preferences; saved addresses; account deletion + reactivation; device tracking; referrals and signup rewards.
- **Services:** `/user-service`, `/authentication`, `/otp-authentication`, `/social-sign-up|in`, `/whatsapp-auth`, `/temp-user`, `/address`, `/user/profiles`, `/userPreference`, `/signupReward`, `/invite-friend`.
- **Notes:** Consumer users have no strong role field; identity is the JWT `sub`. Address has **no `user_id`** — linkage is only from `User.addressLocations[]`.

## 2. Merchant

**Purpose:** Vendor (merchant) accounts, staff, RBAC, organizations, subscriptions, POS config.

- **Entities:** `VendorUser`, `vendorAccess`, `vendorChangePassword`, `web-merchant`, `role` (`role-management`), `Organization`, `subscription`, `posConfig`, `Waiters`.
- **Features:** merchant onboarding; staff & role management (granular `vendorPermission` flags); super-admin impersonation of a vendor via `vendorAccess`; product subscriptions (ordering / seating / events / scan-and-pay); Petpooja POS binding.
- **Services:** `/vendor-user`, `/vendorAccess`, `/role-management` (+ `/admin/*`, `/merchant/*` variants), `/subscription*`, `/admin/pos`, `/merchant/pos/:action`.
- **Notes:** `VendorUser.subscription` is an embedded `{ ordering, seating, event }` boolean block; deeper subscription data is in `subscription`. Merchant tenancy key is `vendor_id`.

## 3. Location

**Purpose:** Restaurants/venues and their operational configuration and discovery representation.

- **Entities:** `restaurant`, `restaurant-extended` (**same `restaurants` collection**), `restaurantCard` (denormalized discovery copy), `Restaurant Chain`, `Restaurant Type`, `Restaurant Features`, `restaurant-tag`, `unregisterRestaurant`, `manageHoursOfOperation`, `manageReservationBlock`, `countryStateCity`, `currency`, plus reference lookups (`Accessibility`, `Dress Code`, `Parking Type`, `Pet Allowance`, `Service Type`, `Services Offered`, `Located Inside`, `Seating Area`).
- **Features:** restaurant profile, geo (`location` 2dsphere), hours per weekday, session/auto-accept settings, chain grouping, availability/open-status checks, geo search & filtering.
- **Services:** `/restaurant*`, `/restaurantCard`, `/listRestaurant`, `/searchRestaurant(Card)`, `/searchGlobal`, `/restaurant-availability`, `/checkOpen`, `/manage-hours-of-operation`, `/manage-reservation-block`, chain/type/feature/tag services.
- **Notes:** `restaurant` uses `strict: false` and carries many nested config blobs. `restaurant` vs `restaurantCard` duplicate many fields (denormalization).

## 4. Catalog

**Purpose:** Global/shared taxonomy and catalogues used across menus, items, restaurants, experiences.

- **Entities:** `Category`, `Sub Category`, `Food Type`, `Food Category`, `Cusine`, `Liquor Category`, `catalogue`, `chaincatalogue`, `templates`, `uom`, `uom-ratio`, `media-catalogue`, `Combo`, `Payment Method`, `Mood`, `MoodManagement`, `Craving`.
- **Features:** category/sub-category taxonomy (referenced everywhere as `ref: "Sub Category"`), cuisines, food types, units of measure and ratios, item templates, chain-level catalogues, moods/cravings/curations for discovery.
- **Services:** `/category`, `/subcategory`, `/cusine`, `/foodtype`, `/foodcategory`, `/liquorcategory`, `/uom`, `/uom-ratio`, `/catalogue`, `/global-catalogue`, `/chaincatalogue`, `/templates`, `/mood`, `/cravings`, `/user-curation`.
- **Notes:** Several collection names contain spaces (`sub categories`, `food types`) — see [04](./04-database-inventory.md). Taxonomy is global admin-managed reference data.

## 5. Menu

**Purpose:** Per-restaurant menus, categories, items and their channel-specific pricing/availability.

- **Entities:** `Menu`, `menuCategory`, `vendorItems`, `Combo`.
- **Features:** menus (STANDARD/CUSTOM) containing category → item lists; menu-category tax/charge config and cross-selling; items with per-channel blocks (`dine_in`, `take_away`, `curb_side`, `skip_line`, `home_delivery`, `catering_banquet`), sizes/UOM, add-ons, day-wise availability, sold-out state; combos; bulk upload; POS item/category IDs.
- **Services:** `/menu`, `/menu-category` (+ `/v2`, `/user`, `/vendor`, `/admin`), `/vendor-items` (+ `/v2`, `/items`), `/combo`, `/uploadItems`, `/resetsoldout`, `/recommended-items`.
- **Notes:** `vendorItems` has **no `restaurant_id`**; restaurant linkage is indirect via `Menu.restaurant`. Item pricing/availability are deeply nested (JSONB candidates).

## 6. Customer

**Purpose:** The consumer-facing experience: discovery, favourites, community, content, reviews.

- **Entities:** `User` (see Identity), `UserProfile`, favourites arrays on `User` (`favourites`, `offerFav`, `eventFav`, `itemFav`, experience favourites), `reviewRating`, `chat`, `reels`/`reelLikes`/`reelViews`/`reelShare`, `vlogs`, `Craving`, `Mood`, `activityTracker`, `pageStats`.
- **Features:** personalized home (moods/cravings/curations, AI recommendations), global search, favourites, reviews & ratings, community (WebView), Bytes/reels media, activity tracking.
- **Services:** `/user/community`, `/searchGlobal`, `/favourites`, `/review-rating`, `/reels`, `/vlogs-feed`, `/user/cravings`, `/user-moods`, `/user-curation`, `/activity-tracker`.
- **Notes:** AI recommendations come from a **separate** recommendations API (`REACT_APP_RECOMMENDATIONS_API_*`); the backing service is **`UNKNOWN — REQUIRES REVIEW`**.

## 7. Order

**Purpose:** Food ordering across channels (dine-in, delivery, curbside, skip-the-line, takeaway, catering), including carts and order lifecycle.

- **Entities:** `ordering`, `cart`, `user_cart`, `ordermemo`, `Combo`; ONDC parallels (`ondc_user_order`, `ondc_user_cart`, `ondc_cart_item`, `ondc_cart_quote`).
- **Features:** guest & authenticated carts; order types; order status lifecycle (numeric, config-driven); surcharges/taxes/GST; scheduling; tips & donations; receipts; merchant order ops (hold, substitute, direct merchant payment); admin/vendor order reports.
- **Services:** `/user/cart`, `/guest/cart`, `/user/checkout`, `/user-ordering`, `/ordering`, `/order-availability|charges|detail`, `/order-cancel-substitution`, `/merchant/ordering`, `/admin/orders`, `/orderMemo`.
- **Notes:** `order_status`, `order_type`, `payment_status`, `payment_method` are **numeric enums resolved from environment variables**; the numeric→meaning mapping is **`UNKNOWN — REQUIRES REVIEW`** (empty in `.env.example`). Two cart models exist (`cart` structured, `user_cart` legacy).

## 8. Payment

**Purpose:** Payments, wallet, ledger, settlements, payouts, refunds, banking.

- **Entities:** `payment`, `paymentLogs`, `Payment Method`, `wallet`, `CloseWallet`, `transactional`, `settlement`, `settlementRecord`, `settlementProcess`, `withdrawRequest`, `refund`, `bank-details`, `bankcard-details`, `razorpay`, `razorpayxService`, `dunzoPayments`, `dunzoCredit`, `Donation`, `DonationSettlement`.
- **Features:** Razorpay order/capture + webhooks; wallet balance/credits/KYC/PIN; scan-and-pay & direct merchant payment; transactional ledger (`t_type` enums); settlements & RazorpayX payouts; withdrawal requests with admin approval; refunds; donations & NGO settlement.
- **Services:** `/razorpay`, `/razorpay-webhook`, `/razorpayx-service`, `/wallet`, `/wallet_kyc`, `/closeWallet`, `/transactional`, `/settlement*`, `/withdraw-request`, `/refund`, `/bank`, `/bankcard`, `/donation`, `/merchantStatement`, `/vendor/earnings`.
- **Notes:** Payment enum values (`PAYMENTSTATUS`, `PAYMENTMETHOD`, `T_TYPE`) are env-driven → **`UNKNOWN — REQUIRES REVIEW`**. Gateway payloads stored as loose objects.

## 9. Delivery

**Purpose:** Delivery fulfilment via self-delivery fleet and third-party partners; live GPS tracking.

- **Entities:** `Delivery`, `deliveryPartners`, `deliverypersons`, `DeliveryQuote`, Dunzo models (`dunzoDeliveries`, `dunzoQuotes`, `dunzoPayments`, `dunzoCredit`), Porter models (`porterAccounts`, `porterBookingJobs`, `porterDrafts`, `porterHandoffs`); PostgreSQL `locations` (Nest tracking).
- **Features:** delivery method selection (`SELF_DELIVERY`, `THIRD_PARTY_DELIVERY`, `AGENT_DELIVERY`); self-delivery person assignment; Dunzo task creation + webhooks; Porter booking (API + headless-browser automation via Redis queue); delivery estimates/availability via the integration service; live GPS via the Nest `/tracking` socket.
- **Services:** `/delivery-partners`, `/delivery-persons`, `/orders/delivery-persons`, `/dunzo*`, `/logistics/porter/*`, `/logistics/delivery/estimate`, plus Nest `GET /delivery/*` and WS `/tracking`.
- **Notes:** Nest `locations` uses `driverId` as the sole primary key (upsert) — the history endpoint may only return one row per driver; **`UNKNOWN — REQUIRES REVIEW`**. Porter browser automation is a fragility risk.

## 10. Reservation

**Purpose:** Table reservations (time-slot booking) — a mode of the diner/seating flow.

- **Entities:** `Diner` (`service_type: "RESERVATION"`), `manageReservationBlock`, `Seating Area`, `Diner Status`.
- **Features:** date/time-slot reservation requests; reservation blocks (blackout windows) per restaurant; status lifecycle; live tracking.
- **Services:** `/diner`, `/user/diner`, `/manage-reservation-block`, `/session-automate`.
- **Notes:** Reservation and walk-in/waitlist share the `Diner` entity and are distinguished by `service_type` and status. See also **Seating** (14).

## 11. Celebration

**Purpose:** Experiences and events (curated/special dining, celebrations, occasions) with booking and ticketing.

- **Entities:** `Experience`, `experience_cart`, `ExperienceView`, `experience_catalog`, `expRequest`, `Events`, `eventHandler`, `ExpEventManagement`, `exp_events`/`user_exp_events` (**shared `exp_events` collection**), `promotional-event`, `Section`, `Section_Experience`, `ticket`.
- **Features:** experience catalog (food/event types, packages, seating); experience booking requests with payment & settlement; vendor events with RSVP/ticketing and nested table/floor setup; sections & occasions; celebration/event favourites and sub-category preferences on `User`.
- **Services:** `/experience*`, `/expRequest`, `/userExpRequest`, `/events`, `/event-handler`, `/exp_events`, `/user_exp_events`, `/experience-media`.
- **Notes:** "Celebration" spans two overlapping subsystems — **Experiences** (`Experience`/`expRequest`) and **Events** (`Events`/`eventHandler`) — plus a scraped `exp_events` dataset. Their exact boundaries are **`UNKNOWN — REQUIRES REVIEW`**.

## 12. Promotion

**Purpose:** Offers, coupons, referral programs, promotional media.

- **Entities:** `Offers`, `merchant-permotion`, `promotionsvideo`, `referral_program`, `Referral Code`, `referralService`, `referre-transaction`, `refreeService`, `SignupReward`, `inviteFriend`.
- **Features:** coupon/offer creation with scope (vendor/restaurant/global, geo, service types), settlement type (VENDOR/ADMIN/SPLIT), usage frequency, usage/view tracking; referral programs & codes; signup rewards; promotional videos.
- **Services:** `/offers` (+ `/user`, `/vendor`, `/admin`, `/offer/details`, `/offer-history`), `/promotions-Video`, `/promotions-event`, `/referralprogram`, `/referralcode`, `/validatereferralcode`, `/refree-service`.
- **Notes:** `Offers.coupon_code` is unique; offers carry `country/state/city` and geo (`location`).

## 13. Ticketing

**Purpose:** Two distinct meanings — (a) **event/experience tickets**, and (b) **support tickets/issues**.

- **Entities:** (a) `ticket` (event tickets), `eventHandler` (RSVPs). (b) `issues`, `suggestions`, `helpAndFaq`, `reviewRating` (support/feedback).
- **Features:** (a) issue/scan event tickets, public ticket QR pages in the merchant app (`/ticketbooked/:id`, `/experience/ticket/:id`); (b) raise/track support tickets, issues & suggestions, FAQ, disputes.
- **Services:** `/ticket`, `/event-handler`; `/help`, `/vendor/ticket`, `/admin/ticket`, `/issues`, `/suggestions`, `/help-and-faq`, `/admin/issues-suggestions`.
- **Notes:** The overlap of the word "ticket" across event ticketing and support ticketing should be disambiguated in the target model. **`UNKNOWN — REQUIRES REVIEW`**: whether disputes are a separate entity or a status of issues.

## 14. Seating

**Purpose:** Walk-in / waitlist / dine-in seating operations (the operational counterpart to Reservation).

- **Entities:** `Diner` (`service_type: "SEATING"`), `Diner Status`, `Seating Area`, `Waiters`, restaurant seating config (`all_seating_area`, `selected_seating_area`).
- **Features:** waitlist and walk-in requests; party/kids/high-chair/accessibility details; geo-fenced check-in (`geolib.isPointWithinRadius`); auto-accept & minimum-person rules from restaurant subscription; table assignment; seating status lifecycle (`PENDING`, `NOTSEATED`, `SEATED`, `REJECTED`, `COMPLETED`, `CANCELLED`); live tracking.
- **Services:** `/diner`, `/user/diner`, `/vendor/diner`, `/table/diner`, `/dinerstatus`, `/restaurantopen/diner`, `/cron/diner`.
- **Notes:** `Diner` unifies Seating and Reservation. `Waiters` model is defined but its service is **not registered** (orphan).

## 15. Notification

**Purpose:** Multi-channel messaging: push, SMS, email, WhatsApp, in-app.

- **Entities:** `notifications` (template/config with `flow_id`), `notification-model` (per-user records), `notificationTemplate`, `inAppNotification`, `smsTemplate`, `emailTemplate`.
- **Features:** push (Firebase/FCM), SMS (Twilio + MSG91 with `flow_id`), email (SendGrid + AWS SES), WhatsApp (MSG91), in-app notifications and admin broadcast campaigns with geo targeting; scheduled template dispatch crons.
- **Services:** `/notifications`, `/sms`, `/msg91`, `/email`, `/inAppNotification`, `/sms-template`, `/notification-template`, `/email-template`, `/socket-event`.
- **Notes:** `notification-records.user_id` has **no `ref`**. Enormous `PUSHNOTIFICATIONENUM_*` / `SMSNOTIFICATIONSENUM_*` key sets in config.

## 16. Reporting

**Purpose:** Operational and financial reporting/exports and analytics tracking.

- **Entities:** `activityTracker`, `videoActivityTracker`, `liveStreamingActivity`, `pageStats`, `misceilaneousTracking`, `userStats`, `user-analytics`.
- **Features:** order/diner/experience/offer/settlement/transaction reports; merchant statements; CSV/Excel export (`exceljs`, `csv`); page & activity analytics; PostHog/GA4/Meta on the frontends.
- **Services:** `/reports`, `/admin/reports`, `/order/reports`, `/dinerReports`, `/event/reports`, `/offer/reports`, `/txn-report`, `/report/settlement`, `/expReport`, `/pageStats`, `/activity-tracker`.
- **Notes:** Reporting reads from operational collections directly; there is no separate analytics store. Client analytics only enabled in prod (`REACT_APP_ENV`).

## 17. Administration

**Purpose:** Super-admin platform administration: approvals, RBAC, ONDC, delivery-partner and POS administration, content/config, platform reference data.

- **Entities:** `VendorUser` (superadmin role), `role` (superAdminPermission tree), `vendorAccess`, ONDC models (15), POS `posConfig`, reference/lookup models, `appVersion`, `error`, `shortLinks`, `firebasedynamiclinks`, `uploadAssets`.
- **Features:** vendor approval/onboarding; ONDC merchant/order/settlement/dispute administration; delivery-partner (Dunzo) admin; POS (Petpooja) administration; subscription bundle configuration; role/staff management; content/curation (moods, reels, templates, promo videos); reference-data maintenance; app-version control; global error logging.
- **Services:** `/admin/*` (many), `/superadmin*` routes in the admin app, `/ondc/admin/*`, `/admin/pos`, `/getAppVersion`, `/errorHandler`, `/firebasedynamiclinks`.
- **Notes:** Authorization is via `VendorUser.role === "superadmin"` and the `portal: ADMIN` header (see [07](./07-authentication-authorization.md)).

---

## Cross-domain observations

- **ONDC** is a cross-cutting channel with its own parallel entities for restaurants, menus, carts, orders, settlements, and reconciliation. It touches Location, Menu, Order, Payment, Delivery, and Administration. Treating it as a **bounded context** is recommended (see [10](./10-migration-risks.md)).
- **Diner** is the shared spine of both **Seating** (14) and **Reservation** (10).
- **Celebration** (11) overlaps Experiences, Events, and Ticketing (13a).
- Tenancy keys are inconsistent (`vendor_id` vs `vendorId`, `restaurant_id` vs `restaurantId`, `user_id` vs `userId`) — see [04](./04-database-inventory.md).
