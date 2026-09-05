# 99 — Consumer Offers / Coupons Browse Target Behavior Contract

**Status:** CONTRACT — DEFERRED  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)

Saved Addresses is closed ([98](./98-CONSUMER-SAVED-ADDRESSES-TARGET-BEHAVIOR-CONTRACT.md)). Favorites ([97](./97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md)), Profile + Dietary Preferences ([96](./96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md)), and Order Tracking ([95](./95-NEXT-CONSUMER-SURFACE-TARGET-BEHAVIOR-CONTRACT.md)) are closed. Do not reopen them.

This document answers whether **consumer offer / coupon browsing** can exist as an independent read surface on the existing Prisma `Offer` / `Coupon` models, without changing cart, checkout, payment, or coupon redemption.

**Decision: DEFER — TARGET DEPENDENCY**

Do **not** implement `GET /api/v1/me/offers`, `GET /api/v1/discover/offers`, or a consumer Offers UI this slice.

Modern target architecture (do not implement the browse-only slice): [101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md](./101-AMEALIO-PROMOTIONS-TARGET-BEHAVIOR-CONTRACT.md). This document remains forensic evidence.

---

## 0. Method

1. **L1** — Traced legacy consumer Offers/Coupons from UI, routes, Feathers services, and Mongo models. Separated discovery, detail, application, redemption, and eligibility.
2. **L2** — Benchmarked modern consumer offer browse (presentation, eligibility visibility, expiry, restaurant association, code display, auth, avoiding unavailable-as-available). Did not research loyalty, wallet, rewards, referrals, or personalization.
3. **L3/L4** — Matrix + proposed later contract. Auto-resolved: do not invent a personal coupon wallet; do not expose offers as available when checkout cannot accept a code.

**Hard rules:** No implementation. No checkout, cart, payment, coupon redemption, order state, delivery, wallet, loyalty, referrals, Favorites, Profile, Addresses, Home V2, RAG, moods, cravings, curations, geo, maps, or OTP changes.

Five lanes must stay five lanes:

| Lane | What it is | This investigation |
| ---- | ---------- | ------------------ |
| **A. Discovery / browse** | List of offers a consumer can see | Candidate — not truthful standalone |
| **B. Detail** | One offer's terms, dates, restaurant, code | Candidate — not truthful standalone |
| **C. Application** | Attach a code to a cart / checkout | **OUT — already a checkout concern** |
| **D. Redemption** | Persist usage against an order | **OUT — already exists on target order create** |
| **E. Eligibility** | Whether the offer may apply now | Evaluable at order time only |

They must not be treated as one feature.

---

## 1. L1 — Legacy reality

### 1.1 There is no working standalone consumer Offers page

| Surface | File | Actual behavior |
| ------- | ---- | --------------- |
| Old profile “Offer & Rewards” | `amealio_web_app` `src/screens/profilePage/ProfilePage.js` | Navigates to `path: '/offers'` |
| Route table | `src/setup/routes-manager/index.js` | **No `/offers` route** → **404** |
| New profile “Offers & Reward” | `src/screens/profilePage/AmealioProfilePageRoute.jsx` | Items “Coupons & Discounts” and “Gift Cards”; both **`route: null`** |
| Doc 95 prior finding | [95](./95-NEXT-CONSUMER-SURFACE-TARGET-BEHAVIOR-CONTRACT.md) | “Drawer 404; apply at cart.” Confirmed. |

**Do not invent a personal Offers / Coupons account book.** Legacy never shipped one. The account entry is dead chrome.

### 1.2 A. Discovery that actually worked

Working browse is **restaurant-adjacent and cart-adjacent**, not an account or home product.

| Surface | Mechanism | Auth | What it lists |
| ------- | --------- | ---- | ------------- |
| Restaurant V2 tickets | `useV2Offers` → `GET user/offers/?vendorId=&cart=true` → `V2OffersTicketSection.jsx` | Optional | Active, in-window offers matching that vendor / restaurant. Hidden offers included when `cart=true`. |
| Cart “Show Available Offers” | Same `GET user/offers/?vendorId=&cart=true` from `CartPage.jsx` | Optional | Same restaurant-scoped list. Copy-code + apply live here. |
| Home carousel `OffersCardInfo.jsx` | Click handler is `console.log('Hiii')` | — | **Not a journey.** |
| Home carousel API path | `GET /user/offers` with `lat` / `long` / `radius` / `isGlobal` / `send_to_carousel` | Optional | **Geo.** Out of this slice (STOP). |
| `GET /user/filter-offers` | JWT required; sort / date / geo dump | Required | Not a consumer product page. |

Feathers implementation: `amealio-vendordashboard` `src/services/user-offer/user-offer.class.ts` `find`.

Restaurant / cart list filters (no geo):

- `active: true`
- `start_date` / `end_date` contain now
- vendor / restaurant match
- `hidden` allowed when `cart=true`
- Global frequency (`useFrequency` / `maxUsage` / `useLimit` vs `offerUsedBy`) only when JWT is present

Expired and inactive offers are omitted from this list. There is no consumer “expired coupons” archive.

### 1.3 B. Detail that actually worked

| Surface | Mechanism | Reality |
| ------- | --------- | ------- |
| Restaurant ticket drawer / modal | Same list payload + local expand (`OffersModal.jsx`) | Title, dates, min-order copy, coupon code, copy-to-clipboard. **This is the real consumer detail.** |
| `GET /user/offers/:id` | Feathers `get`; **JWT required** (401 without) | Hydrates `restaurantDetails`, rating, and `offerFav` flag. Not the primary UI path. |
| `GET /offer/details` `find` | Vendor auth | **Not consumer** |
| `GET /offer/details` `get` with lat/long | Nearby restaurants for an offer | **Geo / vendor.** STOP. |

### 1.4 C. Application that actually worked

Cart, not a browse page.

- `POST /user/offers` with `coupon_code` + `vendor_id` + optional `order_amount` / `user_id`
- Cart then `calcDiscount` **on the client**
- Stores `coupon_code` in `sessionStorage` `order_details`
- Remove coupon is **local only** (does not reverse server usage)
- Apply prompts login if the user is anonymous

### 1.5 D. Redemption that actually worked

Legacy has **no separate Coupon / CouponRedemption collection**.

- Apply increments `offerUsed` and pushes `offerUsedBy` **before payment** (integrity bug — CORRECT, do not copy)
- Payment path also touches usage
- Cancel reverses usage
- Refund does **not** reverse usage

### 1.6 E. Eligibility that actually worked

Evaluated on apply (and partially on list when JWT present):

| Condition | Legacy source | When |
| --------- | ------------- | ---- |
| Active flag | `Offers.active` | List + apply |
| Date window | `start_date` / `end_date` | List + apply |
| Restaurant / vendor | `vendor` / `restaurants` | List + apply |
| Min / max order | offer fields vs `order_amount` | Apply (client also recomputes) |
| Global frequency | `useFrequency` / `maxUsage` / `useLimit` vs `offerUsedBy` | List (if JWT) + apply |
| Hidden | `hidden` | Hidden from some lists; cart list includes them |
| Payment method | not a first-class consumer browse filter | — |
| Customer segment | not a truthful consumer browse axis | — |

### 1.7 Offer vs coupon in legacy

**One Mongo entity.** `Offers.coupon_code` is unique. There is no Coupon collection.

Doc 50 already recorded: “ONE entity (not separate).” De-facto **1 offer : 1 code**.

“Coupon” in the consumer UI is the **code string** on that offer, plus the cart apply action. It is not a second product.

### 1.8 Saved coupons

`User.offerFav` exists on Mongo `user-service` and is only read to set a `favourites` flag on authenticated `GET /user/offers/:id`. There is no consumer clip/save Offers UI. Target Favorites ([97](./97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md)) correctly rejected `OFFER` on HTTP. That is **not** a clipped-coupon wallet and must stay closed.

### 1.9 Persistence and navigation (legacy)

| Concern | Reality |
| ------- | ------- |
| Persistence | Mongo `Offers` + `offerUsed` / `offerUsedBy` on the same document |
| Account navigation | Dead (`/offers` 404; new profile `route: null`) |
| Working navigation | Restaurant page tickets → modal; cart “Show Available Offers” → apply |
| Auth for browse | Optional |
| Auth for apply | Required in practice (cart prompts login) |

---

## 2. L2 — Industry benchmark

Scope: consumer **offer browse**, not loyalty / wallet / rewards / referrals / personalization.

Modern consumer food apps treat these as separate products:

1. **Browse / present** — title, restaurant (or platform), expiry, min spend, discount shape, code if the consumer must type it. Restaurant-adjacent tickets are the common browse surface; a personal coupon wallet is optional, not required.
2. **Eligibility visibility** — show constraints (min order, restaurant, dates, usage left, delivery vs pickup) as facts. DoorDash, Uber Eats, ChowNow, and Grubhub all fail closed: a code that looks valid is still rejected when the current cart does not meet the rule (min subtotal before tax/fees, restaurant participation, order type, first-order / one-use, date window).
3. **Apply** — happens on cart or checkout, against a known restaurant and subtotal. DoorDash: enter or select on Checkout (“Promo codes, rewards & gift cards”). Grubhub API: `POST /carts/{cart_id}/coupons` after the diner is on that restaurant. ChowNow: promo box **on checkout**; if there is no box, there is no restaurant promotion in play.
4. **Redeem** — server-side at order create / payment. Uber Eats: must be applied before place; cannot be attached afterward.

Industry failure mode this slice must avoid: listing deals as available when the consumer has **no field to enter them** and **no restaurant / order context**. ChowNow’s own support copy treats a missing checkout promo box as “no promotion,” not as a browse product. That is advertising, not a product.

Authentication: browse of public catalog facts can be anonymous; claiming personal remaining uses or applying a code requires the signed-in user.

---

## 3. L3 — Gap analysis

| Topic | Legacy | Industry | Target today | Class |
| ----- | ------ | -------- | ------------ | ----- |
| Account Offers page | 404 / `route: null` | Dedicated wallet is optional; many apps only show deals on restaurant + checkout | No consumer HTTP | **CORRECT** — do not invent `/me/offers` |
| Restaurant-scoped tickets | Worked (`vendorId` + `cart=true`) | Standard | Prisma can store restaurant / merchant / global offers; **no consumer read API** | **PRESERVE** intent later; not this slice |
| Cart “available offers” | Worked + apply | Standard | Checkout DTO has `couponCode`; **web checkout never sends it** | **TARGET DEPENDENCY** |
| Home / geo carousel | API exists; card click is a stub | Common | Discovery has **zero** offer usage; geo is STOP | **FUTURE** |
| Offer vs coupon | One Mongo doc + `coupon_code` | Offer = campaign; coupon = redeemable code | Prisma **splits** `Offer` 1—n `Coupon`; `CouponRedemption` on apply | **PRESERVE** target split (**IMPROVE** vs legacy 1-doc) |
| Application | Cart POST + client `calcDiscount` | Server-authoritative | `OrderService.createOrder` already applies | **PRESERVE** — do not touch |
| Redemption timing | Usage ++ before payment | At paid / placed order | `CouponRedemption` ACTIVE on create; REVERSED on cancel path | **PRESERVE** — do not touch |
| Eligibility engine | Dates, vendor, min/max, frequency | Server-side at apply | `assertOfferEligible` + `calculateDiscountMinor` at order create | **PRESERVE** — do not build a browse rules engine |
| “Available to you” without cart | Partial (list omits expired; cannot know min-order) | Do not claim | Cannot know subtotal / `OrderType` | **CORRECT** — do not claim |
| Expired / inactive archive | Not a consumer product | Rare | `active`, `validFrom` / `validTo`, `deletedAt` exist | **FUTURE** |
| Saved / clipped coupons | `offerFav` unused as a product | Optional | `FavoriteType.OFFER` rejected on HTTP | **FUTURE** — Favorites stays closed |
| Platform-wide “near you” | Geo carousel | Common | Needs geo | **FUTURE** / STOP |
| Seed / catalog fullness | Production Mongo had offers | Need real rows | Seed has **no** offers | **TARGET DEPENDENCY** for any later demo |
| Merchant / admin offer APIs | Vendor Feathers | Staff configure; consumers read | `OfferModule` is **merchant/admin only** (P1.7.22). No Nest consumer controller | Expected; browse would be new HTTP |

### 3.1 Target models (what exists)

Prisma (`prisma/schema.prisma`):

```
Offer
  id, merchantId?, restaurantId?, title, description?, termsAndConditions?
  isGlobal, active, settlementType
  discountMinor?, discountPercent?, maxDiscountMinor?
  minOrderMinor?, maxOrderMinor?, serviceTypes Json?
  validFrom?, validTo?
  maxUsageLimit?, perUserLimit?,   useLimit?, useFrequency?   // schema comment still says P1.7.25 deferred;
                             // order create enforces them for GLOBAL offers (P1.7.26B)
  deletedAt?
  coupons Coupon[]

Coupon
  id, offerId, code @unique

CouponRedemption
  couponId, userId?, orderId?, status ACTIVE | REVERSED, discountAppliedMinor?
```

Staff configuration: `apps/api` `OfferModule` — merchant / admin only. `OfferService` / `OfferRepository` are staff-scoped.

Discovery (`apps/api` discovery): **no** offer / coupon queries.

Consumer web:

- `checkoutApi.place` TypeScript accepts `couponCode`
- `CheckoutScreen.tsx` **never sends** `couponCode`
- No checkout coupon field
- No `/offers` consumer route
- No cart “available offers” sheet

Order create **already redeems** (`findAppliedOfferByCouponCode` → `assertOfferEligible` → `calculateDiscountMinor` → `CouponRedemption`). Do not modify.

### 3.2 Can existing redemption power a browse/read model?

**Data:** yes, for **catalog facts** — title, description, terms, dates, restaurant / merchant / global flag, advertised min / max, discount shape, coupon codes, `active` / `deletedAt`.

**HTTP:** no consumer read exists.

**Truthful “available”:** no, not without restaurant + current order / cart context, and not while checkout cannot accept a code.

Listing all non-deleted offers as `GET /api/v1/discover/offers` is a nationwide dump, not “offers for you.”

`GET /api/v1/me/offers` implies a personal clipped book. Legacy never had one.

`GET /api/v1/discover/offers?restaurantId=` can list catalog facts for one restaurant. The only consumer action (copy / apply) has **no checkout field**. Copying a code the user cannot enter is misleading.

---

## 4. L4 — Target contract (deferred)

### 4.1 What this slice is not

This investigation does **not** authorize:

- consumer Offers HTTP
- consumer Offers UI
- checkout / cart coupon field
- changes to `assertOfferEligible` / `CouponRedemption`
- a new eligibility rules engine
- geo / home carousel
- clipped-coupon Favorites
- wallet / loyalty / cashback copy as if it were offers

### 4.2 Offer vs coupon (must stay distinct)

| Concept | Target meaning | Expose first? |
| ------- | -------------- | ------------- |
| **Offer** | Campaign / discount rule owned by platform, merchant, or restaurant | The browse **noun** when a later slice exists |
| **Coupon** | Redeemable **code** attached to an Offer (`Offer` 1—n `Coupon`) | The apply **token** at checkout — already on the order API |
| **CouponRedemption** | Usage row for a user / order | Checkout / order — do not browse as a product |

They are **not** the same target concept. A coupon is not an offer. An offer without a coupon **cannot be typed in at checkout** (doc 53). Do not merge them for implementation convenience.

Legacy treated them as one document. Target **correctly split** them. Later browse should show the Offer and, when a code exists, display the code as a fact — not as a second list of “coupons.”

### 4.3 Eligibility that can be evaluated from existing data

Do **not** build a browse rules engine. Reuse facts; do not re-implement `assertOfferEligible` for a list badge.

| Condition | Evaluable without cart / order? | Safe to show as “available”? |
| --------- | ------------------------------- | ---------------------------- |
| `active` + `deletedAt` null | Yes | Only as “not withdrawn” |
| `validFrom` / `validTo` | Yes | Only as “in calendar window” |
| `isGlobal` vs `restaurantId` vs `merchantId` | Yes as ownership | “For this restaurant” only when `restaurantId` is known |
| `minOrderMinor` / `maxOrderMinor` | Advertised number only | **No** — needs server subtotal |
| `serviceTypes` vs `OrderType` | Advertised only | **No** — needs checkout type |
| `maxUsageLimit` / `perUserLimit` | Counts via `CouponRedemption` ACTIVE | Personal remaining uses need JWT; still not “available for this order” |
| `useLimit` / `useFrequency` | Enforced on global apply (`AppliedOffer` / P1.7.26B) | **No** new browse engine |
| Payment method | Not a first-class Offer field for browse | **No** |
| Customer segment | Not a first-class Offer field for browse | **No** |
| Platform-wide “near you” | Needs geo | **No** (STOP) |

If an offer cannot safely be represented as currently available to the consumer, do not expose it as available.

### 4.4 Later slice (not now) — smallest truthful shape

Only after **consumer-visible application** exists (checkout or cart can send `couponCode` and show apply / reject):

1. **Read-only restaurant catalog** — `GET /api/v1/discover/offers?restaurantId=` (or restaurant payload embed). Facts only: title, terms, window, min/max advertised, discount shape, codes if present, ownership. Never badge “Available for your order.”
2. **Optional detail** — `GET /api/v1/discover/offers/:id` for the same facts.
3. **No** `/me/offers` wallet unless product later ships clip/save (Favorites `OFFER` stays closed until then).
4. **No** geo / home carousel.
5. **No** redemption or eligibility-engine changes.

Until checkout can accept a code, even that catalog is **advertising without a use path**. That is why this is deferred, not implemented as a dead list.

### 4.5 Authentication (later)

| Action | Auth |
| ------ | ---- |
| Restaurant-scoped catalog facts | Optional (same as legacy list) |
| Personal remaining-use counts | JWT |
| Apply / redeem | Already JWT on checkout — do not change |

---

## 5. Decision

**DEFER — TARGET DEPENDENCY**

Exact missing dependency: **consumer-visible coupon application on checkout / cart**.

- Order create already redeems a `couponCode`. Do not modify that.
- Consumer web checkout / cart **do not collect or send** `couponCode`.
- A browse / detail surface cannot be useful or truthful without a place to apply the code.
- Adding that place **is a checkout change** and is out of this slice.
- `GET /api/v1/me/offers` would invent a personal wallet legacy never shipped.
- `GET /api/v1/discover/offers` without `restaurantId` is an untruthful nationwide dump.
- `GET /api/v1/discover/offers?restaurantId=` without checkout apply is a dead catalog.
- Platform-wide “near you” additionally depends on geo (STOP).
- Seed currently has **no** Offer / Coupon rows, so a demo list would be empty or fabricated.

Do not implement a catalog just to look complete.

---

## 6. Owner decisions (not this slice)

| Decision | Why it is not auto-resolved |
| -------- | --------------------------- |
| When to add a checkout / cart `couponCode` field and apply / reject UX | Product + checkout vertical; changes payment presentation |
| Whether restaurant-page informational tickets ship in the same slice as apply | UX coupling; tickets without apply repeat this deferral |
| Whether a later read API is restaurant-scoped catalog vs “available” | “Available” requires cart / order context |
| Whether to ever ship `/me/offers` clip/save | Legacy account page was dead; Favorites `OFFER` is closed |
| Whether global / merchant offers appear on a restaurant page | Ownership rules are data; presentation is product |

---

## 7. Closed doors

Do not reopen Favorites, Profile, Addresses, or Order Tracking to smuggle offer browse.

Do not touch checkout, cart, payment, or `CouponRedemption` in the name of this investigation.
