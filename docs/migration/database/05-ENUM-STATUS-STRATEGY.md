# 05 — Enum & Status Strategy (OD-11 CRITICAL)

**Critical migration risk.** **Numeric enum meanings are NOT guessed.** Where legacy values are env-driven and absent from source, the mapping is **BLOCKED — OWNER / DATA DECISION REQUIRED (OD-11)**. Source: P1.1 [05 §5](../india-baseline/05-DATA-MODEL.md)/[07](../india-baseline/07-BUSINESS-RULES.md); risk: P1.3 [12 P0](../target-architecture/12-MIGRATION-RISKS.md); tracker: P1.3 [11 OD-11](../target-architecture/11-OWNER-DECISIONS.md).

## Enum inventory

| Enum | Source representation | Known values | Unknown values | Business meaning | Domains | Migration impact |
|------|-----------------------|--------------|----------------|------------------|---------|------------------|
| **Order status** | **numeric** (`ORDERSTATUS_*` env; `ordering.order_status`) | names inferred (PENDING…RETURNED) — **integers UNKNOWN** | integer↔name map | order lifecycle | Orders, Delivery, Settlement | **BLOCKED (OD-11)** — cannot ETL orders without map |
| **Payment status** | **numeric** (`PAYMENTSTATUS_*`) | names (CREATED/AUTHORIZED/CAPTURED/REFUNDED/FAILED) — **integers UNKNOWN** | integer↔name | payment lifecycle | Payments | **BLOCKED (OD-11)** |
| **Payment method** | **numeric** (`PAYMENTMETHOD_*`) + strings (RAZORPAY/WALLET) | RAZORPAY, WALLET, scan-and-pay, direct-merchant — **integer codes UNKNOWN** | method | Payments, Orders | **BLOCKED (OD-11)** partial |
| **Transaction t_type** | **numeric** (`T_TYPE_*`) | many wallet/payment types — **UNKNOWN** | integer↔meaning | Payments/wallet ledger | **BLOCKED (OD-11)** |
| **Wallet role** | **numeric** | USER/VENDOR/SUPER_ADMIN (order unknown) | integer↔role | Payments/wallet | **BLOCKED (OD-11)** |
| Order type | string-ish enum (`orderEnums.ts`) | dine_in, take_away, curb_side, skip_line, home_delivery, catering_banquet | — | ordering | Orders | LOW (map names) |
| Diner status | **string** | PENDING, NOTSEATED, SEATED, REJECTED, COMPLETED, CANCELLED | — | seating/reservation | Reservations | LOW |
| Withdrawal status | **string** | PENDING, INPROGRESS, COMPLETED, CANCELLED, REJECTED, HOLD | — | payouts | Payments | LOW |
| Refund status | **string** | INITIATED, PROCESSED, FAILURE | — | refunds | Payments | LOW |
| Refund type / method | **string** | ORDER/EXPERIENCE; WALLET/RAZORPAY | — | refunds | Payments | LOW |
| Settlement payout type | **string** | ORDER, ORDER_TIP, EVENT, SCAN_AND_PAY, EXP | — | settlement | Payments | LOW |
| Transaction_type | **string** | WALLET, RAZORPAY, SCAN_AND_PAY | — | ledger | Payments | LOW |
| Experience type / orderType | **string** | SPECIAL/CURATED; DINEIN/DELIVERY | — | celebrations | Celebrations (owner-decision) | LOW (if in scope) |
| Notification type | **numeric (KNOWN)** | 0=push, 1=SMS, 2=email | — | notifications | Notifications | LOW |
| Notification receiver | **numeric (KNOWN)** | 0=user, 1=vendor | — | notifications | Notifications | LOW |
| Item availability | **string** | AVAILABLE, SOLDOUT, NOTAVAILABLE | — | menu | Menus | LOW |
| Offer settlement type / useFrequency | **string** | VENDOR/ADMIN/SPLIT; DAILY/WEEKLY/MONTHLY/YEARLY | — | promotions | Promotions | LOW |

## Target representation options (tradeoffs)

| Option | Pros | Cons | Use for |
|--------|------|------|---------|
| **PostgreSQL enum** | type-safe, compact, fast | altering values needs migration; not admin-editable | **stable lifecycle statuses** (order/payment/reservation/refund) once values confirmed |
| **Lookup / reference table** | admin-manageable, joinable, extensible, supports i18n/metadata | extra joins; FK overhead | **extensible sets** (payment methods, categories, delivery partners, notification channels) |
| **Constrained string (CHECK)** | simple, human-readable, easy to evolve | weaker than enum; app must guard | small stable sets where enum migration friction is unwanted |
| **Application-level enum only** | most flexible | no DB-level guarantee | discouraged for critical statuses |

## Recommendation (for review; values still blocked by OD-11)
- **Lifecycle statuses** (order/payment/reservation/refund/withdrawal): **PostgreSQL enum or CHECK-constrained string** with explicit **names** (not integers). The **name set** is derivable; the **legacy-integer→name mapping is BLOCKED (OD-11)**.
- **Extensible/admin sets** (payment methods, categories, cuisines, delivery partners, notification channels/templates): **lookup tables**.
- **Known numeric enums** (notification type/receiver): map directly (documented).

## Migration decision records (do not invent values)

- **MDR-ENUM-01 (BLOCKED — OWNER/DATA):** Order status integer↔name mapping. Provide authoritative `ORDERSTATUS_*` values before Orders ETL.
- **MDR-ENUM-02 (BLOCKED — OWNER/DATA):** Payment status integer↔name mapping (`PAYMENTSTATUS_*`).
- **MDR-ENUM-03 (BLOCKED — OWNER/DATA):** Payment method integer codes (`PAYMENTMETHOD_*`).
- **MDR-ENUM-04 (BLOCKED — OWNER/DATA):** Transaction `t_type` integer↔meaning.
- **MDR-ENUM-05 (BLOCKED — OWNER/DATA):** Wallet role integer↔role.
- **MDR-ENUM-06 (OPEN, not blocked):** final storage mechanism (pg enum vs lookup vs CHECK) per status family — decide at schema-design time.

**No enums are implemented.** OD-11 remains open and gates Orders/Payments data migration ([14](./14-DATA-MIGRATION-COMPLEXITY.md), [18](./18-DATA-MODEL-DECISIONS.md)).
