# 13 — Migration Implications

Implications for future replatforming per major domain. **No target architecture is designed here** (that is separate, review-gated work under `docs/architecture/`). Complexity/difficulty are discovery-stage estimates for planning only.

## Reading guide
- **Complexity** = migration effort/invasiveness. **Data difficulty** = ETL/mapping difficulty.
- **API compat** = risk to existing client contracts (both frontends). **Redesign areas** = where a straight port is likely inadvisable.

| Domain | Complexity | Dependencies | Sequencing | Data difficulty | API compatibility | Potential redesign |
|--------|-----------|--------------|------------|-----------------|-------------------|--------------------|
| Identity/Auth | High | — (foundational) | **First** | Medium (users/sessions; enum-free) | High — dual stacks + raw header + strategies | Unify dual auth into one identity + claims model |
| Users | Medium | Identity | After Identity | Medium (fix `address` FK) | Medium | Add explicit address ownership |
| Merchant/Staff/RBAC | High | Identity | With Identity | Medium (flatten permission trees) | Medium | RBAC as explicit policy, not boolean blobs |
| Restaurants/Location | Medium–High | Merchant | Anchor entity, early | Medium (`strict:false`, hours blocks, card dup) | Medium | Drop `restaurantCard`; normalize hours/features |
| Catalog/Taxonomy | Low–Medium | — | Early | Low (global lookups; space-named collections) | Low | Normalize category/sub-category |
| Menu/Items | High | Restaurants, Catalog | After Location/Catalog | High (per-channel pricing, sizes, add-ons, day-wise, no `restaurant_id`) | Medium | Normalize item variants/channel config/add-ons |
| Search/Discovery | Medium | Restaurants | After Location | Low | Medium | Consider a real search/index later |
| Orders | High | Menu, Payments, Delivery | After Menu | High (embedded items, env-driven statuses, 2 cart models) | **High** (heavy client + realtime) | Unify cart; explicit status machine; snapshots |
| Payments/Wallet/Settlement | **Very High** | Orders | After Orders; migrate ledger carefully | **High** (ledger, payouts, gateway payloads, enums) | High (webhooks + reconciliation) | Explicit ledger; provider abstraction; India Razorpay/RazorpayX config |
| Seating/Reservation | Medium | Restaurants | After Location | Medium (shared Diner; geo) | Medium (realtime `diner_trigger`) | Model Diner as unified visit; consider Order/seating relation |
| Celebrations/Experiences | Medium–High | Payments, Restaurants | After Orders/Payments | Medium (bookings + settlement) | Medium | Clarify Experience vs Event boundary |
| Events/Ticketing | Medium | Celebrations | After Experiences | Medium (`exp_events` shared; nested setup) | Medium | Separate event ticket vs support ticket |
| Commerce/Subscriptions | Medium | Merchant, Orders | After Orders | Medium | Medium | Model subscriptions explicitly |
| Promotions | Medium | Orders | After Orders | Medium (coupon scope arrays/geo) | Medium | Normalize offer scope + redemptions |
| Notifications | Medium | Identity | Cross-cutting | Low–Medium (templates) | Medium (FCM/SMS/email/WhatsApp) | Consolidate providers behind interfaces |
| Loyalty | Low (unclear) | Promotions, Payments | Later | Low | Low | Confirm scope (points/tiers) — **UNKNOWN** |
| AI/Personalization | Medium | — | Later | Low (in-app) / N/A (external engine) | Medium | Recommendation engine is **external** — integration decision |
| Delivery | Medium–High | Orders | After Orders; **deferred pieces later** | Medium (partner payloads; tracking data) | Medium | Rationalize tracking (deferred Nest/PostgreSQL) + Porter automation |
| Admin | High | most domains | Alongside operator domains | Low (UI-heavy) | Medium | Split from Merchant; rebuild UI |
| Merchant ops | High | Restaurants, Orders | Alongside Admin | Low (UI-heavy) | Medium | Separate app; shared component library |
| Reporting/Analytics | Medium | most | Later | Medium | Low | Read models / warehouse instead of operational reads |
| ONDC | **Very High** | Orders, Payments, Delivery | **Last** (bounded context) | High (protocol docs, settlement/recon) | High (protocol callbacks) | Separate bounded context/service |

## Cross-cutting implications
- **Enum mapping first:** resolve env-driven numeric codes before any order/payment data migration (blocks Orders, Payments).
- **Realtime & error contracts:** the target must preserve Socket.IO event names/shapes and the `AmealioError` contract, or provide a compatibility shim, to avoid breaking both frontends during cutover.
- **Two databases today:** MongoDB (baseline) + PostgreSQL (deferred tracker). Baseline restoration should not assume the PostgreSQL tracker.
- **Frontend split:** admin/merchant separation and a shared design system are large UI efforts; sequence after the corresponding backend domains stabilize.
- **Security workstream:** rotate committed secrets in parallel, independent of domain sequencing.
- **External unknowns:** integration service, recommendations API, ONDC micro-server are outside the workspace — their migration/integration decisions require owner input.

## Suggested sequencing (planning input, not a design)
Identity/Merchant/Location → Catalog/Menu → Orders → Payments/Settlement → Seating/Reservation → Celebrations/Events/Ticketing → Promotions → Notifications → Delivery (with deferred pieces evaluated) → Admin/Merchant UI + Reporting → ONDC last. Aligns with `docs/migration/10-migration-risks.md#4-recommended-migration-order`.

> This document lists **implications only**. Target design, schema, and migration execution are out of scope for P1.1.
