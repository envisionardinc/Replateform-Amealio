# 107 — Stage D: Pricing / Tax / Fees / Surcharges

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Governing forensic:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Gap matrix:** [103-CORE-COMMERCE-GAP-MATRIX.json](./103-CORE-COMMERCE-GAP-MATRIX.json)  
**Stage A:** [104](./104-STAGE-A-ITEM-VARIANT-MODIFIER-FOUNDATION.md) `e993ae6`  
**Stage B:** [105](./105-STAGE-B-MENU-MERCHANT-CATALOG-CONSISTENCY.md) `2767212`  
**Stage C:** [106](./106-STAGE-C-AVAILABILITY-FOUNDATION.md) `d7eaae9`  
**Promotion Phase 1 kernel:** [102](./102-PROMOTION-EVALUATION-KERNEL.md) `41ec1fb`  
**Settlement baseline:** [63](./63-COMMISSION-BASIS-GST-RECONCILIATION.md) P1.7.34  

This slice creates **one canonical server-authoritative commercial quote**. It does **not** start Stage E, Promotion Phase 2, Combo, Celebration Packages, inventory, delivery pricing, or settlement redesign.

Legacy implementation is evidence, not authority. Industry practice is evidence, not authority. Do not reproduce legacy financial defects for parity.

---

## 1. L1 — Legacy Reality

Primary evidence: `amealio-vendordashboard` (`usercart.class.ts`, `ordering.class.ts`, `settlement.class.ts`, `menu-category.model.ts`, `ordering.model.ts`). Consumer client totals in `amealio_web_app` `OrderingCalculations.js` are already classified CORRECT-not-to-copy (docs 52 / 90).

### 1.1 Pricing path (recovered)

```
vendorItems channel/size price
  + addon option prices (often client-assembled)
  → line finalPrice × quantity          (merchandise / base_amount)
  → calcDiscount on that subtotal
  → splitTaxes on post-discount line amounts
  → surCharges (non-tax names + subscription flatCharges)
  → delivery (often also written into surCharges)
  → total_amount
  → order snapshot: order_items, base_amount, total_amount,
                    gstAmount, surCharges, tax_amount, gstTaxes
```

- Base / variant / size: per-channel `{value, sizes[], sur_charges[]}` on `vendorItems`.
- Modifier: addon option prices; V2 mapper drops size-specific `multipleSize`.
- Quantity: `finalPrice × quantity`.
- Combo: separate `comboPrice` / `listPrice` / `packingCharges` — **deferred to Stage F**. Not implemented here.
- Rounding: server `.toFixed(2)` (rupee decimals, IEEE float). Vendor MVP sometimes integer-rounds. **Unsafe.**
- Historical orders store names/prices/addons loosely; later catalog edits do not reprice those rows, but tax/fee meaning is reconstructable only from opaque maps.

### 1.2 What legacy calls “tax”

`splitTaxes` (`usercart.class.ts` ~250–327):

1. Starts from **post-discount** line amounts (`getDiscountPrice`).
2. Walks each line’s `sur_charges[]`.
3. Optionally rewrites a charge name via `subscription_tax_code` when the name has no `-`.
4. Classifies by the **last whitespace token** of the (rewritten) name: if it is `"tax"` (case-insensitive) the charge stays in `gstAmount`; otherwise the name is a `chargeKey` and later moves to `surCharges`.
5. `PERCENTAGE` → `(postDiscountLine × value / 100).toFixed(2)`.
6. Else flat → `(value × quantity).toFixed(2)`.

Subscription flags `menu_price_include_price` / `add_tax_on_price` / `tax_code` and category `price_include_tax` **exist as settings and are not used** by `splitTaxes`. Inclusive vs exclusive GST is therefore **not actually calculated**.

`gstTaxes` (order create ~2017–2026): sum of `gstAmount` keys whose code token is `CGST`, `SGST`, or `GST`. Settlement subtracts `gstTaxes`. **It is a settlement/reporting artifact**, not an independent tax engine.

`tax_amount` (order create ~1919–1938): **sum of `gstAmount` plus `surCharges`**. Government tax and fees are mixed in one field.

### 1.3 What legacy calls a “fee” / “surcharge”

| Artifact | Actual meaning | Customer payable? |
|---|---|---|
| Item `sur_charges` named `* tax` | Treated as GST via name token | Yes, via `gstAmount` |
| Item `sur_charges` not named `* tax` | Folded into `surCharges`, then often into `tax_amount` | Yes |
| Subscription `tax_values` + `flatCharges` | Flat per order type, stored as surcharge | Yes |
| Packaging / packing | Combo / PetPooja POS fields; not a first-class cart engine | Sometimes POS-only |
| Delivery | Dedicated calc **and** `surCharges["Delivery Charges"]` (duplicated, later stripped from API) | Yes |
| Convenience / platform / restaurant / channel / payment / min-order fees | Words appear; no complete typed customer-fee engine | Unclear / incomplete |
| `gatewayCharges` / `outgoingCharges` | Payout deduction | No (settlement) |
| Tip / donation | Outside merchandise; separate payout | Collected separately |

There is **no** authoritative fee type, recipient, tax treatment, or refund allocation.

### 1.4 Discount vs tax ordering (legacy)

Discount is applied **before** `splitTaxes`. Tax (such as it is) is computed on the post-discount merchandise line. This is the recovered customer-payable sequence, not a GST-law determination.

### 1.5 Client vs server

- Legacy cart/order services compute `splitTaxes` on the server **from client-shaped line prices and charge names**.
- Legacy consumer app also computed totals client-side (doc 90) — already rejected.
- Target before this slice: Stage A merchandise is server-authoritative; **`OrderService` still accepted caller `taxTotalMinor` / `feeTotalMinor` / `deliveryChargeMinor`**. Checkout did not send them, so they defaulted to 0. Staff/test fixtures could still inject tax/fee into the payable total.

### 1.6 Refunds and settlement (legacy)

- Refund = captured RAZORPAY/WALLET minus donation; **no GST-line refund split**.
- Settlement payout deducted `gstTaxes` (name-token GST only) plus gateway/outgoing, tips, donations, ADMIN reimbursement, adjustments, commission.
- Target P1.7 settlement is already the corrected minimal model: `gross = captured net of refunds`, `commission` on P1.7.34 basis, `net = gross − commission`. **Do not reopen.**

### 1.7 Current target before Stage D

| Surface | Behavior |
|---|---|
| `MerchandiseQuoteService` | Variant + modifiers only. No tax/fee/discount. |
| Cart | Merchandise subtotal. Unavailable lines excluded. |
| Checkout | Re-quotes merchandise; does not pass tax/fee. |
| `OrderService.createOrder` | `grand = subtotal − discount + tax + fee + delivery` with **caller tax/fee/delivery**. Coupon discount via existing `offer-discount.ts`, **not** `PromotionEvaluationService`. |
| Payment | `PaymentIntent.amountMinor = Order.grandTotalMinor`. |
| Refund | Against captured amount. No tax/fee allocation. |
| Settlement | P1.7.34. Tax/fee columns excluded from commission basis. |
| `ItemChannelConfig.surcharges` | Opaque `Json`. Not an engine. |
| Tax classification | **None.** No HSN, tax code, jurisdiction, or rate table. |
| Tip / donation | Outside grand total. Unchanged. |

---

## 2. L2 — Industry Benchmark

Modern commerce/POS practice (Toast-style POS, Stripe Tax / Avalara-style engines, large marketplace checkout):

1. **One server `/prices` (or quote) path** shared by cart, checkout, and order create.
2. **Line-level merchandise** first; promotions next; tax on an explicit taxable base; fees as typed lines; grand total last.
3. **Tax class / jurisdiction / rate table** — never a display-name suffix.
4. **Inclusive vs exclusive is an explicit policy**, not an unused flag.
5. **Fees have type, basis, recipient, taxability, visibility, refund treatment.**
6. **Historical orders snapshot** lines, taxes, fees, and promotions. Catalog edits do not rewrite history.
7. **Refunds** either allocate across components or refund a captured amount with a documented allocation engine. Partial component allocation is a dedicated financial product.
8. **Settlement** consumes the same breakdown the customer paid, or an explicit mapped ledger — not a second name-token GST sum.

Use industry practice only to identify safer architecture and missing controls. Do not copy another platform’s GST rates or fee catalog.

---

## 3. L3 — Gap Matrix

| ID | Gap | Class | Stage D action |
|---|---|---|---|
| G-PRICE-1 | Legacy / client totals | **CORRECT** | Client money never authoritative |
| G-PRICE-2 | Reprice at order create from catalog | **IMPROVE** | Checkout quotes then snapshots; later catalog edits do not mutate the order |
| G-PRICE-3 | BigInt minor units | **PRESERVE** | Keep |
| G-TAX-1 | Name-token `"tax"` | **CORRECT** | Not copied. No name-based classification in the canonical path |
| G-TAX-2 | Fees mixed into `tax_amount` | **CORRECT** | Separate `taxes[]` and `fees[]` |
| G-TAX-3 | `gstTaxes` settlement artifact | **IMPROVE** / **FUTURE** | Do not rebuild settlement on GST keys. Snapshot exists for a later settlement consumer |
| G-TAX-4 | Inclusive vs exclusive unused | **OWNER DECISION** | Exclusive is the only implemented mode if a typed rule exists. Inclusive not activated |
| G-TAX-5 | No authoritative tax class / rate | **OWNER DECISION** | Do not invent GST rates. No tax charged without a typed rule |
| G-FEE-1 | Opaque `surcharges Json` | **CORRECT** | Ignored. Never charged |
| G-FEE-2 | Packaging / convenience / payment / min-order | **OWNER DECISION** / **FUTURE** | Not invented |
| G-FEE-3 | Delivery pricing | **FUTURE** | Existing `deliveryChargeMinor` stays 0; non-zero caller delivery rejected |
| G-DISC-1 | Discount vs tax order | **PRESERVE** | Discount before tax (legacy evidence + industry default) |
| G-DISC-2 | Promotion Phase 2 | **FUTURE** | Quote has an explicit discount slot; kernel stays isolated |
| G-SNAP-1 | Loose order snapshot | **IMPROVE** | Additive `commercial.v1` snapshot + existing scalars / merchandise.v1 |
| G-PAY-1 | Payment = grand total | **PRESERVE** | `PaymentIntent.amountMinor = grandTotalMinor` |
| G-REF-1 | Refund vs captured | **PRESERVE** | No allocation engine invented |
| G-SET-1 | P1.7 settlement | **PRESERVE** | No tax/fee deductions added |

---

## 4. L4 — Target Contract

### 4.1 One path

```
MerchandiseQuoteService          (Stage A — unchanged formula)
        ↓
composeCommercialQuote           (this slice — the only totals calculator)
        ↓
Cart / Discover quote / Checkout / OrderService.createOrder
        ↓
Order scalars + commercial.v1 snapshot
        ↓
PaymentIntent.amountMinor = grandTotalMinor
```

There is no second cart, checkout, tax, or merchant pricing implementation.

### 4.2 Financial calculation sequence

```
unitMerchandiseMinor     = variantPriceMinor + Σ(modifierPriceMinor × modifierQty)
lineMerchandiseMinor     = unitMerchandiseMinor × lineQuantity
merchandiseSubtotalMinor = Σ lineMerchandiseMinor

discountMinor            = explicit slot (see §4.4); 0 ≤ discount ≤ merchandiseSubtotal
taxableSubtotalMinor     = merchandiseSubtotalMinor − discountMinor

taxes[]                  = typed rules only; otherwise []
taxTotalMinor            = Σ taxLine.amountMinor

fees[]                   = typed rules only; otherwise []
feeTotalMinor            = Σ feeLine.amountMinor

deliveryChargeMinor      = 0 in this slice (delivery pricing FUTURE)

grandTotalMinor          = taxableSubtotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor
```

Tips and donations remain **outside** this equation (existing tip policy).

### 4.3 Absolute rules

1. Client totals are never authoritative.
2. Client `subtotal` / `tax` / `fee` / `surcharge` / `discount` / `grandTotal` do not determine payable.
3. Server derives money from catalog + server-owned rules.
4. Integer minor units / BigInt only. No floating point.
5. Deterministic rounding (see §8).
6. Do not classify tax by parsing display names.
7. Do not mix taxes and fees.
8. Do not put fees inside tax totals or taxes inside merchandise subtotal.
9. Do not charge from `ItemChannelConfig.surcharges`.
10. Do not invent GST rates, CGST/SGST/IGST splits, or speculative fees.
11. Missing **required** tax/fee configuration fails closed. Absence of any tax/fee rule means tax/fee are **explicitly zero** — classification is not required until an owner provides a typed rule.
12. Invalid configuration fails closed. No silent zero-tax fallback when a rule is present but invalid.

---

## 5. Tax semantics

**Source of classification (missing today):** the current baseline has no HSN, tax code, jurisdiction, product class, or rate table. That dependency is **OD-TAX-CLASS**.

**Smallest safe decision:** do not charge tax until a typed `TaxRule` exists. Production Stage D loads **no tax rules**. The quote still returns `taxes: []` and `taxTotalMinor: 0`.

If a typed rule is supplied (domain / future authoring):

| Field | Rule |
|---|---|
| `code` | Explicit tax code. Never inferred from a name |
| `rateBps` | Integer basis points. `rateBps < 0` or missing → `TAX_CONFIGURATION_INVALID` |
| `mode` | Only `EXCLUSIVE` is implemented. Any other mode → `TAX_CONFIGURATION_INVALID` |
| Tenancy | Rule `merchantId`/`restaurantId` must match the quote. Else `CROSS_TENANT_PRICING_RULE` |

**Exclusive (implemented):** `tax = floor(taxableSubtotalMinor × rateBps / 10000)`.

**Inclusive:** **OWNER DECISION (OD-TAX-INCL)**. Not implemented. Legacy inclusive flags were unused; do not activate them.

**Taxable base:** post-discount merchandise, including modifier amounts (legacy taxed `finalPrice`, which included addons). Fees are **not** in the taxable base (fee tax treatment is OD; default `NONE`). Delivery is not taxed (delivery pricing FUTURE).

**No CGST/SGST/IGST split** is invented.

---

## 6. Fee / surcharge semantics

Do **not** preserve legacy `surcharges Json` as an engine.

Production Stage D loads **no fee rules**. Quote returns `fees: []` and `feeTotalMinor: 0`.

A future typed fee must have: type, amount, recipient, calculation basis, tax treatment, visibility, refund treatment, settlement treatment. Until those are decided, the fee is **OWNER DECISION** or **FUTURE**.

Domain allow-list (for fail-closed tests only; none are charged in production):

`PACKAGING | CONVENIENCE | SERVICE | PLATFORM | CHANNEL | PAYMENT | MINIMUM_ORDER`

Unsupported type → `UNSUPPORTED_FEE_TYPE`.  
Percent / rate-based fees → `FEE_CONFIGURATION_INVALID` (not implemented).  
`taxTreatment !== NONE` → `FEE_CONFIGURATION_INVALID`.  
Non-zero delivery on the quote → `DELIVERY_PRICING_NOT_IMPLEMENTED`.

Settlement treatment of any new customer fee is **OWNER DECISION**. This slice does not add fee deductions to P1.7 settlement.

---

## 7. Discount / tax ordering

```
gross merchandise → discount slot → taxable base → tax → fees → grand
```

Supported by legacy `getDiscountPrice` then `splitTaxes`, and by industry exclusive-tax practice.

**Promotion Phase 2 is not started.** `PromotionEvaluationService.evaluate()` is not called from catalog, cart, checkout, payment, or order create.

The discount slot is:

| Source | Stage D |
|---|---|
| Discover quote / cart | Always `0` |
| Checkout coupon code | Existing `offer-discount.ts` path (docs 52/53). Feeds the slot. **Not** the Phase 1 kernel |
| Staff `discountTotalMinor` without coupon | Existing ad-hoc slot (test/staff fixtures). Remains the slot input until Phase 2 replaces it |
| CouponRedemption writes | Unchanged. Stage D does not add new redemption writes |
| Offer/Coupon lifecycle | Unchanged |

Phase 2 must enter **only** at this slot.

---

## 8. Rounding

All money is `bigint` minor units.

| Operation | Rule |
|---|---|
| Merchandise | Exact integer products (Stage A) |
| Percent discount (existing) | `floor` / truncate toward 0 (`offer-discount.ts`) |
| Exclusive tax | `floor(base × bps / 10000)` |
| Multiple tax lines | Floor **per line**, then sum |
| Fee flat | Exact integer |
| Grand total | Exact sum of already-rounded components |

No half-even, no float, no `.toFixed(2)`.

---

## 9. Order snapshot

Historical orders must not depend on today’s catalog.

**Minimum immutable snapshot (this slice):**

- Existing `OrderItem`: identity, name, variant label, qty, `unitPriceMinor` (unit merchandise), `lineTotalMinor`, `addOns` = `merchandise.v1` (modifier ids, qty, server prices).
- Existing `Order` scalars: `subtotalMinor`, `discountTotalMinor`, `taxTotalMinor`, `feeTotalMinor`, `deliveryChargeMinor`, `grandTotalMinor`.
- Additive `Order.commercialSnapshot` (`commercial.v1`): lines, merchandise subtotal, discount, taxable subtotal, tax lines, fee lines, delivery, grand total, currency, schema.

Catalog price changes after persist **do not** mutate these fields.

Historical rows without `commercialSnapshot` keep their scalar totals. Do not reinterpret them.

Typed `OrderTaxLine` / `OrderFeeLine` tables are **FUTURE** (not required while production tax/fee are empty).

Persisted checkout-quote-before-order is **FUTURE** unless a later slice proves a hold/expiry need.

---

## 10. Refund implications

`RefundService` is unchanged. Refunds are against **captured `PaymentIntent.amountMinor`**, which equals the snapshotted grand total.

Full refund cannot exceed captured (existing).  
Partial refunds are amount-only; **no tax/fee/discount allocation engine** is invented. Documented as FUTURE if component-level refunds are required.

Existing refund tests must remain green.

---

## 11. Settlement implications

P1.7 baseline is **PRESERVE**:

```
gross      = captured amount net of refunds
commission = existing P1.7.34 basis (subtotal − merchant-funded discount)
net        = gross − commission
```

Do not subtract customer tax or fees from payout.  
Do not put tips/donations into this quote.  
Do not silently add GST-on-commission (still OD / docs 63).

---

## 12. Payment implications

`PaymentIntent.amountMinor = Order.grandTotalMinor` (server).  
Client total cannot alter the payment amount.  
Razorpay behavior unchanged beyond consuming that total.  
No payment-provider fee architecture.

---

## 13. API contract

`POST /api/v1/discover/quote` and cart/checkout/order serialization share this shape (stringified minor units on HTTP):

```json
{
  "schema": "commercial.v1",
  "currencyCode": "INR",
  "lines": [
    {
      "menuItemId": "…",
      "variantId": "…",
      "name": "…",
      "variantSize": "Large",
      "quantity": 1,
      "variantPriceMinor": "15000",
      "modifierTotalMinor": "1300",
      "unitMerchandiseMinor": "16300",
      "lineMerchandiseMinor": "16300"
    }
  ],
  "merchandiseSubtotalMinor": "16300",
  "discountMinor": "0",
  "taxableSubtotalMinor": "16300",
  "taxes": [],
  "taxTotalMinor": "0",
  "fees": [],
  "feeTotalMinor": "0",
  "deliveryChargeMinor": "0",
  "grandTotalMinor": "16300"
}
```

Existing Stage A merchandise fields on the discover quote remain (`unitMerchandiseMinor`, selections, …). Commercial fields are additive.

Empty tax/fee is `[]` / `"0"`, not null.

Cart also exposes these totals. Unavailable lines stay excluded from merchandise (Stage C).

Checkout DTO already forbids unknown money fields (`forbidNonWhitelisted`). `OrderService` rejects non-zero caller `taxTotalMinor` / `feeTotalMinor` / `deliveryChargeMinor` (`CLIENT_MONEY_NOT_AUTHORITATIVE`).

---

## 14. Merchant / Admin UX contract

Do **not** build catalog UI in this slice (`apps/merchant` remains order-ops).

| Control | Class | Backend enforced? |
|---|---|---|
| Variant price | PRESERVE (Stage A) | Yes |
| Modifier price / variant override | PRESERVE (Stage A) | Yes |
| Channel price override | PRESERVE (Stage A/C) | Yes |
| Tax classification / rate | NEW / OWNER DECISION | **No** — do not expose a control |
| Inclusive/exclusive toggle | OWNER DECISION | **No** |
| Fee configuration | OWNER DECISION / FUTURE | **No** |
| Opaque surcharge JSON editor | CORRECT — do not expose | Json ignored |

Super Admin Global Catalog: same. Materialization remains copy, not live inheritance. No tax/fee authoring.

---

## 15. Consumer UX contract

Adapt existing surfaces only:

| Surface | Class | Action |
|---|---|---|
| Item live quote | IMPROVE | Still server quote; show merchandise and grand (equal while tax/fee are 0) |
| Cart | IMPROVE | Items, Subtotal, Discount (if > 0), Tax, Fees, Total |
| Checkout | IMPROVE | Same breakdown; place-order sends identities only |
| Order detail | IMPROVE | Same breakdown from snapshotted scalars |
| Standard vs Custom | PRESERVE | Identical quote path (Stage B) |

No internal ledger jargon. Existing amealio tokens / Inter. No invented tax copy that implies GST was calculated.

---

## 16. Owner decisions

| ID | Decision | Stage D stance |
|---|---|---|
| OD-TAX-CLASS | Tax classification source (item / category / HSN / jurisdiction / tax code) | Missing. No rates invented |
| OD-TAX-INCL | Inclusive vs exclusive listed prices | Exclusive-only engine if a rule exists; inclusive not implemented |
| OD-FEE-WHO | Recipient / split of each customer fee | No fees charged |
| OD-PACKAGING | Customer packaging fee | FUTURE / OD |
| OD-PROMO-DELIVERY | Delivery-fee promotions | FUTURE (Phase 2 / delivery) |
| Settlement treatment of a future customer fee | Explicit OD | Not guessed |
| Component-level refund allocation | FUTURE | Amount-only refunds remain |

---

## 17. Deferred / future

- Promotion Phase 2 / coupon browse UX / BOGO / Buy X Get Y
- Combo / bundle pricing (Stage F)
- Celebration Packages
- Inventory / reservation
- Restaurant hours / scheduled availability
- Upsell / cross-sell / personalization / AI
- Delivery pricing
- Payment-provider fees
- Settlement redesign / gstTaxes consumer
- Persisted checkout quote hold
- Typed tax/fee line tables
- Inclusive tax
- Indian GST rate tables / CGST-SGST-IGST
- Global live catalog sync

---

## 18. Explicit non-goals

This slice does **not** implement Promotion Phase 2, coupon checkout redesign beyond the existing code path, BOGO, Combo, Celebration Packages, inventory, restaurant hours, upsell, cross-sell, personalization, AI/RAG, delivery pricing, a new payment provider, payment-provider fee architecture, settlement redesign, or global live synchronization.

---

## CURRENT TARGET → CHANGE → REASON

| Current target | Change | Reason |
|---|---|---|
| `MerchandiseQuoteService` | Unchanged; still merchandise-only | Stage A formula stays the merchandise layer |
| *(none)* | `composeCommercialQuote` + `CommercialQuoteService` | One totals path |
| Cart / discover quote | Add commercial totals | Same calculator as checkout |
| `OrderService.createOrder` | Totals from compose; reject caller tax/fee/delivery | Client/staff money must not set payable tax/fee |
| `Order.commercialSnapshot` | Additive JSON `commercial.v1` | Historical tax/fee/line quote |
| `ItemChannelConfig.surcharges` | Still stored; **never read** | Opaque Json is not an engine |
| `PromotionEvaluationService` | Untouched | Phase 1 remains isolated |
| Payment / Refund / Settlement / Tip | Unchanged contracts | Compatibility |

---

## Error codes (fail closed)

| Code | When |
|---|---|
| Stage C merchandise codes | Invalid variant / modifier / channel / orderability |
| `CLIENT_MONEY_NOT_AUTHORITATIVE` | Caller supplies non-zero tax/fee/delivery (or HTTP money fields) |
| `TAX_CONFIGURATION_INVALID` | Typed tax rule present but invalid |
| `FEE_CONFIGURATION_INVALID` | Typed fee rule present but invalid |
| `UNSUPPORTED_FEE_TYPE` | Fee type not in the allow-list |
| `CROSS_TENANT_PRICING_RULE` | Tax/fee rule restaurant/merchant mismatch |
| `DELIVERY_PRICING_NOT_IMPLEMENTED` | Non-zero delivery on the canonical quote |

Invalid pricing contexts fail closed. No silent client-price fallback.
