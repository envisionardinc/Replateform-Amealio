# 17 — Conceptual ERD (India Baseline)

Conceptual entity-relationship diagram for the approved India baseline. Distinguishes **CORE BASELINE** from **OPTIONAL / DEFERRED / UNKNOWN (owner-decision)**. Conceptual only — no schema. Companion to [`entity-relationship-model.md`](../../architecture/entity-relationship-model.md).

## Legend
- **CORE** — required baseline entities.
- **OPTIONAL** — existing, baseline-optional (Promotions, Wallet, Subscription, Reporting read models).
- **PARTIAL** — Delivery orchestration (tracking deferred).
- **UNKNOWN/DEFERRED** — owner-decision (Celebrations/Events/Ticketing, ONDC) — **reserved, not designed-in**.

## CORE baseline ERD

```mermaid
erDiagram
  MERCHANT ||--o{ RESTAURANT : owns
  MERCHANT ||--o{ STAFF_MEMBER : employs
  MERCHANT ||--o{ ROLE : defines
  ROLE ||--o{ ROLE_PERMISSION : grants
  RESTAURANT ||--o{ OPERATING_HOURS : has
  RESTAURANT ||--o{ MENU : has
  MENU ||--o{ MENU_SECTION : contains
  MENU_SECTION ||--o{ MENU_ITEM : lists
  MENU_ITEM ||--o{ ITEM_VARIANT : sizes
  MENU_ITEM ||--o{ ITEM_CHANNEL_CONFIG : channels
  MENU_ITEM ||--o{ ADDON_GROUP : addonGroups
  ADDON_GROUP ||--o{ ADDON : options
  CATEGORY ||--o{ MENU_SECTION : categorizes
  CATEGORY ||--o{ CATEGORY : subOf

  USER ||--o| USER_PROFILE : profile
  USER ||--o{ ADDRESS : addresses
  USER ||--o{ SESSION : sessions

  USER ||--o{ CART : owns
  CART ||--o{ CART_ITEM : items
  RESTAURANT ||--o{ ORDER : receives
  MERCHANT ||--o{ ORDER : fulfills
  USER ||--o{ ORDER : places
  ORDER ||--o{ ORDER_ITEM : items
  ORDER ||--o{ ORDER_STATUS_EVENT : history
  ORDER ||--o{ PAYMENT_INTENT : payments
  PAYMENT_INTENT ||--o{ PAYMENT_ATTEMPT : attempts
  PAYMENT_INTENT ||--o{ TRANSACTION : ledger
  WEBHOOK_EVENT }o--|| PAYMENT_INTENT : reconciles
  ORDER ||--o{ REFUND : refunds
  MERCHANT ||--o{ SETTLEMENT : settlements
  SETTLEMENT ||--o{ SETTLEMENT_ITEM : covers
  SETTLEMENT ||--o{ PAYOUT : payouts

  RESTAURANT ||--o{ SEATING_REQUEST : reservations
  USER ||--o{ SEATING_REQUEST : requests
  SEATING_AREA ||--o{ TABLE : tables
  RESTAURANT ||--o{ SEATING_AREA : areas

  NOTIFICATION_REQUEST ||--o{ NOTIFICATION_DELIVERY : deliveries
  NOTIFICATION_TEMPLATE ||--o{ NOTIFICATION_REQUEST : uses
  USER ||--o{ DEVICE_PUSH_TOKEN : devices

  ORDER ||--o| DELIVERY_TASK : delivery
  DELIVERY_PERSON ||--o{ DELIVERY_TASK : assigned
```

## OPTIONAL (baseline-optional)

```mermaid
erDiagram
  MERCHANT ||--o{ OFFER : offers
  OFFER ||--o{ COUPON : coupons
  COUPON ||--o{ COUPON_REDEMPTION : redemptions
  USER ||--o| WALLET : wallet
  WALLET ||--o{ WALLET_ENTRY : entries
  WALLET ||--o{ WITHDRAWAL_REQUEST : withdrawals
  MERCHANT ||--o{ SUBSCRIPTION : subscribes
```

## DEFERRED / UNKNOWN (owner-decision — reserved, NOT designed-in)

```mermaid
erDiagram
  RESTAURANT ||--o{ EXPERIENCE : offers
  EXPERIENCE ||--o{ EXPERIENCE_BOOKING : bookings
  RESTAURANT ||--o{ EVENT : hosts
  EVENT ||--o{ EVENT_TICKET : tickets
```
- **Celebrations/Events/Ticketing** shown for context only; created **only if** OD-1..3 approved.
- **ONDC** = separate bounded context (OD-4) — not in baseline schema.
- **Delivery live-GPS tracking, driver app, recommendations, loyalty** — **no tables** in baseline; attach via seams ([16](./16-FUTURE-EXTENSION-SEAMS.md)).

## Notes
- CORE entities carry tenancy (`merchantId`/`restaurantId`) and audit/soft-delete per conventions ([01](./01-DOMAIN-DATA-MODEL.md), [11](./11-AUDIT-SOFT-DELETE.md), [12](./12-OWNERSHIP-MODEL.md)).
- Financial entities (`Order`, `Transaction`, `Settlement`, `Payout`, `Refund`, `WalletEntry`) are immutable/append-only.
- This ERD is conceptual; cardinalities/constraints detail in [04](./04-RELATIONSHIPS-CONSTRAINTS.md). **No schema is produced.**
