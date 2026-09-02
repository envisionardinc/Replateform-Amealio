# P1.7.21 — Offers / Promotions Reconciliation

> **Type:** DISCOVERY / RECONCILIATION ONLY — no code, no schema, no migration, no tests. Reconciles the legacy promotion domain and scopes the smallest correct P1.7.22 slice.
> **Authority:** legacy `amealio-vendordashboard` + `amealiodashboardmvp-` + `amealio_web_app` vs target `replateform-amealio` (Prisma). Baseline **260/260**, unchanged.
> **Method:** frontend → API → service → persistence tracing with file:line evidence. UNKNOWN preserved.

---

## 1. Executive Summary

- **Offer and Coupon are ONE legacy entity.** The `Offers` Mongo collection holds both the promotion definition and the redeemable code (`coupon_code` unique field). There is **no** separate `Coupon` or `CouponRedemption` collection; redemption is an embedded `offerUsedBy[]` array + an `offerUsed` counter.
- **Discount = percentage or fixed amount, order-level, capped by `maximum_discount_applied`.** No item/category/menu/experience/BOGO/free-item discounts exist. Delivery discount fields exist but are only wired into the delivery-quote path.
- **Discount calculation is primarily FRONTEND** (`OrderingCalculations.js`) with a backend path in the legacy cart (`usercart.class.ts calcDiscount`); **order creation does NOT recompute** — it trusts the client-supplied `total_amount`/`discount`. This is a data-integrity risk the target must resolve.
- **Usage is persisted twice** (on coupon-apply `POST /user/offers` and again at payment completion) as `offerUsed++` + `offerUsedBy` push; **cancel** reverses usage, standalone **refund does not**.
- **Offers apply at order/restaurant/vendor level** + optional `service_type[]`; **experience** integration is a dormant unused `experience_cart.offer` FK (browse-only on experience pages).
- **Adjacent systems are all INDEPENDENT** of core Offers: `merchant-permotion` (restaurant tag curation), `promotional-event` (marketing lead), `referral-code`/`referral_program`/`referralService`/`refreeService` + `SignupReward` (wallet/referral economy), `promotionsvideo` (video carousel). Do not fold them into Offer/Coupon.
- **Subscription `offer_management` gates the merchant UI only** — the backend offer CRUD does not enforce it.
- **Target `Offer`/`Coupon`/`CouponRedemption` exist but are INCOMPLETE** (missing usage limits/counters, order-amount gates, min/max discount, active/hidden, per-user limits, multi-restaurant, media/T&C, discount mutual-exclusivity); `ReferralProgram` is a `Json` placeholder vs a richly-typed legacy `referral_program`. **No promotions API module exists.** The Offer→Coupon 1:N split is faithful for the legacy 1:1 data.

---

## 2. Legacy Source Inventory

**Models:** `offers.model.ts` (core), `merchant-promotion.model.ts` (`merchant-permotion`), `promotional-event.model.ts`, `promotionsvideo.model.ts`, `referral-code.model.ts`, `referral-program.model.ts`, `referral-service.model.ts`, `refree-service.model.ts`, `signupReward.model.ts`; `ordering.model.ts` (offer fields), `user-cart.model.ts`/`cart.model.ts`/`experience-cart.model.ts` (cart offer state), `misceilaneous-tracking.model.ts` (redemption analytics), `subscription.model.ts` (`offer_management`).
**Services:** `offers/*` (`/offers`, `/admin/offers`, `/user/offers`, `/user/filter-offers`, `/offer/details`, `/offer-history`, `/vendor/offers`, `/admin/offers-report`), `usercart/*` (discount calc), `ordering/*` (redemption at payment), `merchant-permotion/*`, `promotions-video/*`, `promotions-event`, `referral-*`, `signupReward/*`.

---

## 3. Domain Entities

| Entity | Collection | Owner | Role |
|---|---|---|---|
| **Offers** | `Offers` | merchant (`vendor_id`) / admin (`isGlobal`) | coupon offer: definition + `coupon_code` + embedded redemption log |
| Order offer link | `ordering` | — | `offer`→Offers, `discount{amount,percentage}`, `offerSettlement`, `settleAmount` |
| Redemption log | embedded `Offers.offerUsedBy[]` + `offerUsed` | — | **no separate collection** |
| `misceilaneousTracking` | `misceilaneous-tracking` | — | analytics (`type=OFFER`, `used:true`) |
| merchant-permotion | `merchant-permotion` | admin | restaurant tag curation workflow (independent) |
| promotional-event | `promotional-event` | admin | marketing lead + generated `E_` code (independent) |
| referral-code / refreeService | `Referral Code` / `refreeService` | admin | partner identity codes (independent) |
| referral_program | `referral_program` | admin | wallet reward rules (independent) |
| referralService | `referralService` | system | invite enrollment (independent) |
| SignupReward | `signupReward` | admin | signup wallet bonus (independent) |
| promotionsvideo | `promotionsvideo` | merchant/admin | promo video carousel (independent) |

---

## 4. Offer vs Coupon

**Verdict: ONE entity (not separate).** `offers.model.ts:13` `coupon_code: { type: String, unique: true }` on the `Offers` document; no `Coupon`/`CouponRedemption` collection exists. Apply resolves by `coupon_code` (`user-offer.class.ts:46-51`). The de-facto cardinality is **1 offer : 1 code**. The target's normalized `Offer` → `Coupon[]` → `CouponRedemption[]` split is **structurally faithful** for migrating the legacy 1:1 data, and additionally *allows* multi-code offers the legacy never used.

---

## 5. Promotion Types

Multiple **independent** promotion systems (Phase 13): core **Offers coupons**; **restaurant tag curation** (`merchant-permotion`); **marketing lead/campaign** (`promotional-event`, `promotionsvideo`); **wallet/referral economy** (`referral_program`, `referral-code`/`refreeService`, `referralService`, `SignupReward`). Only core Offers is a checkout discount; the rest do not touch order totals. Consumer experience pages **display** the vendor's Offers (browse-only), not a distinct promotion type.

---

## 6. Discount Types

| Type | Status | Evidence |
|---|---|---|
| Percentage | **IMPLEMENTED** | `isPercentage` + `calcDiscount` (`usercart.class.ts:170-179`) |
| Fixed amount | **IMPLEMENTED** | `discount` (`usercart.class.ts:182-183`) |
| Max-discount cap | **IMPLEMENTED** | `maximum_discount_applied` (`usercart.class.ts:175-178`) |
| Order-level | **IMPLEMENTED** | applied to line-item sum |
| Item-level tax allocation | **PARTIAL** | pro-rata `getDiscountPrice` (tax base only) |
| Delivery discount | **PARTIAL** | `isDelivery`/`deliveryMinOrder`/`deliveryMaxDiscount`; only delivery-quote path |
| Item / category / menu / experience / BOGO / free-item / first-order / member | **NOT FOUND** | no such fields/logic |
| `type` string | **STORED ONLY** | copied to cart context, not used in backend math |

---

## 7. Eligibility Rules

| Rule | Field | Server-enforced? |
|---|---|---|
| Restaurant/vendor | `vendor_id`/`restaurant_id`/`restaurants[]` | **PARTIAL** — on code-apply lookup; cart-by-id does not re-validate |
| Min order value | `minimum_order_applied` | **YES** (`usercart.class.ts:1263`, `user-offer.class.ts:90`) |
| Max order value | `maximum_order_applied` | **PARTIAL** (only in `/user/offers`, not cart patch) |
| Order type / channel | `service_type[]` | **YES** (`usercart.class.ts:1257`) |
| Date window | `start_date`/`end_date` | **YES** |
| Per-user frequency (global) | `useLimit`/`useFrequency`/`maxUsage` + `offerUsedBy[]` | **YES for `isGlobal`** |
| Location/radius | `location`/`isGlobal` | **LISTING ONLY** (geolib on find) |
| Active / hidden | `active`/`hidden` | **PARTIAL / listing only** (cart apply doesn't check `active`) |
| Menu/item/category/cuisine/experience/payment-method/new-vs-existing/subscription | — | **NOT FOUND / NOT ENFORCED** |

---

## 8. Validity and Usage Limits

Stored: `start_date`/`end_date`, `active`, `maximum_usage_limit`, `offerUsed` (counter), `offerUsedBy[]` (log), `useLimit`/`useFrequency`/`maxUsage` (global). **Auto-inactivate on expiry happens lazily on read** (`offers.hooks.ts:18-40,547-576`) and on limit-reached (`user-offer.class.ts:56-71`, payment `user-ordering.class.ts:3532-3537`); the **`OfferCron` is commented out** (`cron.ts:66`). Usage counters are **inconsistent** (cart compares `offerUsedBy.length`, hooks compare `offerUsed`) and can be **double-incremented** (apply + payment). No per-order limit.

---

## 9. Redemption Lifecycle

`CREATE (/offers, /admin/offers) → ACTIVATE (active + dates) → ENTER/APPLY (POST /user/offers OR cart patch) → VALIDATE → [usage may ++ here] → ORDER CREATE (stores offer id + client discount; no recompute) → PAYMENT COMPLETE (usage ++ + settlement) → CANCEL (usage --) → REFUND (wallet credit; usage NOT reversed)`. **No persisted `CouponRedemption` record** — redemption = embedded `offerUsedBy[]`/`offerUsed` + `misceilaneousTracking`. Usage is persisted **early** (coupon-apply, pre-payment) **and again at payment** (`user-ordering.class.ts:3522-3541`); cart apply does **not** persist usage.

---

## 10. Merchant/Admin Configuration

**Merchant** (`/offers`, `PrivateRoute`): create/edit/activate/deactivate/mark-primary/delete offers, coupon code at create, discount type/amount, min/max order, max discount, usage limit, validity, `service_type` eligibility, vendor reports (`/vendor/offers`). **Admin/platform** (`/admin/offers`, `AdminPrivateRoute`): global + restaurant-scoped offer CRUD, `send_to_carousel`, per-customer limits (`useLimit`/`useFrequency`/`maxUsage`), geo/country/city targeting, settlement type, reports (`/admin/offers-report`), offer history. **Not found in either UI:** menu/item/category/experience-scoped eligibility, separate coupon-assignment API, dedicated cancel endpoint (delete only). **Anomaly:** some superadmin screens hit the merchant `POST/DELETE /offers` routes.

---

## 11. Customer Experience

`GET /user/offers?vendorId=&cart=true` (discover) → enter code / tap offer → **frontend** pre-validation (min/max, usage) → `POST /user/offers` (backend validates + **increments usage**, returns the offer doc, but does **not** compute the cart discount) → **frontend `calcDiscount`/`calcFinalTotal`** → sessionStorage `order_details` → `POST /user-ordering` with client `total_amount`/`discount`/`coupon_code`. Remove coupon is local-only (no API). Auto-apply does not exist (only re-validation of an applied coupon on cart change). A field-name mismatch exists (client sends `offerId`; order expects `offer` ObjectId).

---

## 12. Ordering Relationship

`ordering.model.ts:185-189,341-345,355`: `offer`→Offers, `discount{amount,percentage}`, `deliveryDiscount`, `offerSettlement`, `settleAmount`. Order create only checks the offer exists (else strips it) — **no discount recomputation** (`user-ordering.class.ts:2043-2073`); payment uses the stored `total_amount`. Settlement: `ADMIN` → `settleAmount += discount.amount` (platform absorbs); `VENDOR` (default) → vendor bears; **`SPLIT` is stored but not implemented** (falls through to VENDOR). Target `Order` (P1.7.12) has **no** offer/discount fields (offers were correctly deferred).

---

## 13. Experience Relationship

`experience-cart.model.ts:75-78` has a dormant `offer`→Offers FK, but `user-exp-cart.class.ts`/`userExpRequest.class.ts` **never reference it**, and `expRequest` has no offer field. Experience pages surface the vendor's Offers list via a shared component (`V2ExperienceOffersSection.jsx:29-35`) for **browse/discovery only** — no experience-booking redemption. **Classification: OPTIONAL/none (dormant).**

---

## 14. Menu / Item / Custom Menu Relationship

**None.** `Offers` has no FK to Menu/MenuSection/MenuItem/ItemVariant/AddOn/Category/Custom Menu; scope is order/restaurant/vendor + `service_type[]`. Confirmed against P1.7.18 catalog + doc 46 ("Offers → NO DEPENDENCY, apply at cart/order"). The target `Offer` likewise has no item scope — consistent.

---

## 15. Referral / Membership / Subscription Promotions

`referral_program` (typed wallet-reward rules, admin approval, `getReferral.ts` → wallet credit), `referral-code`/`refreeService` (partner identity codes), `referralService` (invite enrollment), `SignupReward` (signup wallet bonus on OTP verify). All are **wallet-economy systems independent of coupons**. No membership/subscription-tier discount on offers. Target has only a placeholder `ReferralProgram { name, active, config Json }` — **not source-compatible** with the rich legacy `referral_program` without dedicated modeling.

---

## 16. Payment / Refund Relationship

Payment charges the stored (client-computed) `total_amount`; at completion, usage increments and `settleAmount`/`offerSettlement` are set from the offer's `settlementType`. **Refund (`RefundOrder`) credits the wallet and does not reverse offer usage** (`user-ordering.class.ts:103-126`); usage reversal is tied to **cancel** paths (`3298-3308`). Refund wallet balance adjusts for ADMIN-funded discounts (`order-cron.class.ts:662-666`).

---

## 17. Notifications / Realtime / Cron

Offer share links (Firebase). No offer-specific Socket.IO. `OfferCron` (expiry sweep) exists but is **commented out** in the scheduler — expiry deactivation is lazy-on-read. No realtime redemption events.

---

## 18. Legacy API Inventory

`POST/GET/PATCH/DELETE /offers`; `POST/GET/PATCH /admin/offers`; `GET /admin/offers-report`; `GET /vendor/offers`; `GET/POST /user/offers`; `GET /user/filter-offers`; `GET /offer/details`; `GET /offer-history/:id`. Adjacent: `/merchant-permotion`, `/user-curation`, `/promotions-event`, `/promotions-Video`, `/referralcode`, `/validatereferralcode`, `/referralprogram`, `/referral-service`, `/signupReward`. Discount enforcement gate: `PATCH /usercart` (legacy). Redemption at `PATCH /user-ordering` (payment).

---

## 19. Target Schema Reconciliation

Target: `Offer{merchantId?,restaurantId?,title,isGlobal,settlementType,discountMinor?,discountPercent?,serviceTypes Json?,validFrom/To,deletedAt}` → `Coupon{offerId,code unique,useFrequency?}` → `CouponRedemption{couponId,userId?,orderId?}`; `ReferralProgram{name,active,config Json}`; enum `OfferSettlementType {MERCHANT,ADMIN,SPLIT}`. **No offers API module.**

| Legacy | Target | Flag |
|---|---|---|
| `name`/`vendor_id`/`restaurant_id`/`start_date`/`end_date`/`isGlobal` | `title`/`merchantId`/`restaurantId`/`validFrom`/`validTo`/`isGlobal` | **EXISTS** |
| `coupon_code` (unique on Offer) | `Coupon.code`+`offerId` | **EXISTS** (faithful 1:1) |
| `settlementType VENDOR\|ADMIN\|SPLIT` | `OfferSettlementType MERCHANT\|ADMIN\|SPLIT` | **EXISTS** (`VENDOR→MERCHANT` rename) |
| `discount`+`isPercentage` | `discountMinor`/`discountPercent` | **INCOMPLETE** (mutual exclusivity not modeled) |
| `service_type[]` | `serviceTypes Json?` | **INCOMPLETE** (untyped) |
| `maximum_usage_limit`/`offerUsed`/`offerUsedBy[]` | `CouponRedemption` rows | **INCOMPLETE** (no limit fields/counters; behavior change) |
| `useLimit`/`maxUsage`/`useFrequency` | `Coupon.useFrequency` only | **INCOMPLETE** |
| `minimum_order_applied`/`maximum_order_applied`/`maximum_discount_applied` | — | **MISSING** |
| `active`/`hidden`/`mark_as_primary`/`send_to_carousel` | — | **MISSING** |
| `restaurants[]`/`vendors[]`/`isAllVendors` | — | **MISSING** |
| `description`/`photos`/`terms_and_condition`/`offerVideo`/geo | — | **MISSING** |
| Order `offer`+`discount`+`offerSettlement` | `CouponRedemption.orderId` only | **INCOMPLETE** (no order discount snapshot) |
| `referral_program` (typed) | `ReferralProgram.config Json` | **WRONG-SEMANTICS** (placeholder) |
| `SignupReward`/`merchant-permotion`/`promotional-event`/`promotionsvideo`/referral-code | — | **MISSING** |

## 20. Target Reuse Opportunities

Reuse `Offer`/`Coupon`/`CouponRedemption` + `OfferSettlementType` for the core coupon system (extend additively with the missing config fields). Reuse `Subscription.config` for the `offer_management` UI gate. Reuse `User`/`Merchant`/`Restaurant`/`Order`/`Currency` relations. **Do not** reuse `ReferralProgram` as anything more than a Json bucket until typed; **do not** try to represent curation/video/referral-wallet systems with Offer/Coupon.

## 21. Confirmed Gaps

Usage limits + counters; order-amount gates (min/max); max-discount cap; active/hidden/primary/carousel; per-user limits; multi-restaurant scope; media/T&C/audit/analytics; discount type mutual-exclusivity; order discount snapshot; server-side discount computation; no promotions API module; referral-wallet/curation/video systems entirely absent.

## 22. Partial

Offer/Coupon/CouponRedemption schema (exists but thin); `serviceTypes Json` (untyped); redemption model (rows exist but no counters/limits/eligibility); settlement `SPLIT` (enum only, unimplemented in legacy too).

## 23. Unknowns

Whether target should replicate the legacy **client-side discount computation** or move it server-side (recommend server-side); the authoritative **redemption timing** (legacy double-counts); whether **subscription gating** should be server-enforced (legacy is UI-only); whether **SPLIT settlement** should be defined; whether `restaurants[]`/geo targeting are still used in production.

## 24. Dependency Graph

| Relationship | Class | Evidence |
|---|---|---|
| Offer → Merchant | **HARD** | `vendor_id`/`merchantId` ownership |
| Offer → Restaurant | **SOFT** | `restaurant_id?`/`restaurants[]` optional; global offers restaurant-less |
| Offer → Subscription | **SOFT (UI-only)** | `offer_management` gates UI, not backend |
| Offer → Currency | **SOFT** | discount in minor units; India-first INR |
| Offer → User | **SOFT** | per-user limits + `offerUsedBy`/redemption |
| Offer → Order | **OPTIONAL** | order stores offer + discount; not required to order |
| Offer → Payment | **OPTIONAL** | usage/settlement at payment; not required |
| Offer → Menu/MenuItem/Custom Menu | **NO DEPENDENCY** | no item scope |
| Offer → Experience | **OPTIONAL (dormant)** | unused `experience_cart.offer` FK; browse-only |
| Coupon → Offer | **HARD** | code belongs to an offer |
| Referral/SignupReward/curation/video → Offer | **NO DEPENDENCY** | independent systems |

## 25. Owner Decisions

- **DEC-OFF-1 — Discount calculation source of truth.** Evidence: legacy computes on frontend + legacy cart; order create trusts client totals (integrity risk). Options: (a) server-authoritative discount at cart/order time (recommended, leverages P1.7.12 Order), (b) mirror legacy client-trust. **Recommend (a).**
- **DEC-OFF-2 — Extend Offer/Coupon schema** with missing config (usage limits, order-amount gates, max-discount, active/hidden, per-user limits, discount mutual-exclusivity). Additive. **Recommend yes** for the config foundation.
- **DEC-OFF-3 — Redemption timing / `CouponRedemption` creation** (apply vs order-create vs payment). Legacy double-counts. **Recommend a single authoritative point at order/redemption time** (deferred to the transactional slice).
- **DEC-OFF-4 — SPLIT settlement** semantics (unimplemented in legacy). **Recommend defer/define later.**
- **DEC-OFF-5 — Referral/SignupReward/curation/video** as separate future domains (not Offer/Coupon). **Recommend defer** with dedicated modeling; do not overload `ReferralProgram.config`.
- **DEC-OFF-6 — Subscription server-side gate** for offers (legacy UI-only). **Recommend keep config in `Subscription.config`; decide enforcement at implementation.**

## 26. Recommended P1.7.22

**Merchant Offer & Coupon Configuration Foundation** — the smallest correct slice: a merchant-tenant-scoped write foundation for **Offer + Coupon** (create/update/activate-deactivate/validity/discount type (percent|fixed, mutually exclusive)/min-max order/max-discount/usage-limit/service-types/settlementType), over the existing `Offer`/`Coupon` models **extended additively** (DEC-OFF-2), reusing P1.7.1F/P1.7.2 tenancy + P1.7.14 activation. **Explicitly defer** redemption, discount **calculation/application**, order/cart/payment integration, `CouponRedemption` creation, experience offers, and all referral/curation/video/wallet systems (they need the transactional runtime + DEC-OFF-1/3). This mirrors how seating (P1.7.16), menu (P1.7.18), and experience (P1.7.20) config foundations preceded their runtime/booking layers.

---

### Confirmations
- **No application code changed** (documentation only). **P1.7.18 untouched**; **P1.7.20 untouched** (branch `cursor/p1-7-20-experience-configuration-foundation-a8e0`, commit `beac723`).
- **No Prisma schema / migration / test change.** Baseline **260/260**, build/lint/format/Prisma unaffected.
- **No legacy source modified; no production DB; no Mongo migration; no frontend; no ONDC.**
