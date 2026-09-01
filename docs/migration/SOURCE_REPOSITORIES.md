# Source Repositories

Canonical reference for the repositories that feed the Amealio replatforming. **All source repositories are READ-ONLY** — analyzed, never modified. The only writable repository is the target (`replateform-amealio` / `amealio-platform`).

- **Last updated:** 2026-09-01 (P0.2)
- **Full analysis:** [REPOSITORY_LANDSCAPE.md](./REPOSITORY_LANDSCAPE.md)
- **Detailed discovery:** [01-reference-inventory.md](./01-reference-inventory.md)

## Repositories

| Repository | Path | Branch @ commit | Stack | Proposed class | India baseline? |
|------------|------|-----------------|-------|----------------|-----------------|
| `amealio-vendordashboard` | `/agent/repos/amealio-vendordashboard` | `main` @ `ee674aa57` | Feathers + MongoDB (backend) | **A** | Candidate — High |
| `amealio_web_app` | `/agent/repos/amealio_web_app` | `main` @ `117f3f6a` | CRA / React 18 (consumer) | **A** | Candidate — High |
| `amealiodashboardmvp-` | `/agent/repos/amealiodashboardmvp-` | `main` @ `2e09b25d4` | CRA / React 16 (admin+merchant) | **A** | Candidate — High |
| `amealio-nestjs-backend` | `/agent/repos/amealio-nestjs-backend` | `main` @ `104303d` | NestJS + PostgreSQL (tracking) | **B** (or C) | Supporting — Medium |
| `amealio-self-delivery-app` | `/agent/repos/amealio-self-delivery-app` | `main` @ `6e3daa7` | Next.js (delivery-boy) | **B** (or C) | Supporting — Medium |
| `replateform-amealio` | `/agent/repos/replateform-amealio` | `cursor/…-a8e0` | Docs only (target) | — (target) | N/A |

Classification legend: **A** India baseline candidate · **B** baseline supporting · **C** feature source · **D** shared/cross-cutting · **E** legacy/deprecated · **F** unknown—needs review · **—** target. Codes are analytical proposals; the final baseline set is **decision B1** (see below).

## Role summary

- **`amealio-vendordashboard`** — the platform's domain API and system of record (MongoDB). All clients depend on its JWTs, services, and Socket.IO events.
- **`amealio_web_app`** — consumer/diner web surface.
- **`amealiodashboardmvp-`** — super-admin console **and** merchant/vendor dashboard in one repo (portal by hostname/`portal` header).
- **`amealio-nestjs-backend`** — narrow delivery-tracking API (PostgreSQL, `synchronize:true`); verifies Feathers-issued JWTs.
- **`amealio-self-delivery-app`** — delivery-boy app; client of both the Feathers backend and the Nest tracking service.

## Read-only handling rules

- No commits, edits, or branches are made in source repositories from this initiative.
- No code is copied wholesale into the target; capabilities are analyzed and adapted deliberately.
- No reference functionality is deleted without explicit approval.
- No production systems or credentials are used; committed secrets in source repos must be rotated, never reused.

## India baseline — decision status

The India baseline **may span multiple repositories** and has **not** been finalized (blocker **B1**). The proposed grouping and the full evidence/overlaps/gaps/dependencies/unresolved-questions are in [REPOSITORY_LANDSCAPE.md → "INDIA BASELINE — DECISION REQUIRED"](./REPOSITORY_LANDSCAPE.md#india-baseline--decision-required).

- **Proposed candidates (core):** `amealio-vendordashboard`, `amealio_web_app`, `amealiodashboardmvp-`.
- **Proposed supporting:** `amealio-nestjs-backend`, `amealio-self-delivery-app`.
- **Do not resolve B1 by guessing.** Confirmation is a stakeholder decision to be recorded in [DECISIONS.md](./DECISIONS.md) and reflected in [MIGRATION_STATUS.md](./MIGRATION_STATUS.md).
