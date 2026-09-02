# P1.7.19 — Celebrations / Experiences Reconciliation

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no tests. Establishes what the live system means by Experience/Celebration/Event/Festival/exp-events, plus Custom Menu and the Media Dashboard, and scopes P1.7.20.
> **Authority:** legacy source (`amealio-vendordashboard` backend, `amealiodashboardmvp-` SPA, `amealio_web_app` customer) + target `replateform-amealio` (Prisma). Baseline **251/251**, unchanged.
> **Method:** frontend → API → service → persistence tracing with file:line evidence. UNKNOWN is preserved where source is insufficient.

---

## 1. Executive Summary

- **Experience and Event are two fully separate domains.** Merchant **`Experience`** (collection `experiences`, `restaurantId` required) is booked via **`expRequest`** (`exprequests`). Merchant **`Events`** (`events`) is booked via **`eventHandler`** (`eventhandlers`) — a different model, service, and lifecycle. They must not be merged.
- **"Festival" is not a backend entity** — zero source matches; it is a UI/taxonomy label only.
- **`exp-events` (`ExpEventManagement`) ≠ `exp_events`.** The former is a **platform taxonomy** (SuperAdmin-managed, `type ∈ {EVENT, EXPERIENCE}`, FK to `Sub Category`) that drives UI grouping/filters; the latter is a **platform scraped external-events catalog** (read-only cards) powering the home "Events" strip. Distinct collections.
- **"Celebration" is a customer-facing UI label**, not a backend entity: it renders `ExpEventManagement` rows where `type=EXPERIENCE`, and selecting one lists merchant **`Experience`** documents filtered by `subCategory`.
- **Experience taxonomy = platform `Category`/`Sub Category`** (FK ObjectIds on `Experience`, not free strings) + the `ExpEventManagement` overlay.
- **Booking lifecycle (proven):** cart → checkout (`expRequest` INITIAL) → pay (Razorpay immediate) or defer (pay-at-site) → PENDING/NOTSEATED → materialize **Diner** (when non-delivery) + **Order** (when food/not occasion-text) → vendor progression (NOTSEATED→SEATED→GETTING_PREPARE→SERVED→COMPLETED) → optional CANCEL + refund.
- **Food is configurable per experience** (included vs purchasable-separately vs occasion-text-only); **seating date/pax is required in UI**, physical table is assigned later by the merchant; **capacity is enforced for CURATED** (at booking), not SPECIAL.
- **Custom Menu** is a **merchant-owned `Menu(type=CUSTOM)`** construct **referenced** by `Experience.CustomMenu[]`/`defaultCustomId` (reference, not snapshot) — the existing target `Menu`/`MenuSection`/`MenuItem` can represent it; the Experience↔Menu link is the gap.
- **Media Dashboard** is a UX name over **four separate legacy patterns** (merchant media upload → embedded URLs; platform `experience_catalog` templates; a largely-unshipped `media-catalogue` backend; the stateless `upload-assets` S3 pipe; plus embedded icon/photo fields). The target has **no media entity and no media columns**.
- **Target has NO Experience/Event/Media models** — the entire Celebrations/Experiences domain is a **CONFIRMED GAP**.

---

## 2. Legacy Source Inventory

**Backend models:** `experience.model.ts`, `expRequests.model.ts`, `experience-cart.model.ts`, `experience-view.model.ts`, `sections-experience.model.ts`, `exp-events.model.ts` (`ExpEventManagement`), `exp_events.model.ts` + `user_exp_event.model.ts` (scraped), `events.model.ts`, `event-handler.model.ts`, `promotional-event.model.ts`, `experience_media.model.ts` (`experience_catalog`), `media-catalogues.model.ts`, `upload-assets.model.ts`, `menu.model.ts`, `menu-category.model.ts`, `vendor-items.model.ts`.
**Backend services:** `experience/*` (`/experience`, `/user/experience`, `/admin/experience`, `/user/exp-cart`, `/user/exp-checkout`, `/experience-menu`), `expRequests/*` (`/expRequest`, `/userExpRequest`), `exp-events/*` (`/admin/exp-events`, `/user-exp-events`), `exp_events/*` + `user_exp_events/*`, `events/*`, `event-handler/*`, `experience-media/*`, `media-catalogues/*`, `upload-assets/*`, `menu/*`.
**Dashboard:** experience create/edit/publish/report + super-admin taxonomy/curation/media (`amealiodashboardmvp-`). **Customer:** experience discover/book/checkout/track (`amealio_web_app`). Full endpoint list in §17.

---

## 3. Actual Domain Entities

| Entity | Collection | Ownership | Key IDs | Important fields | Lifecycle | Relationships |
|---|---|---|---|---|---|---|
| **Experience** | `experiences` | Merchant (`restaurantId` req, `vendorId`) | `_id`, `expId` | `type food\|event`, `expType SPECIAL\|CURATED`, `category/subCategory/classification`→Category/SubCategory, `serveFood`/`is_food_included`/`foodItems`, `isCustomMenu`/`CustomMenu[]`/`defaultCustomId`, `totalSeats`/`seatsLeft`, `active`/`isDraft` | create draft → PATCH steps → publish (`isDraft:false`) → cron deactivate on `endDate` | booked by `expRequest`; refs Menu (CustomMenu) |
| **expRequest** | `exprequests` | Merchant+User | `_id`, `requestId` | `experienceId/userId/restaurantId/vendorId`, `diner_id?`, `order_id?`/`exp_order_id?`, `status`(EXP_REQUEST_STATUS), `paymentStatus`/`paymentData`, `items[]`/`combos[]`, `tableNumber`/`seatingPreference` | INITIAL→PENDING/NOTSEATED→SEATED→GETTING_PREPARE→SERVED→COMPLETED / CANCELLED / REJECTED | → Diner, → Order |
| **experience_cart** | `experience_carts` | User session | `_id` | `experience_id`, `service_type SEATING\|RESERVATION`, seating counts, `items[]`/`combos[]`, amounts | build → checkout → cleared | → expRequest |
| **ExperienceView / Section_Experience** | `experienceviews` / `section_experiences` | Platform (SuperAdmin) | `_id` | homepage `sections[]`, curated `experience_id`+date window | admin curation | homepage layout |
| **ExpEventManagement** | (exp-events) | Platform (SuperAdmin) | `_id` | `category/subCategory`→Category/SubCategory, `type EVENT\|EXPERIENCE`, `icon`, `priority`, `isActive` | admin CRUD | drives UI filters ("Celebrations") |
| **exp_events / user_exp_events** | `exp_events` | Platform (scraped) | `_id` | `event_name`, `detail_url`, `source`, `card_*`/`detail_*`, images | admin ingest; user read | home "Events" strip (read-only) |
| **Events** | `events` | Merchant (`restaurant_id` req) | `_id` | RSVP/ticket, `adult_price`/`child_price`, `table_setup`, `seat_selection_applicable` | merchant events | booked by `eventHandler` |
| **eventHandler** | `eventhandlers` | Merchant+User | `_id` | `event_id`, `event_type RSVP\|TICKET_BOOKED`, `event_status`, `payment_status` | separate booking lifecycle | → Events |
| **promotional-event** | `promotional-event` | Platform | `_id` | marketing lead capture | — | unrelated to bookings |
| **experience_catalog** | `experience_catalog` | Platform (SuperAdmin) | `_id` | `exp_folder_name`, category/subcategory, `photos[]`/`videos[]`, `restaurants[]` | admin CRUD; merchant clone | media templates |

---

## 4. Experience Domain

`Experience` is **merchant-owned** (`restaurantId` required; `vendorId` indexed) with platform-taxonomy FKs (`category`→`Category`, `subCategory`/`classification`→`Sub Category`) — `experience.model.ts:7-22`. It has its own `type ∈ {food, event}` and `expType ∈ {SPECIAL, CURATED}`. Food config: `serveFood`, `is_food_included`, `foodItems`, plus menu-mode flags `isStandardMenu`/`isCustomMenu`/`isPackage` and `CustomMenu[]`→`Menu` (`experience.model.ts:201-228`). Capacity: `totalSeats`/`seatsLeft`. Publication: `active`+`isDraft` (draft on create; publish sets `isDraft:false`; a cron deactivates on `endDate`). CRUD: `POST/PATCH /experience` (`experience.class.ts:587-1003`), vendor-authed; publish/report via dashboard. Discovery: `GET /user/experience?pageType=EXPERIENCES&subCategory=…` filtering `active:true, isDraft:false`.

---

## 5. Celebration Terminology

| Term | What it actually is | Evidence |
|---|---|---|
| **Celebration** | **UI label** for `ExpEventManagement` rows with `type=EXPERIENCE`; selecting one lists merchant `Experience`s by `subCategory`. No `Celebration` model. | `MainHomeScreen.jsx:562` `/user-exp-events?type=EXPERIENCE`; `Celebrations.jsx:606-728`; `celebrationSubCategoryUtils.js:6-33` |
| **Experience** | Merchant-owned bookable entity (`experiences`) | `experience.model.ts` |
| **Event** | Merchant-owned RSVP/ticket entity (`events`) — separate from Experience | `events.model.ts`; `event-handler.model.ts` |
| **Festival** | **No backend entity** (0 grep matches); UI/taxonomy label only | grep `festival` = 0 |
| **exp-events (`ExpEventManagement`)** | Platform **taxonomy** (SuperAdmin; `type EVENT\|EXPERIENCE`; FK Sub Category) | `exp-events.model.ts:5-44`; `exp-events.class.ts:40-58` |
| **exp_events** | Platform **scraped external events** catalog (read-only cards) | `exp_events.model.ts:7-36`; `user_exp_event.model.ts` (same collection) |
| **Sub Category** | Platform taxonomy referenced by Experience + ExpEventManagement | `experience.model.ts:14-22` |

**Not collapsed:** Experience ≠ Event ≠ Festival ≠ exp-events ≠ exp_events ≠ Celebration — each is distinct per source.

---

## 6. Experience Taxonomy

**Platform-defined**, via **`Category`/`Sub Category`** (FK ObjectIds on `Experience.category`/`subCategory`/`classification` — `experience.model.ts:7-22`), **plus** the **`ExpEventManagement`** overlay (SuperAdmin-managed rows mapping `type`+`subCategory`+icon/priority, driving UI "Celebrations"/"Events" grouping — `exp-events.model.ts:5-44`). Not merchant-defined, not customer-generated. Merchant selects taxonomy at experience creation; SuperAdmin owns the `ExpEventManagement` catalog.

---

## 7. Merchant Configuration

A merchant configures (all PATCH `/experience/:id`, dashboard `CreateExpericence.js`/wizard): name/description/media, `type`/`expType`, taxonomy (category/subCategory/classification), dates/times, capacity (`totalSeats`), pricing/packages, food mode (`is_food_included`, `foodIncluded` 1=included/2=separate), menu mode (Standard à-la-carte / Custom menu `CustomMenu[]` + `defaultCustomId` / Package / Occasion-with-text), seating preference, auto-accept, publication (`active`/`isDraft`). Merchant also manages bookings (`expRequest`): approve (→NOTSEATED), reject, seat (→SEATED + `tableNumber`), cancel (+refund), and views reports.

---

## 8. Customer Discovery

`GET /user-exp-events?type=EXPERIENCE` renders the "Celebrations" taxonomy strip; selecting a celebration calls `GET /user/experience?pageType=EXPERIENCES&subCategory={id}&dateFilter=…` to list merchant experiences; detail via `GET /user/experience/:id`. The separate "Events" strip uses `GET /user_exp_events` (scraped). Title→subCategory fallback map: `celebrationSubCategoryUtils.js:6-33`.

---

## 9. Booking Lifecycle (proven stages only)

`DISCOVER (/user-exp-events?type=EXPERIENCE) → LIST (/user/experience?pageType=EXPERIENCES) → DETAILS (/user/experience/:id) → CART (/user/exp-cart: seating + optional menu/packages) → CHECKOUT (POST /user/exp-checkout → expRequest INITIAL) → PAY (Razorpay immediate → paymentStatus:1) OR DEFER (pay-at-site → paymentStatus:0), status→PENDING (may auto→NOTSEATED) → MATERIALIZE Diner (createSeatingRequest, when order_type≠7) + Order (createOrder, when !isOccasionWithText) → VENDOR PROGRESSION (NOTSEATED→SEATED[+tableNumber]→GETTING_PREPARE→SERVED→COMPLETED) → CONFIRMATION + QR (track page) → optional CANCEL (→CANCELLED + experienceRefund)`. Evidence: `user-exp-checkout.class.ts:42-249`, `userExpRequest.class.ts:843-1798`, `expRequest.class.ts:1868-2657`, `ExperienceCheckOutPage.jsx:636-759`, `ExperienceTrackPage.jsx:750-1164`.

---

## 10. Food Relationship

Configurable per experience — **not** mandatory:
- **Food included** in the ticket: `is_food_included`/`serveFood` (`experience.model.ts`).
- **Food extra / à-la-carte**: cart `items[]`/`combos[]`; menu step only when `isStandardMenu`/`isCustomMenu`/`isPackage` (`experienceCartHelpers.js:645-648`).
- **No food** (occasion-text-only): `isOccasionWithText` → **no Order created** (`userExpRequest.class.ts:1590-1591`).
- **Menu relationship**: `Experience.CustomMenu[]`→`Menu`; cart validates items against the custom menu's category allow-list (`user-exp-cart.class.ts:1076-1103`).
- **Order relationship**: `expRequest.order_id` created post-payment when food lines exist (`userExpRequest.class.ts:1613-1672`).
Classification: food-included **OPTIONAL**; extra-food menu **OPTIONAL**; Order link **OPTIONAL**.

---

## 11. Seating Relationship

- **Table setup**: not on Experience (that's Seating/Subscription; `Events` has its own `table_setup`).
- **Capacity**: `totalSeats`/`seatsLeft` on Experience (CURATED enforced at booking; SPECIAL not) — `userExpRequest.class.ts:578-585,843-859`.
- **Physical table assignment**: merchant-assigned at SEATED (`expRequest` `tableNumber`) — `SeatedStatusModal.js:119-124`.
- **Diner**: `expRequest.diner_id` — a `Diner` (SeatingRequest-equivalent) is created after payment for non-delivery bookings (`userExpRequest.class.ts:1585-1587,1747-1752`).
- **SeatingRequest (target)**: the legacy Diner maps conceptually to the target `SeatingRequest` (P1.7.16), but there is **no experience↔seating link in the target**.
Classification: `expRequest → Diner` **HARD** (non-delivery flow); physical table **OPTIONAL**.

---

## 12. Payment Relationship

Payment lives on `expRequest` (`paymentStatus`, `paymentData`, `transactionDetails`), not on Experience. Razorpay immediate (`paymentStatus:1` then PENDING) or **pay-at-site** deferred (`paymentStatus:0`, PENDING); vendor cash collection uses a `PAYMENT_UPDATE` status. Evidence: `ExperienceCheckOutPage.jsx:636-754`, `expRequest.class.ts:1868-1910`. Target payment models (`PaymentIntent`/`Transaction`) are **Order-scoped**; no experience-payment representation exists.

---

## 13. Cancellation / Refund

`experienceRefund` helper handles Razorpay/wallet/external refunds, triggered on cancel when `paymentStatus===1` (`experienceRefund.ts:31-206`; `userExpRequest.class.ts:1015-1020`; `expRequest.class.ts:2124-2129`). An auto-cancel cron exists but is **commented out** (`cron.ts:68`). Customer UI supports **cancel only** (refund is backend/policy-driven) — `ExperienceTrackPage.jsx:750-766`.

---

## 14. Notifications / Realtime

`expRequest` emits Socket.IO `requestUpdate`/`popupNotif`/`trackLocation` (`expRequest.service.ts:22`; `userExpRequest.class.ts:1301-1308`) plus SMS/push/WhatsApp on status changes. `Events`/`eventHandler` emit their own `event_request`/`event_trigger`. `/socket-event` is a generic channel-join only. All realtime/notification behavior is **out of scope for a config foundation**.

---

## 15. Media

Merchant `Experience.photos`/`photoThumbnails`/`videos` (embedded URLs, uploaded via `/upload-assets`, PATCHed onto the experience — media dashboard "Experience" tab). Platform `experience_catalog` (`/experience-media`) is a SuperAdmin-curated **template library** merchants **clone** URLs from. See the dedicated **## Media Dashboard** section below.

---

## 16. Subscription / Feature Gates

- `subscription.experience_management.offline_experience.{special,curated}` gates experience booking availability (`subscription.model.ts:250-294`; enforced `userExpRequest.class.ts:1815-1824`).
- `subscription.event_management.offline_event.{booking_enabled,rsvp,seat_management}` gates the separate Events domain (`subscription.model.ts:54-100`).
Both live in `Subscription.config` (target P1.7.3 preserves config JSON).

---

## 17. Legacy API Inventory

Experience: `POST/PATCH /experience`, `GET /user/experience`, `GET /user/experience/:id`, `GET /vendor/experiences`, `GET /admin/experience`, `GET /experience-menu`. Cart/checkout: `POST /user/exp-cart`, `POST /user/exp-checkout`. Booking: `POST/PATCH /expRequest`, `PATCH /userExpRequest/:id`, `GET /expRequest`, `GET /admin/expRequest`, reports `/expReport`/`/expRequestReports`. Taxonomy: `GET/POST/PATCH /admin/exp-events`, `GET /user-exp-events`. Scraped: `/exp_events`, `/user_exp_events`. Events: `/events`, `/event-handler`, `/user/event-handler`. Media: `/experience-media` (+ `/experience-media/:id/media`), `/media-catalogue`, `/merchant/media-catalogue`, `/upload-assets`, `/upload-assets-video`. Custom menu: `POST/PATCH/GET/DELETE /menu`, `GET /user/menu?customMenu=…`.

---

## Custom Menu

**Classification: E (B + C)** — a **separate merchant-owned menu construct (B)** that is **referenced by Experience (C)**; not an alternate view (A), not request-specific/ephemeral (D).

- **Legacy entities:** `Menu` with `menuType ∈ {STANDARD, CUSTOM}` (`menu.model.ts:8-55`); menu-scoped sections `menuCategory.menu → Menu`; menu-scoped items `vendorItems.menu_id → Menu`. Standard menu is **virtual** (categories/items with no `menu` parent); custom menu is a **named, publishable `Menu(type=CUSTOM)`** doc.
- **Ownership:** merchant (`vendor_id`) + restaurant (`restaurant`). Platform contributes catalogue templates + taxonomy pickers only.
- **Lifecycle:** create shell (`POST /menu`) → add sections (`POST /menu-category` with `menuId`, after-hook `$push` `Menu.categories` + `visibility:true`) → add/import items (`vendorItems.menu_id`; or catalogue import) → publish (`Menu.visibility`) → consumer read (`/user/menu?customMenu=…`) → **Experience attach** (`Experience.CustomMenu[]`/`defaultCustomId`).
- **API:** `create_custom_menu`/`update_custom_menu`/`get_list_of_custom_menu`/`delete_custom_menu` → `/menu`; `GET /experience-menu?experience_id=&menu_id=` validates `menu_id ∈ Experience.CustomMenu`.
- **Relationship to standard Menu:** distinct persistence path (custom = real `Menu` doc; standard = virtual). Read inconsistency: most consumer reads fetch items by `category` id, not the `Menu.categories[].item[]` junction (junction populated mainly by catalogue import).
- **Relationship to Experience/Event/Festival:** **HARD reference** from Experience (`CustomMenu[]`, cart item allow-list `user-exp-cart.class.ts:1076-1103`); **no** menu linkage on Events/Celebration/Festival.
- **Relationship to Diner/Order:** custom menu governs which items are **valid** at cart time; `expRequest.items[]` stores item snapshots; `order_id` created post-payment. No menu id stored on the request.
- **Pricing/publication/availability/media:** identical to standard items (per-item `size[]`/channel blocks; `status` publication + `availability` stock + schedule overlay; `Menu.visibility`; item media URLs). No media on `Menu` itself (only `shareLink`).
- **Target reuse:** existing `Menu(type=CUSTOM)` + `MenuSection(menuId)` + `MenuItem(menuSectionId)` (P1.7.18) represent the core custom-menu shape **without loss**.
- **Target gaps:** **Experience↔Menu association** (no `Experience` model yet); `softOnboarding`/`shareLink`; combos-in-custom-menu (no `Combo` model); catalogue import; the junction-vs-category read rule.
- **UNKNOWNs:** whether consumer reads should use the junction or category membership; how to model virtual standard vs `Menu(type=STANDARD)` docs; whether `Experience.menuList[]` (legacy) is dead vs `CustomMenu[]` (active).
- **Owner decisions:** Experience↔Menu link representation (join table vs JSON on future Experience); canonical item-membership rule at import.

---

## Media Dashboard

**"Media Dashboard" is a UX name over four separate legacy patterns — not one backend service.**

| Pattern | Legacy API / storage | UI | Reusable library? |
|---|---|---|---|
| **A. Merchant media upload** | `/upload-assets` → **embedded URL** strings on `restaurant`/`vendorItems`/`Experience` | Yes (`/media-upload`, tabs Restaurant/Menu/Experience) | No — writes directly to domain docs |
| **B. Experience media catalogue** | `/experience-media` → Mongo `experience_catalog` | Yes (SuperAdmin `/superadmin/experience/media/*`) | Platform **template** folders; merchants clone URLs into `Experience` |
| **C. Media catalogue (marketing repo)** | `/media-catalogue`, `/merchant/media-catalogue` → Mongo `media-catalogue` | **No UI found** | Designed reusable repo (`isUsed`/`usedBy`/tags/archival) but **no ingestion API, no consumers** — largely unshipped |
| **D. Embedded icon/photo fields** | `/upload-assets` → strings on taxonomy/entities | Yes (icon list, onboarding) | No — reference metadata |

- **Storage model:** all binary lives in **S3/CDN**; documents store **URL strings**. `upload-assets`/`upload-assets-video` are stateless upload pipes (placeholder Mongo model; return S3 URLs; **no auth** on the endpoint).
- **Ownership:** merchant media = merchant-scoped (embedded on their docs); `experience_catalog` = platform (SuperAdmin) template store, merchant read/clone; `media-catalogue` = intended platform repo (admin-created, merchant-readable) but incomplete; taxonomy icons = platform (admin).
- **Tagging/archival:** `media-catalogue` (tags, `isArchived`, `isUsed`, `usedBy[]`) and `experience_catalog` (`tags`, `is_archived`, `is_deleted`) support soft-archive; no hard delete. Merchant media = plain URL arrays (no tagging).
- **Domain usage:** Restaurant (`logo_url`/`restaurant_pictures[]`/videos), Menu item (`images[]`/`videos[]`), Experience (`photos[]`/`videos[]`), Category/SubCategory (`icon`/`photo`/`hexColor`/`icon_code`). Custom menu uses the same item URLs. Customer web reads embedded URLs from domain APIs (e.g. `RestaurantDetails.jsx:206`).
- **Target reuse:** **none** — no `Media`/`Asset` model; **no media columns** on `Restaurant`/`MenuItem`; taxonomy icons are embedded strings on `Category` (P1.7.4). Confirmed by docs 31/34.
- **Target gaps:** restaurant logo/gallery/video URLs (High), menu-item media (High), merchant experience media (High, domain deferred), `experience_catalog` templates (Medium), `media-catalogue` repo (Medium, unshipped in legacy anyway), S3 upload infra (infrastructure gap).
- **UNKNOWNs:** how `media-catalogue.images[]` were ever populated (no append API/UI); `usedBy` schema mismatch (VendorUser vs Restaurant); `AdminMediaUsage.validateSuperAdmin` self-recursion (likely broken); whether `media-catalogue` was meant to replace `experience_catalog`.
- **Owner decisions:** (i) media representation — **embedded URL fields + S3 upload infra first** (faithful, low friction) vs a canonical catalogue entity; (ii) whether `experience_catalog`/`media-catalogue` become canonical target abstractions (tie to experience/marketing domains — defer). **Do not discard** the Media Dashboard as "just URLs": `experience_catalog` is a genuine reusable **platform template** capability that likely deserves an eventual target abstraction — but not in P1.7.20.

---

## 18. Target Reuse Opportunities

| Legacy concept | Target existing (reuse) |
|---|---|
| Experience taxonomy | `Category` (P1.7.4) + embedded icons |
| Currency/money | minor-units convention + `Currency` (P1.7.6) |
| Custom menu | `Menu(type=CUSTOM)` + `MenuSection` + `MenuItem` (P1.7.18) |
| Experience seating (Diner) | `SeatingRequest` (P1.7.16) — conceptually, no link yet |
| Booking payment | `PaymentIntent`/`Transaction` (Order-scoped) — pattern only |
| Customer identity + celebration prefs | `User` + `UserProfile.preferences` (holds `celebration_subcategory`) |
| Merchant/Restaurant/Subscription tenancy | P1.7.2/P1.7.3/P1.7.14 |

## 19. Target Gaps

| Concept | Status |
|---|---|
| Merchant-owned `Experience` model | **CONFIRMED GAP** (no model) |
| `expRequest` booking model | **CONFIRMED GAP** |
| `ExpEventManagement` taxonomy overlay | **CONFIRMED GAP** (Category exists; overlay missing) |
| Scraped `exp_events` catalog | **CONFIRMED GAP** (external content) |
| Merchant `Events` + `eventHandler` | **CONFIRMED GAP** |
| Experience↔Menu (CustomMenu) link | **CONFIRMED GAP** |
| Experience capacity/schedule/pricing/food fields | **CONFIRMED GAP** |
| Experience↔Seating(Diner) link | **PARTIAL** (SeatingRequest exists; no link) |
| Experience payment/refund | **PARTIAL** (Order-scoped payment exists; not experience) |
| Media (restaurant/menu/experience/catalogue) | **CONFIRMED GAP** (no media entity/columns) |
| Customer celebration preferences | **PARTIAL** (`UserProfile.preferences`) |
| Festival entity | **NOT FOUND** (no legacy entity) |

## 20. Dependency Graph

| Relationship | Class | Evidence |
|---|---|---|
| Experience → Restaurant | **HARD** | `restaurantId` required |
| Experience → Merchant | **HARD** | via restaurant/vendor |
| Experience → Subscription | **HARD** | `experience_management` gate |
| Experience → Category/SubCategory | **SOFT** | taxonomy FKs (discovery) |
| Experience → Menu (Custom) | **OPTIONAL** | only when `isCustomMenu` |
| Experience → MenuItem | **OPTIONAL** | cart items when food |
| Experience → Currency | **SOFT** | pricing |
| Experience → Media | **OPTIONAL** | photos/videos |
| expRequest → Experience | **HARD** | `experienceId` required |
| expRequest → Diner/SeatingRequest | **HARD** (non-delivery) | `createSeatingRequest` |
| expRequest → Order | **OPTIONAL** | food / not occasion-text |
| expRequest → Payment | **HARD** | payment lifecycle intrinsic (immediate or deferred) |
| ExpEventManagement → SubCategory | **HARD** | taxonomy FK |
| Celebration → ExpEventManagement | **IS-A (UI label)** | not a dependency |
| exp_events (scraped) → anything | **NO DEPENDENCY** | standalone read-only catalog |
| Events/eventHandler → Experience | **NO DEPENDENCY** | separate domain |
| Custom Menu → Experience | **SOFT** | referenced by Experience |
| Media → Experience/Menu/Restaurant | **OPTIONAL** | embedded URLs |

## 21. Owner Decisions Required

- **DEC-EXP-1 — Model `Experience` as a first-class target entity?** Evidence: merchant-owned bookable inventory with taxonomy/capacity/food/menu config. Options: (a) new `Experience` model (+`ExperienceMenu` link), (b) defer whole domain. Recommend **(a)** for P1.7.20 (config foundation only). Impact: additive schema.
- **DEC-EXP-2 — Booking (`expRequest`) representation.** Options: new `ExperienceRequest` model vs reuse/extend `SeatingRequest`+`Order`. Evidence: expRequest has its own lifecycle + payment + optional Diner/Order. Recommend a **dedicated model** later (not P1.7.20). 
- **DEC-EXP-3 — Experience↔Menu (CustomMenu) link:** join table vs JSON. 
- **DEC-EXP-4 — `ExpEventManagement` taxonomy:** model as a `Category` subtype/overlay vs a new `ExperienceTaxonomy`.
- **DEC-EXP-5 — Scraped `exp_events`:** in-scope (import external content) or defer. Recommend **defer** (external/aggregated).
- **DEC-EXP-6 — Merchant `Events` (RSVP/ticket):** separate domain; recommend **defer** (distinct from Experience).
- **DEC-MEDIA-1 — Media representation:** embedded URL fields + S3 infra first vs catalogue entity; and whether `experience_catalog` becomes a canonical abstraction. Recommend **embedded URLs first**, catalogue deferred.
- **DEC-CUSTOMMENU-1 — Item-membership rule** (junction vs category) + virtual-standard-menu modeling (also open from doc 46).

## 22. Proposed P1.7.20

**Smallest evidence-backed next implementation slice: "Merchant Experience Configuration Foundation."** A merchant-scoped write foundation for a new first-class **`Experience`** entity (name/description, `type`/`expType`, taxonomy refs to existing `Category`, capacity `totalSeats`, pricing in minor units, food flags, publication `active`/`isDraft`) **plus the Experience↔CustomMenu reference** (reusing P1.7.18 `Menu(type=CUSTOM)`), merchant-tenant-scoped + activation-gated (P1.7.14).

**Explicitly deferred from P1.7.20:** `expRequest` booking lifecycle, payment/refund, Diner/Order materialization, realtime/notifications, `ExpEventManagement` taxonomy overlay, scraped `exp_events`, merchant `Events`/`eventHandler`, media catalogue abstraction, customer discovery UI. This keeps P1.7.20 to the minimal "merchant can define a bookable experience" foundation, mirroring how P1.7.16 (seating config) and P1.7.18 (menu write) were scoped before their runtime/booking layers.

---

### Confirmations
- **No production/application code was changed** (documentation only); **P1.7.18 remains untouched** (branch `cursor/p1-7-18-menu-item-write-foundation-a8e0`, commit `0106e4f`).
- **No Prisma schema / migration / test change.** Baseline **251/251**, build/lint/format/Prisma unaffected.
- **No legacy source modified; no production DB accessed; no Mongo data migrated; no frontend changed; no ONDC.**
