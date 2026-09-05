# 106 — Stage C: Availability Foundation

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing forensic:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Stage A:** [104](./104-STAGE-A-ITEM-VARIANT-MODIFIER-FOUNDATION.md)  
**Stage B:** [105](./105-STAGE-B-MENU-MERCHANT-CATALOG-CONSISTENCY.md)  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)

This slice makes item / variant / modifier availability server-authoritative on every consumer purchase path. It does **not** start Stage D (tax/fees), combos, inventory/BOM, or Promotion Phase 2.

---

## L1 — Legacy reality (confirmed)

Authoritative legacy backend is `amealio-vendordashboard`. NestJS backend and self-delivery have no menu availability code.

| Layer | Legacy field | Actual meaning | Enforced at order? |
|---|---|---|---|
| Publication | `vendorItems.status` + `currentState=9` (standard only) | Wizard complete / published | Menu read only; custom skipped `currentState` |
| Stock-like enum | `availability` `AVAILABLE\|SOLDOUT\|NOTAVAILABLE` | Ops state, not numeric stock | **Client-side** on consumer/vendor UI; **not** on standard cart/order create |
| Date range | `date_of_availability` | Inclusive start/end | Menu read (`shouldIncludeMenuItemForDate`) |
| Item schedule | `itemAvailableTime` + weekday `multiple_timings` | Display-time `checkIfOpen` | Menu display only; 6+ inconsistent copies; schema default `true` vs UI default `false` |
| Variant | `size.available` | Copied into cart snapshot | **Never** validated server-side |
| Addon | template `available`/`active` | Weak flags | **Never** validated on standard cart/order |
| Channel | `{orderType}.value` | Standard query filter | Custom-by-id skipped (Stage B CORRECT) |
| Menu | `Menu.visibility` | Custom menu gate | Consumer fetch |
| Restaurant | `sessionSettings.restaurant_open` + weekly hours → `openStatus` | Blocks **order create** | Not a product-availability engine |
| Ops | `reset_all_sold_out` | Bulk `AVAILABLE` | Vendor dashboard |

There is **no numeric inventory** on `vendorItems`. Quantity is line quantity.

## L2 — Industry benchmark

Industry platforms separate publication, offer/availability, channel, and inventory. They reject stale configurations at cart/checkout. They do **not** silently substitute unavailable modifiers. Full recurrence/seasonal engines are common but only valuable when merchants actually operate schedules.

## L3 — Gap → class

| Gap | Class | Stage C |
|---|---|---|
| G-AVAIL-1 multi-layer availability inconsistently enforced | PRESERVE layers; IMPROVE enforcement | Shared orderability + quote/cart/checkout |
| Cart/order accepted sold-out items | CORRECT | Quote rejects; cart add/update re-quotes; checkout re-quotes |
| `size.available` unused | IMPROVE | Server rejects unavailable variant |
| Addon availability unused | IMPROVE | Server rejects unavailable modifier; required group with no valid selection is non-orderable |
| Custom skipped current-state/channel | CORRECT (Stage B) | Unchanged |
| Item weekly windows / `date_of_availability` | FUTURE / OWNER DECISION | Not implemented — duplicated, not order-enforced, schema/UI default conflict |
| `lead_time` / `cut_off_time` | FUTURE | Broken/partial in legacy |
| Restaurant hours engine | FUTURE | Target already gates `Restaurant.status=ACTIVE`; `OperatingHours` exists but is unused |
| Numeric stock / reservation | FUTURE | No legacy inventory field |
| Combo scheduling | FUTURE | Combo out of scope |

## L4 — Target contract

```
PUBLISHED  = !deleted && isPublished          // public exposure
VISIBLE    = published                        // may appear on consumer menu
AVAILABLE  = MenuItem.availability == AVAILABLE
             AND some variant.available
             AND required groups selectable
ORDERABLE  = visible AND available AND channelAllowed
             AND configurationValid
IN STOCK   = same enum as AVAILABLE for this slice
             (no quantity ledger)
```

Published + SOLDOUT/NOTAVAILABLE may stay **visible** and **not orderable**.

Channel-disabled items are omitted from a channel-scoped menu (Stage B).

Restaurant not ACTIVE / deleted: discovery 404; quote/cart/checkout reject.

No silent substitution of unavailable defaults or modifiers.

---

## CURRENT TARGET → CHANGE

| Current target | Change | Reason |
|---|---|---|
| `orderability.ts` required group checks `group.available` only | Also require enough **available modifiers** | Required group with all toppings disabled was still `orderable` |
| Discovery hid unavailable modifiers | Return them with `available:false` | Consumer must see disabled options |
| Quote ignored restaurant status | Reject if restaurant not ACTIVE | Cart could bypass CLOSED restaurant |
| Cart update only changed qty | Re-quote; 400 if now invalid | Stale configuration must fail |
| Consumer badge always “Not orderable” | Sold out vs not orderable | Preserve Stage B visibility |

No schema change. Existing `ItemAvailability`, `ItemVariant.available`, `AddOn.available`, `AddOnGroup.available`, `ItemChannelConfig.enabled` are the model.

## Scheduled availability

**Deferred (FUTURE / OWNER DECISION).** Legacy has date ranges and weekday windows, but they are display-only, duplicated, and not enforced at order commit. Target has no schedule fields on `MenuItem`. Do not invent a recurrence engine in Stage C.

## Merchant / Super Admin UX

| Surface | Class | Stage C |
|---|---|---|
| Catalog write APIs (`availability`, variant/addon `available`, channel enabled) | PRESERVE | Backend contract |
| Merchant catalog authoring UI | NEW / FUTURE | `apps/merchant` is still order-ops |
| Super Admin Global Catalog UI | FUTURE | Materialize already copies `available` flags |
| Consumer item/menu | IMPROVE | Sold out badge; disabled variant/modifier chips |

## Global → Merchant materialization

Copy, not live inheritance.

| Field | Owner after copy | Stage C |
|---|---|---|
| `ItemVariant.available` | Merchant (copied default) | PRESERVE — copy from `source_payload.product` |
| `AddOnGroup.available` / `AddOn.available` | Merchant (copied default) | PRESERVE |
| `ItemChannelConfig.enabled` | Merchant (copied default) | PRESERVE |
| `MenuItem.isPublished` | Merchant | Always `false` after materialize; merchant publishes |
| `MenuItem.availability` | Merchant | Starts `AVAILABLE`; no global item-level enum |

No live synchronization. No new propagation engine.

## Historical orders

Orders keep priced snapshots. Current availability does not rewrite past orders.

## Stock

Stage C consumes `ItemAvailability` (`AVAILABLE` / `SOLDOUT` / `NOTAVAILABLE`) and boolean `available` flags. There is no quantity ledger and no reservation. Numeric inventory remains FUTURE.
