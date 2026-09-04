# 23 — TurboRepo Monorepo Foundation (P1.6.1)

Introduces **TurboRepo** as the workspace/task-orchestration layer over the accepted P1.5 (PostgreSQL/Prisma) and P1.6/P1.7.1 (NestJS API + Identity) foundations. **Workspace/architecture task only** — no domain migration, no data, no schema change, no production/MongoDB access.

- **Turbo version:** `turbo@^2.3.3` (resolved 2.10.12); Node ≥ 20, npm workspaces.

## Why TurboRepo
The target architecture is a monorepo hosting one NestJS modular-monolith API now and multiple frontends later, with independently migratable backend domains and clean service-extraction seams. Turbo provides consistent, cacheable root-level task orchestration (`build`/`lint`/`test`/`format:check`) across workspaces without changing the backend's modular-monolith design. It was introduced **minimally** — no premature packages, no speculative apps.

## Workspace structure

```
amealio-platform/            # workspace root (private): turbo, npm workspaces, Prisma, docs
├── turbo.json               # task pipeline
├── package.json             # workspaces:["apps/*"], root scripts, Prisma + shared deps
├── tsconfig.json            # shared TS base (apps extend it)
├── .eslintrc.cjs / .prettierrc   # shared lint/format config
├── docker-compose.yml, .env.example
├── prisma/                  # schema + migrations + seed (UNCHANGED — kept at root)
├── docs/
└── apps/
    └── api/                 # @amealio/api workspace (NestJS)
        ├── package.json     # app scripts (deps hoisted from root)
        ├── nest-cli.json    # sourceRoot src, tsConfigPath tsconfig.app.json
        ├── tsconfig.json / tsconfig.app.json
        ├── jest.config.js / jest.setup.ts
        ├── src/{main.ts, app.module.ts, common/, infrastructure/, config/, health/, modules/identity/}
        └── test/{app.e2e-spec.ts, schema.test.ts}
```

### Current applications
- `apps/api` (`@amealio/api`) — the NestJS API (health, config, Prisma integration, Identity foundation). **The only application.**

### Current packages
- **None.** No shared packages were created (avoiding premature abstraction). Frontends (`apps/web`/`admin`/`merchant`) and any shared packages are introduced later, only when they have a concrete consumer.

## Root commands ↔ application commands

| Root command | Delegates to | Notes |
|--------------|--------------|-------|
| `npm run build` | `turbo run build` → `@amealio/api` `nest build` | outputs `apps/api/dist` |
| `npm test` | `turbo run test` → `@amealio/api` `jest` | DB-dependent; **not cached** |
| `npm run lint` | `turbo run lint` (api eslint) **+** `eslint prisma/**/*.ts` | prisma is a root concern |
| `npm run format:check` | root `prettier --check` over `apps/**` + `prisma/**` | repo-wide (not per-workspace) |
| `npm run start[:dev|:prod]` | `npm run … --workspace @amealio/api` | API runs independently |
| `npm run db:*` | root `prisma …` | migrations/seed/status at root |
| `npm run db:validate` | `@amealio/api` jest `test/schema.test.ts` | P1.5 DB validation |

The API remains **independently runnable** directly in `apps/api` (`npm run build|start|test|lint --workspace @amealio/api`).

## Task pipeline (`turbo.json`)
- `build` → `outputs: ["dist/**"]` (cacheable).
- `lint`, `format:check` → cacheable, no outputs.
- `test` → `dependsOn: ["build"]`, **`cache: false`** so database-dependent tests always execute (no false-positive cached passes).
- `globalEnv`: `NODE_ENV, PORT, DATABASE_URL, TEST_DATABASE_URL, CORS_ORIGIN, LOG_LEVEL` (so env changes are visible to Turbo and DB env is passed through).

### Caching decisions
Conservative: build/lint/format:check are cached; **tests are explicitly uncached** because they hit PostgreSQL and caching could mask real failures. Remote caching is disabled.

## Prisma location decision
**Prisma stays at the repository root** (schema, migrations, seed, `db:*` scripts). It was **not** moved into a shared package.
- **Rationale:** the API resolves `@prisma/client` via npm workspace hoisting (root `node_modules`); migrations/seed are repo-level concerns; moving would add churn and risk to the protected P1.5 assets with no concrete benefit yet.
- **Generated client:** `prisma generate` runs at root (also via a `postinstall` hook) into root `node_modules/.prisma/client`, hoisted and resolvable from `apps/api`.
- **Migration path unchanged:** P1.5 `prisma/schema.prisma` and both migrations are byte-for-byte unchanged; `prisma migrate status` reports up to date.

## Future frontend placement
`apps/web` (consumer), `apps/admin`, `apps/merchant` will be added under `apps/` as additional workspaces during the (later) frontend-migration phase — **not created now** (no fake/empty apps).

## TurboRepo ↔ NestJS modular-monolith boundary
Turbo orchestrates **workspace/package tasks**; it is **orthogonal** to the backend's internal architecture. The backend stays a **modular monolith**: business domains live inside `apps/api/src/modules/<domain>/` (only `identity/` exists so far) with the P1.6 layered dependency direction and ports/domain-event seams. Turbo does not split domains into packages; a future decision could extract a module into its own service at the documented seams without changing Turbo's role.

## Deliberately NOT in the monorepo yet
- No shared packages (ui/design-system/types/validation/auth/config/localization/utils) — added only with a concrete consumer.
- No `apps/web|admin|merchant` — frontend migration is later.
- No domain modules beyond `identity` — migrated one controlled step at a time.
- Prisma not extracted into `packages/database`.

## Migration implications
- Adding a frontend or shared package later is now a matter of adding a workspace under `apps/*` (or a new `packages/*` glob) and a Turbo task — no root re-architecture.
- Domain migrations continue **inside `apps/api`**; Turbo tasks pick them up automatically (they're part of the api workspace build/test).

## Files changed (summary)
- **Added:** `turbo.json`, `apps/api/package.json`.
- **Moved into `apps/api/`:** `nest-cli.json`, `jest.config.js`, `jest.setup.ts`, and the P1.5 DB validation `tests/schema.test.ts` → `apps/api/test/schema.test.ts` (coverage preserved; removed the now-empty root `tests/`). Added `apps/api/tsconfig.json`; adjusted `apps/api/tsconfig.app.json`/`nest-cli.json` to workspace-relative paths (output `apps/api/dist`).
- **Modified:** root `package.json` (workspaces, `packageManager`, Turbo devDep, root scripts delegate to Turbo, `postinstall: prisma generate`); root `tsconfig.json` → shared base; `apps/api/src/app.module.ts` `ConfigModule.envFilePath` fallback (`['.env','../../.env']`) so the API loads the root `.env` under either cwd; `.gitignore` (`.turbo/`).
- **Unchanged:** `prisma/**` (schema + migrations + seed), all `apps/api/src` domain/infra/health/config code and tests, `.eslintrc.cjs`, `.prettierrc`, `docker-compose.yml`, `.env.example`.

## Deviations
- All runtime/dev dependencies are kept at the **root** and hoisted to `apps/api` (which declares no deps) — a deliberate low-risk choice over duplicating dependency lists; consistent with "avoid premature abstraction" and preserving working infrastructure.
- `format:check` is a repo-wide root Prettier task (not per-workspace) and `lint` additionally lints root `prisma/**` — because Prisma is a root concern, not a workspace.
- Added `ConfigModule.envFilePath` fallback (config-loading robustness for the workspace cwd) — not an API contract/behavior change.

## Validation (before → after)
Before restructure: build ✓, lint ✓, 54/54 tests, `migrate status` up to date. After restructure (via Turbo from root): `build` ✓ (`apps/api/dist/main.js`), `lint` ✓, `format:check` ✓, `npm test` ✓ **54/54** (9 suites), API starts and `/api/v1/health` = `{status:ok, db:up}`, `db:validate` ✓ (11/11), Prisma schema/migrations unchanged, `migrate status` up to date. No schema regression.
