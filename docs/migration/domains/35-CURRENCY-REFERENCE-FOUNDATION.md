# 35 — Currency Platform Reference Read Foundation (P1.7.6)

> **Status:** IMPLEMENTED — read foundation only. **One small additive schema change** (new `Currency` reference table). No change to monetary representation, no FX/conversion, no geography, no payments, no CRUD/controllers, no frontend. Auth/tenancy and P1.7.1D–P1.7.5 unchanged.
> **Grounding:** legacy `amealio-vendordashboard/src/models/currency.model.ts` + the P1.7.6A reconciliation + the current target schema.

---

## 1. Legacy Currency source

`currency.model.ts` (Mongoose, `timestamps: true`):

| Field | Type |
|---|---|
| `country_name` | String |
| `name` | String |
| `currency_iso` | String |
| `currency_symbol` | String |
| `description` | String |
| `status` | Boolean (default `true`) |
| `is_deleted` | Boolean (default `false`) |

**Ownership:** PLATFORM_DEFINED (admin-managed reference; not merchant-owned). No `unique` declared in Mongo, but `currency_iso` (ISO 4217) is the conceptual canonical identity. No FX/exchange-rate fields; no Country foreign key (country is a free-text `country_name`).

## 2. Ownership

**PLATFORM_DEFINED** — created/edited by Admin, selected during merchant onboarding, consumed by Merchant/User/financial flows. It is **not** merchant-scoped; access follows the platform reference-data pattern (no `MerchantScopeService`).

## 3. Target schema reconciliation

Confirmed (P1.7.6A + re-verified): the target had **no `Currency` model** — money is represented by an embedded `currencyCode String @default("INR")` + exact BigInt minor units. This slice adds the missing canonical reference table; it does **not** touch the embedded code or any money field.

## 4. Final Currency model

```prisma
model Currency {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  legacyId    String?   @unique
  isoCode     String    @unique          // canonical identity (ISO 4217); legacy currency_iso
  symbol      String?                    // legacy currency_symbol
  name        String?                    // legacy name
  countryName String?                    // legacy country_name (retained; NOT a Country FK)
  description String?
  isActive    Boolean   @default(true)   // legacy status (bool)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?                  // legacy is_deleted -> soft-delete convention
}
```

## 5. Fields and constraints

- **`isoCode @unique`** — canonical identity (ISO 4217). Encoded explicitly per the reconciliation (ISO is the canonical key), even though legacy Mongo did not declare it unique.
- **`legacyId @unique`** — import anchor (repo convention).
- **`isActive`** — mirrors legacy `status` (Boolean); no invented status enum.
- **`deletedAt`** — mirrors legacy `is_deleted` via the target soft-delete convention.
- `symbol`/`name`/`countryName`/`description` — nullable metadata retained from source. `countryName` is a plain string (source compatibility), **not** coupled to a geography model.

## 6. Repository / service

Added to the existing `ReferenceDataModule` (platform reference-data grouping): **`CurrencyRepository`** — `findById`, `findByLegacyId`, `findByIsoCode` (canonical), `listActive` (`isActive` AND not soft-deleted), `listAll`; missing/malformed refs return null. Read-only — no admin CRUD, no controllers, no frontend. No dedicated read service was needed (repository suffices, consistent with `CategoryRepository`/`CuisineRepository`).

## 7. Relationship to existing `currencyCode`

The `Currency` table **supplements** the embedded `currencyCode` string used across money-bearing models (`ItemVariant`, `AddOn`, `ItemChannelConfig`, `Order`, `Wallet`, etc.). It does **not** replace it in this slice: **no money field was migrated to a Currency FK**, and no existing price/currency field changed. Future domains may reference `Currency.isoCode` for validation/metadata without altering monetary storage.

## 8. Relationship to BigInt monetary values

Unchanged. Money remains **exact integer minor units** (`priceMinor BigInt`) + `currencyCode` string. A test asserts a `123456789n` `ItemVariant.priceMinor` round-trips exactly with `currencyCode = "INR"` after the Currency table exists — proving no monetary regression.

## 9. Explicit non-scope: FX

No exchange rates, conversion, FX providers, historical rates, or payment/settlement conversion. None exist in source; none added.

## 10. Explicit non-scope: geography

No `Country`/`State`/`City`/`Region` tables, no normalized geographic hierarchy, and **no `Currency → Country` foreign key**. `countryName` is retained as a plain string only. Geography remains the separate partial foundation identified in P1.7.6A.

## 11. Migration implications

- Legacy `currency` rows → target `Currency` via `legacyId` + `isoCode` at a future controlled import (not built here).
- Legacy `status` (bool) → `isActive`; `is_deleted` → `deletedAt`.
- Downstream may later validate embedded `currencyCode` against `Currency.isoCode`; no FK is introduced now.

## 12. UNKNOWNs

- Exact legacy `status` vocabulary beyond boolean true/false (kept as `isActive` bool; no enum invented).
- Decimal precision / minor-unit exponent per currency is **not** in legacy source (INR/2 assumed by minor-unit convention); if per-currency precision is later required it is an additive field (owner decision).
- Whether embedded `currencyCode` should eventually become a FK to `Currency` (deferred; out of scope).

## 13. Owner decisions

- Whether/when to add per-currency decimal precision (not in source).
- Whether to later constrain money `currencyCode` against `Currency` (FK) — deferred.
- Currency seed/import set + canonical `status` mapping at import time.

## 14. Deferred items

Geography (Country/State/City), media/asset repository, discovery taxonomy (Mood/Craving), experience/event taxonomy, FX/conversion, payments/settlement/wallet, currency admin CRUD + UI, Mongo import/backfill. ONDC remains DEFERRED — existing.

---

## Schema / migration / validation

- **Schema change (additive):** new `Currency` model. Migration `20260902050937_p1_7_6_currency_reference` (applied dev + test; historical migrations unmodified).
- **Application:** `CurrencyRepository` + `CurrencyRecord` type added to `apps/api/src/modules/reference-data/`; registered in `ReferenceDataModule`.
- **Tests:** 6 new integration (suite 182 → **188**): identity + symbol/country/name preservation; legacyId + ISO lookup; ISO + legacyId uniqueness; active listing excludes inactive + soft-deleted (+ `listAll` includes inactive); missing/malformed-ref safety; **embedded `currencyCode` + exact BigInt money unaffected**. P1.7.1E/F/2/3/4/5 suites green.
- **Validation:** `npm run build` ✓ · `npm run lint` ✓ (0 problems) · `npm run format:check` ✓ · `npm test` → **188/188** (25 suites) · `prisma validate` ✓ · `prisma migrate status` up to date.
- **Baseline evolution:** `docs/current-state/` (forensic branch, PR #21) — fold the Currency reference-table finding into `DATA-MODEL-INVENTORY.md` when integrated.
