# 11 — Audit & Soft-Delete Strategy

Which entities need audit history and what delete semantics apply. Design only; no infra built. Legacy is inconsistent (5 soft-delete flag styles; embedded `auditLogs[]`) — P1.1 [05 §6](../india-baseline/05-DATA-MODEL.md)/[12](../india-baseline/12-GAPS-RISKS.md).

## Audit fields (baseline conventions)
- **All entities:** `createdAt`, `updatedAt`.
- **Actor-bearing changes:** `createdBy`, `updatedBy` (uuid, nullable) where an actor is known (merchant/admin/user).
- **Status transitions:** dedicated event tables for high-value lifecycles — `OrderStatusEvent` ([07](./07-ORDER-DATA-MODEL.md)); reservation status via events; not generic triggers everywhere.
- **Financial changes:** immutable append-only ledger (`Transaction`, `WalletEntry`) + status events; **no updates/deletes**.
- **Administrative actions:** `AdminAction`/`AuditLog(id, actorId, action, targetType, targetId, before?/after? or reason, createdAt)` for approvals, blocks, impersonation (replaces legacy `vendorAccess`/`flaggedLogs` blobs).

## Audit scope (do not over-build)
| Needs audit history | Rationale |
|---------------------|-----------|
| Orders (status events) | reliable history, disputes |
| Payments/Transactions/Settlements/Refunds | financial, regulatory |
| Reservations (status) | ops disputes |
| Admin/operational actions | accountability |
| Merchant/role/permission changes | security |
| Restaurant/menu availability toggles | optional (low) |
- **Not** every table gets a full history table; use `updatedAt`/`updatedBy` for low-value entities.

## Delete semantics per entity class

| Entity class | Delete policy | Rationale |
|--------------|---------------|-----------|
| Orders, Transactions, Settlements, Payouts, Refunds, WalletEntry | **Immutable historical records** (no delete; status only) | Financial/history integrity |
| Users, Merchants, Restaurants, Menus, Items, Offers | **Soft delete** (`deletedAt`) | Preserve references/history; hide from active queries |
| Sessions, DevicePushToken, WebhookEvent, cart (abandoned) | **Hard delete / TTL** | No lasting business value; volume/cleanup |
| Reservations | **Soft delete** (status CANCELLED preferred over delete) | history |
| Reference/lookup (categories, cuisines, partners) | **Soft delete / active flag** | avoid breaking references |
| Audit/event tables | **Append-only, never delete** | integrity |

## Unification from legacy
- Replace `is_deleted`/`deleted`/`isDeleted`/`isDelete`/`isArchive` with a **single `deletedAt`** convention (+ partial indexes excluding deleted rows).
- Convert embedded `auditLogs[]` into typed event/audit tables.

## Rationale summary
Immutability for money/history; soft-delete for referenced business entities; hard-delete/TTL for ephemeral rows; explicit audit only where accountability/regulatory value exists — avoiding unnecessary audit infrastructure.

Integrity enforcement: [15](./15-DATA-INTEGRITY-RULES.md). Decisions: [18](./18-DATA-MODEL-DECISIONS.md).
