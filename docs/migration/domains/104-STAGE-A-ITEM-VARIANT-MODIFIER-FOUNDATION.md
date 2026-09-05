# 104 — Stage A: Canonical Item → Variant → Modifier Foundation

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing forensic:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Gap matrix:** [103-CORE-COMMERCE-GAP-MATRIX.json](./103-CORE-COMMERCE-GAP-MATRIX.json)  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)

This slice establishes the first L4 product foundation. It does **not** implement Stage B–J, tax, fees, promotions Phase 2, combos, or Celebration Packages.

---

## CURRENT TARGET → CHANGE → REASON

| Current target | Change | Reason |
|---|---|---|
| `MenuItem` | Reused unchanged | Already the commercial product identity. Publication (`isPublished`) ⊥ stock (`availability`). |
| `ItemVariant` | Additive optional `sku` | Variant is the sellable SKU; size remains the evidenced label. No apparel/alcohol enforcement. |
| `ItemChannelConfig` | Reused unchanged | Channel enable + item-level price override still apply to the **variant base**. Per-variant channel price stays deferred (doc 47). |
| `AddOnGroup` | Additive `allowQuantity`, `available`, `sortOrder` | Express quantity behavior, group availability, display order without inferring rules from names. `minSelect`/`maxSelect` remain the required / min / max / single-vs-multi contract (`required ⇔ minSelect ≥ 1`, `single ⇔ maxSelect === 1`). |
| `AddOn` | Additive `available`, `isDefault`, `sortOrder` | Modifier availability, defaults, order. `priceMinor` is the **default adjustment**, not a child SKU price. |
| *(none)* | New `AddOnVariantPrice` | Explicit Small/Medium/Large Pepperoni overrides. Not JSON. Not three products. |
| `CartService.price` | Quotes variant + validated modifiers | Variant-only cart totals were incompatible with Stage A. |
| `CheckoutService` line unit | Uses the same merchandise quote | Prevents cart/checkout money divergence. No tax/fee/promo change. |
| `CartItem.addOns` / `OrderItem.addOns` JSON | Canonical `merchandise.v1` snapshot | Structured `{groupId, selections[{modifierId, quantity}]}`. Flat addon ids rejected. |
| `PromotionEvaluationService` | Untouched | Phase 1 remains isolated. |
| `platform-catalog/` | Untouched | Materialization still copies into `MenuItem`. Later: copy new modifier fields + variant prices (see § Materialization). |

---

## Contract

```
Item (MenuItem)
  └── Variant (ItemVariant)                    sellable size / SKU
        └── applicable Modifier Groups (AddOnGroup)
              └── Modifiers (AddOn)
                    └── optional AddOnVariantPrice per variant
```

**Merchandise formula (integer minor units):**

```
unitMerchandiseMinor = variantPriceMinor + Σ (modifierPriceMinor × modifierQty)
lineMerchandiseMinor = unitMerchandiseMinor × lineQuantity
```

`variantPriceMinor` is the catalog variant price, or `ItemChannelConfig.priceOverrideMinor` when that channel row exists.

Clients send identities and quantities only. Any client money field is ignored or rejected.

Unpriced taste sliders remain in `customization` JSON and are not priced.

---

## API

**Merchant catalog (existing paths, extended bodies)**

- `POST/PATCH /catalog/items`, variants, add-on-groups, add-ons accept the new fields.
- `POST /catalog/add-ons/:addOnId/variant-prices` `{ variantId, priceMinor }` upserts an override. Variant must belong to the same item.

**Consumer**

- `GET /discover/items/:id` includes `modifierGroups` (required/singleSelect derived from min/max).
- `POST /discover/quote` `{ variantId, quantity, type?, modifierGroups }` → authoritative merchandise quote.
- `POST /cart/items` `{ variantId, quantity, type?, modifierGroups, customization? }` — no prices. Flat `addOns: [id]` → 400.

Canonical payload:

```json
{
  "variantId": "…",
  "quantity": 1,
  "modifierGroups": [
    { "groupId": "…", "selections": [{ "modifierId": "…", "quantity": 1 }] }
  ]
}
```

---

## Order snapshot (documented, not redesigned)

`OrderItem` still stores:

- `variantSnapshot` = size label
- `unitPriceMinor` = **unit merchandise** (variant + modifiers)
- `addOns` = `merchandise.v1` snapshot (group/modifier ids, qty, server price strings)

**Future (not this stage):** typed order-line modifier rows so historical reports do not depend on JSON, and so variant price vs modifier adjustments can be queried separately.

---

## Global catalog materialization (later)

`platform-catalog` is unchanged. Future materialize must copy:

- variant `sku`
- group `minSelect` / `maxSelect` / `allowQuantity` / `available` / `sortOrder`
- modifier `priceMinor` / `available` / `isDefault` / `sortOrder`
- `AddOnVariantPrice` rows after local variants exist

Lineage remains copy, not live inheritance.

---

## Out of scope (confirmed)

Celebration Packages / Celebrations / Occasions / Festivals. Combos/bundles. Tax / GST / fees / surcharges. Promotion Phase 2. Upsell / cross-sell / AI. Recipe BOM. Apparel/alcohol enforcement. Delivery pricing.

---

## Validation (Stage A stop)

- Domain unit tests: `merchandise-configuration.spec.ts` (20 cases) + catalog/controller/service specs + promotion kernel specs — pass.
- Stage A e2e: `stage-a-merchandise.e2e-spec.ts` — pass (quote, tenant isolation, cart ignore client money, flat payload 400, schema CHECK/unique).
- Regression e2e: `menu-item-write`, `menu-catalog`, `consumer-discovery`, `consumer-ordering-payment`, `consumer-experience-slice` — pass.
- `npx tsc --noEmit` in `apps/api` — pass.
- Full-repo `turbo test` / lint was **not** claimed green.

Invalid merchandise payloads (including flat addon ids) map to HTTP 400 via `MerchandiseQuoteService`. Default required-group selections appear in the quote before optional toppings; assertions match by modifier id, not array index.

**Stop.** Stage B (Menu + Merchant Catalog consistency) waits for explicit GO.

---

## Part L — UX adaptation map

Target UX follows the canonical contract, not frozen legacy visual parity. The UI is never the price/validation authority.

Existing target apps: `apps/web` (consumer) and `apps/merchant` (order operations only). There is **no** Super Admin or Merchant catalog UI in the TurboRepo yet.

### Consumer / User (`apps/web`)

| Surface | Class | Stage A action |
|---|---|---|
| Item: variant/size selection | **IMPROVE** | Replaced `<select>` with design-system chips. Size remains the evidenced variant axis. |
| Item: modifier groups + rules | **CORRECT** / **NEW** | Legacy/target item page sent variant only. Required groups would now 400. Screen now configures groups, respects required/min/max/single/multi/qty/availability in UX, and submits structured `modifierGroups`. Server still validates. |
| Item: live merchandise price | **CORRECT** | Catalog variant price is no longer presented as the payable total. `POST /discover/quote` is the displayed merchandise price. Client never sends money. |
| Restaurant list starting price | **IMPROVE** | Shows “From …” / Customize when variants or modifier groups exist. Does not add-to-cart from the list. |
| Cart line merchandise | **IMPROVE** | Still server-priced. Shows modifier adjustment + selected-option count from `merchandise.v1`. |
| Checkout / payment / tip / tax | **PRESERVE** | Unchanged. Existing checkout engine; this slice does not invent rates. |
| Guest cart | **FUTURE** | Still sign-in required. |
| Full customization sheet / photos / taste sliders | **FUTURE** | Unpriced `customization` JSON remains available; no UI yet. |

### Merchant Catalog / Menu Management (`apps/merchant`)

| Surface | Class | Stage A action |
|---|---|---|
| Order list / kitchen transitions | **PRESERVE** | Out of Stage A. No catalog screens exist here. |
| Item / variant / modifier authoring | **NEW** | Required later: create item, variants, modifier groups, selection rules, defaults, availability, channel config. |
| Variant-specific modifier pricing | **NEW** | Required later: explicit override UI (`POST /catalog/add-ons/:id/variant-prices`). Do not encode prices in names. |
| Standard vs Custom Menu | **FUTURE** | Stage B. Same orderability rules on both surfaces. |
| Combo / package / celebration config | **FUTURE** | Later stages. |

Do **not** build a merchant catalog SPA in this slice. The write API is the contract those screens will use.

### Super Admin Global Catalog

| Surface | Class | Stage A action |
|---|---|---|
| Global catalogue / item admin | **FUTURE** | `apps/api` `platform-catalog` is unchanged. No target Super Admin app exists. |
| Global variants + reusable modifier groups | **NEW** | Later Super Admin must author variants and modifier groups (not flatten modifiers into child SKUs). |
| Materialize → merchant catalog | **PRESERVE** (lineage) / **NEW** (fields) | Copy, not live inheritance. Later copy: variant `sku`, group rules, modifier defaults, `AddOnVariantPrice`. |

### Design system

Consumer Stage A uses existing `apps/web` tokens, Inter, Chip/Button/Card/Banner/Badge. No legacy visual clone.
