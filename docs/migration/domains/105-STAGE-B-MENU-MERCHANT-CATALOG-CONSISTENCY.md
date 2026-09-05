# 105 — Stage B: Menu + Merchant Catalog Consistency

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing forensic:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Stage A:** [104](./104-STAGE-A-ITEM-VARIANT-MODIFIER-FOUNDATION.md)  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)

This slice makes Standard and Custom menus share one server-authoritative orderability path. It does **not** start Stage C–J, tax, fees, combos, or Promotion Phase 2.

---

## CURRENT TARGET → CHANGE → REASON

| Current target | Change | Reason | Legacy evidence | Target rule |
|---|---|---|---|---|
| `GET /discover/restaurants/:id/menu` | Virtual `kind: STANDARD` assembly of published catalog items | Standard is not a Menu row | Virtual à-la-carte (doc 103) | No fake `_id=123456` / STANDARD placeholder |
| `Menu.type=STANDARD` rows | Ignored by consumer; still creatable for staff/experience tests | Persisted STANDARD ≠ consumer à-la-carte | Merchant could insert STANDARD Menu | Consumer Standard is always virtual |
| `Menu.type=CUSTOM` | Consumer list/detail endpoints | Custom Menu is a real merchant menu | Mongo Menu default CUSTOM | Visibility + restaurant ACTIVE + same item gates |
| `MenuItem.menuSectionId` | Custom Menu membership (reference, not clone) | Same catalog item identity | Custom referenced vendorItems | No menu-specific price in this stage |
| Discovery item/menu | Optional `type` + shared `orderability.ts` | Custom-by-id skipped channel filters | G-MENU-3 | Same channel/orderability on every path |
| `isPublished` vs `availability` | Preserved; `orderable` is derived | Published ≠ in stock ≠ orderable | Doc 103 | Sold-out can appear, not purchase |
| `platform-catalog` materialize | Copy Stage A snapshot from `source_payload.product` | Materialize dropped variants/modifiers | Copy, not live inheritance | Unpublished local copy; merchant publishes |
| `legacyId=123456` | Rejected on menu create | Placeholder Standard id | Legacy hard-coded id | Forbidden |

---

## Standard / à-la-carte

Virtual. Assembled at read time from restaurant catalog items that are `deletedAt=null` and `isPublished=true`.

`GET /api/v1/discover/restaurants/:id/menu?type=`

- `kind: "STANDARD"`
- No Menu row is created or required
- Items that also sit on a Custom Menu section still appear here (same catalog identity)

## Custom Menu

Real `Menu` (`type=CUSTOM`, `visibility=true`, not deleted).

- `GET /api/v1/discover/restaurants/:id/menus`
- `GET /api/v1/discover/menus/:menuId?type=`

Sections list catalog items via `MenuItem.menuSectionId`. Pricing remains the merchant catalog / Stage A quote. Hidden or STANDARD-typed menus are not consumer-visible.

**Limitation (FUTURE):** one item can belong to one section FK. Multiple Custom Menu membership needs a join table later.

## Resolution + orderability

```
Restaurant (ACTIVE)
  → Standard (virtual) OR Custom Menu (visible CUSTOM)
    → Section (custom only)
      → MenuItem (published)
        → Variant / modifiers
```

Shared rule (`catalog/domain/orderability.ts`):

```
visible    = !deleted && isPublished
on channel = visible && (no type OR ItemChannelConfig.enabled !== false)
orderable  = visible && AVAILABLE && channelAllowed && some variant.available
             && every required modifier group is available
```

Direct `GET /discover/items/:id?type=` uses the same appearance rule as the menu. Quote/cart remain the purchase authority (Stage A).

## Global → Merchant

Still copy/materialization. If `source_payload.product` contains variants, SKU, modifier groups/rules/defaults/availability, variant-specific prices, and channel configs, those are copied onto the new unpublished `MenuItem`. Empty payload still creates a name-only draft. No live inheritance. Chain catalog unchanged.

## UI

| Surface | Class | Stage B |
|---|---|---|
| Consumer Standard menu | **IMPROVE** | `kind: STANDARD`, Home Delivery channel, orderable badge |
| Consumer Custom Menu | **NEW** | List + `/restaurants/:id/menus/:menuId` using the same item cards |
| Consumer Item (Stage A) | **PRESERVE** | Still quotes server-side; now loads item with `type` |
| Merchant catalog UI | **NEW** / **FUTURE** | `apps/merchant` is still order-ops only. Write APIs already exist |
| Super Admin Global Catalog UI | **FUTURE** | No admin app. Put Stage A snapshot in `source_payload.product` |

## Out of scope (confirmed)

Celebration Packages. Combos. Tax / fees / surcharges. Promotion Phase 2. Upsell / cross-sell. Availability engine (Stage C). Per-variant×channel price (doc 47). Menu-specific pricing (Stage D if ever evidenced).

## Historical orders

Orders keep `unitPriceMinor` + `addOns` JSON snapshot. Menu publication changes do not rewrite past orders. Typed order-line snapshot remains FUTURE.

## Tests

- `catalog/domain/orderability.spec.ts`
- `catalog/domain/materialization-product.spec.ts`
- `test/stage-b-menu-consistency.e2e-spec.ts`
- Stage A merchandise unit + e2e remain the quote authority
- Promotion Phase 1 kernel specs remain isolated

## Remaining gaps / owner decisions

| Item | Class |
|---|---|
| One `MenuItem.menuSectionId` (no multi-menu membership) | FUTURE |
| Menu-specific price | Stage D if evidenced |
| Per-variant × channel price | FUTURE (doc 47) |
| Home feed still `take: 100`, no geo rank | FUTURE |
| Merchant catalog / menu management UI | NEW / FUTURE |
| Super Admin Global Catalog UI | FUTURE |
| Empty `source_payload` still materializes a name-only unpublished draft | PRESERVE |
| Typed historical order-line snapshot | FUTURE |
