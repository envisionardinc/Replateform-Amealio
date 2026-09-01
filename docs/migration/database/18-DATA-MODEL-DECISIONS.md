# 18 — Data Model Decisions

Register of important data-model choices. Decisions blocked by OD-11 or another unresolved item are marked **BLOCKED — OWNER / DATA DECISION REQUIRED**. Nothing is guessed or implemented.

Status: **PROPOSED** (design recommendation, for review) · **BLOCKED** (needs owner/data input) · **OPEN** (to finalize at schema-design time).

| ID | Decision | Recommendation | Status |
|----|----------|----------------|--------|
| DR-01 | **Identifier strategy** | Internal UUID (time-ordered) PK; separate public codes (`orderNumber`, `couponCode`); explicit external provider id columns; `idempotencyKey`; transient `legacyId` for ETL | PROPOSED |
| DR-01a | Retain legacy human ids (e.g. `order_id` format) vs new scheme | Prefer new `orderNumber`; retain legacy value in `legacyId` | OPEN |
| DR-02 | **Enum storage mechanism** | pg enum / CHECK for stable lifecycle statuses; lookup tables for extensible/admin sets; known numeric enums (notif type/receiver) mapped directly | OPEN (mechanism); **values BLOCKED** |
| DR-02a | **Order status integer→name mapping** (OD-11) | — do not invent | **BLOCKED — OWNER/DATA (MDR-ENUM-01)** |
| DR-02b | **Payment status integer→name mapping** (OD-11) | — | **BLOCKED — OWNER/DATA (MDR-ENUM-02)** |
| DR-02c | **Payment method integer codes** (OD-11) | — | **BLOCKED — OWNER/DATA (MDR-ENUM-03)** |
| DR-02d | **Transaction `t_type` mapping** (OD-11) | — | **BLOCKED — OWNER/DATA (MDR-ENUM-04)** |
| DR-02e | **Wallet role mapping** (OD-11) | — | **BLOCKED — OWNER/DATA (MDR-ENUM-05)** |
| DR-03 | **Monetary representation** | Integer minor units (paise) + `currencyCode`; no floats; single rounding policy | PROPOSED |
| DR-03a | **India GST breakdown/rates** | Structured tax lines; **exact GST components/rates confirmed against baseline, not invented** | BLOCKED — OWNER/DATA (tax rules) |
| DR-04 | **Status representation (order)** | Separate order/payment/fulfillment statuses; explicit values; append-only status events | PROPOSED (values blocked by DR-02a/b) |
| DR-05 | **Soft-delete strategy** | Single `deletedAt`; immutable for financial/history; hard-delete/TTL for ephemeral (sessions, tokens, webhook, abandoned carts) | PROPOSED |
| DR-06 | **Audit strategy** | `createdAt`/`updatedAt`(+by); dedicated event tables for orders/reservations/financial/admin; no blanket triggers | PROPOSED |
| DR-07 | **Ownership boundaries** | Merchant multi-tenant; `merchantId`/`restaurantId` discriminators; shared DB/schema; app scoping (+ optional RLS later); customers cross-tenant | PROPOSED |
| DR-07a | **Organization (enterprise) tenancy** | Include only if enterprise grouping is in scope | BLOCKED — OWNER (OD adjacent) |
| DR-08 | **Payment model** | PaymentIntent + PaymentAttempt (idempotencyKey) + WebhookEvent (providerEventId unique) + immutable Transaction ledger + Refund; provider-ref tracking | PROPOSED (enum values blocked) |
| DR-09 | **Order model** | Order + OrderItem (priced snapshot) + OrderStatusEvent; minimal customer/restaurant snapshot; idempotent create; drop legacy denormalized blobs | PROPOSED (status values blocked) |
| DR-10 | **Reservation model** | Unified `SeatingRequest` (type WALK_IN/WAITLIST/RESERVATION); string statuses (known); reservation blocks; no invented slot inventory | PROPOSED |
| DR-11 | **Geo indexing** | PostGIS (`GiST`) vs `earthdistance` | OPEN |
| DR-12 | **restaurantCard / denormalized reads** | Replace with read model / materialized view (not a source table) | PROPOSED |
| DR-13 | **Cart unification** | Single `Cart`/`CartItem`; deprecate `user_carts` | PROPOSED |
| DR-14 | **Celebrations/Events/Ticketing entities** | Reserve; design only if OD-1..3 approved | BLOCKED — OWNER (OD-1/2/3) |
| DR-15 | **ONDC schema placement** | Separate bounded context if OD-4 approves; not baseline tables | BLOCKED — OWNER (OD-4) |
| DR-16 | **Loyalty (points/tiers)** | No entity (not evidenced) | BLOCKED — OWNER (OD-5) |
| DR-17 | **Wallet in baseline** | Model as OPTIONAL; include per OD-6 | BLOCKED — OWNER (OD-6) |
| DR-18 | **US-market fields** | India-only; no US/Stripe fields | PROPOSED (OD-7 assumed India-first) |

## Explicitly BLOCKED decisions (summary)
- **DR-02a..e** — all OD-11 numeric enum mappings (order/payment status, payment method, `t_type`, wallet role). **Gate Orders/Payments/Wallet data migration.**
- **DR-03a** — India GST components/rates (confirm against baseline).
- **DR-14 / DR-15 / DR-16 / DR-17** — owner-decision domains (Celebrations/Events/Ticketing, ONDC, Loyalty, Wallet inclusion).
- **DR-07a** — enterprise Organization tenancy.

## Open (finalize at schema-design time, not blocked)
- DR-01a (legacy id retention), DR-02 (enum mechanism), DR-11 (geo index).

No decision is silently resolved; blocked items require owner/data input recorded in `docs/migration/DECISIONS.md` before the affected model/migration proceeds.
