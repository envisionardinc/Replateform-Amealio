# 02 — Target Domain Boundaries

Proposed **logical target domains** derived from the P1.2 [Capability Matrix](../india-baseline/14-CAPABILITY-MATRIX.md). Domains map to `apps/api/src/modules/*` in the recommended modular monolith ([01](./01-TARGET-ARCHITECTURE-OPTIONS.md), [`target-repository-structure.md`](../../architecture/target-repository-structure.md)). A domain is included **only** where India baseline evidence supports it.

Domain classification: **CORE** · **OPTIONAL** · **PARTIAL** · **DEFERRED** · **UNKNOWN** · **NOT BASELINE**.

| Target domain | Class | Target module | Baseline evidence (P1.2) | Notes |
|---------------|-------|---------------|--------------------------|-------|
| Identity & Access | **CORE** | `auth` | Registration/login/logout/roles/permissions/session REQUIRED | Unify dual auth (`/authentication` + `/vendorauthentication`) into one identity + claims |
| Users | **CORE** | `users` | Profile/addresses REQUIRED | Add explicit address ownership |
| Restaurants (Location) | **CORE** | `locations` | Onboarding/profile/hours/availability REQUIRED | Anchor entity; drop `restaurantCard` duplication |
| Menus | **CORE** | `menus` | Menu/categories/items/modifiers/pricing/availability REQUIRED | Normalize variants/channel config/add-ons |
| Catalog (taxonomy) | **CORE** | `catalog` | Products/catalog REQUIRED | Shared reference data |
| Discovery / Search | **CORE** | in `locations` (+ search port) | Discovery/search REQUIRED | Mongo/geolib today; search-engine option later |
| Dining / Reservations | **CORE** | `reservations` | Reservation lifecycle REQUIRED | Unified `Diner` (seating + reservation) |
| Cart | **CORE** | in `orders` | Cart REQUIRED | Unify `cart` + legacy `user_cart` |
| Orders | **CORE** | `orders` | Order lifecycle REQUIRED | Explicit status machine; item snapshots |
| Payments | **CORE** | `payments` | Payment/webhook/ledger/settlement REQUIRED | Highest correctness bar; provider abstraction (India Razorpay/RazorpayX) |
| Notifications | **CORE** | `notifications` | Email/SMS/push/in-app REQUIRED | Consolidate providers behind interfaces |
| Administration | **CORE** | `admin` | Platform/merchant/user/restaurant admin REQUIRED | Split from Merchant UI |
| Merchant operations | **CORE** | spans `merchants`/`orders`/`menus`/`locations` | Merchant mgmt REQUIRED | `merchants` module for vendor/staff/RBAC/subscriptions |
| Delivery | **PARTIAL** | `delivery` | Orchestration/assignment/status REQUIRED; live tracking + driver app DEFERRED | Extraction seam for future tracking service |
| Promotions | **OPTIONAL** | `promotions` | Coupons/discounts OPTIONAL | Normalize offer scope + redemptions |
| Commerce (subscriptions) | **OPTIONAL** | in `merchants` | Merchant subscriptions OPTIONAL | — |
| Reporting / Analytics | **OPTIONAL** | read models in `admin` | Reporting OPTIONAL | Read models/materialized views, not new SoT |
| AI / Personalization | **PARTIAL** | personalization in `customers`; **recommendations = external port** | In-app moods/cravings OPTIONAL; recommendations engine external | Recommendation engine repo not in workspace |
| Celebrations | **UNKNOWN (owner-decision)** | `celebrations` | Implemented; first-wave inclusion is owner-decision | Do not resolve here ([11](./11-OWNER-DECISIONS.md)) |
| Events | **UNKNOWN (owner-decision)** | `celebrations` | Implemented; owner-decision | — |
| Ticketing | **UNKNOWN (owner-decision)** | in `celebrations` | Event tickets + QR exist; validation/capacity UNKNOWN | — |
| ONDC (commerce channel) | **UNKNOWN (owner-decision)** | separate bounded context (extraction seam) | Implemented; large external-protocol surface | Recommend separate service if included |
| Integrations | **CORE (as boundary)** | `packages/integrations` + per-domain ports | Baseline integrations REQUIRED/OPTIONAL ([08](./08-INTEGRATION-MIGRATION-MAP.md)) | Provider adapters behind interfaces |
| Loyalty (points/tiers) | **NOT BASELINE / UNKNOWN** | — | Not evidenced beyond referrals/wallet cashback | Do not create a loyalty domain on assumption |

## Cross-domain notes
- **Diner** underpins Dining and Reservations (one aggregate).
- **Cart** lives inside Orders (not a standalone domain) — evidence shows cart is the pre-order state.
- **Merchant operations** is not a separate module; it is the operator-facing surface over `merchants` + `orders` + `menus` + `locations`.
- **ONDC / Celebrations / Events / Ticketing / Loyalty** are **carried forward as owner-decisions** — modules are *reserved* but not designed-in until the owner decides ([11](./11-OWNER-DECISIONS.md)).
- **Delivery tracking + driver app** remain outside the baseline; the `delivery` module exposes a seam for them ([12 feature-repo protection](./10-MIGRATION-SEQUENCE.md#feature-repository-extension-points)).

Boundaries are proposals for review; nothing is implemented.
