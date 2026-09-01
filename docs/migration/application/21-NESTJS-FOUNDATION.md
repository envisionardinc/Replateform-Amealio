# 21 — NestJS Application Foundation (P1.6)

The NestJS modular-monolith **application foundation** on top of the P1.5 PostgreSQL/Prisma database foundation. **Foundation only — no business domains, integrations, or authentication are implemented.**

- Framework: **NestJS 10** (`apps/api`), TypeScript, Express platform
- Database: **Prisma 5 / PostgreSQL** (reuses P1.5 unchanged)
- Test runner: **Jest + ts-jest** (single runner; see [Testing](#testing))

## Application structure

```
apps/api/
  tsconfig.app.json          # build config (rootDir src -> outDir ../../dist)
  src/
    main.ts                  # bootstrap: prefix /api, URI versioning v1, ValidationPipe, CORS, shutdown hooks
    app.module.ts            # root module: wires cross-cutting infra only
    config/
      env.validation.ts      # typed + validated env (class-validator); fail-fast
      env.validation.spec.ts
    infrastructure/prisma/
      prisma.service.ts      # PrismaClient + lifecycle + isHealthy()
      prisma.module.ts       # @Global
    common/
      request-context/request-id.middleware.ts   # x-request-id correlation
      logging/logging.interceptor.ts             # structured request logging
      errors/all-exceptions.filter.ts            # consistent API error shape
      events/                                     # domain-event convention (in-process)
      security/security.decorators.ts            # @Public/@Roles/@RequireMerchantScope (metadata only)
      ports/README.md                            # provider/integration port convention
    health/                  # GET /api/v1/health (liveness + DB connectivity)
    modules/README.md        # FOUNDATION PLACEHOLDER — no domains yet
  test/
    app.e2e-spec.ts          # bootstrap + health + error-shape
```
`prisma/`, `tests/`, `docker-compose.yml`, `.env.example` remain from P1.5 (preserved).

## Module boundaries & dependency direction

No business domains are implemented in P1.6. The convention for future domains (P1.7+) — documented in `apps/api/src/modules/README.md`:

```
controller (HTTP)
  -> application / use-case layer
    -> domain (entities, value objects, ports)
      -> infrastructure / provider adapters (Prisma repos, external providers)
```
- **Inward-only** dependencies. **Domain logic must not import external providers directly** — it depends on ports; infrastructure supplies adapters.
- Cross-domain communication prefers **domain events** over direct imports (preserves service-extraction seams).
- Domains will be added under `apps/api/src/modules/<domain>/` one controlled step at a time; empty modules are not pre-created.

## Configuration

- `@nestjs/config` global module with a fail-fast `validate()` (`config/env.validation.ts`).
- Validated vars: `NODE_ENV` (development|test|staging|production), `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `CORS_ORIGIN`.
- Uses the P1.5 `.env.example` conventions; **development + test only**. Staging/production are infra-managed — no production config or secrets in the repo. `.env`/`.env.test` are git-ignored.

## Database integration

- `PrismaService extends PrismaClient` with `onModuleInit`/`onModuleDestroy` (clean connect/disconnect) and `isHealthy()` (`SELECT 1`).
- `PrismaModule` is `@Global`; future domains inject `PrismaService`. **No business repositories/services yet.**
- The P1.5 schema and migrations are **unchanged**; migrations still run via the P1.5 commands.

## Logging

- NestJS `Logger` for startup/shutdown and initialization failures (e.g. Prisma connect failure throws and is logged).
- `LoggingInterceptor` emits one structured line per request (`requestId`, method, path, status, ms).
- `RequestIdMiddleware` assigns/propagates `x-request-id`. No external monitoring providers.

## Error handling

- Global `AllExceptionsFilter` returns a consistent shape: `{ statusCode, error, message, requestId, path, timestamp }`.
- 5xx logs full stack **server-side only**; clients never receive stack traces or internals.
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) is the request-validation foundation. No domain-specific error codes yet.

## HTTP / API foundation

- Global prefix `api` + **URI versioning** default `v1` → routes under `/api/v1/*`.
- **Health:** `GET /api/v1/health` → `{ status, db, uptimeSeconds, timestamp }` (verifies DB connectivity safely). Marked `@Public()`.
- CORS foundation configurable via `CORS_ORIGIN` (permissive in local dev). No business endpoints.

## Security foundation (no auth implemented)

- `@Public()`, `@Roles(...)`, `@RequireMerchantScope()` decorators define **metadata conventions only**. **No guard enforces them**, no authentication is implemented or migrated, and no production auth is touched. These are extension points for the future Identity domain (P1.7+).

## Domain-event convention

- `DomainEvent` interface + `DomainEventBus` **port** + `InProcessEventBus` (Node `EventEmitter`) default implementation, wired via `EventsModule` (`@Global`).
- **No events are published yet.** Domains will publish via the port without coupling to providers. Later this can evolve to an outbox + message broker without changing domain code.

## Provider / integration port convention

- Documented in `apps/api/src/common/ports/README.md`: external systems are reached via **ports** (interfaces) implemented by infrastructure adapters. **No integrations and no fake implementations** are provided. The only concrete port shipped is the internal `DomainEventBus`.

## Testing

- **Jest + ts-jest** is the single test runner. Rationale: NestJS DI and class-validator require `emitDecoratorMetadata`, which esbuild/`tsx` does **not** emit; ts-jest does. The P1.5 DB validation was migrated to Jest so the repo has one runner (no competing systems). `tsx` remains only for the Prisma seed.
- Suites: `apps/api/src/config/env.validation.spec.ts` (config validation), `apps/api/test/app.e2e-spec.ts` (bootstrap + health + error shape), `tests/schema.test.ts` (P1.5 DB foundation).
- Run against the **test** database: `export DATABASE_URL="$TEST_DATABASE_URL"; npx prisma migrate deploy; npm test`. Synthetic data only.

## Local startup

```bash
cp .env.example .env
npm install
npm run db:up            # or use a local PostgreSQL (see doc 19)
npm run db:migrate:deploy
npm run start:dev        # nest start --watch
# GET http://localhost:3000/api/v1/health
```
Scripts: `build` (`nest build`), `start`/`start:dev`/`start:prod`, `lint`, `format`/`format:check`, `test`, plus the P1.5 `db:*` scripts.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Reflect.getMetadata is not a function` in a unit test | Ensure `jest.setup.ts` (imports `reflect-metadata`) is in `setupFiles` |
| Health returns `db: down` | DB not reachable — start it (doc 19) and check `DATABASE_URL` |
| `Invalid environment configuration` at boot | A required env var is missing/invalid (fail-fast by design) |
| e2e test "no tests found" | e2e files use `*.e2e-spec.ts`; `testMatch` includes that pattern |
| Build can't find Prisma types | run `npm run db:generate` (regenerates the client) |

## Boundaries honored (P1.6)

No business-domain services, no payment/external/delivery/recommendation/ONDC/loyalty/celebration integrations, no deferred repositories, no frontend migration, no auth migration, no production access, no MongoDB changes, no legacy data migration, no invented business rules, no OD-11/GST resolution. The P1.5 PostgreSQL foundation is unchanged.
