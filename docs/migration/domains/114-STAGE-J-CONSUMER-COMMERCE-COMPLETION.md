# 114 — Stage J: Consumer Commerce Completion

**Status:** FORENSIC ONLY — L1–L4 contract. **No implementation.**  
**Date:** 2026-09-05  
**Accepted HEAD at start:** `9d7d8d7b1c89ec23638f92927ddbdd05160fa88f`  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Machine-readable matrix:** [114-STAGE-J-GAP-MATRIX.json](./114-STAGE-J-GAP-MATRIX.json)

This document recovers the canonical amealio **consumer / user-app commerce experience** from HOME through TRACKING, plus PROFILE / FAVORITES / SAVED ADDRESSES / DIETARY PREFERENCES. It compares that evidence to the current TurboRepo, industry practice, and the already-shipped A–G / Payment / Refund / OrderStatus authorities.

**Hard stop:** no schema, migrations, APIs, UI, seeds, or A–I production changes in this task. Do not implement Stage J. Do not start Stage H personalization. Do not start Stage K event/celebration commerce. Do not modify Stage I.

---

## Vocabulary (do not collapse)

| Term | What the evidence says it is | What it is not |
|---|---|---|
| **Saved Address** | Customer-owned address-book row (`Address`) | Not the historical order destination |
| **Order delivery address** | Destination used to fulfill that order | Not a live pointer that mutates when the book changes |
| **Guest cart** | Legacy unauthenticated local cart + `POST guest/cart` pricing | Not guest checkout |
| **Guest checkout** | Placing an order without a consumer JWT | **Not found** in legacy. Do not invent |
| **Canonical Home** | Target `/` = Home Page 1 taxonomy/discovery | Not Home V2 / RAG / moods (Stage H) |
| **Commercial quote** | Server `MerchandiseQuoteService` / cart / checkout totals | Not client-typed money |
| **Combo** | Stage F food bundle | Not a Celebration Package (Stage K) |
| **pairsWellWith** | Stage G merchant CROSS_SELL | Not favorites. Not Stage H ranking |
| **PaymentIntent** | Target prepaid capture object | Not a second payment engine |
| **RefundService** | Paid cancel / reject refund authority | Not a consumer refund-allocation UI |
| **OrderStatus** | Named order lifecycle | Not a client-predicted state machine |

Product intent (already documented in docs 90 / 98 / 103): a signed-in consumer discovers a restaurant, configures items/combos under server availability and quote, applies a promotion at commit, pays or chooses COD, and tracks/cancels the resulting order. Stage J completes that **surface**, it does not replace A–G.

---

## Evidence sources

| Repo | Path | Role | Stage J evidence |
|---|---|---|---|
| amealio_web_app | `/agent/repos/amealio_web_app` | Legacy consumer | Home V1/V2, restaurant/menu/item, orderingv1 cart/checkout/track, profile, favorites, addresses |
| Amealio-VendorDashboard | `/agent/repos/amealio-vendordashboard` | Legacy Feathers/Mongo **truth** | `guest/cart`, `user/cart`, `user/checkout`, `user-ordering`, `/address`, offers, Razorpay, `updateTransaction` |
| AmealioDashboardMVP- | `/agent/repos/amealiodashboardmvp-` | Merchant / Super Admin | **Not** on the consumer food path |
| Replateform-Amealio | `/agent/repos/replateform-amealio` | Target TurboRepo | `apps/web` routes + `apps/api` discover/cart/checkout/orders/me/* |
| amealio-nestjs-backend | `/agent/repos/amealio-nestjs-backend` | Legacy Nest | **No** consumer cart/checkout/ordering |
| amealio-self-delivery-app | `/agent/repos/amealio-self-delivery-app` | Rider | **No** consumer commerce |
| Amealio-VendorApp | — | Native merchant | **Unavailable** |
| Amealio-Homepage-V2-RAG-Server | — | Home V2 RAG | **Unavailable** (Stage H / doc 92 — out of J) |

### Migration documents inspected

`00` behavioral rule · `90` consumer ordering/payment · `91` self-delivery · `92` Home V2 · `94` Home 1 taxonomy · `95` order tracking · `96` profile/dietary · `97` favorites · `98` saved addresses · `99` offers browse (deferred) · `101`/`102`/`108` promotions · `103` core commerce · `104`–`110` Stages A–G · `111` Stage H (deferred) · `112` Stage I · `113` Stage K (deferred) · `52` cart/offer runtime · `56` payment/refund · `66`/`70`/`71`/`73` tip/donation.

---

## 1. L1 — Legacy Reality

### 1.1 Canonical food funnel (ordering v1)

Legacy production redirects favor **menu/v1 + orderingv1**. The older `/food/cartpage` + `/food/checkout/:order_id` path still exists and is the one that still wires **coupons + wallet**.

```
HOME (guest OK)
 → RESTAURANT / MENU / ITEM (guest OK)
 → CART (guest: Redux persist + POST guest/cart pricing; auth: /user/cart)
 → LOGIN required
 → CHECKOUT POST /user/checkout
 → PAY (Razorpay | Pay at Site / PAYLATER | Direct Merchant; wallet on legacy path only)
 → ORDER (user-ordering)
 → TRACK (GET + socket order_trigger + optional live map socket)
```

| Hop | Route | Component | API | Auth |
|---|---|---|---|---|
| HOME | `/` → `/home`; alt `/homepage2`, `/food/:id?` | `MainHomeScreen.jsx`, `HomePage2.jsx`, `HomePage.js` | moods / cravings / curation / `searchGlobal` / restaurant cards | Guest OK (`ProtectedLayer` does not redirect) |
| RESTAURANT | `/restaurant/:ID` | `NewRestaurantDetails.jsx` | `listRestaurant`, offers | Guest OK |
| MENU | `/restaurant/:ID/food/menu/v1` | `RestaurantMainMenu.jsx` | `v2/user/menu`; add uses `user/cart` or `guest/cart` | Guest OK |
| ITEM | `/restaurant/:ID/food/itemdetails/:itemId` | `V2ItemDetailsScreen.jsx` | item/menu | Soft gate only |
| CART | `/restaurant/:ID/food/cart` | `orderingv1/cart/cartPage.jsx` | `guest/cart` or `/user/cart` | Guest cart **yes**; checkout CTA requires login |
| CHECKOUT | `/restaurant/:ID/food/ordercheckout` | `OrderCheckout.jsx` | `GET /user/cart`, `POST user/checkout` | **Auth required** |
| PAYMENT | same page + `/food/direct-merchant-payment` | Razorpay + `updateTransaction` | JWT | Auth required |
| TRACK | `/restaurant/:ID/food/ordertrack/:order_id` | `OrderTrackScreenNew.jsx` | `GET user-ordering/:id`, sockets | Token used; no poll interval |

`amealio-nestjs-backend` and `amealio-self-delivery-app` contain **no** `user/cart`, `guest/cart`, or `user/checkout`.

### 1.2 Home / discovery classification

| Surface | Classification | Commerce role |
|---|---|---|
| Home V1 restaurant list / filters | **DISCOVERY** | Entry to restaurant |
| Home V2 default `/home` strips | **DISCOVERY + PERSONALIZATION + CONTENT** | Entry only |
| Moods / cravings / curations | **DISCOVERY** (curated lists; prefs are Stage H) | Not cart |
| Global search | **SEARCH** | Not cart |
| Bytes / Experiences / scraped Events | **CONTENT** | Stage K / editorial — not food checkout |
| HomePage2 RAG (`dev-recommendation-api`) | **PERSONALIZATION** | Isolated. Not in cart/checkout |
| Bestseller / ratings rails | **MERCHANDISING** / **DISCOVERY** | Display |
| Navbar `userLocation` / maps | **SEARCH** / geo | Lane C of doc 98 — not checkout |

Stage J does **not** pull Home V2, RAG, moods, cravings, or curations into the consumer commerce contract. Those remain Stage H / content.

### 1.3 Cart (legacy)

| Concern | Reality |
|---|---|
| Guest cart | **Yes.** Redux persist → `localStorage` (`ordering` whitelist) + stateless `POST guest/cart` (prices only; **does not persist** server-side) |
| Auth cart | Mongo `/user/cart` |
| Merge on login | **Yes.** Guest lines POSTed to `/user/cart` |
| Guest checkout | **No.** UI + `user-ordering` reject missing JWT |
| Restaurant scope | Conflict popup; must clear to switch restaurant |
| Address | Auth cart stores `address_id` (`PUT /user/cart`) |
| Tip / donation | Collected on **cart** (`CartSummary`), sent through checkout |
| Coupons | **Absent on v1 cart.** Present on legacy `CartPage` / `OffersOrdering` |
| Notes | Per-restaurant notes in a separate localStorage helper |

### 1.4 Address / checkout (legacy) — mandatory forensic point

Three lanes already isolated in doc 98:

| Lane | Legacy behavior |
|---|---|
| A. Address book | JWT CRUD `/address`. Ownership is `User.addressLocations[]`, not `Address.user_id`. Delete pulls the id; Mongo document often remains |
| B. Checkout selection | Cart `address_id` → order `deliveryAddress` **live ObjectId**. Checkout also sends embedded `user_data` / `delivery_address_id` |
| C. Browse geo | `localStorage.userLocation`. Selecting a saved address on the profile book updates **browse location**, not cart |

**Snapshot evidence**

- Standard home-delivery order stores `deliveryAddress` as an ObjectId and copies `delivery_location {lat,lng}` at create (`user-ordering.class.ts`).
- Subsequent reads `.populate('deliveryAddress')`.
- If the address is edited after place, historical orders show the **new** text.
- If the address is deleted, populate can return **null**. No consumer fallback to a full text snapshot was found.
- Catering has a richer `settings_snapshot` / mixed `delivery_address` — not the standard food path.

**Conclusion:** legacy is a **live FK + coordinate copy**, not a historical address snapshot. That is unsafe for fulfillment history.

Recipient `mobile` / `contactName` are collected in some UI forms and **dropped by Mongoose**. `additionalInstructions` persists on the Address document. Target `Address` has neither phone nor instructions.

### 1.5 Payment (legacy)

| Method | Ordering v1 | Legacy checkout page |
|---|---|---|
| Razorpay (UPI / cards / netbanking) | Yes | Yes |
| PAY_LATER / Pay at Site | Yes (`PAYLATER`, `paymentType: 6`) | Yes |
| Direct Merchant UPI + proof | Yes (separate page) | Not found on v1 |
| Wallet | **Not found** on v1 | Yes |
| COD | Enum exists; **not wired** on v1 UI | Enum only |

Sequence (v1 + Razorpay): create unpaid order first → Razorpay Orders → client SDK → `updateTransaction` → PATCH order PENDING. **No HMAC verify** on the consumer path. Webhook stub. Duplicate checkout guarded only by a UI `placingOrder` flag — **no idempotency key**.

### 1.6 Promotions (legacy)

- V1 cart/checkout: **no coupon UI**.
- Legacy cart: apply/remove; `usercart` validates; usage can increment **at apply** (doc 52 / 90 — unsafe).
- Standalone `/offers` consumer page: **404** (doc 99).

### 1.7 Order / tracking / cancel (legacy)

- Track: one-shot GET + Feathers socket `order_trigger`. **No status poll.**
- Live map: separate socket when status is on-the-way.
- Cancel: only while `order_status === 0` → status 8.
- Refund UX for standard food: **not found** (status change only; wallet refund if `settleAmount` set).
- Help on track: “Help Coming Soon.”

### 1.8 Profile / favorites / dietary / auth

| Surface | Commerce requirement |
|---|---|
| Saved addresses | **Required** for delivery/catering checkout handoff |
| Dietary / allergies | Copied into cart/checkout notes; **not** a checkout gate |
| Multi-diner profiles | Optional “ordered for” |
| Restaurant / item favorites | Hearts + lists; **not** required to place |
| Login | Feathers JWT. OTP / social exist. Guest browse allowed |
| Guest commerce | Cart yes, checkout **no** |

### 1.9 Failure / empty / closed (legacy)

| Case | Handling |
|---|---|
| Empty cart | Dedicated empty state |
| Sold out / not now | Slot chips; add can return `NO_SIZE` |
| Restaurant closed | Badge “Closed Now / Today” — **informational**; hard block before add **not found** |
| Wrong restaurant | Conflict popup |
| Checkout fetch fail | `cartFetchError` |
| Duplicate submit | UI flag only |

---

## 2. Current target reality

The TurboRepo already ships a **signed-in, server-authoritative** food loop. Surfaces exist; several are intentionally incomplete.

### 2.1 Consumer routes (`apps/web/src/App.tsx`)

| Path | Screen | Auth | Status |
|---|---|---|---|
| `/` | `HomeScreen` | Public | Canonical Home 1. City + name + category chips. No moods/V2/RAG/geo |
| `/login` | `LoginScreen` | Public | Phone + password. OTP/social **absent** |
| `/restaurants/:id` | `RestaurantScreen` | Public | Menu + combos + custom menus. Channel hardcoded `HOME_DELIVERY`. Favorite |
| `/restaurants/:restaurantId/menus/:menuId` | `CustomMenuScreen` | Public | Custom menu |
| `/items/:id` | `ItemScreen` | Browse public; add → login | Variants, modifiers, server quote, Stage G rail |
| `/combos/:id` | `ComboScreen` | Browse public; add → login | Stage F slots / quote / cart |
| `/cart` | `CartScreen` | **Required** | Server cart, coupon, qty/remove. No address, tip, payment |
| `/checkout` | `CheckoutScreen` | **Required** (redirect) | Coupon, COD/PREPAID, idempotency. **No address. No tip. No PAY_LATER. No verify** |
| `/orders` | `OrdersScreen` | Required | `lane=active\|history` |
| `/orders/:id` | `OrderScreen` | Required | Timeline, 15s poll, cancel INITIAL/PENDING, rider name/phone. No map |
| `/profile` | `ProfileScreen` | Required | Email, dietary chips, allergies |
| `/favorites` | `FavoritesScreen` | Required | RESTAURANT / MENU_ITEM |
| `/addresses` | `AddressesScreen` | Required | Book CRUD. Copy: *“These do not change checkout”* |
| `*` | Navigate `/` | — | No dedicated 404 page |

**Not a route:** `/restaurants` list (home is the list), `/offers`, `/wallet`, Home V2, moods, celebrations.

Header + tab bar: Home, Cart, Orders, Profile / Sign in. `--ame-*` + Inter. Mobile tab bar; desktop hides tab bar.

### 2.2 APIs the consumer actually calls

| Client | Endpoints |
|---|---|
| `discoverApi` | `GET /api/v1/discover/home`, restaurant, menu, menus, items, combos, `POST /quote` |
| `authApi` | register / login / me / logout |
| `cartApi` | `GET/PATCH/DELETE /api/v1/cart`, `POST /cart/items` (`?couponCode=`) |
| `checkoutApi` | `POST /api/v1/checkout` + `Idempotency-Key` |
| `ordersApi` | `GET /me/orders`, `GET /:id`, `PATCH /:id/cancel` |
| `profileApi` | `GET/PATCH /me/profile` |
| `favoritesApi` | `GET/PUT/DELETE /me/favorites` |
| `addressesApi` | CRUD `/me/addresses` |
| Offers browse | **Not in client** (doc 99 deferred) |
| `POST /payments/verify` | **Exists on API; not called by web** |

`CheckoutDto` accepts `restaurantId`, `type`, `settlement`, `couponCode`, `tipMinor`, `donationMinor`, optional `items`. **No `addressId`.** Ordering module does not read `deliveryAddressId`.

### 2.3 What already works (do not rebuild)

- Stage C orderability on item/combo/cart/checkout (unpublished / unavailable lines excluded from subtotal; channel `HOME_DELIVERY`).
- Stage D server quote on PDP, cart, checkout. Client never sends money fields.
- Stage E coupon apply/remove on cart + checkout; re-evaluated server-side; redemption at paid commit.
- Stage F combo configure + cart + quote.
- Stage G `pairsWellWith` rail on item.
- Server cart, restaurant-scoped (adding another restaurant **replaces** the cart).
- Checkout idempotency key in `sessionStorage`.
- COD → `PENDING`, cart cleared. PREPAID → `INITIAL` + Razorpay `PaymentIntent`.
- PAY_LATER accepted by **API**, omitted by **UI**.
- Order list/detail, poll, customer cancel, server refund on paid cancel.
- Profile dietary, favorites, address book.

### 2.4 What is stubbed or unused

| Capability | Schema / API | Web |
|---|---|---|
| `Cart.guestToken` | Column + index | Unused. JWT cart only |
| `Order.deliveryAddressId` | Optional FK | Unused |
| Address snapshot on Order | **None** | None |
| Tip / donation | DTO + Order columns; tip routing exists | Web does not send `tipMinor` |
| Prepaid verify | `POST /payments/verify` + webhook | Warning banner only |
| Wallet as instrument | `PaymentMethod.WALLET`; refund rail | No consumer wallet |
| Delivery charge line | `deliveryChargeMinor` on cart/order | `QuoteTotals` omits it |
| Restaurant open/closed hours | Not on discover home | No closed badge |
| Offers browse | Offer/Coupon models | No `/offers` |

---

## 3. L2 — Industry Benchmark

Evidence, not authority. Used to classify CORRECT vs IMPROVE. Not a license to copy competitors.

| Practice | Why it matters here |
|---|---|
| Server-authoritative totals | Already target (Stage D). Preserve |
| Reprice + re-evaluate promo at commit | Already target (D + E). Preserve |
| Idempotent checkout | Already target. Preserve |
| HMAC verify + webhook as payment SoT | Already Nest kernel. Consumer UI must not treat Razorpay “success” as paid |
| Order-first then pay (amealio) **or** pay-then-place | Keep amealio order-first `INITIAL` (doc 90) |
| Historical delivery-address snapshot on the order | Live FK after edit/delete is unsafe. **CORRECT** vs legacy populate |
| Saved-address book ≠ order destination | Doc 98 lanes. Preserve the split; wire selection only |
| Guest browse; login before pay | Matches legacy. Guest **checkout** is not evidenced |
| Guest cart + merge-on-login | Common; legacy has it; target does not. Not required to complete signed-in commerce |
| Cancel before accept; explicit refund | Already target + RefundService |
| Poll if no socket; named timeline | Already target (15s poll) |
| Live map / ETA / push | Common; not required to complete the contract. FUTURE |
| Mobile-first checkout, 44px targets, labelled fields, errors next to controls | Target tokens already (`--ame-touch`, `Field`, `StatusPanel`) |
| Do not show sold-out as addable | Target badges + server reject. Preserve |

---

## 4. L3 — Gap Analysis

See also [§25 matrix](#25-legacy-vs-target-matrix) and `114-STAGE-J-GAP-MATRIX.json`.

**Core commerce holes (Stage J):**

1. **HOME_DELIVERY checkout has no destination.** Address book is live and explicitly decoupled. This is the only missing step that makes the food path commercially incomplete for delivery.
2. **No historical address snapshot.** Even if `deliveryAddressId` is written later, a live FK repeats the legacy populate bug.
3. **Prepaid consumer completion** (Razorpay SDK + verify) is API-ready and UI-incomplete. COD already closes the loop.
4. **Tip collection UI** is API-ready and omitted. Settlement/routing already exists; this is UX, not a new engine.
5. **Guest cart** is a product choice, not a commerce blocker.
6. Home V2 / moods / RAG / live map / notifications / donations / offers browse / wallet instrument are **out of J** or already deferred.

**103 G-UX-1** (“target lacks customization/combo/menu switcher”) is **closed** by current `ItemScreen` / `ComboScreen` / `CustomMenuScreen`. Do not use that row to justify rebuilding catalog UX.

---

## 5. L4 — Target Contract

Stage J does **not** introduce a second availability, price, promo, combo, merchandising, payment, refund, or status engine.

### 5.1 End-to-end journey (canonical)

```
GET /discover/home                         [public; taxonomy]
 → /restaurants/:id + menu                 [public; Stage B/C]
 → /items/:id | /combos/:id                [public quote; Stage C/D/F/G]
 → POST /cart/items                        [JWT; server reprice]
 → GET /cart?couponCode=                   [Stage D+E]
 → POST /checkout + Idempotency-Key
      client sends: restaurantId?, type, settlement, couponCode?,
                    tipMinor?, addressId? (identity only)
      server owns: availability, prices, discount, tax, fees,
                   delivery charge, grand total, payment amount
      HOME_DELIVERY / CATERING: require owned, non-deleted address
      snapshot destination onto the Order
 → COD | PAY_LATER → Order PENDING, cart cleared
 → PREPAID → Order INITIAL + PaymentIntent
      POST /payments/verify and/or webhook → PENDING, cart cleared
 → /orders/:id                             [own orders only]
```

Browse remains public. Add-to-cart, cart, checkout, orders, profile, favorites, addresses remain JWT.

### 5.2 Authority map (do not duplicate)

| Concern | Authority | Consumer may |
|---|---|---|
| Availability / orderability | **Stage C** | Display sellable / sold-out; never override |
| Prices, tax, fees, delivery charge, grand | **Stage D** `MerchandiseQuoteService` / commercial quote | Display `QuoteTotals` |
| Promotion / coupon | **Stage E** `PromotionEvaluationService` + `CouponRedemption` | Send `couponCode` |
| Combo configuration | **Stage F** `ComboService` | Send slot selections |
| Cross-sell | **Stage G** merchant `CROSS_SELL` | Render rail; add still goes through C/D |
| Personalization / RAG / moods | **Stage H** | **Out.** Home stays canonical |
| Global → merchant copy | **Stage I** | Consumer sees merchant item only |
| Event / celebration | **Stage K** | **Out** |
| Payment | **PaymentService** | Choose settlement; prepaid verify uses existing kernel |
| Refund | **RefundService** | Cancel; server refunds if captured |
| Order lifecycle | **OrderStatus** + `OrderStatusEvent` | Display; cancel INITIAL/PENDING |
| Saved address book | **Address** + `/me/addresses` | CRUD own rows |
| Order destination | **Order snapshot** (new) + optional `deliveryAddressId` lineage | Select `addressId` at checkout |

No client money. No localStorage cart unless OD-J-1 explicitly accepts guest cart. No second promo engine. No map requirement on the first slice.

### 5.3 Address / checkout contract (Lane B)

Doc 98 Lane A (book) stays as-is. Lane C (browse geo / maps) stays FUTURE.

For **HOME_DELIVERY** and **CATERING**:

1. Client sends `addressId` (UUID of a row from `/me/addresses`).
2. Server loads the row by JWT `sub`. Reject missing, foreign, or `deletedAt != null`.
3. Persist an **immutable snapshot** on the Order (JSON): label, line1, line2, city, state, pinCode, lat, lon if present, plus `sourceAddressId` and `snapshottedAt`.
4. Optionally set `Order.deliveryAddressId` as **lineage only**. Display and fulfillment read the snapshot.
5. Subsequent book edit/delete **must not** change historical order destination.
6. DINE_IN / TAKE_AWAY / CURB_SIDE / SKIP_LINE: address **not** required.
7. Default book address may pre-select in UI; server still requires an explicit id (do not silently invent from `isDefault` without a client identity). Using default without selection remains product-optional — see OD-J-4 for extra recipient fields, not for skipping selection.

This is **CORRECT** vs legacy live populate, and **IMPROVE** vs current target (no destination).

### 5.4 Cart contract (preserve)

- One active cart per user. Cross-restaurant add **replaces** (current API). UI should say so (IMPROVE copy; do not change replace semantics in the first slice).
- Unavailable lines stay visible, excluded from subtotal (current).
- Coupon in `sessionStorage` is a reminder only; server re-evaluates.
- Empty cart blocks checkout (current).
- Guest cart remains **off** unless OD-J-1 says otherwise.

### 5.5 Payment / tip / donation

- Settlements: `COD` and `PREPAID` stay first-class. `PAY_LATER` is already a server settlement — exposing it in the select is IMPROVE, not a new rail.
- Prepaid: keep order-first; capture via existing verify/webhook only.
- Wallet **instrument** and Direct Merchant remain FUTURE / existing owner decisions (docs 90 / 95 OD-6).
- Tip: API already accepts `tipMinor`; web should collect 10/15/20/custom when the first checkout-completion slice includes it. **0% amealio commission** and merchant beneficiary stay as already implemented. Do not redesign settlement. Tip after place is **out**.
- Donation: **FUTURE** (already).

### 5.6 Tracking / refunds / account

- Keep GET + 15s poll + named `statusEvents`. Sockets, map, rider GPS, ETA, push: **FUTURE** (doc 95).
- Cancel INITIAL/PENDING only; paid cancel uses RefundService. No consumer refund-amount editor.
- Profile / dietary / favorites stay account surfaces. Dietary does not gate checkout. Favorites do not become Stage G or H.

### 5.7 Authentication

| Action | Target |
|---|---|
| Browse home/restaurant/item/combo | Public |
| Add to cart / cart / checkout / orders / profile / favorites / addresses | Consumer JWT |
| Guest checkout | **Forbidden** (legacy + current) |
| Guest cart | Off unless OD-J-1 |
| Foreign order / address / favorite | 404, not 403 leakage |
| Session expiry | 401 → `/login?next=` |

### 5.8 Failure states (consumer must fail safe)

| Case | Target |
|---|---|
| Loading | `StatusPanel` + skeleton (current) |
| Empty cart / empty menu / empty favorites / empty addresses | Empty banner, no fake rows |
| Sold out / not orderable | Badge; add/quote rejected by Stage C |
| Restaurant unavailable | Discover/menu error + retry |
| Restaurant closed / not accepting type | Server reject at quote/cart/checkout (Stage C). UI badge is IMPROVE if hours exist |
| Invalid / expired / min-order coupon | Promo error code; cart remains |
| Stale cart / 409 cancel | Reload server state |
| Checkout fail | Keep Idempotency-Key; show error |
| Prepaid verify fail | Order stays INITIAL; no client “paid” |
| Unauthorized | Login with `next` |
| Unknown route | Today redirects `/`. Dedicated 404 is IMPROVE, not blocking |
| Network | Retry on StatusPanel |

---

## 6. End-to-end consumer journey

```
HOME (/) ──public──► RESTAURANT ──► MENU / CUSTOM MENU
                         │
                         ├── ITEM (quote C/D, modifiers, G rail)
                         └── COMBO (quote F)
                         │
                         ▼
                    LOGIN if needed
                         │
                         ▼
                      CART (server D+E)
                         │
                         ▼
                    CHECKOUT
                      coupon (E)
                      addressId if delivery   ← GAP
                      settlement COD|PREPAID
                      tipMinor optional       ← UX gap
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
         COD/PAY_LATER              PREPAID
         PENDING                    INITIAL → verify/webhook → PENDING
            │                         │
            └────────────┬────────────┘
                         ▼
                    /orders/:id
                    poll + cancel
```

Experiences, celebrations, Home V2, and RAG do **not** appear on this path.

---

## 7. API / surface inventory

### 7.1 Existing target routes (do not add)

`/` · `/login` · `/restaurants/:id` · `/restaurants/:restaurantId/menus/:menuId` · `/items/:id` · `/combos/:id` · `/cart` · `/checkout` · `/orders` · `/orders/:id` · `/profile` · `/favorites` · `/addresses`

### 7.2 Missing routes (document only — do not add)

| Path | Why missing | Action |
|---|---|---|
| `/restaurants` | Home **is** the list | Do not add |
| `/offers` | Doc 99 deferred | FUTURE |
| `/wallet` | No consumer wallet | FUTURE / OD-6 in 95 |
| `/homepage2` / moods / cravings | Stage H | Out of J |
| Experience / event / celebration routes | Stage K | Out of J |

### 7.3 Justified API change **after GO** (not in this task)

| Change | Why |
|---|---|
| `CheckoutDto.addressId?: string` | Client identity only |
| CheckoutService load/validate Address | Server ownership |
| `Order.deliveryAddressSnapshot Json?` (or equivalent) | Historical destination |
| Checkout + order GET serialize snapshot | Confirmation / track |
| Web checkout address picker | Lane B UX |

No new payment, promo, catalog, or personalization APIs.

---

## 8. Commerce authority map

```
Stage C  Availability/orderability
Stage D  MerchandiseQuote / commercial totals / BigInt minor units
Stage E  PromotionEvaluation + CouponRedemption
Stage F  ComboService
Stage G  Merchant CROSS_SELL (pairsWellWith)
Stage H  Personalization — DEFERRED — not in J
Stage I  Global materialization — merchant catalog only on consumer path
Stage K  Event/Celebration — DEFERRED — not in J
PaymentService     PaymentIntent / verify / webhook / capture
RefundService      Paid cancel / reject
OrderStatus        Lifecycle + statusEvents
Saved Address      Customer book (/me/addresses)
Order destination  Historical snapshot (GAP)
```

**Conflicts found**

| Conflict | Resolution |
|---|---|
| `Cart.guestToken` vs JWT-only cart | Schema leftover. Do not activate without OD-J-1 |
| `Order.deliveryAddressId` unused vs checkout with no address | First slice: snapshot + optional FK lineage |
| `CheckoutDto.tipMinor` vs web omitting tip | UX gap; do not add a second tip engine |
| `PAY_LATER` in DTO vs COD/PREPAID select | IMPROVE UI later; API already correct |
| Legacy live `deliveryAddress` populate vs industry snapshot | **CORRECT** to snapshot |
| Legacy v1 no coupon vs target coupon at cart | Target E is authority. Preserve target |
| Legacy v1 no COD vs target COD | Target 90 is authority. Preserve COD |
| 103 G-UX-1 vs current Item/Combo/CustomMenu | Closed. Do not reopen catalog UX |

---

## 9. Failure-state matrix

| State | Legacy | Target | Class |
|---|---|---|---|
| Loading | Mixed | `StatusPanel` + skeleton | PRESERVE |
| Empty cart | Dedicated | Banner + no checkout form | PRESERVE |
| Sold out | Chips | Badge + server reject | PRESERVE |
| Unpublished | Hidden/inconsistent | Not in consumer menu | PRESERVE (C) |
| Restaurant closed | Badge, weak gate | No hours badge; C rejects unorderable items | IMPROVE badge if hours exist |
| Invalid coupon | Legacy cart only | `promoCodeFromError` | PRESERVE (E) |
| Payment fail | Order stays INITIAL | Same (doc 90) | PRESERVE |
| Checkout fail / retry | UI flag; can double-create | Same Idempotency-Key | PRESERVE |
| Stale cancel 409 | n/a | Reload | PRESERVE |
| Unauthorized | Login modal | `/login?next=` | PRESERVE |
| Session expiry | JWT fail | 401 → login | PRESERVE |
| 404 order | Mixed | Error + retry | PRESERVE |
| Unknown URL | Various | Redirect `/` | IMPROVE dedicated 404 later |
| Deleted address after order | Populate null | N/A today; snapshot prevents this | CORRECT |

---

## 10. Authentication / guest behavior

| Question | Legacy | Target | Contract |
|---|---|---|---|
| Guest browse | Yes | Yes | PRESERVE |
| Guest cart | Yes (local + `guest/cart`) | No | **OD-J-1** |
| Merge on login | Yes | N/A | Follows OD-J-1 |
| Guest checkout | **No** | No | **Do not invent.** Resolved. Not OD-J-2 |
| Protected writes | JWT | Consumer JWT | PRESERVE |
| OTP / social | Yes | No | FUTURE (doc 25 / 95) |

---

## 11. Address / checkout behavior

| Question | Finding |
|---|---|
| Does checkout select a saved address today? | **No** |
| Does Order store a destination today? | **No** (`deliveryAddressId` unused) |
| Must checkout snapshot? | **Yes** — CORRECT. Live FK is insufficient |
| Must maps/geocoder ship in J? | **No.** Lane C FUTURE. Coordinates optional metadata |
| Must recipient/phone/instructions exist? | **OD-J-4.** Not on target Address; legacy mobile/contactName were dropped |
| Default address auto-apply? | Optional UX. Server still needs `addressId` |

---

## 12. Payment behavior

Canonical path unchanged (doc 90):

- PREPAID: Order → PaymentIntent → verify/webhook → capture → PENDING  
- COD / PAY_LATER: PENDING, no intent  

Consumer gaps: no Razorpay SDK, no verify call, no PAY_LATER option, no wallet instrument. Do not create a parallel engine. Completing prepaid UI is IMPROVE **after** address snapshot if COD remains the smoke path.

---

## 13. Promotion behavior

Target E is complete enough for commerce: apply/remove/invalid/expired/min-order/restaurant/service-type/usage/COD/prepaid/cancel/refund. Consumer UX gaps only: no offers browse (doc 99 DEFER), no auto-apply merchandising rail (do not invent; Stage E already evaluates). Do not redesign E.

---

## 14. Refund / cancellation behavior

Customer cancel INITIAL/PENDING; merchant reject uses doc 88; paid cancel → RefundService (Razorpay or wallet rail). No consumer refund editor. Wallet-vs-Razorpay **display** remains the existing 95 OD-6 — do not invent allocation.

---

## 15. Responsive UX findings

| Surface | Finding |
|---|---|
| Legacy | Mobile-first restaurant funnel; desktop is the same stack |
| Target | `app-shell`, sticky CTA, tab bar on small screens, tab bar hidden `min-width` desktop, `--ame-touch: 44px` |
| Gap | Checkout has no address block (behavioral, not visual). Do not reproduce Mulish / legacy chrome |

---

## 16. Accessibility findings

| Control | Target | Gap |
|---|---|---|
| Primary nav / tab bar | `aria-label="Primary"` | None blocking |
| Category chips | `aria-pressed` | Preserve |
| Fields | `<label class="field">` wraps control | Preserve |
| Favorites | `aria-pressed` | Preserve |
| Delete address | `role="dialog" aria-modal` | Preserve (better than legacy no-confirm) |
| Order timeline | `ol aria-label` | Preserve |
| Quote | `aria-live="polite"` on item price | Preserve |
| Checkout settlement | labelled `<select>` | Add address group with the same pattern |
| Screen-reader / focus audit | Not a full a11y rewrite | No commerce blocker found |

Do not start an accessibility rewrite in Stage J.

---

## 17. PRESERVE

- Server-authoritative quote / cart / checkout (C/D/E/F).
- Order-first prepaid `INITIAL`; COD/PAY_LATER `PENDING`.
- Checkout `Idempotency-Key`.
- Coupon at cart/checkout; redeem at paid commit.
- One restaurant per cart; replace on switch.
- Named `OrderStatus` + events; cancel INITIAL/PENDING; RefundService.
- Canonical Home 1 (not V2).
- Address **book** as own-resource CRUD (doc 98 Lane A).
- Favorites as bookmarks, not merchandising or ranking.
- Dietary prefs as profile, not checkout gate.
- Inter + `--ame-*`. Guest browse. Login before pay.
- Combo ≠ package. Cross-sell ≠ favorites. Help-desk `ticket` ≠ admission.

---

## 18. IMPROVE

- Checkout address picker on existing book (Lane B).
- Show delivery charge in `QuoteTotals` when server returns it.
- Expose `PAY_LATER` in the settlement select (API already accepts).
- Prepaid: wire existing verify (and SDK) so INITIAL orders can become PENDING without a staff tool.
- Collect `tipMinor` in checkout using existing DTO (10/15/20/custom).
- Tell the user when add-to-cart **replaces** another restaurant’s cart.
- Restaurant closed / not-accepting badge if hours exist in discover (server remains the gate).
- Dedicated 404 instead of silent `/` redirect (later).

---

## 19. CORRECT

- **Do not** copy legacy live `deliveryAddress` populate as the historical destination. Snapshot at place.
- **Do not** trust client totals (already corrected vs legacy `CheckOutPage`).
- **Do not** increment coupon usage at apply (already corrected in E).
- **Do not** HMAC-skip prepaid (already corrected in PaymentService).
- **Do not** invent guest checkout.
- **Do not** treat `Cart.guestToken` as live behavior.
- **Do not** treat address-book mutation as changing past orders.

---

## 20. OWNER DECISION

Only unresolved product choices. Examples from the brief that are **already resolved** are listed in §27.

| ID | Decision | Why it is unresolved |
|---|---|---|
| **OD-J-1** | Guest cart + merge-on-login? | Legacy yes; target no; industry common; **not** required to finish signed-in commerce |
| **OD-J-4** | Recipient name / phone / delivery instructions on the snapshot? | Legacy UI collected some; Mongo dropped mobile/contactName; target Address has no such columns |
| **OD-J-5** | Must HOME_DELIVERY require lat/lon? | Legacy API did not require coords; maps are Lane C FUTURE |

---

## 21. FUTURE

- Home V2, RAG, moods, cravings, curations, personalized ranking (Stage H).
- Event / celebration / packages / tickets / seating (Stage K).
- Browse geo, maps, geocoder, location permission (doc 98 Lane C).
- Live sockets, rider map, delivery ETA, push notifications.
- Guest checkout (not evidenced).
- Donation capability.
- Tip edit after the order is placed.
- Consumer wallet as a pay-in instrument; offers browse page; OTP/social login.
- Inventory/BOM, tax/fee/settlement redesign, AI.

---

## 25. Legacy vs target matrix

| ID | Behavior | LEGACY | TARGET | GAP | CLASS | ACTION |
|---|---|---|---|---|---|---|
| J-HOME-1 | Default home | V2 strips + V1 list | Canonical Home 1 taxonomy | Moods/V2 absent | PRESERVE | Keep Home 1; H stays deferred |
| J-DISC-1 | Restaurant search/filter | Geo + cuisine/mood | City + q + category | No geo/open-closed | IMPROVE / FUTURE | Hours badge later; no geo in first slice |
| J-MENU-1 | Standard + custom menu | v1 menu + custom | Restaurant + custom menu routes | Channel fixed HOME_DELIVERY in UI | PRESERVE | Server still takes `type` |
| J-ITEM-1 | Customize + quote | Client + server mix | Server quote + modifiers | None material | PRESERVE | Do not add a second model |
| J-COMBO-1 | Combo slots | Menu combos | Stage F consumer | None material | PRESERVE | Do not expand F |
| J-G-1 | Cross-sell | Category / related | `pairsWellWith` | None material | PRESERVE | Do not turn into H |
| J-CART-1 | Auth cart | Mongo `/user/cart` | Prisma JWT cart | None | PRESERVE | |
| J-CART-2 | Guest cart | localStorage + `guest/cart` | Banner “not on this slice” | Product | OWNER DECISION | OD-J-1 |
| J-CART-3 | Persistence | Guest local; auth server | Server only (`sessionStorage` for coupon/key) | Matches no-guest | PRESERVE | Do not invent local cart |
| J-PROMO-1 | Apply code | Legacy path only | Cart + checkout E | V1 had none | PRESERVE | Do not reopen 99 |
| J-ADDR-1 | Address book | `/address` | `/addresses` + `/me/addresses` | Done | PRESERVE | Lane A closed |
| J-ADDR-2 | Checkout selection | Cart `address_id` | **Missing** | Delivery has no destination | IMPROVE | First slice |
| J-ADDR-3 | Order destination | Live ObjectId + lat/lng | Unused FK | Historical integrity | CORRECT | Snapshot |
| J-ADDR-4 | Recipient / phone / notes | Partial / dropped | No columns | Product | OWNER DECISION | OD-J-4 |
| J-PAY-1 | COD | Unwired on v1 | COD first-class | Target ahead | PRESERVE | |
| J-PAY-2 | Prepaid verify | Fetch/capture, no HMAC | Kernel exists; web unwired | Consumer completion | IMPROVE | After address slice |
| J-PAY-3 | PAY_LATER | v1 Pay at Site | API yes, UI no | UI | IMPROVE | Small select change later |
| J-PAY-4 | Wallet instrument | Legacy page | Refund rail only | 95 OD-6 | FUTURE | |
| J-TIP-1 | Tip collect | Cart summary | DTO unused by web | UX | IMPROVE | Existing `tipMinor` |
| J-DON-1 | Donation | Udbhav flag | Column unused | Product | FUTURE | |
| J-ORD-1 | Confirmation / track | Socket + map | Poll + timeline | Map/sockets | FUTURE | Doc 95 |
| J-CXL-1 | Cancel / refund | Status 8; weak refund UX | Cancel + RefundService | Display only | PRESERVE | |
| J-PROF-1 | Profile / dietary | Health flow | `/profile` | Done | PRESERVE | Not H |
| J-FAV-1 | Favorites | Hearts + lists | Restaurant + item | Done | PRESERVE | Not G/H |
| J-AUTH-1 | Guest checkout | No | No | None | CORRECT | Do not invent |
| J-ERR-1 | Fail-safe | Mixed | StatusPanel | Closed hours badge | IMPROVE | Non-blocking |
| J-A11Y-1 | A11y | Inconsistent | Tokens + labels | No blocker | PRESERVE | No rewrite |

---

## 26–27. Classifications and exact owner decisions

See §§17–21. Open ODs:

**OD-J-1 — Guest cart?**  
Legacy: yes (local + pricing API), merge on login, checkout still requires login. Target: no. Industry: often yes.  
Recommendation if forced to pick for the first slice: **keep guest cart off.** Signed-in commerce is already complete enough; activating `guestToken` is a new identity/persistence design.

**OD-J-4 — Recipient / phone / instructions on the delivery snapshot?**  
Legacy persistence does not reliably store mobile/contactName. Target Address is label + lines + city/state/pin + optional lat/lon.  
First slice can snapshot **existing Address fields only**. Extra recipient fields need columns or snapshot-only extras — do not guess.

**OD-J-5 — Map/geo required for delivery?**  
Legacy book validator did not require coordinates. Target HTTP omits lat/lon.  
First slice: **coordinates not required.** Lane C / rider dropoff geo stays FUTURE.

### Resolved (do not re-open as ODs)

| Brief example | Resolution | Why |
|---|---|---|
| OD-J-2 Guest checkout | **No** | Not in legacy; target 401; do not invent |
| OD-J-3 Snapshot format | **JSON snapshot + optional `deliveryAddressId` lineage** | Live FK is CORRECT-to-replace; format follows `commercialSnapshot` |
| OD-J-6 Live tracking/map | FUTURE | Doc 95 |
| OD-J-7 Notifications | FUTURE | No inbox HTTP |
| OD-J-8 Tip after order | **No** | Tip at checkout only (legacy cart-before-pay) |
| OD-J-9 Donation | FUTURE | Existing tip/donation docs |
| OD-J-10 Wallet vs Razorpay refund UX | Existing RefundService + 95 OD-6 | Do not invent an allocator |
| OD-J-11 Delivery ETA | FUTURE | |
| OD-J-12 Checkout payment methods | COD + PREPAID now; PAY_LATER = IMPROVE UI; wallet/direct = FUTURE | API already has three settlements |

---

## 28–29. Smallest justified Stage J implementation slice

**Decision: IMPLEMENT NOW** (when an explicit GO is given). **Do not implement in this forensic task.**

The consumer A–G path already places COD orders and tracks them. The one hole that makes **HOME_DELIVERY commercially incomplete** is the missing destination.

### First slice (after GO)

**Checkout address integration + historical delivery-address snapshot.**

In:

- `CheckoutDto.addressId` (UUID, optional on DTO, **required** when `type` is `HOME_DELIVERY` or `CATERING`)
- Server: load Address by caller; reject foreign/deleted
- Persist `deliveryAddressSnapshot` JSON on Order; optionally set `deliveryAddressId` as lineage
- Serialize snapshot on order GET
- Web `/checkout`: list saved addresses, select one, link to `/addresses` to add
- Confirmation / track: show snapshot lines (not live book)
- Tests: ownership, deleted address, edit-after-place does not change snapshot, dine-in without address, idempotent replay

Out of first slice:

- Guest cart / guest checkout
- Maps, geocoder, lat/lon requirement
- Recipient/phone/instructions unless OD-J-4 lands first
- Razorpay SDK / verify UI (next IMPROVE, not this slice)
- Tip UI, PAY_LATER select, donation
- Live map, sockets, ETA, notifications
- Offers browse, wallet, Home V2, Stage H, Stage K
- Tax/fee/settlement redesign
- Any A–I behavior change except checkout reading an owned Address

### Why not defer the whole of J

Deferring would leave HOME_DELIVERY orders without a dropoff. That is not a visual-polish gap. Foundations (book, checkout, Order FK, JWT) already exist.

### Why this slice is smaller than “complete checkout UX”

Tip, prepaid verify, and PAY_LATER are real IMPROVEs, but COD + server totals already function. Address is the missing **commerce fact**.

---

## Explicit non-implementation confirmation

- **No production code changed** in this task (Prisma, migrations, controllers, services, React, routes, seeds, CSS, APIs).
- **Stage H was not implemented.**
- **Stage K was not implemented.**
- **Stage I was not modified.**
- Defects that would need code (unused `deliveryAddressId`, omitted tip, unwired verify, silent restaurant replace) are **documented only**.
