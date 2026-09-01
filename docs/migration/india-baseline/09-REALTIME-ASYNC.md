# 09 — Real-time & Asynchronous Behavior

How the baseline handles sockets, background/scheduled jobs, webhooks, and event processing. Backend = `amealio-vendordashboard`.

## 1. WebSockets / Socket.IO

- **Server:** `app.configure(socketio(...))` in `src/app.ts`; channels in `src/channels.ts` (publish to `users`, `vendors`, `superAdmins`, delivery-person channels).
- **Clients:** consumer `amealio_web_app/src/App.js` (Feathers socket to `REACT_APP_BASE_URL`); admin/merchant `amealiodashboardmvp-/client/src/App.js` (socket to `REACT_APP_API_URL`).

### Event contracts (service → event → consumer)
| Service | Event(s) | Emitted where | Consumed by |
|---------|----------|---------------|-------------|
| `ordering` | `order_creation`, `order_trigger`, `pending_notification`, `assign_delivery_person`, `update_location`, `delivery_location` | `src/services/ordering/ordering.service.ts`, `channels.ts` | consumer (`OrderTrackScreenNew.jsx`), merchant, (deferred driver app) |
| `user-ordering` | `curb_notification`, `curb_arrival` | ordering services | merchant |
| `diner` | `diner_creation`, `diner_trigger`, `update_location` | diner services | consumer (`useTrackScreenSocket.js`), merchant |
| `user/diner` | `patched` | Feathers default | merchant |
| `expRequest` | `requestUpdate`, `popupNotif` | expRequest services | consumer, merchant |
| `event-handler` | `event_trigger`, `event_request` | event services | merchant |
| `ticket` | `created` | Feathers default | merchant |
| `chat` | `created` | chat service | both |
| `notifications` | (listen) | — | merchant |
| `vendor-user`/`admin/vendor-user` | `adminLogin`, `patched` | vendor services | admin/merchant |

### Real-time order/restaurant updates
- **Orders:** status changes emit `order_trigger`/`pending_notification`; consumer order-track subscribes and also to an **external** live-tracking socket (`REACT_APP_LIVE_TRACKING_SOCKET_URL`) for driver `locationUpdated` (delivery GPS is external/deferred).
- **Restaurant updates:** availability/session changes propagate via service patches + crons (no dedicated restaurant socket channel observed beyond Feathers default events) — **UNKNOWN — REQUIRES REVIEW** for any restaurant-specific realtime.

## 2. Scheduled / background jobs

Node `cron` jobs started **after MongoDB connects** (`src/index.ts` → `startCron`, ONDC crons). Gated by `CRON_RUN` (diner + session crons run regardless). Source: `src/cron.ts`, `src/ondc.cron.ts`.

| Schedule | Job | Purpose |
|----------|-----|---------|
| `* * * * *` | Diner cron; session automation | seating transitions; restaurant open/close |
| `*/4 * * * *` | `cancelCron` | auto-cancel stale orders |
| `10,40 * * * *` / `20,50 * * * *` / `0,30 * * * *` | push / SMS / email template dispatch | scheduled notifications |
| `0 4 * * *` | settlement + user-delete + experience status | settlement processing |
| `0 5 * * *` | order completion | close completed orders |
| `0 * * * *` / `* */4 * * *` | rating aggregation (item / restaurant) | ratings |
| `0 0 1 * *` | wallet monthly reset | `monthBalance = 0` |
| `0 */6 * * *` | ONDC catalog search | ONDC |
| various | ONDC settlement/refund/reconciliation; short-link cleanup | ONDC/misc |

## 3. Queues
- **Redis** is used **only** for the **Porter browser-automation job queue** (`src/services/automation_delivery/porter_automation/porter-automation.queue.ts`). No general application/message queue (e.g. no RabbitMQ/Kafka/BullMQ elsewhere). An unused `RedisAuthService` exists (`src/services/authentication/`).

## 4. Webhooks (inbound)
| Webhook | Source | Handler |
|---------|--------|---------|
| Razorpay payment events | Razorpay | `/razorpay-webhook` |
| Dunzo delivery status | Dunzo | `/dunzoWebHook` |
| Petpooja POS | Petpooja | `/pos/webhook/:posId/:action` |
| ONDC protocol callbacks | ONDC network | `/ondc/on_*` |

## 5. Event processing / notifications
- Domain events → Socket.IO emits (above) + push/SMS/email dispatch via providers ([08](./08-INTEGRATIONS.md)).
- `pg_notify`/LISTEN is used only in the **deferred** Nest tracker (out of baseline).
- Error events: `unhandledRejection` handler writes to `errorHandler` service (`src/index.ts`).

## 6. Summary / concerns
- Realtime and cron are **central** to orders, seating, experiences, and settlements — a target must preserve these event contracts or provide compatibility.
- Crons run **in-process** in the monolith (no external scheduler) — scaling/HA concern.
- Porter automation queue couples delivery to Redis + a headless browser (fragility). See [12](./12-GAPS-RISKS.md).
