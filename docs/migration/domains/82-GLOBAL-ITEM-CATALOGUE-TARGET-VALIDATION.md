# 82 — Global Item Catalogue Target Validation Against Docs 75–78

> **Type:** VALIDATION. Records what the current target implements versus the forensic contract.
>
> **Authority:** Docs 75–78 + direct legacy sources in `amealio-vendordashboard` / `amealiodashboardmvp-` + `apps/api/src/modules/platform-catalog/` on `replatform/backend-consolidation`.
>
> **Brand:** amealio

## Status

**🟡 Discovery + create + materialize implemented; temp-local path / chain / full field copy / delete still deferred.**

## Legacy endpoints traced (this slice)

| Operation | Legacy evidence |
|---|---|
| List catalogues | `GET /catalogue` — `catalogue.class.ts#find`; Super Admin `admin_get_global_catalog`; merchant `get_all_global_cateloge_menu` |
| Get catalogue detail | `GET /catalogue/:id` — `catalogue.class.ts#get` (+ after-hook category enrichment); merchant + Super Admin |
| Item discovery by category | `GET /vendor/items/:categoryId?catlogue_id=` — `addItemGlobalCatelogAction.js` |
| Create catalogue | `POST /catalogue` — Super Admin UI |
| Update catalogue | `PATCH /catalogue/:id` — `admin_update_global_catalog` |
| Bulk create content | `POST /global-catalogue` — split into explicit category/item create in target |
| Materialize | `POST /vendor/items?add=true` — merchant copy into local items |
| Delete catalogue | `DELETE /catalogue/:id` — **deferred** (materialization RESTRICT semantics unresolved) |
| Temp local path | `/vendor/localCategoryItems` — **deferred** |

## Capability matrix

| Forensic contract (75–78) | Target today | Disposition |
|---|---|---|
| Platform catalogue container distinct from merchant menu | `platform_catalogs` + service | Preserved |
| Platform categories / items as reusable source | `platform_catalog_categories` / `platform_catalog_items` | Preserved |
| Explicit materialization lineage | `platform_catalog_item_materializations` | Preserved |
| Super Admin creates global catalogue/category/item | `POST platform-catalog/global*` + `@PlatformOnly` | Validated |
| Super Admin updates catalogue metadata | `PATCH platform-catalog/global/:catalogId` + `@PlatformOnly` | Implemented |
| List/get catalogues | `GET platform-catalog/global`, `GET .../global/:catalogId` | Implemented |
| List categories / items | `GET .../categories`, `GET .../items?categoryId=` | Implemented |
| Get global item | `GET platform-catalog/global-items/:itemId` | Implemented |
| Merchant discovery reads | Same GET routes; `MERCHANT_OWNER` / `MERCHANT_STAFF` (+ SUPER_ADMIN) | Implemented |
| Merchant materialize copy into local MenuItem | `POST .../materialize` + restaurant/section scope | Validated |
| No invented source→copy sync / deletion propagation | Not implemented | Correct — deferred |
| Chain catalogue | Not implemented | Deferred |
| Temp local materialization + promote | Not implemented | Deferred |
| Full vendorItems field copy on materialize | name/description + `source_payload` on source | Deferred (doc 77) |
| Delete catalogue | Not exposed | Deferred (owner/RESTRICT) |

## Authorization

- Discovery: `JwtStaffGuard` + `StaffAuthorizationGuard` + `@RequireStaffRoles(SUPER_ADMIN, MERCHANT_OWNER, MERCHANT_STAFF)`
- Source mutations: `@PlatformOnly` (SUPER_ADMIN)
- Materialization: `@RequireStaffRoles(MERCHANT_OWNER, MERCHANT_STAFF)` + `MerchantScopeService`
- Request `merchantId` never grants scope

## Explicit non-claims

- Not claiming full Global Catalogue product parity.
- Not claiming CI passed.
- Not inventing temp-local / chain / sync / delete-with-copies semantics.
