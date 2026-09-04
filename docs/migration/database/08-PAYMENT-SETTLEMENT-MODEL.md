# 08 — Payment & Settlement Model (P0)

Conceptual target model for payments/settlements. **P0 risk.** Design only; **no payment integration implemented**; **no provider behavior invented** beyond the baseline. Legacy: `payments`,`transactionals`,`wallets`,`settlements`,`withdrawrequests`,`refunds` (P1.1 [05](../india-baseline/05-DATA-MODEL.md)).

## Entities (conceptual)

### PaymentIntent
`id`, `orderId?`/`bookingId?`, `amount` (minor units), `currencyCode`, `status` (**names known; integer map BLOCKED OD-11**), `method` (razorpay/wallet/scan_and_pay/direct_merchant), `razorpayOrderId?` (unique where present), `createdAt`.

### PaymentAttempt
`id`, `paymentIntentId`, `amount`, `status`, `razorpayPaymentId?`, **`idempotencyKey` (unique)**, `providerPayload` (JSONB), `createdAt`. Supports retries without double-charge.

### WebhookEvent
`id`, `provider` (razorpay/dunzo/petpooja), **`providerEventId` (unique)** for **replay protection**, `type`, `payload` (JSONB), `receivedAt`, `processedAt?`, `processingStatus`. Dedupe on `providerEventId`.

### Transaction (ledger)
`id`, `type` (WALLET/RAZORPAY/SCAN_AND_PAY/… — `t_type` integer map **BLOCKED OD-11**), `direction` (CREDIT/DEBIT), `userId?`/`merchantId?`, `orderId?`, `amount`, `currencyCode`, `paymentIntentId?`, `walletEntryId?`, `createdAt`. **Append-only, immutable** (auditability).

### Refund
`id`, `type` (ORDER/EXPERIENCE), `orderId?`/`bookingId?`, `paymentIntentId`, `method` (WALLET/RAZORPAY), `amount` (≤ captured), `status` (INITIATED/PROCESSED/FAILURE — string, known), `gatewayPayload` (JSONB), timestamps.

### Wallet / WalletEntry (OPTIONAL)
`Wallet(id, userId unique, balance, currencyCode, isKyc, isClosed)`; `WalletEntry(id, walletId, direction, amount, refType, refId, balanceAfter, createdAt)` — append-only ledger.

### Settlement / SettlementItem / Payout
`Settlement(id, merchantId, restaurantId, payoutType[ORDER|ORDER_TIP|EVENT|SCAN_AND_PAY|EXP], status[PENDING|PARTIAL|FAILED|COMPLETED], amount, currencyCode)`; `SettlementItem(settlementId, orderId?/bookingId?/transactionId?)`; `Payout(id, settlementId, provider=RAZORPAYX, providerPayoutId, status, payload JSONB)`.

### WithdrawalRequest
`id`, `walletId`, `userId`, `amount`, `status[PENDING|IN_PROGRESS|COMPLETED|CANCELLED|REJECTED|HOLD]`, `accountDetails` (ref/JSONB).

### BankAccount
`id`, `ownerType`, `ownerId`, encrypted details.

## Design guarantees (required)
- **Idempotency:** `PaymentAttempt.idempotencyKey` unique; order-create idempotency; payout dedupe by provider id → **prevents duplicate payments** ([15](./15-DATA-INTEGRITY-RULES.md)).
- **Webhook replay protection:** `WebhookEvent.providerEventId` unique + processed-once semantics.
- **Provider reference tracking:** explicit columns for `razorpayOrderId`/`razorpayPaymentId`/`payoutId` → reconciliation.
- **Auditability:** immutable ledger (`Transaction`, `WalletEntry`); status changes recorded; no hard delete.
- **Reconciliation:** settlement items link back to source orders/transactions; totals reconcilable to legacy (AC-D3).

## Legacy fields NOT to copy
- Numeric `t_type`/status integers as-is (map; BLOCKED OD-11).
- `strict:false` stray fields on `payments`.
- Duplicate `refund` model (`resetSettlements`) — single `Refund`.
- Loose gateway blobs → confined to `providerPayload` JSONB (not scattered).

## Blocked / owner items
- OD-11 enum mappings (payment status, method, `t_type`, wallet role) — **BLOCKED**.
- Exact Razorpay/RazorpayX status semantics beyond documented baseline — confirm, do not invent.

## Migration classification: **CRITICAL** — reconciliation + enum mapping required before ETL. See [14](./14-DATA-MIGRATION-COMPLEXITY.md).
