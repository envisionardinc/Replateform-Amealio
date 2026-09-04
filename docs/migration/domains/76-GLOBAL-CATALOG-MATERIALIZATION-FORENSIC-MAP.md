# Global Catalog & Merchant Materialization — Forensic Map

**Status:** FORENSIC / RECONCILIATION ONLY  
**Date:** 2026-09-03  
**Target branch:** `replatform/backend-consolidation`

## Purpose

This document records the legacy Global Catalogue contract and the merchant materialization workflow that must be preserved when the PostgreSQL target implementation is introduced.

No production behavior, API, schema, or migration is changed by this document.

## 1. Legacy platform-owned Global Catalogue exists

The legacy backend registers a dedicated `/global-catalogue` service. Its implementation is explicitly described as a bulk insertion API for building a global catalogue with categories and items. The service creates/reuses:

1. a cuisine/sub-category context when supplied;
2. a catalogue;
3. a global menu category (`is_global: true`); and
4. a global item (`is_global: true`) associated to the catalogue/category.

The service rejects an item when another global item with the same name already exists. An `assign_items` array can associate item IDs to the catalogue. The implementation itself warns that `assign_items` is an explicit operation and should not be supplied casually.

The service is registered at `/global-catalogue`, while the underlying catalogue container is separately registered at `/catalogue`. fileciteturn183file0

## 2. Super Admin catalogue lifecycle is broader than the bulk endpoint

The Super Admin UI has a dedicated Global Catalogue area and an Add Global Catalogue screen. The UI's catalogue form captures:

- `name` (required);
- `cuisin_type` (required and selected from approved cuisines);
- `description`;
- `status`; and
- `catalogue_id` in the form state.

The UI action creates the catalogue through `POST /catalogue`, reads catalogues through `GET /catalogue`, updates through `PATCH /catalogue/:id`, and deletes through `DELETE /catalogue/:id`.

Therefore the migration must distinguish the **catalogue container lifecycle** from the separate **bulk global category/item construction** endpoint. Do not assume `/global-catalogue` is the only API involved in the Super Admin Global Catalogue workflow.

The legacy Super Admin UI also exposes explicit Global Catalogue and Chain Catalogue screens and separate catalogue-detail/assignment flows. fileciteturn173file0

## 3. Catalogue is a reusable container, not the merchant menu

The legacy `/catalogue` service is a read service over the catalogue model. A catalogue contains a name, cuisine type, description, an item-ID collection, and active/status state. Reads populate the referenced items. This establishes a platform catalogue/container layer distinct from the merchant's operational menu. fileciteturn156file0 fileciteturn158file0

The legacy service registration exposes three related paths:

- `/catalogue` — catalogue container CRUD/read surface;
- `/global-catalogue` — platform/global catalogue construction;
- `/vendor/localCategoryItems` — merchant-side materialization/commit workflow. fileciteturn182file0

## 4. Merchant Global Catalogue discovery and selection

The merchant dashboard uses `/catalogue` to retrieve Global Catalogue containers, `/catalogue/:id` to retrieve the selected catalogue and its item/category data, and `/vendor/items/:categoryId?catlogue_id=:catalogueId` to retrieve items for a selected catalogue category.

The merchant selection action then posts to `/vendor/items?add=true`. The request contains a `cat_id` and an `Items` collection of selected source item IDs. The legacy implementation authenticates the merchant, loads those source item records, copies their business fields into new merchant-owned item documents, replaces the category with the selected local category, and suppresses creation when the merchant already has an item with the same name. fileciteturn164file0 fileciteturn170file0

This is direct evidence that merchant reuse is a **copy/materialization operation**, not a live reference to the global item document.

## 5. Merchant reuse is materialization, not a live reference

The legacy merchant catalogue service receives a catalogue ID and materializes records into the merchant's own namespace.

For each source category it:

- creates a new local category when needed;
- removes the source `_id` from the copied object;
- records the source category ID in `temp_parent_category_id`;
- sets `is_temp_local=true`, `is_global=false`, `is_chain_catalogue=false`;
- sets the merchant/vendor ID;
- sets the catalogue ID; and
- optionally associates the new category with a menu.

For each source item it follows the same pattern:

- removes the source `_id`;
- sets `is_temp_local=true`, `is_global=false`, `is_chain_catalogue=false`;
- sets the merchant/vendor ID;
- replaces the source category with the newly materialized local category;
- records the catalogue ID; and
- optionally associates a menu. fileciteturn157file0

The source global records therefore remain distinct from the merchant records.

## 6. There are two observed merchant import paths

The legacy codebase contains both:

### A. Local-category temporary materialization path

`GET /vendor/localCategoryItems/:catalogueId` materializes catalogue content into temporary local category/item records, followed by `POST /vendor/localCategoryItems` to promote retained records and optionally attach them to a menu.

### B. Direct selected-item copy path

`POST /vendor/items?add=true` receives selected source item IDs and copies the source fields into merchant-owned item documents under a supplied category. The direct copy implementation explicitly carries over a broad set of item properties, including nutrition/allergy/personalization-related values, media, availability, tags, schedule/state values, description/ingredient information, cuisine/food classification, sizes, and add-ons. fileciteturn170file0

These paths must not be collapsed until their UI usage and business differences are fully reconciled. They may represent different merchant setup workflows.

## 7. Commit/promotion is a separate step

The legacy `/vendor/localCategoryItems` service's `create` operation treats selected records as temporary materializations. A temporary category/item can be deleted, while a retained record is promoted by changing:

- `is_temp_local: false`
- `is_local: true`

When a menu is supplied, the promoted category/item is associated with that menu and the relevant item IDs are inserted into the menu's category structure. fileciteturn157file0

This is important: **selection/materialization and operational activation are separate legacy states.** The target must not collapse those states into a single implicit insert if doing so would remove an existing merchant workflow or prevent cancellation before commit.

## 8. Chain Catalogue is a separate source class

The same merchant materialization service has an explicit `chainCatalogue` path. When that query flag is present, it loads a chain catalogue and materializes its items through the same local-category/local-item machinery.

The Super Admin UI also has separate Chain Catalogue create/read/update/delete actions and views. The dashboard action layer calls `/chaincatalogue` for create and `/admin/chaincatalogue` for retrieval, with corresponding update/delete calls on `/chaincatalogue/:id`. fileciteturn163file0

The target must therefore preserve the distinction:

- Global Catalogue = platform-owned reusable source;
- Chain Catalogue = chain-owned reusable source;
- Merchant Local = merchant-owned operational copy.

Do not merge Global Catalogue and Chain Catalogue into one generic source without further evidence.

## 9. Authorization evidence — preserve intent, not legacy weaknesses

The legacy authorization evidence is inconsistent across the related endpoints:

- the merchant materialization service explicitly requires an authorization token and resolves the authenticated merchant before copying data;
- Super Admin category creation explicitly checks that the authenticated vendor user has `role == "superadmin"`;
- the legacy AdminItems create/find/get/patch/remove service requires an authenticated vendor user but does **not** independently enforce the `superadmin` role in the service implementation;
- the `/catalogue` hooks shown here do not independently enforce the commented-out authorization check. fileciteturn157file0 fileciteturn197file0 fileciteturn198file0 fileciteturn199file0

Therefore the target should preserve the **business intent** — Global Catalogue administration is a platform/Super Admin capability and merchant materialization is merchant-scoped — but should not copy legacy authorization omissions merely because they exist in code. The modern implementation must use the target RBAC/tenant-scope boundary.

This is an implementation/security conclusion from evidence, not a new business rule.

## 10. Target gap confirmed

The current target catalog model is merchant/restaurant scoped. The target `MenuItem` belongs to a merchant and restaurant/menu structure; there is no equivalent platform-owned Global Catalogue aggregate in the current target baseline. The current write service is explicitly merchant-tenant-scoped. fileciteturn186file0

Therefore the correct next step is **not** to add a collection of legacy flags to `MenuItem`. The missing capability is a domain boundary: a platform reusable source plus an explicit materialization relationship into merchant-owned catalog/menu records.

## 11. Minimum target design direction — evidence-based

The target implementation should be evaluated around these concepts:

### Platform reusable source

A platform-owned catalogue/template aggregate containing reusable item definitions and their category relationships.

### Merchant materialization

A merchant-owned copy/materialization record that points back to its source for lineage/audit, while remaining independently editable after creation.

### Operational menu attachment

The materialized merchant item/category can then be attached to a merchant/restaurant menu through the existing target menu model.

### Source lineage

Because the legacy workflow copies source records and subsequently operates on merchant-local records, lineage should be explicit if it can be introduced without changing legacy semantics. The exact lineage fields and whether source updates ever propagate remain implementation questions requiring additional evidence.

## 12. Business rules that are established

- Super Admin has a dedicated Global Catalogue workflow.
- Global Catalogue has a catalogue/container lifecycle.
- Global Catalogue includes categories and items.
- Global items are platform-owned records.
- Merchants can discover and consume Global Catalogue content.
- Merchant consumption creates merchant-local records rather than turning the global source into the merchant record.
- Merchant-local records can be promoted from a temporary state to an operational local state.
- A direct selected-item copy path also exists.
- Global and chain catalogue sources are distinct.
- Existing merchant-created items remain a valid path and must continue to work.

## 13. Business rules still not established

Do **not** infer the following without further evidence or an owner decision:

1. whether edits to a global source propagate to existing merchant copies;
2. whether a merchant copy retains permanent lineage to its source;
3. whether a merchant may import one item independently or only through catalogue/category selection;
4. whether duplicate detection is by source ID, name, external ID, or a combination in the modern target;
5. whether chain catalogue content overrides, supplements, or merely coexists with global content;
6. whether the temporary materialization state must remain visible in the modern UI/API;
7. whether global categories themselves are editable by merchants after materialization;
8. exact field-level normalization from the legacy `vendorItems` document into the target `MenuItem`/variant/add-on model;
9. whether the two observed merchant import paths are intentionally distinct or historical duplication;
10. exact authorization roles/permissions beyond the observed requirement for a valid authenticated legacy token.

## 14. Required vertical-slice acceptance test

Before calling this capability migrated, the target must prove the following against PostgreSQL:

1. Super Admin creates a reusable global catalogue.
2. Super Admin creates/associates reusable global category/item content.
3. Global source is retrievable independently of any merchant.
4. Merchant discovers the global source through an authorized merchant operation.
5. Merchant selects global content for reuse.
6. Merchant materializes the selected category/item into its own scope.
7. Materialization does not mutate the global source.
8. Merchant can edit the local copy without changing the global source.
9. Merchant can attach the local copy to an operational menu.
10. Merchant-created item creation still works independently of Global Catalogue.
11. Global and chain source paths remain distinguishable.
12. Repeating the same materialization does not create unintended duplicate local records under the established duplicate rule.
13. Both observed merchant import paths are reconciled before either is removed or collapsed.

## 15. Immediate implementation gate

No Global Catalogue schema/API implementation should be merged until the remaining legacy evidence is traced for:

- exact Super Admin request shapes for global item creation and assignment;
- exact merchant request/response shapes for both import paths;
- category/item selection semantics;
- duplicate behavior across the two import paths;
- chain catalogue precedence;
- global edit/delete behavior and impact on existing merchant copies;
- full field-level copy semantics; and
- Experience Catalogue/template behavior.

Authorization intent is now sufficiently understood to implement the modern boundary as **SUPER_ADMIN for platform Global Catalogue administration** and **merchant-scoped staff for merchant materialization**, subject to existing target RBAC conventions. The remaining questions above are still data/behavior questions, not reasons to block the forensic mapping.

Once those traces are complete, implement the smallest PostgreSQL vertical slice and integration-test it before expanding the schema to cover the full legacy item field surface.
