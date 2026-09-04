# Target Repository Structure (Approved Layout — Reference)

Status: **REFERENCE.** Records the approved target monorepo layout, API module decomposition, and domain list provided for the replatform. This is documentation only — **no code, apps, modules, packages, or Prisma schema are scaffolded** in this phase (per the phase guardrails). It exists so the migration and architecture docs align to a single agreed structure.

## 1. Monorepo layout

```
amealio-platform/
├── apps/
│   ├── api/         # NestJS backend (domain API, replaces the Feathers monolith)
│   ├── admin/       # Super-admin console (Next.js)
│   ├── merchant/    # Merchant/vendor dashboard (Next.js)
│   └── web/         # Consumer web app (Next.js)
├── packages/
│   ├── ui/            # Shared UI components
│   ├── design-system/ # Design tokens, theme
│   ├── types/         # Shared TypeScript types / domain contracts
│   ├── validation/    # Shared validation schemas (e.g. zod)
│   ├── auth/          # Shared auth (claims, guards, client helpers)
│   ├── config/        # Shared configuration (incl. market config)
│   ├── localization/  # i18n / locale utilities
│   └── utils/         # Shared utilities
├── prisma/          # Prisma schema + migrations (NOT created yet — pending design review)
├── docs/            # This documentation (migration + architecture)
└── turbo.json       # Turborepo pipeline
```

Notes:
- **`apps/admin` and `apps/merchant` are separate apps** in the target, unlike the current combined `amealiodashboardmvp-` (portal-by-hostname). This resolves the admin/merchant coupling noted in `docs/migration/01`.
- **`apps/api` (NestJS)** replaces the Feathers monolith (`amealio-vendordashboard`). The existing Nest delivery-tracking service (`amealio-nestjs-backend`) is a candidate to fold into the delivery module or remain a satellite — **`UNKNOWN — REQUIRES REVIEW`**.
- **`prisma/`** will hold the schema designed in `postgresql-domain-model.md`, created **only after design review**.
- `packages/*` directly address the "no shared design system / duplicated logic" findings in `docs/migration/09`.

## 2. API module decomposition (`apps/api/src/modules/`)

```
apps/api/src/modules/
├── auth/           # identity, sessions, tokens, claims
├── users/          # consumer users, profiles, addresses
├── merchants/      # vendors, staff, roles/permissions, subscriptions
├── locations/      # restaurants, chains, hours, reference data
├── catalog/        # shared taxonomy (categories, cuisines, UOM, tags)
├── menus/          # menus, sections, items, variants, add-ons, combos
├── customers/      # customer engagement (favourites, reviews, community)
├── orders/         # carts + orders lifecycle
├── payments/       # payment intents, wallet, ledger, settlements, refunds
├── delivery/       # delivery tasks, persons, partners, tracking
├── reservations/   # reservations + seating (unified Diner)
├── celebrations/   # experiences + events + tickets
├── promotions/     # offers, coupons, referrals, rewards
├── notifications/  # templates, dispatch, device tokens
└── admin/          # super-admin operations, config, reference data
```

## 3. Module ↔ domain ↔ discovery mapping

| API module | Domain(s) (`docs/migration/02`) | Schema context (`postgresql-domain-model.md`) |
|------------|--------------------------------|-----------------------------------------------|
| `auth` | Identity (auth) | Identity |
| `users` | Identity, Customer | Identity |
| `merchants` | Merchant | Merchant |
| `locations` | Location | Location |
| `catalog` | Catalog | Catalog |
| `menus` | Menu | Menu |
| `customers` | Customer | Customer/engagement |
| `orders` | Order | Order |
| `payments` | Payment | Payment |
| `delivery` | Delivery | Delivery |
| `reservations` | Reservation, Seating | Reservation/Seating |
| `celebrations` | Celebration, Ticketing (event) | Celebration |
| `promotions` | Promotion | Promotion |
| `notifications` | Notification | Notification |
| `admin` | Administration, Reporting | Administration |

### Coverage notes
- **Ticketing** (`docs/migration/02` #13) splits: **event tickets** → `celebrations`; **support tickets/issues** → likely `admin` or a small `support` concern. Placement **`UNKNOWN — REQUIRES REVIEW`**.
- **Reporting** (#16) is expected to be read models/materialized views surfaced via `admin` (and per-module report endpoints), not a standalone module in the provided list.
- **ONDC** is **not** a module in the provided list. Given its size/complexity (`docs/migration/10`), it is recommended as a **separate bounded context/module** or service, integrated last. **Confirmation required.**
- The provided module list has **15 modules**; the domain list has **17 domains** — the deltas above (Ticketing split, Reporting as read models, ONDC separate) account for the difference.

## 4. Alignment with architecture docs

- Schema/entities: `postgresql-domain-model.md`, `entity-relationship-model.md`.
- Tenancy (`merchantId`/`restaurantId`, claims): `multi-tenancy.md`.
- Market/locale (India-first, config-not-forks): `localization-strategy.md`.
- Shared `packages/*` (ui, design-system, types, validation, auth, config, localization, utils) implement the cross-cutting concerns identified across the discovery docs.

## 5. Not done in this phase (guardrails)

- No apps scaffolded (`apps/*` not created).
- No NestJS modules created.
- No Next.js apps created.
- No `prisma/schema.prisma` or migrations.
- No `turbo.json`/workspace wiring.

These are recorded here purely as the **agreed target** to guide subsequent, separately-reviewed implementation phases.
