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

The service rejects an item when another global item with the same name already exists. An `assign_items` array can associate item IDs to the catalogue. The implementation itself warns that `assign_items` is an explicit operation and should not be supplied casually. See legacy `global-catalogue.class.ts` and its service registration. 

## 2. Catalogue is a reusable container, not the merchant menu

The legacy `/catalogue` service is a read service over the catalogue model. A catalogue contains a name, cuisine type, description, an item-ID collection, and active/status state. Reads populate the referenced items. This establishes a platform catalogue/container layer distinct from the merchant's operational menu. 

The legacy service registration exposes three related paths:

- `/catalogue` — catalogue reads;
- `/global-catalogue` — platform/global catalogue construction;
- `/vendor/localCategoryItems` — merchant-side materialization/commit workflow.

## 3. Merchant reuse is materialization, not a live reference

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
- optionally associates a menu.

The source global records therefore remain distinct from the merchant records.

## 4. Commit/promotion is a separate step

The merchant service's `create` operation treats the selected records as temporary materializations. A temporary category/item can be deleted, while a retained record is promoted by changing:

- `is_temp_local: false`
- `is_local: true`

When a menu is supplied, the promoted category/item is associated with that menu and the relevant item IDs are inserted into the menu's category structure.

This is important: **selection/materialization and operational activation are separate legacy states.** The target must not collapse those states into a single implicit insert if doing so would remove an existing merchant workflow or prevent cancellation before commit.

## 5. Chain Catalogue is a separate source class

The same merchant materialization service has an explicit `chainCatalogue` path. When that query flag is present, it loads a chain catalogue and materializes its items through the same local-category/local-item machinery, while marking the copied records as non-global and non-chain-local after promotion.

The target must therefore preserve the distinction:

- Global Catalogue = platform-owned reusable source;
- Chain Catalogue = chain-owned reusable source;
- Merchant Local = merchant-owned operational copy.

Do not merge Global Catalogue and Chain Catalogue into one generic source without further evidence.

## 6. Target gap confirmed

The current target catalog model is merchant/restaurant scoped. The target `MenuItem` belongs to a merchant and restaurant/menu structure; there is no equivalent platform-owned Global Catalogue aggregate in the current target baseline.

Therefore the correct next step is **not** to add a collection of legacy flags to `MenuItem`. The missing capability is a domain boundary: a platform reusable source plus an explicit materialization relationship into merchant-owned catalog/menu records.

## 7. Minimum target design direction — evidence-based

The target implementation should be evaluated around these concepts:

### Platform reusable source

A platform-owned catalogue/template aggregate containing reusable item definitions and their category relationships.

### Merchant materialization

A merchant-owned copy/materialization record that points back to its source for lineage/audit, while remaining independently editable after creation.

### Operational menu attachment

The materialized merchant item/category can then be attached to a merchant/restaurant menu through the existing target menu model.

### Source lineage

Because the legacy workflow copies source records and subsequently operates on merchant-local records, lineage should be explicit if it can be introduced without changing legacy semantics. The exact lineage fields and whether source updates ever propagate remain implementation questions requiring additional evidence.

## 8. Business rules that are established

- Super Admin can create/manage reusable Global Catalogue content.
- Global Catalogue includes categories and items.
- Global items are platform-owned records.
- Merchants can consume Global Catalogue content.
- Merchant consumption creates merchant-local records rather than turning the global source into the merchant record.
- Merchant-local records can be promoted from a temporary state to an operational local state.
- Global and chain catalogue sources are distinct.
- Existing merchant-created items remain a valid path and must continue to work.

## 9. Business rules still not established

Do **not** infer the following without further evidence or an owner decision:

1. whether edits to a global source propagate to existing merchant copies;
2. whether a merchant copy retains permanent lineage to its source;
3. whether a merchant may import one item independently or only through catalogue/category selection;
4. whether duplicate detection is by source ID, name, external ID, or a combination in the modern target;
5. whether chain catalogue content overrides, supplements, or merely coexists with global content;
6. whether the temporary materialization state must remain visible in the modern UI/API;
7. whether global categories themselves are editable by merchants after materialization;
8. exact field-level normalization from the legacy `vendorItems` document into the target `MenuItem`/variant/add-on model.

## 10. Required vertical-slice acceptance test

Before calling this capability migrated, the target must prove the following against PostgreSQL:

1. Super Admin creates a reusable global catalogue/category/item.
2. Global source is retrievable independently of any merchant.
3. Merchant discovers the global source through an authorized merchant operation.
4. Merchant materializes the selected category/item into its own scope.
5. Materialization does not mutate the global source.
6. Merchant can edit the local copy without changing the global source.
7. Merchant can attach the local copy to an operational menu.
8. Merchant-created item creation still works independently of Global Catalogue.
9. Global and chain source paths remain distinguishable.
10. Repeating the same materialization does not create unintended duplicate local records under the established duplicate rule.

## 11. Immediate implementation gate

No Global Catalogue schema/API implementation should be merged until the remaining legacy evidence is traced for:

- authorization/RBAC around the global endpoints;
- exact Super Admin request shapes;
- exact merchant request/response shapes;
- category/item selection semantics;
- duplicate behavior;
- chain catalogue precedence;
- global edit/delete behavior; and
- experience catalogue/template behavior.

Once those traces are complete, implement the smallest PostgreSQL vertical slice and integration-test it before expanding the schema to cover the full legacy item field surface.
