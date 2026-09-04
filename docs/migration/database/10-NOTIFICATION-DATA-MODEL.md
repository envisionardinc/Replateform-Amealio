# 10 — Notification Data Model

Conceptual target model for baseline notifications. Design only. Separates **business event** from **notification delivery**. Legacy: `notifications` (template/config), `notification-models` (per-user), `smsTemplate`/`emailTemplate`/`notificationTemplate` (P1.1 [05](../india-baseline/05-DATA-MODEL.md)/[09](../india-baseline/09-REALTIME-ASYNC.md)).

## Entities (conceptual)

### NotificationTemplate
`id`, `key` (e.g. `USER_PROFILE_SIGNUP_OTP`), `channel` (**PUSH | SMS | EMAIL | WHATSAPP | IN_APP**), `market?` (India default), `providerFlowId?` (MSG91 `flow_id`), `body`/`subject`, `active`. Legacy `notificationType` 0/1/2 (**known**: push/SMS/email) maps to `channel`.

### NotificationRequest  (business event / trigger)
`id`, `templateKey`, `eventType` (e.g. order_status_changed, reservation_confirmed, payment_captured), `recipientType` (USER | VENDOR — legacy `reciever` 0/1 **known**), `recipientId`, `refType`/`refId` (order/reservation/payment), `payload` (JSONB), `createdAt`. Represents "a notification should be sent because X happened."

### NotificationDelivery  (per-channel attempt)
`id`, `notificationRequestId`, `channel`, `provider` (FCM/MSG91/SendGrid/…), `status` (QUEUED | SENT | DELIVERED | FAILED), `providerMessageId?`, `attempt` (int), `error?`, `sentAt?`, `deliveredAt?`. One request may fan out to multiple deliveries; retries add attempts.

### DevicePushToken
`id`, `ownerType` (USER/VENDOR/…), `ownerId`, `token`, `platform`, `createdAt`, `revokedAt?`. Legacy FCM tokens (per user/vendor/delivery).

## Business-event vs delivery separation
- **Business event** → `NotificationRequest` (what/why, recipient, ref). Idempotent per (event, recipient, template).
- **Delivery** → `NotificationDelivery` (how it was sent, provider result, retries). Enables retry/audit without duplicating the business trigger.

## Fields / behavior to preserve
- Template resolution by key/`flow_id` (MSG91), channel routing (baseline rule).
- Trigger points: order (`order_trigger`,`pending_notification`), reservation (`diner_trigger`), payment — recorded as `NotificationRequest.eventType`.
- Scheduled dispatch (cron) → jobs produce `NotificationRequest`s / `NotificationDelivery`s.

## Legacy fields NOT to copy
- `notification-records.user_id` without ref → proper FK (`recipientId`).
- Merge the several template collections into `NotificationTemplate` (+ channel).

## Migration classification: **MEDIUM** — templates + tokens straightforward; historical per-user records optional. See [14](./14-DATA-MIGRATION-COMPLEXITY.md).
