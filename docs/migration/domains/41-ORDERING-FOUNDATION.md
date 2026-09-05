# 41 — Ordering Foundation (P1.7.12)

> **Type:** IMPLEMENTATION (bounded slice) — canonical **Order + OrderItem creation** and the **native `OrderStatus` lifecycle** over the EXISTING target schema. **No schema change, no migration.**
> **Governing gate:** [40-ORDERING-LIFECYCLE-RECONCILIATION.md](./40-ORDERING-LIFECYCLE-RECONCILIATION.md) — **OD-11 RESOLVED**.
> **Authority:** legacy source (`amealio-vendordashboard` `ordering.model.ts` / `user-ordering.class.ts` / `vendor-ordering.class.ts`, `amealio-self-delivery-app`, `amealiodashboardmvp-`, `amealio_web_app`) + target `prisma/schema.prisma`. Baseline **210/210 → 220/220**.

---

## 1. Scope

Implemented the **minimum canonical Ordering foundation** required before later payment, delivery, POS, realtime, cart, and frontend migration:

1. Canonical `Order` creation.
2. Canonical `OrderItem` creation.
3. Merchant / Restaurant / User ownership enforcement.
4. Native `OrderStatus` lifecycle (single field, P1.7.11 1:1 mapping).
5. `OrderStatusEvent` history.
6. Merchant-tenant authorization (P1.7.1F / P1.7.2).
7. Source-faithful lifecycle transitions.
8. Exact money in BigInt minor units.

**Not** the whole Ordering platform. Cart, payment, delivery, POS/PetPooja, Socket.IO, notifications, ONDC, refunds/settlement, rider integration, and frontend migration are **DEFERRED** (§13).

No schema change was required — `Order`, `OrderItem`, and `OrderStatusEvent` already exist with every field this foundation needs.

## 2. Source reverification (matches P1.7.11)

- **Single order lifecycle field.** `ordering.model.ts` stores one numeric `order_status` (`ORDERSTATUS`) — `INITIAL, PENDING, CONFIRMED, PREPARING, PACKING, READYTOPICK, ONTHEWAY, DELIVERED, COMPLETED, CANCELLED, RETURNED` — plus `previous_status`. Maps **1:1** to target `OrderStatus` (cosmetic `READYTOPICK→READY`, `ONTHEWAY→ON_THE_WAY`).
- **Initial status = INITIAL.** `user-ordering.class.ts:2031` sets `contextData.order_status = ORDERSTATUS.INITIAL` at order creation (draft), then transitions to `PENDING`/`CONFIRMED` as the flow proceeds. → the canonical create defaults to **INITIAL** (not PENDING).
- **Rider advances the SAME field.** The delivery-person PATCH path sets `order_status = 5/6` (`ONTHEWAY`/`DELIVERED`). There is **no separate rider state machine** — 5/6 are encodings of the same `OrderStatus`.
- **Payment is separate.** `payment_status` is a distinct numeric enum; the target already separates `OrderStatus`/`PaymentStatus`/`FulfillmentStatus`/`DeliveryTaskStatus`.
- **Money.** Legacy order/item amounts are numeric currency; the target convention (P1.5/P1.7.5) is **integer minor units as `BigInt`** with a DB total-integrity CHECK.

No material difference from P1.7.11 was found → no HARD STOP.

## 3. Source → target Order mapping

| Legacy (`ordering.model.ts`) | Target `Order` | Notes |
|---|---|---|
| `order_id` / reference | `orderNumber` (`@unique`) | caller-supplied reference; duplicate protection |
| `restaurant_id` | `restaurantId` | must be in caller merchant scope |
| (restaurant → vendor) | `merchantId` | **server-derived from the restaurant**, never from request |
| `user_id` | `userId?` | optional customer attribution |
| `order_type` | `type` (`OrderType`) | DINE_IN/TAKE_AWAY/CURB_SIDE/SKIP_LINE/HOME_DELIVERY/CATERING |
| `order_status` | `status` (`OrderStatus`) | initial **INITIAL** |
| `payment_status` | `paymentStatus` | left at default `CREATED` (separate slice) |
| — | `fulfillmentStatus` | left at default `UNFULFILLED` (separate) |
| item subtotal | `subtotalMinor` | `Σ lineTotalMinor` |
| tax | `taxTotalMinor` | order-level, default 0 |
| discount | `discountTotalMinor` | order-level, default 0 |
| charges/fees | `feeTotalMinor` | order-level, default 0 |
| delivery charge | `deliveryChargeMinor` | order-level, default 0 |
| grand total | `grandTotalMinor` | **derived** = subtotal − discount + tax + fee + delivery |
| currency | `currencyCode` | default `INR` (P1.7.6 Currency reference unchanged) |
| created time | `placedAt` / `createdAt` | `placedAt` set at creation |

## 4. Source → target OrderItem mapping

`OrderItem` uses **historical snapshots** so an order stays correct if the catalog changes later.

| Legacy item | Target `OrderItem` | Notes |
|---|---|---|
| menu item ref | `menuItemId?` | optional; if set, **must belong to the order's restaurant** |
| item name | `nameSnapshot` | required snapshot |
| variant | `variantSnapshot?` | optional snapshot |
| unit price | `unitPriceMinor` (BigInt) | ≥ 0 |
| quantity | `quantity` (Int) | positive integer |
| line total | `lineTotalMinor` (BigInt) | **computed** = `unitPriceMinor × quantity` |
| add-ons | `addOns?` (Json) | preserved as-is (no add-on redesign) |
| customization | `customization?` (Json) | preserved as-is |
| currency | `currencyCode` | inherits order currency |

## 5. OrderStatus mapping (1:1)

`INITIAL, PENDING, CONFIRMED, PREPARING, PACKING, READY, ON_THE_WAY, DELIVERED, COMPLETED, CANCELLED, RETURNED` — identical set to legacy `ORDERSTATUS` (cosmetic renames only). Numeric `5 → ON_THE_WAY`, `6 → DELIVERED` are represented on this same `status` field.

## 6. Transition rules

Enforced graph (invalid transitions rejected; terminal states have no outgoing edge):

```
INITIAL     → PENDING | CANCELLED
PENDING     → CONFIRMED | CANCELLED
CONFIRMED   → PREPARING | CANCELLED
PREPARING   → PACKING | READY | CANCELLED
PACKING     → READY | CANCELLED
READY       → ON_THE_WAY | COMPLETED | CANCELLED   (delivery vs pickup/dine-in)
ON_THE_WAY  → DELIVERED                             (rider advances SAME field)
DELIVERED   → COMPLETED | RETURNED
COMPLETED   → (terminal)
CANCELLED   → (terminal)
RETURNED    → (terminal)
```

- **Actors.** Every transition records the caller (`actorType='STAFF'`, `actorId=staffMemberId`). Fine-grained per-actor authority (merchant vs rider vs system/cron vs external provider) is **documented for later integration** — the rider PATCH path and system/cron transitions belong to the deferred delivery/realtime slices — and is **not** invented here. This slice enforces the **transition graph + merchant tenancy**; it does not grant unrestricted mutation.
- **No auto-advance.** Creation establishes `INITIAL` only; it does not auto-transition (legacy transitions happen in later steps/payment).

## 7. OrderStatusEvent semantics

Uses the existing `OrderStatusEvent` (`fromStatus?`, `toStatus`, `actorType?`, `actorId?`, `reason?`, `createdAt`). Every canonical change records an event:

- **Creation** → one event `fromStatus=null → toStatus=INITIAL`.
- **Each transition** → `fromStatus=<current> → toStatus=<next>`.

Events are read `orderBy createdAt asc`, so the full status sequence is **reconstructable** and `previous_status` (legacy) is captured as `fromStatus`.

## 8. Ownership & tenancy

Ownership chain: **Merchant → Restaurant → Order** and **User → Order** (optional). `merchantId` is always **derived from the restaurant**, never trusted from request input.

- Merchant staff operate **only within their merchant**; creating/transitioning against another merchant's restaurant → `403` (P1.7.2 `MerchantScopeService.assertRestaurantInScope`).
- `SUPER_ADMIN` is platform-scoped and targets a restaurant explicitly (no act-as/switching).
- An order cannot be created against a restaurant of another merchant. Unknown restaurant → `404`.

## 9. Authorization

Reuses P1.7.1F staff authorization + P1.7.2 tenancy — no new auth. Operations take a `StaffPrincipal` (merchant-scoped or platform). Customer-side self-placement (consumer principal + cart) is **deferred**; the create service can attribute an order to a customer via optional `userId`.

## 10. Money

Exact integer minor units (`BigInt`), no floating point:

```
lineTotalMinor  = unitPriceMinor × quantity
subtotalMinor   = Σ lineTotalMinor
grandTotalMinor = subtotalMinor − discountTotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor
```

`grandTotalMinor` is **derived** to satisfy the existing DB `order_total_integrity` CHECK; a negative grand total (discount exceeds subtotal + charges) is rejected. Tax/discount/fee/delivery are accepted as already-resolved order-level components (no tax-engine, no payment calc, no FX).

## 11. Transaction boundary

- **Creation is atomic:** `Order` + all `OrderItem`s + the initial `OrderStatusEvent` are written in one `prisma.$transaction`. An order can never exist without its items/initial history; a duplicate `orderNumber` fails the whole unit (no partial write — verified by test).
- **Each transition is atomic:** the `Order.status` update + the new `OrderStatusEvent` are one transaction.
- Payment/delivery operations are explicitly **out of scope** and get no transaction here.

## 12. Idempotency / duplicates

Legacy has no dedicated idempotency framework; the order carries a reference. The target `Order.orderNumber @unique` is reused as the natural duplicate guard: the caller supplies `orderNumber` (from the resolved order reference) and a duplicate is rejected at the DB. No client-id/idempotency-key framework was invented.

## 13. Schema discipline

**No schema change; no migration.** `Order`/`OrderItem`/`OrderStatusEvent` and the `OrderStatus`/`OrderType`/`PaymentStatus`/`FulfillmentStatus` enums already cover every field. Historical migrations are unchanged (6 migrations, `migrate status` up to date).

## 14. APIs / services / repositories

`apps/api/src/modules/ordering/` (wired into `AppModule`; imports `MerchantModule` + `CatalogModule`):

- `domain/ordering.types.ts` — `CreateOrderInput`, `CreateOrderItemInput`, `OrderRecord`, `OrderItemRecord`, `OrderStatusEventRecord`, status/type unions.
- `infrastructure/order.repository.ts` — `createOrderWithItems` (tx), `findById`, `updateStatusWithEvent` (tx).
- `application/order.service.ts` — `createOrder`, `transitionStatus`, `getOrder` (tenancy + item validation + money + transition graph).
- `ordering.module.ts` — providers/exports.

No controllers/endpoints were added (frontend migration deferred); the foundation is a service/repository layer other slices compose.

## 15. Tests (10 new; 210 → 220)

`apps/api/test/ordering-foundation.e2e-spec.ts` (real TEST DB):

1. valid order creation — relationships, initial `INITIAL`, item snapshots + line totals, exact BigInt subtotal/tax/discount/**grand**; `paymentStatus=CREATED`/`fulfillmentStatus=UNFULFILLED` remain separate.
2. `menuItemId` must belong to the order's restaurant (cross-restaurant item rejected; same-restaurant accepted).
3. missing/invalid references rejected (unknown restaurant `404`, empty items `400`, bad type `400`).
4. negative grand total (discount > subtotal + charges) rejected.
5. merchant staff create within own merchant; cross-merchant create `403`.
6. `SUPER_ADMIN` explicit target; `merchantId` server-derived.
7. full delivery lifecycle INITIAL→…→ON_THE_WAY→DELIVERED→COMPLETED; **9 ordered events**, `fromStatus` chain correct, reconstructable sequence, rider states on `OrderStatus`.
8. invalid transition (INITIAL→DELIVERED) and out-of-terminal (CANCELLED→CONFIRMED) rejected.
9. tenancy enforced on transitions (cross-merchant `403`).
10. creation transactional + duplicate `orderNumber` rejected with **no partial write** (exactly one order, items + 1 event intact).

## 16. Validation

- `npm test` → **220/220** (28 suites; 210 prior + 10 new; all prior suites green).
- `npm run build` → ✓ (nest build).
- `npm run lint` → ✓.
- `npm run format:check` → ✓.
- `npx prisma validate` → ✓; `npx prisma migrate status` → up to date (6 migrations, unchanged).

## 17. Explicitly deferred

Cart write workflow; payment (Razorpay/wallet/UPI/pay-later/refunds/capture/settlement/direct-merchant); delivery providers (Dunzo/Porter/own-rider), rider assignment/live tracking, `DeliveryTask` orchestration; POS/PetPooja; Socket.IO realtime; notifications; ONDC; frontend migration; Mongo import/backfill; tax-engine redesign; generic workflow/state-machine engine; per-actor (rider/system/provider) status authority; customer self-service placement.

## 18. Remaining UNKNOWNs / owner decisions

- Precise per-actor transition authority (which role may perform which transition) and system/cron-driven transitions — resolved with the delivery/realtime + RBAC-catalogue slices.
- Whether canonical orders originate exclusively from Cart (order-origination) — traced but Cart write is deferred; the create service accepts already-resolved input.
- Payment/delivery **value** mapping (legacy numeric `payment_status`/method → `PaymentStatus`/delivery models) — separate slices.

## 19. Downstream readiness & recommended next slice

The Order foundation is structurally ready for later Cart (origination), Payment status mapping, Delivery task orchestration, POS, and realtime — none of which are blocked by it. **Recommended next slice:** the **Cart write foundation** (order-origination) or the **Payment/Delivery status-value mapping**. Seating (`table_setup`) and Discovery (Mood/Craving) remain blocked by their own owner decisions.
