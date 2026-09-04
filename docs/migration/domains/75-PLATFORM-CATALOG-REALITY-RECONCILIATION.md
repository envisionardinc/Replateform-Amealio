# 75 — Platform Catalog Reality Reconciliation

> **Type:** FORENSIC / RECONCILIATION. No production behavior is changed by this document.
>
> **Purpose:** Establish the verified legacy reality for Super Admin global catalog workflows before the target PostgreSQL model or APIs are extended.
>
> **Authority:** `Amealio-VendorDashboard` backend source + `AmealioDashboardMVP-` Super Admin / Merchant UI. Where an older migration document conflicts with directly verified source, this document is the current reconciliation record and the older document remains historical evidence.

## 1. Finding

The earlier conclusion in `34-SUPERADMIN-PLATFORM-FOUNDATION-RECONCILIATION.md` that there is **no Super Admin Item Catalog** is not consistent with the directly verified source/UI workflow.

The legacy platform has a real **Super Admin Global Catalogue** workflow for reusable menu categories/items, plus a distinct **Experience Catalogue** workflow in the Super Admin experience area. These workflows must be preserved in the replatforming; they must not be removed merely because their MongoDB implementation is not a clean standalone template entity.

This does **not** mean that the target must copy the legacy MongoDB shape. The target should preserve the business capability and ownership workflow while using canonical PostgreSQL entities and explicit relationships.

## 2. Verified Global Item Catalogue evidence

### Backend

`Amealio-VendorDashboard/src/services/catalogue/global-catalogue.class.ts` is explicitly implemented as the global catalogue creation service. Its source comment states that the API performs bulk insertion into the **global catalogue**, including categories and items.

The implementation:

- creates/reuses a `Sub Category`;
- creates/reuses a `catalogue` by name;
- creates/reuses a global `menu_category` with `is_global: true`;
- creates a global `vendorItems` record with `is_global: true`;
- associates the item to the menu category and catalogue;
- supports `assign_items` to replace/assign the catalogue's item list.

The separate `vendor-catalogue.class.ts` then consumes a catalogue and materializes local merchant records. It creates local categories/items with merchant ownership and converts temporary local records into local records when the merchant commits the selection.

### Super Admin UI

`AmealioDashboardMVP-/client/src/components/superAdminComponents/superAdminAllComponent/SuperAdminGlobalCatalogue/` contains the Super Admin Global Catalogue screens, including:

- `GlobalCatalogueDashboard.js`
- `GlobalCatalogViewDetails.js`
- `SuperAdminCatalogueView/GlobalCatalogueView.js`
- `SuperAdminCatalogueView/AssignItem.js`
- `SuperAdminCatalogueView/ItemsDash.js`
- `SuperAdminCatalogueView/AssignChainItem.js`

The UI also has dedicated global-catalogue routes and Redux actions such as `SUPERADMIN_GET_GLOBAL_CATALOG` and `GET_ADMIN_GLOBAL_ALL_MENU_ITEMS`.

The merchant onboarding/menu setup UI explicitly loads both the global and chain catalogues, and item setup exposes a `Global/Chain` selection. Therefore this is a real merchant-facing reuse workflow, not merely an unused admin table.

## 3. Global Item Catalogue business workflow to preserve

The verified workflow is:

```text
Super Admin
   |
   | create/manage reusable global categories/items/catalogue
   v
Global Catalogue
   |
   | merchant selects/reuses catalogue content
   v
Merchant temporary/local category + item records
   |
   | merchant commits selection to menu
   v
Merchant-owned Menu / MenuSection / MenuItem
```

Important distinction:

- **Global Catalogue ownership:** platform/Super Admin curated reusable source.
- **Merchant catalogue/menu ownership:** merchant runtime records derived from or created independently by the merchant.
- **Chain catalogue:** separate reusable chain-level path and must not be collapsed into the global path without evidence.
- **Merchant-created items:** remain supported and must coexist with copied global items.

## 4. Verified Experience Catalogue evidence

`AmealioDashboardMVP-/client/src/components/superAdminComponents/superAdminAllComponent/SuperAdminExperience/ExperienceCatalog/` is a dedicated Super Admin **Experience Catalogue** area.

Verified files include:

- `AddExperienceFolder.js`
- `MediaManagement.js`
- `MediaCatalogue.js`
- `AddPhotos.js`
- `AddVideos.js`
- `AiGenrationPopup.js`

`MediaCatalogue.js` explicitly labels the experience folders as **Experience Catalogue** and provides folder-level photo/video management. The UI route is `/superadmin/experience/media/...`.

This establishes a platform-managed reusable experience catalogue/media capability. It must not be incorrectly collapsed into merchant-owned `Experience` records.

The legacy `Experience` MongoDB model itself is merchant/restaurant-scoped (`vendorId`, `restaurantId`) and represents the merchant's published/operational experience. The platform Experience Catalogue is therefore a distinct **reusable platform content/workflow layer**, even though the legacy implementation stores different pieces of the capability in different services/models.

## 5. Target impact

The current target has merchant-scoped `Menu`, `MenuSection`, `MenuItem` and merchant-scoped `Experience` foundations, but no explicit platform global-catalogue application/service layer.

Therefore:

### Global Item Catalogue — REQUIRED migration capability

Do not invent a new product concept beyond the verified workflow. Add a target representation for:

1. platform-owned reusable item/category/catalogue definitions;
2. Super Admin create/manage/assign operations;
3. merchant discovery/selection of reusable global content;
4. copying/materialization into merchant-owned menu/category/item records;
5. preservation of merchant-created local content;
6. separate chain-catalogue behavior where legacy evidence requires it.

The exact target schema/API surface is **implementation work**, not an owner decision, provided the behavior above is preserved.

### Experience Catalogue — REQUIRED migration capability

Preserve the platform-managed Experience Catalogue/media workflow separately from merchant operational `Experience` records.

At minimum the target architecture must distinguish:

```text
Platform Experience Catalogue / reusable content
                |
                v
Merchant Experience configuration / operational record
```

The existing target `Experience` model must not be repurposed to mean the platform catalogue without a migration design review.

## 6. What remains owner-decision / unknown

This reconciliation does **not** establish the following without additional source tracing:

- whether every global item can be copied independently or only through catalogue/category selection;
- whether global item edits propagate to previously copied merchant items;
- whether copied merchant records retain a source/global-item lineage identifier;
- exact global-vs-chain precedence when both exist;
- whether Experience Catalogue folders are reusable templates, reusable media only, or both for every experience workflow;
- exact propagation/update semantics for experience catalogue content after merchant reuse.

These are forensic questions, not reasons to block the migration. Do not invent answers until traced from the corresponding backend services and UI actions.

## 7. Immediate implementation rule

Before the next catalog/experience write implementation is merged:

1. trace the legacy API/service registrations for Global Catalogue and Experience Catalogue;
2. trace the corresponding Super Admin actions and merchant selection/clone actions;
3. identify the complete request/response shapes;
4. map them to target PostgreSQL entities and lineage rules;
5. add integration tests for platform creation, merchant reuse/copy, and merchant-local creation;
6. validate against the canonical PostgreSQL database before merge.

No blind schema addition and no merge based only on an AI-generated claim of completion.

## 8. Relationship to prior migration documentation

`34-SUPERADMIN-PLATFORM-FOUNDATION-RECONCILIATION.md` remains useful for its broader platform-reference inventory, currency/geography/media findings, and dependency analysis. Its specific **Sections 9 and 10 conclusions about the absence of Global Item/Experience Catalogue workflows are superseded by this reconciliation**.

The legacy source itself is the deciding evidence: the Global Catalogue backend service and the Super Admin Global Catalogue UI are both present and operationally connected to merchant menu setup.
