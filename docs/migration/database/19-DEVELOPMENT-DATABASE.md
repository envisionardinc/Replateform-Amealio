# 19 — Development Database (P1.5)

Reproducible local PostgreSQL development foundation for the Amealio target platform. **Local development only — never production; no production credentials.**

- **PostgreSQL version:** 16
- **ORM / migrations:** Prisma 5 (approved: `docs/migration/DECISIONS.md` D-004)
- **Databases:** `amealio_dev` (development), `amealio_test` (validation suite)
- **Credentials (synthetic, local only):** user `amealio` / password `amealio_dev_pw`

## 1. Prerequisites
- Node.js ≥ 20, npm
- Either Docker (preferred) **or** a local PostgreSQL 16 server

## 2. Setup

```bash
cp .env.example .env         # local dev config (DATABASE_URL, TEST_DATABASE_URL)
npm install                  # installs prisma + tooling
```

### Option A — Docker (preferred, reproducible)
```bash
docker compose up -d db      # starts postgres:16 as amealio_pg_dev on :5432
```
`docker-compose.yml` provisions user `amealio`, password `amealio_dev_pw`, db `amealio_dev` — matching `.env.example`.

### Option B — Existing local PostgreSQL
Create matching role + databases once:
```sql
CREATE ROLE amealio LOGIN PASSWORD 'amealio_dev_pw' CREATEDB;
CREATE DATABASE amealio_dev  OWNER amealio;
CREATE DATABASE amealio_test OWNER amealio;
```

## 3. Startup / shutdown
| Action | Command |
|--------|---------|
| Start DB (Docker) | `npm run db:up` (`docker compose up -d db`) |
| Stop DB (Docker) | `npm run db:down` (`docker compose down`) |
| Reset DB volume (Docker) | `docker compose down -v` |

## 4. Migrations
| Action | Command |
|--------|---------|
| Create + apply a dev migration | `npm run db:migrate` (`prisma migrate dev`) |
| Apply pending migrations (no diff) | `npm run db:migrate:deploy` (`prisma migrate deploy`) |
| Migration status | `npm run db:migrate:status` |
| Generate Prisma client | `npm run db:generate` |

Migrations live in `prisma/migrations/` (checked in): `…_init` (schema) and `…_constraints_and_immutability` (CHECK constraints + append-only triggers). Migration history is tracked in `_prisma_migrations`. Rollback: Prisma migrations are forward-only; to undo in development use reset (below) or add a compensating migration.

## 5. Reset (development)
```bash
npm run db:reset     # prisma migrate reset --force: drops, re-applies all migrations, re-seeds
```
Destroys local data only. Never run against non-development databases.

## 6. Seed (synthetic dev data)
```bash
npm run db:seed      # prisma db seed -> prisma/seed.ts (loads .env)
```
Idempotent (safe to re-run). Creates a synthetic merchant, role/staff, restaurant + location + hours + seating, catalog taxonomy, menu/section/item/variant, a consumer user/profile/address, and a notification template. **No financial history is seeded.** All names are prefixed `DEV`.

## 7. Testing / validation
```bash
# point at the test database, apply migrations, run the suite:
export DATABASE_URL="$TEST_DATABASE_URL"   # or: postgresql://amealio:amealio_dev_pw@localhost:5432/amealio_test?schema=public
npx prisma migrate deploy
npm run db:validate                         # tsx --test tests/*.test.ts
```
The suite (`tests/schema.test.ts`) validates UUID generation, FKs, uniqueness, monetary BigInt behavior, CHECK constraints, order-total integrity, payment idempotency, webhook uniqueness, append-only ledger immutability, and soft-delete filtering. It does **not** assert any legacy numeric enum mapping (OD-11 blocked).

> Note: Prisma Client reads `DATABASE_URL` from the process env (the CLI loads `.env`; direct `tsx` runs do not). Export the intended `DATABASE_URL` when running the seed/tests directly.

## 8. Troubleshooting
| Symptom | Fix |
|---------|-----|
| `P1001 can't reach database` | Ensure Docker container / local PG is running on `:5432`; check `DATABASE_URL` |
| `migrate dev` shadow-DB error | Ensure the `amealio` role has `CREATEDB` (Prisma needs a shadow database) |
| Seed wrote to the wrong DB | Confirm `DATABASE_URL` in the current shell; prefer `npm run db:seed` (loads `.env`) |
| `gen_random_uuid() does not exist` | Requires PostgreSQL 13+ (we use 16); on older PG add `CREATE EXTENSION pgcrypto` |
| Reset refuses to run | Reset only targets the configured `DATABASE_URL`; never point it at prod |

## 9. Safety
- Only synthetic, local credentials are used. `.env` / `.env.test` are git-ignored; **never commit real secrets**.
- No production connection, no production data, no MongoDB access. Staging/production configuration is **not** included in this repo (managed by infra).
