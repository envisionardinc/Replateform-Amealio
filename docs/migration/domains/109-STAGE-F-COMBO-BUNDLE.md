# 109 — Stage F: Combo / Bundle (food meal deals)

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Commerce forensics:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Stage A–E:** [104](./104-STAGE-A-ITEM-VARIANT-MODIFIER-FOUNDATION.md) · [105](./105-STAGE-B-MENU-MERCHANT-CATALOG-CONSISTENCY.md) · [106](./106-STAGE-C-AVAILABILITY-FOUNDATION.md) · [107](./107-STAGE-D-PRICING-TAX-FEES-SURCHARGES.md) · [108](./108-STAGE-E-PROMOTION-PHASE-2-APPLICATION-REDEMPTION.md)

This slice traces legacy **food combos / meal deals** and implements the smallest coherent target. It is **not** Celebration Packages, festival/occasion/experience packages, tickets, inventory/BOM, upsell, or Promotion Phase 3.

---

## Evidence sources

| Repo | Role | Combo evidence |
|---|---|---|
| `amealio-vendordashboard` | Legacy Feathers API | `src/models/combo.model.ts`; `src/services/menu/combo.class.ts`; `usercart/cart.class.ts` `getComboUnitPrice`; `user-menu.class.ts`; `menu-category.hooks.ts` |
| `amealio_web_app` | Legacy consumer | `ComboCustomizationDrawer.jsx`; `comboCartPayload.js`; `cartManager.cartAddCombo` |
| `amealiodashboardmvp-` | Merchant + Super Admin UI | `MenuSetup/combos/CreateCombos.js` (merchant). **No Super Admin global combo** |
| `amealio-self-delivery-app` | Kitchen/delivery | Generic `order_items` only — no combo expansion |
| `amealio-nestjs-backend` | Nest location/auth | **None** |
| `Amealio-VendorApp` | Merchant mobile | **Not in this workspace** |
| `replateform-amealio` | Target | No Combo model before this slice |

**Shared-name trap:** Experience / Celebration flows reuse the `Combo` Mongo collection and words “package/combo”. Those paths (`user-exp-cart`, `Experience.Package[]`, seating `packages[]`) are **out of scope**. Food path = `/combo` + `/user/cart` + restaurant menu.

---

## L1 — Legacy Reality

### Identity and structure

Food combo is a **separate `Combo` collection**, not a `vendorItems` row and not an add-on group.

```
Combo
  comboName, description, images, type ("Combo")
  vendor_id, restaurant, menu_id?, category_id?
  substitutable
  availability / activeStatus
  pricing.{dineIn|delivery|takeAway|curbSide|skipTheLine}.{listPrice, comboPrice, packingCharges}
  comboItems[]          // slots / groups
    category_id?
    items[]             // options in the slot
      _id → vendorItems
      default
      additionalPrice
  condiments[]          // unused on the food cart path
```

A combo is a **bundle of component products**. A modifier is **configuration of one item**. Pizza+Pepperoni is a modifier. Pizza+Drink+Side is a combo.

### Component selection

- Intended rule: **one pick per `comboItems` group**.
- `substitutable=false`: V2 drawer shows only the default/first option (fixed).
- `substitutable=true`: radio choose-one per group.
- Defaults: `default: true` else first option.
- No min/max beyond one-per-group. No per-component quantity. No choose-many.
- Legacy backend **does not validate** membership or one-per-group — ObjectId existence of the combo only.
- Cart payload: `{ combo_id, items: string[] /* vendorItem ids */, quantity }`.

### Variants inside components

No size picker. Consumer resolves a **default size for the order type** and **does not send `size_id`**. Food cart skips size validation for combo lines.

### Modifiers inside components

**Not supported** on the food path. Combo lines force `addons: []`. Item customization popup is blocked for combo entries.

### Nested combos

`comboItems.items._id` refs **`vendorItems` only**. No combo-in-combo on the food path.

### Pricing (what money actually moved)

`cart.class.ts` `getComboUnitPrice`:

```
combo.pricing[channel].comboPrice
  ?? combo.pricing[channel].listPrice
  ?? 0
```

Food cart **does not add** `additionalPrice`, `packingCharges`, component prices, or modifiers.

V2 drawer **displays** `comboPrice + Σ additionalPrice` for substitutable combos and **does not send** those extras. That is a UI/backend disagreement.

Experience cart **does** add `additionalPrice` + packing — **not** this contract.

### Availability

- Category hook: `availability === true` to attach combos.
- Custom-menu hydration **omits** missing component items from the response (silent drop).
- Cart add does **not** re-check component availability.
- V2 UI filters options without a default size and blocks add if a remaining group has no pick.

### Catalog / menus

- Combos attach by **`category_id`**, not by cloning products.
- `menu_id` is copy metadata; listing is category-driven.
- Appear on Standard (virtual) and Custom menus when the category is on that menu.
- **No Super Admin global combo template.** Global catalogue is items/categories/add-ons.

### Cart → order → kitchen

- One `order_items` header line: `itemType: 2`, name = `comboName`, synthetic size `_id` = combo id, price = `comboPrice`.
- Selected component ids live on **`cart.combos`** and are **not forwarded to the order**.
- Kitchen/self-delivery sees a **single combo line**.

### Promotions / tax / fees / refund / settlement

- Promotions: order-level on line `finalPrice`; no combo targeting.
- Tax: combo `sur_charges: []`; no component GST split. `taxesIncluded` unused.
- Refund: generic order-line amount; no component allocation.
- Settlement: captured amount path; no combo deduction.
- No combo inventory decrement.

---

## L2 — Industry benchmark

Typical QSR / POS meal deals (Toast combo/set price, Square/Clover meal deals, PetPooja combo SKU):

- Combo is a **bundle SKU**, distinct from modifiers.
- Price policy is explicit: **fixed meal price**, or **sum**, or **base + upgrade deltas**.
- Component groups are choose-one (or choose N) from real products.
- Server is authoritative for money and availability.
- Unavailable required components **block** the combo; they are not silently swapped.
- Kitchen usually **sees components**.
- Refunds are usually **whole line / amount**, not invented component clawback.
- Global “combo templates” exist in some chains as **copy**, not live inheritance.

Industry does **not** treat a combo as a modifier group, and does **not** trust client totals.

---

## L3 — Gap matrix

| ID | Topic | Legacy | Industry | Class | Stage F |
|---|---|---|---|---|---|
| G-COMBO-1 | Separate bundle entity | `Combo` collection | Bundle SKU | **PRESERVE** | `Combo` + slots + options |
| G-COMBO-2 | Weak server composition | UI-only one-per-group | Server enforces | **CORRECT** | Validate slots/options |
| G-COMBO-3 | `additionalPrice` not charged (food) | UI sums extras | Explicit upgrade policy | **OWNER DECISION** kept; money path **PRESERVE** actual charge | Fixed `comboPriceMinor` only. Upgrades FUTURE |
| G-COMBO-4 | Components missing on order | Cart-only | Kitchen needs components | **IMPROVE** | Snapshot components; no new kitchen router |
| G-COMBO-5 | Silent omit of unavailable options | Custom-menu drop | Fail closed | **CORRECT** | Stage C; no substitution |
| G-COMBO-6 | Client display extras | Drawer `finalPrice` | Server money | **CORRECT** | Client never supplies money |
| G-COMBO-7 | Channel combo prices | 5 pricing buckets | Channel price or one price | **FUTURE** | One `comboPriceMinor` (Stage D has no channel prices) |
| G-COMBO-8 | Global combo templates | None | Copy/materialize | **PRESERVE absence** | Do not invent |
| G-COMBO-9 | Nested combos | None (food) | Rare / complex | **FUTURE** | Reject |
| G-COMBO-10 | Modifiers inside components | Not on food path | Sometimes | **FUTURE** | Not in this slice |
| G-COMBO-11 | Variant pick inside components | Default size only | Sometimes upgrades | **FUTURE** | Default available variant for availability only |
| G-COMBO-12 | Condiments | Schema / experience | Separate | **FUTURE** | Not implemented |
| G-COMBO-13 | Component refund split | None | Usually amount-only | **FUTURE** | Existing full-refund path |
| G-COMBO-14 | Combo-specific promo | None | Sometimes exclusive | **PRESERVE** | Stage E on merchandise subtotal |
| G-COMBO-15 | Inventory/BOM | None | Separate | **FUTURE** | Not implemented |
| G-COMBO-16 | Celebration reuse of Combo | Same Mongo collection | Different domain | **PRESERVE separation** | Out of scope |

---

## L4 — Target contract

### What a combo is

A restaurant-owned **bundle product**. It references existing `MenuItem` rows. It is **not** a `MenuItem`, **not** an `AddOnGroup`, and **not** a Celebration Package.

```
Combo
  → ComboSlot[]          (required choose-one groups)
    → ComboSlotOption[]  (MenuItem refs + default)
```

### Selection

- Exactly **one option per slot**.
- `substitutable=false`: only the default option may be selected (server fills default if omitted).
- `substitutable=true`: client sends `{ slotId, menuItemId }` per slot; must be a member option.
- No stacking of options in a slot. No nested combos. No modifier configuration on components.

### Availability (Stage C)

Combo is **orderable** iff:

1. Combo `deletedAt` is null, `isPublished`, `availability=AVAILABLE`
2. Restaurant is discoverable
3. Every slot has a selected option that is a **published, AVAILABLE, channel-enabled** `MenuItem` with an available variant
4. If `substitutable=false`, the selection is the default option
5. Custom-menu listing: combo is linked to a visible section of that menu (reference, not clone)

Unavailable required component → combo **not orderable**. No silent substitution. Optional slots are not in this slice (legacy groups are required).

### Pricing (Stage D)

```
merchandise line = comboPriceMinor × quantity
→ Stage E discount slot (unchanged kernel)
→ taxable = merchandise − discount
→ tax / fees / delivery (Stage D)
→ grand total
```

- Server `comboPriceMinor` is the **only** combo money input.
- Component catalog prices, `additionalPrice`, packing, and client totals are ignored.
- BigInt only. `composeCommercialQuote` remains the only totals calculator.

### Promotion (Stage E)

Combo merchandise is part of the same subtotal the kernel already sees. No combo-specific promotion math. No stacking.

### Tax / fees / settlement / refund

Unchanged Stage D/E/settlement/refund rails. Combo is one merchandise line. No GST/HSN invention. No component refund allocation.

### Cart

Client sends identities:

```
{ comboId, quantity, selections?: [{ slotId, menuItemId }] }
```

Server re-quotes. Snapshot stored as `combo.v1` on the cart line (not an authoritative price).

### Order snapshot

`Order.commercialSnapshot` line plus `OrderItem.addOns.schema = "combo.v1"`:

- comboId, name, comboPriceMinor
- selected components (slot, menuItem id/name)
- quantity, merchandise, discount, tax, fees, grand

Catalog edits after purchase do not rewrite history.

### Kitchen

One order line named as the combo, with **component names in the snapshot**. No new status machine. No inventory.

### Global catalog

**Not implemented.** Merchant-owned only. Copy/materialization FUTURE if Super Admin later authors templates.

### Custom menu

`ComboSection` references a `MenuSection`. Same Combo identity; no cloned commercial product.

---

## Owner decisions

| ID | Topic | Stage F resolution |
|---|---|---|
| OD-COMBO-PRICE | Fixed vs sum vs upgrades | **Money = fixed `comboPriceMinor`** (food backend evidence). Upgrade deltas remain **FUTURE** if product later wants them. |
| OD-COMBO-NEST | Nested bundles | **FUTURE** — not implemented |
| OD-COMBO-GLOBAL | Global templates | **Do not invent** — none in Super Admin |
| OD-COMBO-REFUND | Component allocation | **FUTURE** — amount-only / existing full refund |
| OD-PROMO-1…5 | Promotion advanced | Unchanged; not required |

---

## Deferred

Celebration/occasion/festival/event packages; experience `Package[]`; condiments; packingCharges; channel combo prices; component modifiers; component size upgrades; additionalPrice charging; nested combos; global combo copy; inventory/BOM; kitchen ticket explosion; upsell/cross-sell; promotion stacking.

---

## API (this slice)

- `POST/PATCH /api/v1/catalog/combos` · `GET /api/v1/catalog/restaurants/:id/combos` (staff)
- `GET /api/v1/discover/restaurants/:id/menu` includes `combos[]`
- `GET /api/v1/discover/combos/:id`
- `POST /api/v1/discover/quote` accepts `comboId` + `selections` (xor `variantId`)
- `POST /api/v1/cart/items` accepts `comboId` + `selections`

---

## Explicit non-goals

Celebration Packages, occasion/festival/event food packages, inventory, recipe/BOM, upsell, cross-sell, personalization, promotion stacking, BOGO, Buy X Get Y, settlement redesign.
