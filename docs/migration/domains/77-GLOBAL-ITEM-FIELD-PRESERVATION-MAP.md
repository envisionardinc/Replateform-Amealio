# Global Item Field Preservation Map

**Status:** FORENSIC / RECONCILIATION ONLY  
**Date:** 2026-09-03  
**Target branch:** `replatform/backend-consolidation`

## Purpose

This document prevents the Global Catalogue migration from either losing legacy item behavior or blindly reproducing the legacy Mongo document in PostgreSQL.

No production behavior, API, schema, or migration is changed by this document.

## 1. Legacy global items use the same vendorItems document family

The legacy platform Global Catalogue does not have a small standalone item DTO. Global items are stored in the broad `vendorItems` model and are distinguished through catalogue/category ownership and flags such as `is_global`, `is_chain_catalogue`, and `is_local`.

The legacy `vendorItems` model contains substantially more than the current target `MenuItem`: identity/external IDs, classifications, dietary information, media, availability, variants/sizes, nutrition, allergies, personalization controls, channel-specific pricing/surcharges, scheduling, tags, add-ons, and catalogue/source flags. fileciteturn204file0

## 2. Field groups observed in the legacy item model

The legacy model contains these functional groups:

### Identity and classification

- `name`
- `ext_id`
- `externalId`
- `thirdParty`
- `global_chain_id`
- `type`
- `description`
- `ingredient_description`
- `category`
- cuisine / primary food / beverage classifications
- food and beverage classification arrays

### Dietary and personalization

- `veg`
- `itemType` (VEG / NONVEG / EGG)
- `keywords`
- `utterancesVoice`
- `tags`
- health tags and primary health tags
- allergy information / primary allergy
- `personalization_text`
- `personalization_status`
- temperature, ice, flavour, sour, spice, salt, sugar and fat levels
- meat-cook and egg-cook levels
- `customizable`
- add-on behavior flags

### Media and discovery

- `images`
- `image_thumbnails`
- `videos`
- UPC / barcode / QR code
- review/rating-related state
- generated/share-link related behavior exists elsewhere in the service layer

### Availability and operational state

- date-of-availability window
- `lead_time`
- `cut_off_time`
- `status`
- `auto_accept`
- `prepTime`
- `sortOrder`
- opening-time/schedule data
- day-of-week open/closed and multiple timing windows

### Variants / sizes

Each `size` entry can contain:

- price
- size
- UOM
- pax
- description
- default/available state
- calories
- alcohol content
- imperial/metric serving/UOM metadata
- alternate-unit serving/UOM metadata

### Nutrition

- nutritional-info enablement
- calorie data
- detailed nutrition values and UOMs
- nutritional image references

### Channel-specific configuration

The legacy item stores separate structures for:

- `skip_line`
- `take_away`
- `curb_side`
- `dine_in`
- `home_delivery`
- `catering_banquet`

Each can carry enabled/value state, sizes, and surcharge configuration.

### Source/ownership state

- `is_global`
- `is_chain_catalogue`
- `is_local`
- `is_temp_local`
- `catalogue_id`
- `restaurant_chain_id`
- issue-description/state fields

These source flags are part of the legacy storage strategy; they should not automatically become fields on the modern merchant `MenuItem`.

## 3. Direct merchant Global Catalogue copy is broad

The legacy `POST /vendor/items?add=true` implementation explicitly copies many of the above fields from the selected source item into a new merchant item. The copied set includes nutrition, allergy, personalization, media, tags, availability, schedule/state, description/ingredient information, food/beverage/cuisine classification, sizes, and add-ons, among other fields. fileciteturn170file0

This establishes a critical migration requirement:

> Global Catalogue reuse is not merely copying `name` and `price`.

A modern implementation that only copies the current target `MenuItem` fields would silently reduce legacy behavior unless the omitted capabilities are proven obsolete or intentionally deferred.

## 4. What belongs in the first PostgreSQL vertical slice

The first Global Catalogue vertical slice should only normalize fields required to prove the source/materialization contract:

### Platform source

- catalogue identity/name/description/status
- source category identity/name and category relationship
- reusable item identity/name/description/status
- source-to-catalogue/category relationship
- legacy IDs where available for migration traceability

### Merchant materialization

- merchant/restaurant ownership
- source item reference/lineage
- source category reference/lineage where applicable
- local item name/description/status
- local category/menu-section association
- variant/price information only where the existing target ordering flow requires it
- explicit materialization state if the two-step workflow is retained

### Do not force into the first slice

The following should remain separate follow-on migrations unless existing target consumers already require them:

- detailed nutrition
- allergy taxonomy
- personalization-level configuration
- advanced scheduling
- all channel-specific surcharge structures
- barcode/QR/UPC enrichment
- voice utterances
- advanced health tags
- legacy media-shape details
- alcohol-content metadata
- complex alternate UOM structures

The reason is not to discard them. It is to avoid coupling the first reusable-source proof to every legacy field before each field's target semantics are understood.

## 5. Important distinction: preservation versus schema copying

The migration must preserve **business capability and data meaning**, not the physical Mongo document shape.

The target already has normalized concepts for Menu, MenuSection, MenuItem, ItemVariant, ItemChannelConfig, AddOnGroup, and AddOn. Those should remain the operational merchant model. The missing platform layer should supply reusable source definitions and materialization behavior around that existing model rather than turning `MenuItem` into a legacy-document compatibility container. fileciteturn186file0

## 6. Required field-by-field reconciliation before production migration

Before migrating existing Global Catalogue data, every legacy field group must receive one of these dispositions:

- **NORMALIZE** — map to an existing target relational concept;
- **NEW DOMAIN FIELD** — target behavior requires a new first-class concept;
- **JSON/EXTENSION** — evidence supports preservation but target semantics are not yet stable enough to normalize;
- **DEFER** — no current target consumer and migration can safely occur later;
- **RETIRE** — proven obsolete with evidence;
- **OWNER DECISION** — business meaning or desired behavior is ambiguous.

No field should be silently dropped merely because it is absent from the current target schema.

## 7. Current target gap

The current target `CreateItemInput` supports only a subset of the legacy item surface: name, description, availability/publication, POS ID, legacy ID, variants, channel configuration, and add-on groups. fileciteturn188file0

That is acceptable for the current merchant catalog foundation, but it is not yet sufficient to claim full Global Catalogue parity.

## 8. Implementation sequence

1. Finish Global Catalogue source/merchant API reconciliation.
2. Define the minimal platform-source schema.
3. Define source-to-merchant materialization with explicit lineage.
4. Reuse existing merchant `MenuItem` creation/update machinery rather than duplicating it.
5. Prove source immutability during materialization.
6. Prove local edit independence.
7. Add variant/add-on copying only after their legacy-to-target mapping is established.
8. Reconcile the remaining item field groups individually.
9. Only then claim Global Catalogue parity.

## 9. No business-rule invention

This map does not establish any of the following:

- whether global source edits propagate to merchant copies;
- whether copied prices remain controlled by the source or become merchant-controlled;
- whether a merchant can selectively omit variants/add-ons during import;
- whether global categories can be independently reused across catalogues;
- whether global item deletion is soft or destructive from the merchant perspective;
- whether advanced personalization/nutrition fields are required in the first modern merchant release.

Those remain forensic or owner decisions as appropriate.
