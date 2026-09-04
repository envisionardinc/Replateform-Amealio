# 05 — Business Rules & Validation

Business rules and validation encoded in the backend (`amealio-vendordashboard`), captured from hooks, service classes, cron jobs, and Mongoose schemas. Rules are the current behavior; correctness/intent is not judged here. Ambiguous rules are marked **`UNKNOWN — REQUIRES REVIEW`**.

## 1. Where rules live

- **Feathers hooks** (`src/services/**/**.hooks.ts`, `src/app.hooks.ts`) — most authorization and lifecycle rules.
- **Service classes** (`src/services/**/*.class.ts`) — transactional/business logic.
- **Mongoose schema enums / required fields** — the primary validation layer.
- **`class-validator` DTOs** — minimal, mostly commented (e.g. `vendor-item.dto.ts`).
- **Custom errors** — `AmealioError` (`src/helpers/amealio-error.ts`) with `{ name, message, code, className, errors }`.

## 2. Identity & account rules

| Rule | Detail | Source |
|------|--------|--------|
| Blocked users | `user_blocked` → reject login (401/403); global hook rejects blocked users on any raw-token request | `src/authentication.ts`, `src/app.hooks.ts` |
| Social-account guard | Local login rejected if account was created via Google/Facebook signup | `src/authentication.ts` |
| Deleted account reactivation | Deleted user + OTP + `reactivate` flag restores account (`userDelete` retained) | `src/authentication.ts` |
| Unverified account | Returns HTTP 409 with a limited admin token instead of full session | `src/authentication.ts` |
| Account deletion block | User cannot be deleted while active orders exist (`order_status` 0–6) | `src/services/userDelete/userDelete.class.ts` |
| Session lifetime | Session persisted 30 days; TTL index expires sessions | `src/authentication.ts`, `src/models/session.model.ts` |

## 3. Merchant / authorization rules

| Rule | Detail | Source |
|------|--------|--------|
| Portal enforcement | Vendor auth checks `portal` header: `ADMIN` requires `superadmin`, `MERCHANT` requires `vendor`, `ANY` allows any (and updates `last_activity_date`); mismatch → 403 "Invalid Access." | `src/authentication.ts` |
| Superadmin impersonation | When acting for a vendor, `vendorAccess.vendor_id` swaps the effective vendor on order operations | `src/services/ordering/ordering.hooks.ts` |
| Superadmin-only operations | `vendor-items`, `events`, `offers`, `subscription`, `chain-catalogue`, `sub-category`, etc. gate on `role === 'superadmin'` | respective `*.hooks.ts` |
| Vendor signup role match | Role must match on vendor-user create | `src/services/vendor-user/vendor-user.hooks.ts` |
| RBAC granularity | `role` model carries deep `vendorPermission` / `superAdminPermission` boolean trees per restaurant | `src/models/role-management.model.ts` |

## 4. Ordering rules

| Rule | Detail | Source |
|------|--------|--------|
| Vendor context required | Order ops require vendor JWT; superadmin uses `vendorAccess` swap; Dunzo webhook bypasses via `params.dunzo` | `src/services/ordering/ordering.hooks.ts` |
| Pending notification | New order (`order_status === 0`) emits `pending_notification` | same |
| Referral first-order | First order tracked for referral rewards on create | same |
| Auto-cancel | `cancelCron` every 4 minutes cancels stale orders | `src/cron.ts`, `src/helpers/orderCancelCron` |
| Completion | Daily 05:00 order-completion cron | `src/cron.ts` |
| Order types | `dine_in`, `take_away`, `curb_side`, `skip_line`, `home_delivery`, `catering_banquet` | `src/enums/orderEnums.ts` |
| Status codes | Numeric `order_status` from env (`ORDERSTATUS.*`); exact mapping **`UNKNOWN — REQUIRES REVIEW`** | `config/default.js` |
| Delivery method | `SELF_DELIVERY` / `THIRD_PARTY_DELIVERY` / `AGENT_DELIVERY`; partner code `== 2` triggers integration-service availability | `src/services/usercart/*`, `config/default.js` |
| Abandoned cart | `ABONDONED_CART_TIME` config governs cart expiry | `config/default.js` |

## 5. Seating / reservation rules

| Rule | Detail | Source |
|------|--------|--------|
| Geo-fenced check-in | Arrival validated with `geolib.isPointWithinRadius` | `src/services/diner/*` |
| Auto-accept / min-person | Auto-accept and minimum party rules read from restaurant subscription settings | `src/services/diner/user-diner.class.ts` |
| Status lifecycle | `PENDING`, `NOTSEATED`, `SEATED`, `REJECTED`, `COMPLETED`, `CANCELLED` | `src/services/diner/vendor-diner.class.ts` |
| Diner cron | Runs every minute for time-based updates | `src/cron.ts` |
| Reservation blocks | `manageReservationBlock` defines blackout windows per restaurant | `src/models/manage-reservation-block.model.ts` |

## 6. Experience / event rules

| Rule | Detail | Source |
|------|--------|--------|
| Booking↔order sync | `expRequest` status synced against order status (1,2,6,7,9 referenced) | `src/services/expRequests/*` |
| Status cron | Daily 04:00 experience status + settlement | `src/cron.ts` |
| Cancel cron | Experience request cancel job (available; commented in main cron) | `src/services/expRequests/expRequestStatusCorn.ts` |
| Experience types | `SPECIAL`, `CURATED`; order types `DINEIN`/`DELIVERY` | `src/models/expRequests.model.ts`, `experience.model.ts` |

## 7. Payment / wallet / settlement rules

| Rule | Detail | Source |
|------|--------|--------|
| Payment methods | `RAZORPAY`, `WALLET` (+ scan-and-pay / direct merchant) | `src/enums/orderEnums.ts` |
| Wallet KYC | KYC gate with OTP SMS via MSG91 `flow_id`; PIN required for wallet | `src/services/wallet/wallet.class.ts`, `walletkyc.class.ts` |
| Monthly wallet reset | `monthBalance` reset on 1st of month | `src/cron.ts` |
| Settlement batching | `settlement_process` batches records; daily 04:00 cron polls RazorpayX payout status → maps to payment status | `src/services/settlement-process/settlement-process-cron.class.ts` |
| Settlement hold | `blockSettlement` / `settlementReady` flags gate payouts on orders | `src/models/ordering.model.ts` |
| Withdrawals | RazorpayX IMPS payout on approval; wallet reversal on failure; statuses `PENDING/INPROGRESS/COMPLETED/CANCELLED/REJECTED/HOLD` | `src/services/withdraw-request/admin-withdraw-request.class.ts` |
| Payout types | `ORDER`, `ORDER_TIP`, `EVENT`, `SCAN_AND_PAY`, `EXP` | `src/models/settlement.model.ts` |
| Refunds | Types `ORDER`/`EXPERIENCE`; methods `WALLET`/`RAZORPAY`; statuses `INITIATED/PROCESSED/FAILURE` | `src/models/refund.model.ts` |

## 8. Delivery rules

| Rule | Detail | Source |
|------|--------|--------|
| Assignment | Self-delivery person assigned on order; Dunzo task via API; Porter via API + headless-browser automation queue | `src/services/ordering/*`, `dunzo/*`, `logistics/porter/*` |
| Availability | On placement, backend calls integration service `/delivery/system/create` and `/delivery/check-availability` | `src/services/ordering/ordering.class.ts`, `usercart/cart.class.ts` |
| Dunzo status mapping | Dunzo webhook states → `order_status` (5/7/8/10) | `src/services/dunzo/dunzo-webHook.ts` |
| Driver status transitions | Delivery app: `order_status: 5` (on the way) → `6` + `payment_status: 1` (delivered) | `amealio-self-delivery-app` (`order-card.tsx`, `order-detail.tsx`) |

## 9. Notification rules

| Rule | Detail | Source |
|------|--------|--------|
| Channel routing | `notificationType` 0=push, 1=SMS, 2=email; `reciever` 0=user, 1=vendor | `src/models/notifications.model.ts` |
| Flow resolution | MSG91 `flow_id` resolved by `notificationId` from `notifications` collection | `src/authentication.ts`, notification services |
| Scheduled dispatch | SMS at `20,50 * * * *`; push at `10,40 * * * *`; email at `0,30 * * * *` | `src/cron.ts` |

## 10. Validation layer summary

- **Primary validation is Mongoose schema** (types, `required`, `enum`, `unique`). Business validation lives in hooks/classes.
- **`class-validator` DTOs are largely commented out** — do not assume DTO-level validation is enforced today.
- **Custom error contract** is `AmealioError` with numeric `code`; the target must preserve or map this contract for client compatibility. **`UNKNOWN — REQUIRES REVIEW`**: the full catalogue of error codes/messages clients depend on.

## 11. Rules flagged for review

- Numeric enum meanings for order/payment status/method and transaction `t_type` (env-driven).
- `MERCHANT` portal role check contains an ineffective comparison (`query.role === "vendor"` as a statement) — intended behavior unclear.
- Whether abandoned-cart, auto-cancel, and settlement timings are business-mandated or operational defaults.
- Guest/temp-user token issuance flow and its expiry semantics.
