# 47 — Merchant Menu & Item Write Foundation (P1.7.18)

> **Type:** IMPLEMENTATION (bounded slice) — merchant-scoped **WRITE** foundation for the catalog hierarchy over the EXISTING target models. One additive migration.
> **Governing gate:** [46-MENU-ITEM-WRITE-RECONCILIATION.md](./46-MENU-ITEM-WRITE-RECONCILIATION.md) (DEC-3).
> **Authority:** legacy source (`amealio-vendordashboard` `menu`/`menu-category`/`vendor-items` write flow) + target `prisma/schema.prisma` + P1.7.5 catalog read module. Baseline **242/242 → 251/251**.

Legend: **IMPLEMENTED** / **DEFERRED** / **UNKNOWN** / **OWNER DECISION**.

---

## 1. Scope

Implemented a merchant-tenant-scoped `CatalogWriteService` (+ `CatalogWriteRepository`) that lets an **activated** merchant configure:

`Menu → MenuSection → MenuItem → (ItemVariant | ItemChannelConfig | AddOnGroup → AddOn)`

over the EXISTING P1.7.5 hierarchy. No new hierarchy, **no platform Item Catalog**, no combos, no tax engine, no scheduling, no POS sync, no controllers/UI.

---

## 2. Legacy source evidence used

- Menu write: `POST/PATCH/DELETE /menu` (`menu.class.ts:587-779,1035-1049`); `Menu.visibility` publish gate; `menu.model.ts:8-55`.
- Section write: `/menu-category` + `/menuCategory/order` (`menu-category.hooks.ts`, `menu-category-order.class.ts:28-67`); `menu-category.model.ts:12-82` (`name`, `sortOrder`, `menu`, `description`, string classification).
- Item write: `POST/PATCH/DELETE /vendor-items` (`vendor-items.hooks.ts:120-286`); `vendor-items.model.ts:12-608`.
- **Publication vs availability (DEC-3):** `vendorItems.status` (Boolean) = **publication** (consumer requires `status:true`, `user-menu.class.ts:1014-1018`); `vendorItems.availability` (enum) = **stock** — proven distinct (doc 46 §10).
- Variants embedded `size[]` incl. `isDefault`/`available` (`vendor-items.model.ts:96-120`).
- Channels: six per-channel blocks `{ value, sizes[], sur_charges[] }` → `OrderType` + `ItemChannelConfig` (doc 46 §9).
- Add-ons `addOns[]` + `sameAddOn`/`diffrentAddon` (doc 46 §8).

No legacy source was modified; no Mongo data was read/migrated.

---

## 3. Target implementation

`apps/api/src/modules/catalog/` (extends the P1.7.5 read module):
- `domain/catalog-write.types.ts` — create/update inputs + write records.
- `infrastructure/catalog-write.repository.ts` — Prisma writes + scope resolvers (`menuRestaurant`/`sectionRestaurant`/`itemRestaurant`/`variantRestaurant`/`groupRestaurant`/`addOnRestaurant`/`categoryExists`); atomic nested item create; channel-config upsert.
- `application/catalog-write.service.ts` — merchant-scoped write service (tenancy + validation).

### Capabilities

| Capability | Status |
|---|---|
| Menu create/update (name, description, type, visibility, legacyId) | **IMPLEMENTED** |
| Section create/update + **reorder** (name, description, sortOrder, categoryId?) | **IMPLEMENTED** |
| Item create/update (name, description, availability, **isPublished**, menuSectionId, posItemId?, legacyId) | **IMPLEMENTED** |
| Item create with nested variants/channels/add-on groups (**atomic**) | **IMPLEMENTED** |
| Variant create/update (size, uomId?, priceMinor, currencyCode, pax, **isDefault**, **available**) | **IMPLEMENTED** |
| Channel config **upsert** (channel, enabled, priceOverrideMinor?, surcharges Json) | **IMPLEMENTED** |
| AddOnGroup + AddOn create/update (name, minSelect, maxSelect, priceMinor) | **IMPLEMENTED** |
| Publication (`isPublished`) distinct from stock `availability` | **IMPLEMENTED** |
| Menu-section `charges[]` / tax financial behavior | **DEFERRED / OWNER DECISION** |
| Combos | **DEFERRED / OWNER DECISION** |
| Weekly/date scheduled availability, `checkIfOpen`, blackout | **DEFERRED** |
| POS sync / PetPooja / webhooks | **DEFERRED** (optional `posItemId` preserved) |
| Per-variant channel pricing | **DEFERRED** (target channel price is single `priceOverrideMinor`) |
| Dietary/nutrition/allergy/media metadata | **DEFERRED** |
| item↔platform Category dietary FKs | **DEFERRED** |
| HTTP controllers / frontend | **OUT OF SCOPE** (service/repository layer only) |

---

## 4. Publication vs availability (Step 3)

`MenuItem.isPublished Boolean @default(false)` (new) = the legacy `status` **publication gate**. `MenuItem.availability` (`ItemAvailability`, unchanged) = stock. They are **independent** and never collapsed (verified in tests: create → `isPublished=false`+`availability=AVAILABLE`; update sets each independently). No publication workflow/scheduling was added.

## 5. Tax / charges (Step 4)

Item per-channel surcharges are preserved as the existing `ItemChannelConfig.surcharges Json?` (stored verbatim; **no calculation**). `menuCategory.charges[]`/`price_include_tax` financial consumption remains **UNKNOWN / OWNER DECISION** (doc 46 §11) and was **not** implemented — no `MenuSection.charges` field, no tax engine, no checkout totals.

## 6. Combos (Step 5) — DEFERRED

No `Combo`/`ComboItem`/`Bundle`/`PlatformItemCatalog` model was created. Combos remain an **owner decision** (first-class entity vs composite MenuItem vs defer), documented in doc 46 §12/§18.

## 7. Tenancy / authorization (Step 8)

All writes take a `StaffPrincipal` and resolve to the owning restaurant, then enforce P1.7.2 `MerchantScopeService.assertRestaurantInScope` (reuses P1.7.1F):
- merchant scope is **server-derived** (never from caller input); cross-merchant → `403`.
- child writes resolve up the chain (variant/group/add-on → item → restaurant; section → menu → restaurant) and reject cross-restaurant (e.g. an item cannot reference another restaurant's section → `400`).
- unknown/soft-deleted restaurant/menu/item → `404`.
- `SUPER_ADMIN` operates with an explicit restaurant/merchant target; no act-as/switching.
- The P1.7.14 **activation gate** is upstream: a BLOCKED owner cannot obtain a staff session (verified via real staff login), so it can never reach the write service.

## 8. Transactions (Step 9)

Item creation with variants/channel-configs/add-on groups(+add-ons) is a **single atomic nested `prisma.menuItem.create`** (implicit transaction) — verified: an invalid child rejects the whole create with no partial item persisted. Section reorder uses one `$transaction` of updates. No generic workflow engine.

## 9. Schema changes (additive) + migration

`prisma/schema.prisma` (all additive; no existing column altered/dropped):
- `MenuItem.isPublished Boolean @default(false)` — publication gate (DEC-3).
- `ItemVariant.isDefault Boolean @default(false)`, `ItemVariant.available Boolean @default(true)` — source-backed variant flags.
- `Menu.description String?`, `MenuSection.description String?` — source-backed (legacy has descriptions).

Migration `prisma/migrations/20260902100500_p1_7_18_menu_item_write/migration.sql` — applied to **dev** (`amealio_dev`) and **test** (`amealio_test`); `migrate status` up to date (8 migrations). Historical migrations unchanged. (No field was added for combos/charges/schedule/POS.)

## 10. Tests (9 new; 242 → 251)

`apps/api/test/menu-item-write.e2e-spec.ts` (real TEST DB): menu create/update; section create/update/reorder (+ reject foreign-menu section); full atomic item hierarchy with publication⊥availability; transaction rollback on invalid child; variant create/update + channel upsert (no duplicate) + add-on create/update + invalid selection rejection; cross-merchant + cross-restaurant rejection + SUPER_ADMIN explicit target + unknown restaurant; soft-deleted restaurant rejection; activation gate via real staff login; legacyId uniqueness. Existing suites unchanged.

## 11. Validation

- `npm test` → **251/251** (31 suites; 242 prior + 9 new).
- `npm run build` ✓ · `npm run lint` ✓ · `npm run format:check` ✓.
- `npx prisma validate` ✓; `npx prisma migrate status` up to date (8 migrations).

## 12. Remaining UNKNOWNs / owner decisions

- **Combos** modeling (first-class vs composite vs defer).
- **`menuCategory.charges`** representation + whether it affects order totals (financial consumption UNKNOWN).
- **Per-variant channel pricing** (legacy `{channel}.sizes[]` vs target single `priceOverrideMinor`).
- **Weekly/date scheduled availability** representation.
- **Add-on selection semantics** from legacy booleans (multi-size options) — currently `minSelect`/`maxSelect` accepted directly; import inference deferred.
- **Dietary/nutrition/allergy/media** metadata; **item↔Category** dietary FKs; **min/max order qty**; `add_tax_on_price` (stored, unused).

## 13. Explicitly deferred / not implemented

Combos; menu-category charges/tax engine; scheduled/date availability + `checkIfOpen`/blackout; POS sync/PetPooja/webhooks; per-variant channel pricing; dietary/nutrition/media; catalogue/chaincatalogue import; customer/merchant UI; ordering/cart/checkout/payment/delivery; offers/experiences/events; seating changes; ONDC; Mongo import; HTTP controllers/frontend. **P1.7.12 Ordering and P1.7.15/16 Seating are untouched.**
