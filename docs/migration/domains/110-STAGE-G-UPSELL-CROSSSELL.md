# 110 — Stage G: Upsell / Cross-sell

**Status:** IMPLEMENTED (bounded slice)  
**Date:** 2026-09-05  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Commerce forensics:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Stage A–F:** [104](./104-STAGE-A-ITEM-VARIANT-MODIFIER-FOUNDATION.md) · [105](./105-STAGE-B-MENU-MERCHANT-CATALOG-CONSISTENCY.md) · [106](./106-STAGE-C-AVAILABILITY-FOUNDATION.md) · [107](./107-STAGE-D-PRICING-TAX-FEES-SURCHARGES.md) · [108](./108-STAGE-E-PROMOTION-PHASE-2-APPLICATION-REDEMPTION.md) · [109](./109-STAGE-F-COMBO-BUNDLE.md)  
**Machine-readable matrix:** [110-STAGE-G-GAP-MATRIX.json](./110-STAGE-G-GAP-MATRIX.json)

This slice determines the canonical amealio merchandising model from evidence and implements the smallest server-authoritative **cross-sell** capability. It is **not** Stage H personalization, AI/RAG, behavioral ranking, a second pricing engine, a promotion, a modifier, a variant, or a combo.

---

## Vocabulary (do not collapse)

| Term | Meaning | Stage |
|---|---|---|
| **Upsell** | Encourage a higher-value version of what the diner is already buying (Small → Large, basic → premium) | G concept; **not implemented** as a relation |
| **Cross-sell** | Encourage a complementary product (Pizza → Beverage, Burger → Fries) | **G** |
| **Personalization** | Rank or choose from customer history, prefs, embeddings, learned models | **H — not started** |

---

## Evidence sources

| Repo | Role | Stage G evidence |
|---|---|---|
| `amealio-vendordashboard` | Legacy Feathers API | `menu-category.model.ts` `cross_selling.category[]`; `user-category.class.ts` `?cross_selling=true`; `recommended-items.class.ts` tag buckets; `user-personalisation-menu.class.ts` prefs/favorites sort |
| `amealiodashboardmvp-` | Merchant + Super Admin UI | `MenuSetup/CrossSelling.js` (casual / multi-service / fast-food / admin copies); `CrossSellingVendorDash.js`; POS `CarouselMain.js` + `get_suggested_items` |
| `amealio_web_app` | Legacy consumer | Cart `Recommended for You` via `/recommended-items` + bestsellers/rating fallback; menu filters `best_seller` / `chef_special`; seating/track recommended food. **No `cross_selling` consumer call** |
| `amealio-nestjs-backend` | Nest location/auth | **None** (lockfile “recommended” is a npm deprecation notice) |
| `amealio-self-delivery-app` | Kitchen/delivery | **None** |
| `Amealio-VendorApp` | Merchant mobile | **Not in this workspace** |
| `Amealio-Homepage-V2-RAG-Server` | RAG | **Not in this workspace** |
| `replateform-amealio` | Target | Stages A–F live; no merchandising-relation model before this slice |

---

## 1. L1 — Legacy Reality

### A. Existing true upsell behavior

**None as a first-class merchandising relation.**

- No `upsell` collection, no item→variant upgrade table, no “upgrade this selection” API.
- Size / channel size is **variant choice** (Stage A). Premium toppings are **modifiers** (Stage A). Meal deals are **combos** (Stage F).
- Dashboard help copy (`ServiceComponent.js`) markets “upsell and cross sell opportunities” and “staff on upselling best practices.” That is **marketing text**, not an engine.
- Non-food combo UI `additionalPrice` is combo merchandising (Stage F / `OD-COMBO-PRICE`), not an upsell graph.

### B. Existing true cross-sell behavior

**Yes — merchant-controlled category-to-category complementary merchandising.**

| Question | Finding |
|---|---|
| Stored | `menuCategory.cross_selling.category[]` (ObjectId refs to other `menuCategory` rows) + unused `category_type` string |
| Who creates / edits | Merchant Menu Setup → Cross Selling (and Super Admin **restaurant menu-setup copies** of the same screen). Vendor dash route `CrossSellingVendorDash` |
| Retrieved | `POST /user/menu-category?cross_selling=true` with body `{ cross_selling_category: categoryIds[], item_ids? }` |
| Appears | **Merchant POS cart carousel** (`CarouselMain.js`): unique categories already in the cart → complementary-category items, `AVAILABLE` only, excluding `item_ids` |
| Merchant-controlled | Yes |
| Category-based | **Yes — only** |
| Item-based | **No** |
| Variant-based | **No** |
| Automatic | No ML. Merchant-authored category lists |
| Personalized | No |
| Affects price | No |
| Affects cart state | Only if staff/diner **adds** a suggested item through the normal cart path |
| Affects orderability | No — filters `AVAILABLE` + `currentState: 9`; does not make sold-out items sellable |
| UI decoration | No — it loads real sellable items |
| Production | **Used on the vendor ordering surface.** Consumer web app does **not** call this API |

Consumer complementary-category display on item detail / cart was **not found** in `amealio_web_app`. The live consumer “recommendation” strip is a different mechanism (see C).

### C. Existing recommendation behavior that is NOT true upsell/cross-sell

| Mechanism | What it actually is |
|---|---|
| `/recommended-items` | Tag titles `"Recommended"`, `"Best Seller"`, `"Chef's Special"` on vendor items; first 5; **not** CF/ML |
| Cart `Recommended for You` | `buildExperienceRecommendedItems`: prefer `/recommended-items`, else bestsellers/rating ≥ 4, else first N menu items. Excludes items already in cart |
| Menu filters `best_seller` / `chef_special` | Tag / query filters on the restaurant menu |
| Seating / track / experience “recommended food” | Same `/recommended-items` merchandising tags |
| Homepage / Suggested Bytes / experience `recommended` flags | Static or editorial merchandising, not complementary relations |
| `user-personalisation-menu` | Prefs, favorites, scored sort — **Stage H** |
| ONDC `related: Boolean` | ONDC item flag, not amealio merchandising |
| Help-page “upsell / cross sell” | Copy only |

### D. Existing category-based cross-sell mechanisms

Exactly one: `menuCategory.cross_selling.category[]` authored in Menu Setup, read by `user/menu-category?cross_selling=true`, consumed by **vendor POS suggestions**.

No category→item graph. No complementary-category consumer web surface.

### E. Existing item-level relationship mechanisms

**None.** No item→item, item→variant, or item→combo merchandising table in Mongo models.

### F. Existing cart / checkout recommendation surfaces

| Surface | Mechanism | True X-sell? |
|---|---|---|
| Vendor POS cart carousel | Category complementary items | **Yes** (category-based) |
| Consumer cart | Tag / bestseller / rating “Recommended for You” | **No** |
| Consumer checkout | Not found | — |
| After Add to Cart modal | Not found | — |
| Order confirmation | Not found | — |
| Item detail | Size/modifier/combo drawers only | **No** complementary rail |

### G. Existing merchant authoring controls

- Pick a **source category**, pick one or more **complementary categories**, save onto the source category document.
- Delete clears `cross_selling.category` to `[]`.
- Fast-food Add Categories can wipe `cross_selling` to `{}` on some saves.
- No sort order, schedule, placement, or item picker.

### H. Existing Super Admin / global authoring controls

Super Admin screens are **copies of restaurant Menu Setup**, not a Global Catalog relationship library. No reusable platform-level recommendation inheritance.

### I. Existing consumer presentation

Consumer food app presents **tag merchandising** and **menu filters**, not merchant complementary categories. Complementary category merchandising is a **staff POS** tool in the evidence available here.

### J. Lookalikes (do not duplicate)

| Looks like | Actually is | Canonical layer |
|---|---|---|
| Size Small / Large | Variant selection | Stage A `ItemVariant` |
| Extra cheese / premium topping | Modifier | Stage A `AddOnGroup` / `AddOn` |
| Meal deal Pizza+Drink+Side | Combo / bundle | Stage F `Combo` |
| “Recommended / Best Seller / Chef’s Special” | Merchant tags | Merchandising labels — not G relations |
| Personalised menu sort | Prefs / favorites | Stage H |
| Category navigation / Suggested Bytes | Editorial / taxonomy | Discovery, not G |
| Combo `additionalPrice` | Uncharged food-path upgrade copy | Stage F FUTURE |

---

## 2. L2 — Industry Benchmark

Useful modern commerce capabilities (not a copy of any vendor):

- Merchant-curated **item-level** complementary products
- Optional **variant upgrade** upsell (explicit “make this Large”) when the catalog has a higher SKU
- Category complementary as a **fallback** when item pairs are not authored
- Placement: item detail, post-add, cart, checkout — each optional
- Availability-, channel-, and tenant-aware retrieval
- Manual ranking; later behavioral ranking
- Analytics on accept/ignore (later)
- Scheduling / daypart (later)

Industry does **not** require Stage G to invent a new price, a recommendation discount, or a learned “frequently bought together” model.

### Classification

| Capability | Class | Note |
|---|---|---|
| Merchant complementary merchandising intent | **PRESERVE** | Real production behavior (category list + POS suggestions) |
| Category-only storage | **IMPROVE** | Too coarse; pizza and pasta in “Mains” get the same drinks |
| Item-to-item CROSS_SELL | **IMPROVE** | Canonical complementary primitive |
| Server-side orderability filter | **CORRECT** | Never let a relation bypass Stage C |
| Server quote on add | **PRESERVE** | Stage D `MerchandiseQuoteService` / `composeCommercialQuote` |
| Stage E on the combined cart | **PRESERVE** | No recommendation discount |
| Explicit UPSELL relation graph | **FUTURE** | No legacy engine; size/modifier/combo already cover upgrade UX |
| After-ATC / cart / checkout / confirmation placements | **FUTURE** | First slice = one placement |
| Placement / schedule metadata | **FUTURE** | Not in L1 |
| Super Admin reusable relations / chain inheritance | **FUTURE** | L1 Super Admin is restaurant menu-setup, not a library |
| Analytics / learned ranking / FBT / embeddings / RAG | **FUTURE** | Stage H+ |
| Treating modifiers, variants, or combos as recommendations | **CORRECT** | Do not duplicate A/F |
| Client-side recommendation prices | **CORRECT** | Forbidden |

---

## 3. L3 — Gap Analysis

| ID | Gap | Legacy | Target | Class |
|---|---|---|---|---|
| G-XSELL-1 | Category list is the only complementary graph | `cross_selling.category[]` | Item-to-item `CROSS_SELL` | **IMPROVE** |
| G-XSELL-2 | Consumer food app never reads category complementary | POS only | Compose into consumer item detail | **IMPROVE** |
| G-XSELL-3 | No tenant-safe first-class relation table | Embedded ObjectId array | Prisma FKs, merchant + restaurant, unique pair | **CORRECT** |
| G-XSELL-4 | No deterministic rank | Unordered array | `sortOrder`, then createdAt | **IMPROVE** |
| G-XSELL-5 | Weak availability on POS path | `AVAILABLE` + `currentState: 9` | Full Stage C (`appearsOnConsumerMenu` + `isConsumerOrderable`) | **CORRECT** |
| G-XSELL-6 | Cart “Recommended for You” is tags, not complementary | `/recommended-items` | Do not relabel tags as cross-sell | **CORRECT** |
| G-UPSELL-1 | No upgrade relation | Absent | Do not invent; use variants / modifiers / combos | **FUTURE** |
| G-CAT-1 | Category complementary authoring convenience | Menu Setup | Follow-up slice; not required to ship item-level | **FUTURE** (PRESERVE intent) |
| G-PLACE-1 | Many possible surfaces | POS cart + consumer tags | One consumer placement: item detail | **PRESERVE** scope |
| G-PERS-1 | Personalization exists separately | Prefs / favorites | Stage H | **FUTURE** |
| G-PRICE-1 | Recs must not price themselves | N/A | Stage D only | **PRESERVE** |
| G-PROMO-1 | Recs must not discount themselves | N/A | Stage E only | **PRESERVE** |
| G-COMBO-1 | Combos as recommendation targets | Not in L1 complementary | Eligible later; not in first slice | **FUTURE** |

---

## 4. L4 — Target Contract

### What Stage G is

Merchant-owned, restaurant-scoped, **explicit item → item CROSS_SELL** merchandising.

```
Source MenuItem  →  Related MenuItem   (type = CROSS_SELL)
```

This is **not** a variant, modifier, combo, promotion, price, or personalized rank.

### Why this model (proved, not assumed)

- Existing A/F layers already express upgrade (variant), configuration (modifier), and bundle (combo). A new UPSELL graph would duplicate them without L1 evidence.
- Category-only complementary is real but too coarse and is **not** on the consumer food path.
- Industry complementary merchandising is item-level.
- Polymorphic source/target (item|category|combo|variant) is unnecessary for the first slice.

Category-to-category remains a **documented follow-up** that preserves L1 Menu Setup convenience. It does not block item-level G. It is **not** replaced by silently treating platform `Category` taxonomy as complementary (that tree is discovery taxonomy, not restaurant menu categories).

### Relationship rules

- Tenant: `merchantId` + `restaurantId` from the **source item**, never from the request body.
- Source and target must be distinct `MenuItem` rows, same restaurant and merchant, not deleted.
- Type in this slice: `CROSS_SELL` only.
- Unique `(sourceItemId, targetItemId, type)`.
- `sortOrder` is merchant-controlled. Consumer order is `sortOrder ASC`, `createdAt ASC`, `id ASC`.
- `status` ACTIVE / INACTIVE. Inactive is hidden from consumers; merchants still see it.
- No placement field. No schedule. No soft-delete (hard delete or INACTIVE).
- Combos are **not** sources or targets in this slice.
- Variants are **not** relation endpoints. Adding a recommended item uses that item’s own Stage A variant picker.
- Duplicate create is **idempotent**: same pair returns the existing row (and may update `sortOrder` / `status`).

### Retrieval and orderability

Consumer recommendations:

1. Load ACTIVE `CROSS_SELL` rows for the source item.
2. Load targets through the existing consumer catalog read.
3. Keep a target only if `appearsOnConsumerMenu` **and** `isConsumerOrderable` for the requested channel.
4. Cap at **8**.
5. If the source item is invalid / unpublished, `GET /discover/items/:id` already 404s — fail safely, no orphan recs.

A relation **never** makes a target orderable. Unpublished, deleted, sold-out, channel-disabled, restaurant-closed, and required-modifier-blocked targets do not appear.

### Pricing / promotions / combos

- Adding a recommended item uses the existing cart + `MerchandiseQuoteService` + `composeCommercialQuote`.
- No recommendation price, no recommendation discount, no stacking.
- Stage E evaluates the cart the diner actually built.
- Combo checkout and snapshots are unchanged. Combos are not recommendation targets.

### Placement (first slice)

**One surface:** consumer item detail (`GET /discover/items/:id` → `pairsWellWith` + Item screen “Pairs well with”).

Not in this slice: after Add to Cart, cart, checkout, confirmation, restaurant menu rail, custom-menu rail, combo screen, POS carousel rewrite.

Wording: **“Pairs well with”** — the relation is complementary. Do not say “Upgrade” (no UPSELL type). Do not say “Recommended for You” (that L1 label is tags / personalization). Recommendations are optional; they are not a required product choice.

### Authorization

- Merchant writes: `JwtStaffGuard` + `StaffAuthorizationGuard` + `MerchantScopeService`.
- Roles: `MERCHANT_OWNER` / `MERCHANT_STAFF` (same as catalog / combos). SUPER_ADMIN is **not** added to merchant catalog routes.
- Consumer read is the existing public discovery item surface (same auth as today).
- Never trust `merchantId` from the body.

### Super Admin / Global Catalog

**No UI and no inheritance.** L1 Super Admin Cross Selling is restaurant menu-setup, not a reusable library.

---

## 5. Evidence references

- `amealio-vendordashboard/src/models/menu-category.model.ts` — `cross_selling.category[]`
- `amealio-vendordashboard/src/services/menu-category/user-category.class.ts` — `cross_selling=true` item load + AVAILABLE filter
- `amealio-vendordashboard/src/services/vendor-items/recommended-items.class.ts` — tag buckets, cap 5
- `amealio-vendordashboard/src/services/vendor-items/user-personalisation-menu.class.ts` — Stage H
- `amealiodashboardmvp-/client/src/components/.../MenuSetup/CrossSelling.js` — merchant authoring
- `amealiodashboardmvp-/client/src/components/vendorDashboardComponents/ItemAvailability/CrossSellingVendorDash.js`
- `amealiodashboardmvp-/client/src/components/vendorDashboardComponents/Orders/OrderRequest/CarouselMain.js` — POS cart suggestions
- `amealiodashboardmvp-/client/src/store/actions/OrderingAction/vendorOrderingAction.js` — `get_suggested_items`
- `amealio_web_app/src/screens/orderingv1/cart/cartPage.jsx` — “Recommended for You”
- `amealio_web_app/src/screens/experiencev1/components/experienceRecommendedItems.js` — tag / rating fallback
- `amealiodashboardmvp-/.../helpPage/.../ServiceComponent.js` — marketing “upsell and cross sell”
- Docs 103 § G-UPSELL-1 / G-XSELL-1 / OD-UPSELL

---

## 6. Owner decisions

The following were **resolved from evidence** and are **not** open blockers:

| Candidate | Resolution |
|---|---|
| OD-G-1 item vs category vs both | **Item-level now.** Category-level is a follow-up that preserves L1 Menu Setup convenience. |
| OD-G-2 explicit upsell relations | **No** in Stage G. Variants / modifiers / combos already express upgrades. Same as 103 `OD-UPSELL` = FUTURE. |
| OD-G-3 after Add to Cart | **No** in this slice. L1 consumer has no such modal. |
| OD-G-4 max count | Server cap **8** (IMPROVE; L1 POS was unbounded). |
| OD-G-5 placement controls | **No** field. Implicit placement = item detail. |
| OD-G-6 manual order | **Yes** — `sortOrder`. |
| OD-G-7 schedule | **No**. |
| OD-G-8 Super Admin reusable relations | **No**. |
| OD-G-9 chain inheritance | **No**. |
| OD-G-10 analytics ranking | **FUTURE** (Stage H-adjacent). |

No unresolved owner decision blocks this slice.

---

## 7. Deferred

- Category-to-category complementary model / Menu Setup UI
- Explicit UPSELL relations (item or variant)
- Additional placements (cart, checkout, after-ATC, confirmation, menu rails, combo screen, POS carousel)
- Placement / schedule metadata
- Combo as source or target
- Global Catalog / chain inheritance of relations
- Super Admin merchandising UI
- Merchant dashboard authoring UI (API-only, same as Stage F combos)
- Tag merchandising rewrite (“Recommended / Best Seller”)
- Stage H: personalization, CF, embeddings, RAG, FBT learned models, segment ranking, loyalty ranking, analytics engine
- Recommendation discounts, BOGO, Buy X Get Y, promotion stacking
- Inventory / BOM, Celebration / Experience packages

---

## 8. Implementation recommendation

**Implement now (this document’s slice):**

1. Prisma `MerchandisingRelation` (CROSS_SELL, item→item, tenant FKs, unique pair, sortOrder, status).
2. Merchant catalog API to create / list / patch / delete, scoped by `MerchantScopeService`.
3. Compose orderable targets onto `GET /discover/items/:id` as `pairsWellWith`.
4. Consumer Item screen “Pairs well with” using existing design-system tokens. Add uses the existing cart + Stage D quote. Items that require customization navigate to the target item instead of skipping modifiers.
5. Tests covering authorization, isolation, validation, Stage C filters, ordering, idempotency, consumer retrieval, cart/quote/promotion consistency, combo non-target, A–F non-regression of calculators.

**Do not implement:** UPSELL type, category relations, AI, extra placements, Super Admin UI.
