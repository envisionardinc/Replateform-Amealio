# 06 — Money & Pricing Model

How the target represents monetary values. **No floating point.** India-first (INR/GST); no US/USD behavior assumed. Design only.

## Core rules
- **Store money as integer minor units** (INR paise; `amount BIGINT` + `currencyCode CHAR(3)`), never `float`/`double`/`numeric-as-float`. Legacy stored some amounts loosely (see P1.1 [05](../india-baseline/05-DATA-MODEL.md)); this is corrected.
- **Currency:** `currencyCode` default `INR` for the India baseline; carried on every monetary aggregate (order, transaction, settlement, payout, refund). Market-driven ([`localization-strategy.md`](../../architecture/localization-strategy.md)).
- **Precision:** minor units (2 decimal → paise). **Rounding:** apply a single documented rounding rule (half-up to paise) at computation boundaries; store already-rounded integers.
- **No implicit currency conversion** in the baseline (single currency).

## Amount fields (conceptual)
| Concept | Representation |
|---------|----------------|
| Item price | `ItemVariant.price` (minor units) + currency; per-channel override in `ItemChannelConfig.priceOverride` |
| Order line total | `OrderItem.unitPrice`, `quantity`, `lineTotal` (minor units) |
| Order totals | `Order.subtotal`, `taxTotal`, `discountTotal`, `feeTotal`, `deliveryChargeTotal`, `grandTotal` (all minor units) |
| Taxes | structured **tax lines** (see below), not a single float |
| Discounts | `discountTotal` + link to applied `Coupon`/`Offer` + per-line discount where applicable |
| Fees / surcharges | itemized (`OrderCharge`/line fees), minor units |
| Delivery charge | `deliveryChargeTotal` + optional breakdown |
| Payment amount | `PaymentIntent.amount` / `PaymentAttempt.amount` (minor units) |
| Refund | `Refund.amount` (minor units), ≤ captured |
| Settlement / payout | `Settlement.amount`, `Payout.amount` (minor units) |
| Wallet | `Wallet.balance`, `WalletEntry.amount`, `balanceAfter` (minor units) |

## Tax representation (India GST)
- Represent tax as **structured tax lines** on the order (and where needed on items), e.g. `OrderTaxLine(type, rate, taxableAmount, taxAmount)` with GST components (CGST/SGST/IGST) — **the exact GST breakdown fields must follow the baseline's actual computation** (`ordering` `gstAmount`, menu-category tax config). The **precise India tax rules/rates are baseline-driven**; treat any rate/rule not evidenced as **owner/data confirmation** rather than inventing.
- Store computed tax amounts as integers (minor units); keep the rate for audit.

## Discount representation
- `discountTotal` on the order + `AppliedOffer`(orderId, offerId/couponId, amount, scope). Per-line discount optional. Preserve offer settlement type (VENDOR/ADMIN/SPLIT) for settlement math.

## Rounding & totals integrity
- Compute line totals → sum → apply order-level discounts/taxes/fees → `grandTotal`, with a **single rounding policy**; enforce `grandTotal = subtotal - discountTotal + taxTotal + feeTotal + deliveryChargeTotal` via application + a data-integrity check ([15](./15-DATA-INTEGRITY-RULES.md)).

## Blocked / owner items
- Exact **GST component breakdown & rates** must reflect baseline behavior — confirm against production computation (not invented).
- Any **US/USD/Stripe** behavior is **out of scope** (deferred; owner-decision OD-7).

No monetary code/schema is implemented in this task.
