# 82 — Global Item Catalogue Target Validation Against Docs 75–78

> **Type:** VALIDATION. Records what the current target implements versus the forensic contract.
>
> **Authority:** Docs 75–78 + `apps/api/src/modules/platform-catalog/` on `replatform/backend-consolidation`.
>
> **Brand:** amealio

## Status

**🟡 Partial — foundation validated; discovery/list and temp-materialization paths still incomplete.**

The narrow Global Item Catalogue foundation matches the forensic contract for:

- platform-owned reusable catalogue / category / item source layer;
- Super Admin–only administration of that source;
- merchant-scoped copy/materialization into local `MenuItem`;
- no invented live sync / propagation / chain collapse.

It does **not** yet restore the full Super Admin container CRUD surface or the two-phase merchant temp→promote workflow.

## Capability matrix

| Forensic contract (75–78) | Target today | Disposition |
|---|---|---|
| Platform catalogue container distinct from merchant menu | `platform_catalogs` + service | Preserved |
| Platform categories / items as reusable source | `platform_catalog_categories` / `platform_catalog_items` | Preserved |
| Explicit materialization lineage | `platform_catalog_item_materializations` | Preserved |
| Super Admin creates global catalogue/category/item | `POST platform-catalog/global` (+ categories/items) + `@PlatformOnly` | Validated |
| Merchant materialize copy into local MenuItem | `POST platform-catalog/global-items/:sourceItemId/materialize` + merchant roles + `MerchantScopeService` | Validated |
| Restaurant/menu-section ownership server-validated | Service checks restaurant scope + section restaurant match | Validated (unit tests) |
| Materialization is copy, not live reference | Service copies name/description; does not mutate source on merchant edit path | Preserved |
| No invented source→copy sync / deletion propagation | Not implemented | Correct — deferred |
| Chain catalogue distinct from global | Not implemented | Deferred (doc 76/78) |
| Catalogue container list/update/delete (`/catalogue`) | Not exposed on platform-catalog HTTP yet | Gap — next |
| Bulk `/global-catalogue` composite create | Split into explicit create endpoints | Acceptable narrowing (doc 78 §9) |
| Merchant discovery GET catalogue/items | Not exposed yet | Gap — next |
| Temp local materialization + promote (`localCategoryItems`) | Not implemented | Gap — deferred until UI path recovered |
| Full vendorItems field copy on materialize | Narrow name/description + `sourcePayload` on source | Gap — expand using doc 77 dispositions |

## Authorization validation

Aligned with doc 81 coarse RBAC:

- No token / missing principal → controller refuses service call; guard returns 401 when composed.
- Merchant staff on `@PlatformOnly` global create → rejected.
- Merchant staff materialize own restaurant → allowed after scope check.
- Merchant staff materialize other merchant restaurant → `ForbiddenException` via `MerchantScopeService`.
- Section from another restaurant → `BadRequestException`.

Covered by `platform-catalog.controller.spec.ts`, `platform-catalog.service.spec.ts`, and `merchant-scope.service.spec.ts`.

## Explicit non-claims

- Not claiming full Global Catalogue product parity.
- Not claiming CI passed (local unit tests only).
- Not inventing temp-local / chain / sync semantics.

## Next actions for this vertical

1. Add Super Admin list/get/update/status endpoints for catalogue containers (legacy `/catalogue` lifecycle).
2. Add merchant discovery reads (list catalogues / catalogue contents) with merchant auth.
3. Expand materialization field copy per doc 77 dispositions (not blind Mongo dump).
4. Trace and restore temp-local → promote only if merchant UI still depends on it.
5. Keep Chain Catalogue separate until its own forensic slice.
