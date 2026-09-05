# 108 — Stage E: Promotion Phase 2 — Cart / Checkout Application + Redemption

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Promotion contract:** [101](./101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md)  
**Phase 1 kernel:** [102](./102-PROMOTION-EVALUATION-KERNEL.md) `41ec1fb`  
**Stage D quote:** [107](./107-STAGE-D-PRICING-TAX-FEES-SURCHARGES.md) `95b5d7f`  
**Accepted Stage C:** `d7eaae9`

This slice connects the existing Phase 1 evaluation kernel to the Stage D discount slot. It does **not** rebuild promotions, redesign pricing, start Combo, Celebration Packages, stacking, BOGO, delivery-fee promotions, audience segmentation, or campaign management.

---

## 1. Phase 1 kernel boundary

`PromotionEvaluationService.evaluate(context)` remains the **only** eligibility and discount quotation engine.

It stays:

- read-only
- deterministic
- server-side
- mutation-safe
- not responsible for `CouponRedemption` writes

`calculateDiscountMinor` remains the kernel's money function. Checkout/cart/order must not fork that math.

`composeCommercialQuote` remains the **only** commercial totals calculator. This slice only supplies `discountMinor`.

---

## 2. Phase 2 integration boundary

```
MerchandiseQuoteService            (Stage A — unchanged)
        ↓
PromotionEvaluationService         (Phase 1 — unchanged)
        ↓ discountMinor + promotion identity
composeCommercialQuote             (Stage D — discount slot)
        ↓
Cart / Discover quote              (no ledger write)
        ↓
Checkout → OrderService.createOrder
        ↓
COD / PAY_LATER: ACTIVE CouponRedemption in the order transaction
PREPAID: offerId/couponId on the order; ACTIVE at capture
        ↓
Order.commercialSnapshot.promotion + discount scalars
        ↓
PaymentIntent.amountMinor = grandTotalMinor
```

`PromotionApplicationService` is an adapter only: normalize code, call `evaluate()`, map public rejection codes, and return a discount for Stage D. It does not invent eligibility rules.

---

## 3. Quote behavior

`POST /api/v1/discover/quote` accepts optional `couponCode`.

- Trim + empty string = no code.
- Explicit valid code → `discountMinor` from the kernel; `promotion` identity on the response.
- Explicit invalid code → deterministic `400` with a public code. **Do not** silently apply an automatic promotion.
- No code → best eligible automatic promotion, or explicit zero discount (`NO_ELIGIBLE_PROMOTION` is not an error).
- Quote never writes `CouponRedemption`.

---

## 4. Cart behavior

`GET /api/v1/cart?couponCode=` (and cart mutations that accept the same optional query) re-evaluate against the current server merchandise subtotal.

The cart does **not** persist a calculated discount. The optional `couponCode` query is intent only. Consumer UI stores the typed code in `sessionStorage` and re-sends it. No `Cart.couponCode` column.

Removing the code re-quotes with discount `0` (or an automatic promotion if one is eligible).

---

## 5. Checkout behavior

Checkout still sends only `couponCode` intent.

`OrderService.createOrder`:

1. Builds server merchandise lines (already priced by checkout or staff snapshots).
2. Rejects caller tax/fee/delivery (Stage D).
3. **Consumer:** always evaluates via the kernel (code or automatic).
4. **Staff with `couponCode`:** evaluates via the kernel; invalid code fails closed.
5. **Staff without `couponCode`:** keeps the existing ad-hoc `discountTotalMinor` slot (POS/test). Does not surprise staff with automatic discounts.
6. Feeds `discountMinor` into `composeCommercialQuote`.
7. Snapshots `commercial.v1` including promotion identity.
8. Sets `Order.grandTotalMinor` from the quote.

Client discount / promotion id / eligibility are ignored.

---

## 6. COD / PAY_LATER redemption

Order create is the commercial commit.

If the applied promotion has a `couponId`, create exactly one `ACTIVE` `CouponRedemption` in the same transaction as the order.

If the transaction rolls back, there is no orphan redemption.

Code-less automatic promotions have no `Coupon` row. Discount still applies via `offerId` + snapshot. Ledger usage for those promotions remains FUTURE (Phase 1 already counted usage only when a coupon exists).

---

## 7. Prepaid redemption

`deferRedemption: true` when prepaid **and** a coupon was applied.

Order/payment-intent creation does **not** write `ACTIVE`.

`promoteOnPaymentCapture` (verify + webhook) commits exactly one `ACTIVE` row. Retries are idempotent via `(couponId, orderId)` unique and the existing `findFirst` guard.

Failed / abandoned prepaid: order stays `INITIAL`, no ACTIVE row, capacity free.

---

## 8. Idempotency

Existing `checkoutIdempotencyKey` replay returns the same order. No second redemption.

Payment verify / webhook retries call `promoteOnPaymentCapture`, which no-ops when a redemption already exists.

No new idempotency system.

---

## 9. Concurrency

Usage limits stay on derived `ACTIVE` counts plus the existing coupon row lock in `lockAndAssertRedemptionLimits`.

The kernel quote is not a reservation. Commit re-checks limits under the transaction.

No in-memory lock.

---

## 10. Cancellation

Unchanged: cancelling an order with an `ACTIVE` redemption marks it `REVERSED` in the same status transaction. Idempotent `updateMany`.

Prepaid cancel before capture: no ACTIVE row to reverse.

---

## 11. Refund

Unchanged: **full** refund reverses `ACTIVE`. Partial refund stays amount-only — no promotion clawback math.

---

## 12. Order commercial snapshot

`commercial.v1` gains optional:

```
promotion: {
  offerId, couponId, couponCode, title, source
} | null
```

plus existing `discountMinor` / taxable / tax / fee / grand.

Catalog or Offer edits after persist do not rewrite the snapshot.

---

## 13. Payment consistency

`PaymentIntent.amountMinor = Order.grandTotalMinor = commercialQuote.grandTotalMinor`.

The promotion discount is already inside that total. No separate promo-adjusted payment amount.

---

## 14. Consumer UX

Minimum cart + checkout field:

- enter / apply / validation / discount / updated total / clear / checkout

No Offers page. No browse carousel. No inapplicable promotions list.

Public codes:

`INVALID_CODE | NOT_ACTIVE | EXPIRED | NOT_YET_ACTIVE | MINIMUM_NOT_MET | MAXIMUM_EXCEEDED | NOT_ELIGIBLE | USAGE_LIMIT_REACHED | ALREADY_USED | SERVICE_TYPE_NOT_ALLOWED | RESTAURANT_NOT_ALLOWED | UNSUPPORTED_PROMOTION`

---

## 15. Deferred advanced features

Stacking, BOGO, Buy X Get Y, free item, free/delivery-fee promotions, unique-code batches, audience/first/lapsed, funding split, analytics, saved promotions, discovery carousel, dayparts, inheritance, global live sync, Combo, Celebration Packages.

Automatic promotions without a Coupon cannot consume the redemption ledger; usage caps for those are FUTURE.

---

## 16. Owner decisions

Unchanged and not required by this slice:

| ID         | Topic                     |
| ---------- | ------------------------- |
| OD-PROMO-1 | Stacking                  |
| OD-PROMO-2 | Audience / first / lapsed |
| OD-PROMO-3 | Promotion funding         |
| OD-PROMO-4 | Delivery-fee promotions   |
| OD-PROMO-5 | Saved promotions          |

---

## Error mapping (kernel → public)

| Kernel reason                             | Public code                |
| ----------------------------------------- | -------------------------- |
| `INVALID_CODE`                            | `INVALID_CODE`             |
| `PROMOTION_INACTIVE`                      | `NOT_ACTIVE`               |
| `PROMOTION_NOT_YET_VALID`                 | `NOT_YET_ACTIVE`           |
| `PROMOTION_EXPIRED`                       | `EXPIRED`                  |
| `BELOW_MINIMUM`                           | `MINIMUM_NOT_MET`          |
| `ABOVE_MAXIMUM`                           | `MAXIMUM_EXCEEDED`         |
| `USAGE_LIMIT_REACHED`                     | `USAGE_LIMIT_REACHED`      |
| `CUSTOMER_USAGE_LIMIT_REACHED`            | `ALREADY_USED`             |
| `INVALID_SERVICE_TYPE`                    | `SERVICE_TYPE_NOT_ALLOWED` |
| `NOT_FOR_RESTAURANT` / `NOT_FOR_MERCHANT` | `RESTAURANT_NOT_ALLOWED`   |
| `INVALID_BENEFIT`                         | `UNSUPPORTED_PROMOTION`    |
| other rejection with an explicit code     | `NOT_ELIGIBLE`             |

`NO_ELIGIBLE_PROMOTION` without a code is success with zero discount.
