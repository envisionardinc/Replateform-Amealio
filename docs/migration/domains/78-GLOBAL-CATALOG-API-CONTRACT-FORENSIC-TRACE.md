# Global Catalogue API Contract — Forensic Trace

**Status:** FORENSIC + NARROW TARGET FOUNDATION IMPLEMENTED  
**Date:** 2026-09-03  
**Target branch:** `replatform/backend-consolidation`

## Purpose

Capture the concrete legacy request/response surfaces traced for Global Catalogue administration and merchant reuse, then record the deliberately narrow target implementation that proves the established contract without inventing unresolved behavior.

## 1. Catalogue container lifecycle

The Super Admin dashboard uses the `/catalogue` service for the Global Catalogue container lifecycle:

- `POST /catalogue` — create a catalogue container;
- `GET /catalogue` — list/read global catalogue containers;
- `PATCH /catalogue/:id` — update catalogue container fields;
- `DELETE /catalogue/:id` — delete a catalogue container.

The dashboard explicitly performs these operations for Global Catalogue Management. The create/update UI sends a `formData` object; the dashboard displays catalogue `name` and `description` and toggles `status`. The traced form contract also includes `cuisin_type` and catalogue identity state. This confirms that catalogue metadata is a separate lifecycle from global item construction. fileciteturn223file0 fileciteturn224file0

## 2. Global catalogue construction is a separate endpoint

The legacy backend exposes `/global-catalogue` as a dedicated bulk construction operation. It accepts a composite payload containing optional `sub_category`, optional `catalogue`, optional `menu_category`, optional `item`, and optional `assign_items` data. The service creates/reuses the supplied sub-category and catalogue, creates/reuses a global menu category, creates a global item linked to the category and catalogue, and can associate item IDs with the catalogue. A duplicate global item name is rejected. fileciteturn215file0

This must not be collapsed into `POST /catalogue` in the target without preserving the distinction between **container management** and **reusable content construction**.

## 3. Merchant Global Catalogue discovery

The merchant dashboard reads:

- `GET /catalogue` for catalogue containers;
- `GET /catalogue/:catalogueId` for catalogue contents;
- `GET /vendor/items/:categoryId?catlogue_id=:catalogueId` for item selection within a catalogue category.

The merchant selection flow then posts selected content to:

- `POST /vendor/items?add=true`

with a form payload containing a `cat_id` and an `Items` collection of selected source item IDs. The client treats HTTP 201 as successful materialization. fileciteturn221file0

## 4. Direct selected-item copy semantics

The traced legacy direct-copy implementation authenticates the merchant, resolves the source items, creates merchant-owned item documents, removes the source `_id`, changes global/source flags to merchant-local state, assigns the supplied local category, and preserves the source item's business fields. It suppresses creation when an equivalent merchant item already exists under the legacy duplicate condition. This is a true materialization/copy operation rather than a reference assignment. fileciteturn216file0

The target therefore needs an explicit source-to-local boundary. A merchant `MenuItem` must not become the global source record merely because a merchant selected it.

## 5. Temporary local materialization path

The second legacy path is catalogue-level materialization through `/vendor/localCategoryItems`. For each source category and item it creates a temporary merchant-local record with:

- `is_temp_local=true`;
- `is_global=false`;
- `is_chain_catalogue=false`;
- merchant/vendor ownership;
- catalogue association;
- copied business fields;
- optional menu association.

The subsequent create/commit operation either deletes temporary records or promotes retained records to local state using `is_temp_local=false` and `is_local=true`, optionally attaching them to a menu. fileciteturn216file0 fileciteturn217file0

This establishes a legacy two-phase user workflow: **preview/select/materialize → commit/promote**.

## 6. Chain Catalogue remains distinct

The same merchant materialization service has an explicit `chainCatalogue` branch. The Super Admin dashboard separately creates, lists, updates, and deletes Chain Catalogues through `/chaincatalogue` and `/admin/chaincatalogue`. Global and Chain Catalogue are therefore distinct source classes in the legacy product. fileciteturn216file0 fileciteturn223file0

## 7. Authorization contract

The legacy merchant materialization path requires a valid authorization token and resolves the authenticated vendor before operating. The Super Admin UI calls the catalogue administration endpoints with the authenticated access token. Legacy authorization enforcement is inconsistent in some underlying services, so the target should preserve capability intent using the modern RBAC/merchant-scope model rather than reproduce missing legacy checks. fileciteturn216file0 fileciteturn223file0

## 8. Established target boundary

The evidence is sufficient to define the target's first Global Catalogue vertical boundary without guessing the entire legacy item schema:

1. platform-owned reusable catalogue container;
2. platform-owned reusable category/item source content;
3. Super Admin-only administration of that source;
4. merchant-scoped discovery/materialization;
5. explicit merchant copy into local `MenuItem` records;
6. independent local editing after materialization;
7. optional operational menu-section attachment;
8. separate Global vs Chain source concept (Chain implementation remains deferred);
9. no mutation of the global source when a merchant edits its copy.

## 9. Narrow target implementation now present

The branch now contains a deliberately small PostgreSQL source layer:

- `platform_catalogs` — reusable platform-owned catalogue containers;
- `platform_catalog_categories` — reusable source categories;
- `platform_catalog_items` — reusable source items;
- `platform_catalog_item_materializations` — explicit source-item → merchant `MenuItem` copy records.

The implementation is under `apps/api/src/modules/platform-catalog/` and is registered in `AppModule`.

The application service enforces:

- `SUPER_ADMIN` for global catalogue/category/item creation;
- merchant-owner/staff scope for materialization;
- server-derived restaurant/merchant scope;
- destination menu-section/restaurant consistency;
- source preservation through an explicit source payload extension field;
- atomic creation of the local `MenuItem` plus materialization link.

The source layer intentionally does **not** add global flags to `MenuItem`, and it does not implement source-to-copy propagation.

## 10. Still blocked / not to invent

Do not infer yet:

- global-source update propagation to existing copies;
- permanent lineage requirements beyond the explicit materialization record;
- exact modern duplicate key beyond observed legacy name-based checks;
- chain-over-global precedence;
- whether temporary preview state must remain visible in the new UI;
- full legacy item field parity and variant/media/nutrition mapping;
- whether the two legacy import paths should converge in the final API;
- deletion/archive semantics for source content that already has merchant copies;
- a public REST controller until the existing staff route/guard conventions are traced and the endpoint contract is reconciled with the legacy UI.

These are evidence gaps or owner/business decisions, not implementation details to guess.

## 11. Validation gate

CI remains the authoritative build/migration/test gate. The branch must not be merged merely because the files were committed. Required proof for this slice is:

1. migration applies cleanly to an empty canonical PostgreSQL database;
2. Prisma generation/validation remains clean;
3. API build/lint/format remain clean;
4. a SUPER_ADMIN can create source catalogue/category/item records;
5. a merchant can materialize an item only inside its own restaurant scope;
6. the resulting `MenuItem` is merchant-owned and independent from the source;
7. editing the local item leaves the global source unchanged;
8. cross-merchant materialization is rejected;
9. the transaction does not leave an orphan local item when materialization-link creation fails.

Because GitHub Actions is currently blocked before workflow execution by the repository/account billing lock, these checks are **not yet claimed as CI-validated**.

## 12. Next implementation slice

Next, trace and implement the smallest **read/discovery + staff REST boundary** needed by the existing Super Admin and merchant dashboards, then add contract tests before exposing frontend integration. Keep Chain Catalogue, full legacy field parity, propagation, and unresolved deletion semantics out of scope until their evidence is complete.
