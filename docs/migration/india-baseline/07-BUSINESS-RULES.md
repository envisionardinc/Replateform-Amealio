# 07 — Business Rules

Business rules **evidenced in code** (no inference). All in `amealio-vendordashboard` unless noted. Rules live in Feathers hooks (`src/services/**/**.hooks.ts`, `src/app.hooks.ts`), service classes (`*.class.ts`), cron jobs, and Mongoose schema enums. Custom error: `AmealioError` (`src/helpers/amealio-error.ts`).

## Identity / account
| Rule | Location |
|------|----------|
| Blocked users rejected on login and on any raw-token request | `src/authentication.ts`; `src/app.hooks.ts` |
| Local login rejected if account created via Google/Facebook | `src/authentication.ts` |
| Deleted account can reactivate via OTP + `reactivate` flag | `src/authentication.ts` |
| Unverified account returns HTTP 409 with limited admin token | `src/authentication.ts` |
| Account deletion blocked while active orders exist (`order_status` 0–6) | `src/services/userDelete/userDelete.class.ts` |
| Session persisted ~30 days; TTL index expiry | `src/authentication.ts`; `src/models/session.model.ts` |

## Authorization
| Rule | Location |
|------|----------|
| Portal enforcement: `ADMIN`→`superadmin`, `MERCHANT`→`vendor`, `ANY`→any (mismatch → 403) | `src/authentication.ts` |
| Superadmin impersonation swaps effective vendor via `vendorAccess` on order ops | `src/services/ordering/ordering.hooks.ts` |
| Superadmin-only gates on several services (`vendor-items`,`events`,`offers`,`subscription`,`chain-catalogue`,`sub-category`) | respective `*.hooks.ts` |
| Vendor signup role match | `src/services/vendor-user/vendor-user.hooks.ts` |
| RBAC permission trees per `vendor_id`/`restaurant_id` | `src/models/role-management.model.ts` |

## Orders
| Rule | Location |
|------|----------|
| Order ops require vendor JWT; Dunzo webhook bypass via `params.dunzo` | `src/services/ordering/ordering.hooks.ts` |
| New order (`order_status===0`) emits `pending_notification` | `src/services/ordering/ordering.hooks.ts` |
| First order tracked for referral rewards on create | `src/services/ordering/ordering.hooks.ts` |
| Auto-cancel stale orders every 4 minutes | `src/cron.ts` + `src/helpers/orderCancelCron` |
| Order completion daily 05:00 | `src/cron.ts` |
| Order types: `dine_in`,`take_away`,`curb_side`,`skip_line`,`home_delivery`,`catering_banquet` | `src/enums/orderEnums.ts` |
| `order_status` numeric enum from env (values **UNKNOWN — REQUIRES REVIEW**) | `config/default.js` (`ORDERSTATUS_*`) |
| Delivery method `SELF_DELIVERY`/`THIRD_PARTY_DELIVERY`/`AGENT_DELIVERY`; partner code `==2` triggers integration-svc availability | `src/services/usercart/*`, `config/default.js` |
| Abandoned-cart timing | `ABONDONED_CART_TIME` (`config/default.js`) |

## Seating / reservation
| Rule | Location |
|------|----------|
| Geo-fenced arrival via `geolib.isPointWithinRadius` | `src/services/diner/*` |
| Auto-accept / minimum-party from restaurant subscription settings | `src/services/diner/user-diner.class.ts` |
| Diner status lifecycle `PENDING/NOTSEATED/SEATED/REJECTED/COMPLETED/CANCELLED` | `src/services/diner/vendor-diner.class.ts` |
| Diner cron every minute | `src/cron.ts` |
| Reservation blackout windows | `src/models/manage-reservation-block.model.ts` |

## Experiences / events
| Rule | Location |
|------|----------|
| `expRequest` status synced against order status | `src/services/expRequests/*` |
| Experience status + settlement cron daily 04:00 | `src/cron.ts` |
| Experience types `SPECIAL`/`CURATED`; order types `DINEIN`/`DELIVERY` | `src/models/expRequests.model.ts`, `experience.model.ts` |

## Payments / wallet / settlement
| Rule | Location |
|------|----------|
| Payment methods `RAZORPAY`,`WALLET` (+ scan-and-pay / direct merchant) | `src/enums/orderEnums.ts` |
| Wallet KYC gate + OTP SMS (MSG91 `flow_id`); PIN | `src/services/wallet/wallet.class.ts`, `walletkyc.class.ts` |
| Wallet monthly balance reset on 1st | `src/cron.ts` |
| Settlement batching; daily 04:00 cron polls RazorpayX payout status → payment status | `src/services/settlement-process/settlement-process-cron.class.ts` |
| Settlement hold via `blockSettlement`/`settlementReady` on orders | `src/models/ordering.model.ts` |
| Withdrawal RazorpayX IMPS payout; wallet reversal on failure; statuses PENDING…HOLD | `src/services/withdraw-request/admin-withdraw-request.class.ts` |
| Payout types `ORDER`,`ORDER_TIP`,`EVENT`,`SCAN_AND_PAY`,`EXP` | `src/models/settlement.model.ts` |
| Refund types `ORDER`/`EXPERIENCE`; methods `WALLET`/`RAZORPAY` | `src/models/refund.model.ts` |
| **Pricing / taxes / discounts:** order charges & surcharges computed server-side; menu-category tax config; offer discounts | `src/services/ordering/*` (`/order-charges`), `src/models/menu-category.model.ts`, `src/models/offers.model.ts` |

## Restaurant / menu availability
| Rule | Location |
|------|----------|
| Restaurant open/availability & session automation | `src/services/restaurant/*` (`/restaurant-availability`,`/checkOpen`), `/session-automate`, `src/cron.ts` |
| Item availability `AVAILABLE/SOLDOUT/NOTAVAILABLE` + day-wise windows; `/resetsoldout` | `src/models/vendor-items.model.ts`, `src/services/*` |

## Delivery
| Rule | Location |
|------|----------|
| Assignment (self / Dunzo / Porter) | `src/services/ordering/*`, `dunzo/*`, `logistics/porter/*` |
| On placement, backend calls integration svc `/delivery/system/create` + `/delivery/check-availability` | `src/services/ordering/ordering.class.ts`, `usercart/cart.class.ts` |
| Dunzo webhook states → `order_status` (5/7/8/10) | `src/services/dunzo/dunzo-webHook.ts` |

## Notifications
| Rule | Location |
|------|----------|
| Channel routing `notificationType` 0=push,1=SMS,2=email; `reciever` 0=user,1=vendor | `src/models/notifications.model.ts` |
| MSG91 `flow_id` resolved by `notificationId` | `src/authentication.ts`, notification services |
| Scheduled dispatch (SMS `20,50 * * * *`, push `10,40`, email `0,30`) | `src/cron.ts` |

## Validation
- Primary validation is **Mongoose schema** (types/required/enum/unique). `class-validator` DTOs largely commented (`src/services/vendor-items/vendor-item.dto.ts`). Business validation is in hooks/classes.

## Rules requiring review (not inferred)
- Numeric enum meanings (order/payment status/method, `t_type`) — env-driven, values not in source.
- The `MERCHANT` portal check contains an ineffective statement (`query.role === "vendor"`) — intended behavior unclear (`src/authentication.ts`).
- Whether auto-cancel / abandoned-cart / settlement timings are business-mandated vs operational defaults.
- Guest/temp-user token issuance and expiry semantics.
