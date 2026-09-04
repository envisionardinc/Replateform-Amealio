# Global Catalogue API Contract — Forensic Trace

**Status:** FORENSIC / RECONCILIATION ONLY  
**Date:** 2026-09-03  
**Target branch:** `replatform/backend-consolidation`

## Purpose

Capture the concrete legacy request/response surfaces now traced for Global Catalogue administration and merchant reuse. This document does not implement or change target behavior.

## 1. Catalogue container lifecycle

The Super Admin dashboard uses the `/catalogue` service for the Global Catalogue container lifecycle:

- `POST /catalogue` — create a catalogue container;
- `GET /catalogue` — list/read global catalogue containers;
- `PATCH /catalogue/:id` — update catalogue container fields;
- `DELETE /catalogue/:id` — delete a catalogue container.

The dashboard explicitly performs these operations for Global Catalogue Management. The create/update UI sends a `formData` object; the dashboard displays catalogue `name` and `description` and toggles `status`. The previously traced form contract also includes `cuisin_type` and catalogue identity state. This confirms that catalogue metadata is a separate lifecycle from global item construction. fileciteturn223file0 fileciteturn224file0

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

## 8. What is now established for target implementation

The evidence is now sufficient to define the target's first Global Catalogue vertical boundary without guessing the entire legacy item schema:

1. platform-owned reusable catalogue container;
2. platform-owned reusable category/item source content;
3. Super Admin-only administration of that source;
4. merchant-scoped discovery;
5. explicit merchant materialization into local catalog records;
6. independent local editing after materialization;
7. optional operational menu attachment;
8. separate Global vs Chain source classes;
9. no mutation of the global source when a merchant edits its copy.

## 9. Still blocked / not to invent

Do not infer yet:

- global-source update propagation to existing copies;
- permanent lineage requirements;
- exact modern duplicate key beyond observed legacy name-based checks;
- chain-over-global precedence;
- whether temporary preview state must remain visible in the new UI;
- full legacy item field parity;
- whether the two import paths should converge in the final API;
- deletion/archive semantics for source content that already has merchant copies.

These are either evidence gaps or owner/business decisions, not implementation details to guess.

## 10. Next implementation slice

Proceed with the smallest PostgreSQL implementation that proves the established contract, while deliberately deferring unresolved behavior:

**Super Admin → create Global Catalogue → create reusable category/item → merchant discovers → selects → materializes local copy → edits local copy → attaches to menu → verify source unchanged.**

The implementation should reuse the existing target merchant/restaurant/menu/item foundation where appropriate, but introduce a distinct platform-source aggregate rather than adding legacy global flags to `MenuItem`.
