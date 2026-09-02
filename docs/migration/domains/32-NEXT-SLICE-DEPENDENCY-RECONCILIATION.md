# 32 — Next-Slice Dependency Reconciliation (P1.7.5 discovery)

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no owner decisions resolved. Determines, from source evidence, the next canonical backend/data foundation after P1.7.4.
> **Grounding:** shared backend `amealio-vendordashboard` (authority), combined admin/merchant FE `amealiodashboardmvp-`, user FE `amealio_web_app`, RAG `amealio-homepage-v2-rag-server`, the forensic audit (`docs/current-state/`, PR #21), and the current target `prisma/schema.prisma` + P1.7.1D–P1.7.4.
> **Completed foundations:** staff identity/auth/authz (P1.7.1D/E/F), Merchant+Location (P1.7.2), Subscription+config (P1.7.3), Platform taxonomy Category/Cuisine (P1.7.4). Test baseline **172/172**.

---

## 1. Executive finding

**The next canonical foundation should be MENU & CATALOG** (`Menu → MenuSection → MenuItem → ItemVariant`, with `ItemChannelConfig` + `AddOnGroup/AddOn`).

It is the **earliest missing application foundation** that sits directly on the completed Merchant/Restaurant/Taxonomy layer and is depended upon by the largest set of live downstream domains (ordering, cart/checkout, scan-&-pay, experience food, discovery surfacing, AI/RAG). The target schema for it is **already COMPLETE** (P1.4/P1.5), its upstream dependencies are **all satisfied**, ownership is **source-certain** (merchant-owned `Menu`/`vendorItems`, `vendor_id`), and it carries **no blocking UNKNOWN** (unlike ordering/seating/experiences/discovery). It is also **scope-containable**: a read/catalog foundation can be built without pulling in ordering behavior.

This is a clear single winner — **no HARD STOP condition applies** (no tie, ownership is clear, no schema conflict, no owner decision required to start, no skipped earlier foundation).

## 2. Dependency graph

```
COMPLETED FOUNDATION
  Merchant (P1.7.2) → Restaurant/Location (P1.7.2)
  Merchant → Subscription/config (P1.7.3)
  Platform taxonomy: Category / Sub Category / Cuisine (P1.7.4)
        │
        ▼
NEXT MISSING FOUNDATION  ►►  MENU & CATALOG
  Menu (restaurant-scoped, merchant-owned)
   → MenuSection (→ optional platform Category)   [taxonomy link ready via P1.7.4]
      → MenuItem (availability, posItemId)
         → ItemVariant (priceMinor, uom, pax)
         → ItemChannelConfig (per OrderType channel pricing)
         → AddOnGroup → AddOn
        │
        ▼
DOWNSTREAM DOMAINS UNLOCKED (later slices)
  Cart/CartItem → Ordering (Order/OrderItem) → Payments → Delivery/Settlement
  Experience food (experience-menu / exp-cart) — needs MenuItem
  Scan & Pay — needs MenuItem
  Discovery/search surfacing of items; AI/RAG (reads vendoritems)
```

Upstream of Menu: **Merchant (done), Restaurant (done), Category (done, optional link), UnitOfMeasure (present)**. Nothing upstream is missing → Menu is the earliest unblocked foundation.

## 3. Candidate ranking

| Rank | Candidate | Why Needed | Upstream Dependencies | Downstream Unlocks | Target Readiness | Source Certainty | Blocking UNKNOWN | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **1** | **Menu & Catalog** | Highest centrality; base of ordering/cart/experience-food/scan&pay/discovery/AI | Merchant ✓, Restaurant ✓, Category ✓ (all done) | Ordering, Cart, Checkout, Experience food, Scan&Pay, Discovery items, AI | **COMPLETE** (Menu/MenuSection/MenuItem/ItemVariant/ItemChannelConfig/AddOn present) | **High** (`menu`/`vendorItems` merchant-owned, `vendor_id`) | **None** | **PROCEED (P1.7.5)** |
| 2 | Restaurant profile completeness (OperatingHours, RestaurantFeature, attributes) | Discovery/availability detail | Restaurant ✓ | Availability display, discovery detail | PARTIAL (models exist; attribute↔Category mapping is a P1.7.4 owner decision) | Medium | attribute→Category vs RestaurantFeature (P1.7.4) | Defer (lower centrality; partly blocked) |
| 3 | Ordering (Order/OrderItem/status) | Core transaction | **Menu (not done)**, Payments | Payments, Delivery, Settlement | PARTIAL (schema present) | Medium | **OD-11 numeric order/payment status mapping (BLOCKING)** | Defer (needs Menu + OD-11) |
| 4 | Seating (Diner/SeatingRequest) | Live functionality | Subscription.table_setup, Restaurant tables, realtime | Reservations/waitlist | PARTIAL (SeatingRequest missing `INITIAL` + cross-links) | Medium | **table_setup modeling (owner decision, doc 30/§reconciliation)**; realtime transport | Defer (design decision first) |
| 5 | Payments/Wallet/Settlement | Financial | Ordering | Settlement, payouts | PARTIAL (schema present) | Medium | OD-11 (BLOCKING) | Defer (after ordering) |
| 6 | Experiences/Celebrations | Live | **No target schema (MISSING)**, Menu (food), taxonomy, optional Diner/order | Celebrations, exp booking | MISSING | Medium | Experience/Event architecture (design phase) | Defer (needs design + Menu) |
| 7 | Events/Festivals | Live | No schema; taxonomy UNKNOWN | Tickets/RSVP | MISSING | Low | Festival vs exp-events vs Events (UNKNOWN) | Defer |
| 8 | Discovery/Mood/Craving | Live | taxonomy | Home discovery | PARTIAL | Low | **Mood/MoodManagement/Craving canonical (P1.7.4 UNKNOWN, BLOCKING)** | Defer |
| 9 | Delivery/GPS | Live | Ordering | Fulfillment | PARTIAL (DeliveryPartner/Task present; GPS satellite) | Medium | needs Ordering | Defer |
| 10 | AI/RAG | Live | — (proxy Python) | Discovery chat | N/A (integration, not data foundation) | High | endpoint auth (owner) | Defer (not a data foundation) |

## 4. Top candidate deep dive — Menu & Catalog

**Legacy models (`amealio-vendordashboard/src/models/`):**
- `Menu` (`menu.model.ts`): `name`, `description`, `type`, sections (`category_id → menuCategory`, items), `restaurant → restaurant`, `vendor_id`, `visibility`, `softOnboarding`. → **restaurant-scoped, merchant-owned**.
- `menuCategory` (`menu-category.model.ts`): per-menu section (`ref: Menu`, `status`, tax config). → target `MenuSection` (P1.7.4 established; NOT platform taxonomy).
- `vendorItems` (`vendor-items.model.ts`): `name`, `category → menuCategory`, `menu_id → Menu` (null = standard menu), `vendor_id`, `date_of_availability`, `description`, `veg`, `prepTime`, `status` (bool), **`size[]`** (`price`/`size`/`description`/`available` = variants), nested addon/modifier `sizes`, `personalization`. → **merchant-owned item catalog**.
- `combo` (combos), `catalogue`/`chain-catalogue` (chain-level), `uom`/`uom-ratio` (units), `review-rating`.

**Legacy services/APIs:** `/menu`, `/menu-category`, `/v2/menu-category`, `/vendor-items`, `/v2/vendor-items`, `/user/menu`, `/v2/user/menu`, `/user/items`, `/user/menu-category`, `/recommended-items`, `/combo`. (v1/v2 duplicates → canonical disambiguation at implementation.)

**Usage:**
- **Admin:** oversight, chain-catalogue, `/admin/items`.
- **Merchant:** menu/item management (`/menusetup-dashboard`, `/itemavailablitydashboard`, `/vendor-items`) — **creates/owns**.
- **User:** menu browse (`MainMenu`, `/user/menu`), item detail/modifiers, cart add.
- **Delivery:** order line items reference menu items (indirect).
- **AI/RAG:** reads `vendoritems` (`VENDOR_ITEMS_COLLECTION`) for item discovery.

**Relationships:** `Merchant → Restaurant → Menu → MenuSection (→ optional Category) → MenuItem → ItemVariant / ItemChannelConfig / AddOnGroup → AddOn`.

**Ownership:** **MERCHANT_DEFINED** (menu/items created by merchant, `vendor_id`); `MenuSection.categoryId` optionally references **PLATFORM_DEFINED** taxonomy (P1.7.4); consumed by User/Admin/Delivery/AI.

**Lifecycle:** `Menu.visibility` + `deletedAt`; `MenuItem.availability` (`ItemAvailability` AVAILABLE/SOLDOUT/NOTAVAILABLE) + `deletedAt`; legacy `status` bool + `date_of_availability`.

**Business rules (source):** item availability gates ordering; `size[]` = priced variants (money → target `priceMinor` BigInt, integer minor units); per-channel pricing (`ItemChannelConfig` by `OrderType`); add-on min/max selection; standard vs custom menu (`MenuType`); `posItemId` for POS sync; sold-out reset cron (`resetsoldout`).

**Existing target models:** **COMPLETE** — `Menu`, `MenuSection`, `MenuItem`, `ItemVariant`, `ItemChannelConfig`, `AddOnGroup`, `AddOn`, `UnitOfMeasure`, enums `MenuType`/`ItemAvailability`/`OrderType`; `legacyId` on `Menu`/`MenuItem`.

**Missing target foundation:** only the **application layer** (repositories/read services + merchant-tenant-scoped access via P1.7.1F/P1.7.2). No schema change is anticipated (to be confirmed at implementation).

**Migration risks:** v1/v2 API disambiguation; legacy `size[]` → `ItemVariant` mapping (calories/size semantics); nested addon/modifier normalization; per-channel pricing mapping; POS-linked items; standard-menu (null `menu_id`) items.

**Unresolved decisions:** none required to START a catalog read foundation. (Menu-level food-taxonomy vs `RestaurantFeature`, and combos modeling, can be confirmed during the slice; they do not block a base MenuItem/variant foundation.)

## 5. Why not the others (yet)

- **Ordering:** depends on Menu (not yet built) **and** the **OD-11** legacy numeric order/payment status → named-enum mapping (a standing BLOCKING owner decision), plus a realtime transport for order tracking. Build Menu first.
- **Seating:** blocked by the **`table_setup` modeling** owner decision (doc 30/reconciliation) and the incomplete `SeatingRequest` model (missing `INITIAL` + `exp_request_id`/`order_id` cross-links), plus realtime — design decisions must precede it. Importance ≠ readiness.
- **Experiences/Celebrations:** **no target schema exists** (Experience/expRequest absent) and it depends on Menu (food included/extras) + optional Diner/order + a dedicated design phase. Not next.
- **Events/Festivals:** no schema; the **Festival vs exp-events vs Events** taxonomy is an open UNKNOWN. Not next.
- **Discovery/Mood/Craving:** blocked by the **P1.7.4 discovery-taxonomy UNKNOWN** (canonical Mood/MoodManagement/Craving source). Not next.
- **Payments:** depends on Ordering + OD-11. Schema present but no upstream consumer yet.
- **Delivery:** depends on Ordering.
- **AI:** an integration/proxy to the Python service, not a canonical data foundation; separate track.
- **Wallet/Settlement:** depends on payments/orders.

## 6. Blockers

| UNKNOWN | Affects | Class |
|---|---|---|
| OD-11 numeric order/payment status → enum mapping | Ordering, Payments | **BLOCKING (for those; NOT for Menu)** |
| `table_setup` normalization + cron status-sync | Seating | **BLOCKING (Seating)** |
| SeatingRequest missing `INITIAL` + cross-links | Seating | BLOCKING (Seating) |
| Experience/Event/Festival architecture + missing schema | Experiences, Events | BLOCKING (those) |
| Mood/MoodManagement/Craving canonical source (P1.7.4) | Discovery | BLOCKING (Discovery) |
| Menu v1/v2 API canonicalization | Menu | **NON-BLOCKING** (read foundation is API-agnostic) |
| legacy `size[]`→variant, addon/combo normalization | Menu | **NON-BLOCKING** (base variant model sufficient; combos deferrable) |
| Menu food-taxonomy vs RestaurantFeature | Menu | **NON-BLOCKING** (`MenuSection.categoryId` optional) |
| ONDC | (isolated) | **DEFERRED — existing** |

**Menu & Catalog has no BLOCKING UNKNOWN.**

## 7. Owner decisions genuinely required before P1.7.5 (Menu)

**None to start.** A catalog read-foundation over the existing complete schema needs no owner decision. (OD-11, table_setup, discovery/experience taxonomy remain owner decisions for their *own* future slices, not for Menu.) Non-blocking clarifications useful during the slice: canonical v1/v2 menu API; whether combos are in the first catalog slice.

## 8. Proposed P1.7.5 boundary (NOT to be implemented here)

**IN SCOPE (proposed):**
- Read foundation over the existing catalog schema: `MenuRepository`, `MenuItemRepository` (+ variants/channel-config/add-ons), following P1.7.2/P1.7.3 conventions.
- Merchant-tenant-scoped access (menus/items confined to the staff's `StaffPrincipal.merchantId` via P1.7.1F; reuse `MerchantScopeService.assertRestaurantInScope`).
- Read/lookup: menu by restaurant, sections (with optional Category), items by menu/section, item detail with variants + channel config + add-ons, availability filtering; `legacyId` lookups.
- Domain read-model types; real-DB integration tests; documentation (doc 33).
- **Likely NO schema change** (confirm at implementation).

**OUT OF SCOPE:**
- Ordering/cart/checkout/payments; menu/item **mutation/CRUD**; admin/merchant menu UI; combos (unless trivially confirmed); per-channel pricing *behavior*; POS sync; discovery/search; experiences/events; seating; delivery; AI; Mongo import/backfill; any schema redesign; resolving OD-11/table_setup/taxonomy UNKNOWNs.

## 9. Expected test strategy (if P1.7.5 approved; do not write now)

Real-DB integration: menu/item identity + `legacyId` lookup; `Menu→MenuSection→MenuItem→ItemVariant` relationships; `MenuSection→Category` optional link; `ItemVariant` `priceMinor` BigInt (integer minor units) exactness; `ItemChannelConfig` uniqueness per `(item, channel)`; `AddOnGroup/AddOn` min/max; availability filtering (`ItemAvailability`); soft-delete exclusion; **merchant tenancy** (staff of merchant A cannot read merchant B's menu/items) + SUPER_ADMIN behavior; missing/unknown-ref safety. Plus: existing P1.7.1E/F/2/3/4 suites remain green.

## 10. Documentation impact (after implementation)

New `docs/migration/domains/33-MENU-CATALOG-FOUNDATION.md`; update `MIGRATION_STATUS.md` + hub `README.md`. Baseline-evolution notes (menu ownership, v1/v2 canonicalization, size→variant mapping) fold into the forensic-audit `DATA-MODEL-INVENTORY.md` (PR #21) when integrated.

---

### Hard-stop check
No hard-stop condition applies: (1) no dependency tie — Menu is a clear #1; (2) ownership established (merchant-owned); (3) no target/legacy schema conflict (schema complete, `menuCategory=MenuSection` already reconciled); (4) no owner decision required to start; (5) P1.7.4 UNKNOWNs do not block Menu; (6) no earlier foundation was skipped (Merchant/Restaurant/Subscription/Taxonomy precede Menu correctly); (7) the next step is a new slice (P1.7.5 Menu), not resolving an existing foundation; (8) repository evidence agrees with the forensic baseline.

**Recommendation: P1.7.5 = Menu & Catalog read foundation.** No implementation performed in this task.
