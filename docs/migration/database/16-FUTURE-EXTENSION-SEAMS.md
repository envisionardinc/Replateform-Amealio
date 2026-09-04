# 16 — Future Extension Seams

How the baseline data model supports later deferred capabilities **without polluting the baseline** and **without speculative tables**. Design only. Aligns with P1.3 [10 extension points](../target-architecture/10-MIGRATION-SEQUENCE.md#feature-repository-extension-points).

**Principle:** the baseline schema contains **only** baseline entities. Deferred capabilities attach via **stable keys, ports, and domain events** — not by pre-creating their tables now.

| Deferred capability | Seam in the baseline model | What is NOT added now |
|---------------------|----------------------------|-----------------------|
| **Delivery tracking (live GPS)** | `DeliveryTask` has a stable `id` + `driverId` reference; a future tracking service (or the deferred Nest tracker) owns a `location`/tracking store keyed by `deliveryTaskId`/`driverId`. Baseline emits delivery domain events. | **No** `location`/GPS table in the baseline; no PostgreSQL tracking schema |
| **Driver application** | Consumes `DeliveryTask`/`DeliveryPerson` via APIs; `DeliveryPerson` has stable identity + `is_online` state | No driver-app-specific tables |
| **Recommendations / AI** | `RecommendationProvider` **port** (external); personalization uses existing `UserProfile`/moods/cravings | No recommendation-store tables (engine is external) |
| **ONDC** | Separate bounded context / schema keyed by baseline `Order`/`Restaurant`/`Menu` ids via integration mapping + domain events | **No** `ondc_*` tables in the baseline schema |
| **Advanced loyalty (points/tiers)** | Referrals/rewards exist; a future loyalty context can reference `User`/`Order` and subscribe to order events | **No** points/tier tables (not evidenced — OD-5) |
| **Ticketing/seating (beyond baseline)** | If OD-3 confirms, `Event`/`EventTicket` extend the celebrations context keyed by existing ids | No ticket-validation/capacity tables until confirmed |

## Enabling mechanisms
- **Stable public/internal ids** ([03](./03-IDENTIFIER-STRATEGY.md)) so external contexts reference baseline entities without coupling to internals.
- **Domain events** (order placed/updated, delivery assigned, payment captured) for async attachment — supports Option-C service extraction (P1.3 [01](../target-architecture/01-TARGET-ARCHITECTURE-OPTIONS.md)).
- **Provider ports** (`TrackingProvider`, `RecommendationProvider`, `PosProvider`, `DeliveryPartner`) so external systems plug in behind interfaces ([08 integration map](../target-architecture/08-INTEGRATION-MIGRATION-MAP.md)).
- **Separate schemas/bounded contexts** for large external protocols (ONDC) rather than baseline tables.

## Explicitly avoided (no speculative tables)
- No GPS/location table, no ONDC tables, no loyalty points/tier tables, no driver-app tables, no ticket-validation/capacity tables in the baseline schema. These are added **only** when the corresponding owner-decision/feature is approved.

This keeps the baseline model minimal and evidence-driven while leaving clean seams for progressive introduction.
