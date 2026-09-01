# `modules/` — Business Domains (FOUNDATION PLACEHOLDER)

**Empty by design in P1.6.** No business domains are implemented yet.

Future domains (migrated independently in P1.7+, one controlled step each) will live here as bounded NestJS modules, e.g.:

```
modules/
  identity/
  merchant/        # merchant + location
  catalog/         # catalog + menu
  orders/
  payments/
  reservations/
  notifications/
  admin/
```

## Convention for each domain module (to follow when implemented)

Layered, with a strict inward dependency direction:

```
controller (HTTP)            apps/api/src/modules/<domain>/<domain>.controller.ts
  -> application/use-cases   .../application/*.use-case.ts
    -> domain (entities,     .../domain/*
       value objects, ports)
      -> infrastructure      .../infrastructure/*  (Prisma repositories, provider adapters)
```

Rules:
- **Domain logic must not import external providers directly.** It depends on **ports** (interfaces); infrastructure supplies adapters (see `../common/ports/README.md`).
- Cross-domain communication prefers **domain events** (`../common/events/`) over direct imports, preserving clean service-extraction seams.
- Each module owns its Prisma access via the shared `PrismaService`; no cross-module table reads.

Do **not** pre-create empty modules for appearance — add a module only when its domain is actually migrated.
