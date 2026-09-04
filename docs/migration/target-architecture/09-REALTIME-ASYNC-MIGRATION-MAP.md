# 09 — Real-time / Async Migration Map

Maps sockets, realtime updates, notifications, webhooks, and jobs to target components. Design only. Source: P1.1 [09-REALTIME-ASYNC](../india-baseline/09-REALTIME-ASYNC.md).

| Concern | Current (baseline) | Target component (proposed) | Disposition | Notes |
|---------|--------------------|-----------------------------|-------------|-------|
| Sockets | Feathers Socket.IO; channels `users`/`vendors`/`superAdmins`/delivery (`src/channels.ts`) | NestJS **realtime gateway** module (WebSocket) | **REIMPLEMENT** | Preserve channel targeting by identity/role |
| Realtime order updates | events `order_creation`,`order_trigger`,`pending_notification` | gateway emits **same event names/payloads** | **RETAIN contracts** | P0 — both clients depend on these (AC-B3) |
| Realtime reservation/experience | `diner_trigger`,`requestUpdate`,`popupNotif`,`event_trigger` | gateway | **RETAIN contracts** | preserve semantics |
| Chat | `chat.created` | gateway/chat module | **REIMPLEMENT** | preserve event |
| Notifications | push (FCM)/SMS (Twilio,MSG91)/email (SendGrid,SES)/in-app/WhatsApp | Notifications module + provider ports; async dispatch | **REIMPLEMENT** + **ADAPT** | consolidate duplicate providers |
| Inbound webhooks | Razorpay/Dunzo/Petpooja/ONDC | domain webhook endpoints (signed, idempotent) | **ADAPT** | P0/P1 signature + idempotency |
| Background jobs | in-process `cron` (orders auto-cancel, completion, diner, settlement, ratings, wallet reset) | **external scheduler + worker** (dedicated process/queue) | **REIMPLEMENT** | move out of request path; idempotent |
| Scheduled jobs (ONDC) | `ondc.cron.ts` | ONDC bounded context (owner-decision) | **owner-decision** | only if ONDC in scope |
| Async processing / queue | Redis used **only** for Porter automation; no general queue | introduce a **job queue** (e.g. worker + queue) for async work | **REPLACE/ADD** | Porter automation isolated/replaced ([08](./08-INTEGRATION-MIGRATION-MAP.md)) |
| pg LISTEN/NOTIFY (tracking) | in deferred Nest tracker only | N/A in baseline | **NOT BASELINE** | delivery tracking deferred |
| Error events | `unhandledRejection` → `errorHandler` service | structured logging/observability | **REIMPLEMENT** | |

## Target model (proposed, for review)
- **Realtime:** a gateway module publishes **the same event names/payloads** the clients expect (compatibility during cutover), later evolvable.
- **Async:** domain events on an internal bus (supports Option C service-extraction seams); a **worker** consumes jobs/schedules; **webhooks** are validated and enqueued for idempotent processing.
- **Scheduling:** replace in-process crons with an external scheduler so jobs don't depend on API process lifecycle and can scale/HA.

## Preservation requirements
- Event-name/payload parity for order/reservation/experience updates (AC-B3) — **P0**.
- Job effects (auto-cancel, completion, settlement, dispatch, wallet reset) reproduced with idempotency (AC-B5).
- Webhook idempotency for payments/delivery — **P0/P1**.

No realtime/async code is implemented in this task.
