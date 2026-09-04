# 92 — Order vertical implementation notes (Phase 1)

**Branch:** `replatform/backend-consolidation`  
**Authority:** docs 88 / 90 / 91; methodology doc 00  
**This slice:** merchant order HTTP (doc 88)

## Refund rail (OD-MOM-REFUND-RAIL / OD-COP-REFUND-RAIL)

Owner policy is **not** decided here. Paid reject/cancel calls existing
`RefundService.executeRefund` with the method already stored on `PaymentIntent`:

| PaymentIntent.method | RefundService method | Observed effect |
| -------------------- | -------------------- | --------------- |
| `RAZORPAY` | `RAZORPAY` | Async: `Refund.status = INITIATED` until `refund.processed` |
| `WALLET` | `WALLET` | Sync wallet credit, `PROCESSED` |
| `SCAN_AND_PAY` / `DIRECT_MERCHANT` | `WALLET` | Existing `requestRefund` default — no new instrument invented |

Mapping is isolated in `apps/api/src/modules/ordering/domain/refund-rail.ts`.
Change that file to change rail routing without rewriting order state.

Unpaid / COD (no captured `PaymentIntent`): cancel only; **no** refund row.

## Order types (OD-MOM-TYPES)

No new enums. Existing six `OrderType` values only.

Legacy buffet / drive-thru (when they appear in evidence) map for this vertical as:

| Legacy evidence | Target type used now |
| --------------- | -------------------- |
| Buffet / dine experience seating | `DINE_IN` (pickup-like READY → COMPLETED) |
| Drive-thru | `TAKE_AWAY` or `CURB_SIDE` (pickup-like) |

A first-class `BUFFET` / `DRIVE_THRU` enum remains an owner decision and is not
required to run kitchen + reject + refund.

## Phase 1 HTTP

| Method | Path | Actor |
| ------ | ---- | ----- |
| GET | `/api/v1/orders` | merchant staff, server merchant/restaurant scope |
| GET | `/api/v1/orders/:id` | same; joins `PaymentIntent` |
| PATCH | `/api/v1/orders/:id/status` | `{ toStatus, reason?, reasonCode?, expectedStatus? }` |

`OrderStatus` is the only lifecycle authority. `DeliveryTask` is unused.
