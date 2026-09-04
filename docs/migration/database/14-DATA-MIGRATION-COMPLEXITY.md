# 14 — Data Migration Complexity

Per-entity migration classification: **LOW / MEDIUM / HIGH / CRITICAL**, with transformation, cleanup, duplicate/orphan handling, enum mapping, historical issues, validation. Design/assessment only.

| Entity | Complexity | Transformation | Cleanup / duplicates / orphans | Enum mapping | Historical | Validation |
|--------|-----------|----------------|-------------------------------|--------------|------------|-----------|
| User / UserProfile | MEDIUM | favourites→join; prefs→structured | unify soft-delete; dedupe by phone | — | keep | count + login sample |
| Address | MEDIUM | add `userId` from `User.addressLocations` | orphans if user missing | — | — | every address resolves to a user |
| Merchant / Staff | MEDIUM | split account vs role; subscription extract | dedupe | — | keep | vendor counts |
| Role / Permission | HIGH | flatten boolean trees → rows | enumerate 100+ flags | — | — | permission parity per role |
| Restaurant | HIGH | split shared `restaurants`; drop `restaurantCard`; hours→table | `strict:false` stray fields; duplicate card | — | keep | discoverability parity, geo |
| Menu / Item / Variant / AddOn | HIGH | normalize size/channel/addons; add `restaurantId` | dedupe; broken refs | availability (string) LOW | keep | menu parity vs consumer view |
| Cart | MEDIUM | unify `carts` + `user_carts` | drop legacy carts | — | ephemeral (may skip) | active-cart sample |
| **Order / OrderItem** | **CRITICAL** | embedded items→rows + snapshot; split statuses | numeric statuses | **BLOCKED (OD-11)** | **must preserve** | counts, totals, status distribution reconcile |
| **Payment / Transaction** | **CRITICAL** | gateway blobs→JSONB; ledger | dup `refund` model | **BLOCKED (OD-11)** t_type/status | **must preserve** | financial reconciliation |
| Wallet / WalletEntry | HIGH | balances→minor units; ledger | — | wallet role BLOCKED | preserve | balance reconciliation |
| Settlement / Payout / Withdrawal | HIGH | link items; payout refs | — | payout/status (string) LOW; some numeric BLOCKED | preserve | payout reconciliation |
| Refund | MEDIUM | single `Refund` | merge duplicate model | status string LOW | preserve | amounts ≤ captured |
| Reservation (SeatingRequest) | MEDIUM | Diner→typed; auditLogs→events | broken `"User Service"` ref | statuses string LOW | keep | status parity |
| Notification templates/tokens | MEDIUM | merge template collections | notif-records no ref | type/receiver KNOWN | optional history | template coverage |
| Promotion (Offer/Coupon) | MEDIUM | scope arrays→join; redemptions | — | strings LOW | keep active | coupon uniqueness |
| Delivery (task/person/partner) | MEDIUM | orchestration only | partner blobs→JSONB | — | keep | assignment parity (tracking deferred) |
| Taxonomy (Category/Cuisine/UOM) | LOW | normalize; space-named collections | — | — | — | reference completeness |
| Audit/admin | MEDIUM | blobs→typed audit | — | — | keep | — |

## Cross-cutting prerequisites (blockers)
- **OD-11 enum mapping** must be resolved before **Order/Payment/Transaction/Wallet** ETL (CRITICAL). Until then those migrations are **blocked**.
- **Live-document audit** of `strict:false` collections (restaurant/payment) before mapping.
- **Reference reconciliation** for broken refs and shared collections.
- **Financial reconciliation harness** (counts, sums, balances) is a validation gate for Payments/Settlement/Wallet.

## Summary
- **CRITICAL:** Orders, Payments/Transactions (blocked on OD-11).
- **HIGH:** Role/Permission, Restaurant, Menu/Item, Wallet, Settlement.
- **MEDIUM:** User, Address, Merchant, Cart, Refund, Reservation, Notification, Promotion, Delivery, Audit.
- **LOW:** Taxonomy/reference.
