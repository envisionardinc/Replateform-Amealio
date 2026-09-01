# 08 — Integration Migration Map

Every baseline integration mapped to a target boundary. Design only. Source: P1.1 [08-INTEGRATIONS](../india-baseline/08-INTEGRATIONS.md) and P1.2 integration classification ([14 §16](../india-baseline/14-CAPABILITY-MATRIX.md#16-integrations-classification)).

**Principle:** each integration sits behind a **port/adapter** in the owning domain (or `packages/integrations`), so providers are swappable and market-configurable (India-first). **No credentials in code**; committed secrets in reference repos must be rotated.

## BASELINE INTEGRATIONS

| Provider | Purpose | Target boundary | Config/creds | Webhooks | Sync/Async | Migration risk |
|----------|---------|-----------------|--------------|----------|-----------|----------------|
| Razorpay | Customer payments | Payments · `PaymentProvider` port | keys (env/secret) | `/payments/webhook/razorpay` (idempotent, signed) | sync init + async webhook | **P0** |
| RazorpayX | Payouts/settlement | Payments · `PayoutProvider` port | keys | payout status callbacks/poll | async | **P0** |
| MSG91 | OTP/SMS/WhatsApp | Notifications/Identity · `MessagingProvider` | keys, `flow_id` | — | sync send | P1 |
| Firebase/FCM | Push + social auth | Notifications/Identity · `PushProvider`/`AuthProvider` | service acct / web keys | — | async push | P1 |
| AWS S3 | Media storage | cross-cutting · `StorageProvider` | keys, buckets | — | sync | P1 |
| Google Maps | Geo/discovery | Locations · `GeoProvider` | keys | — | sync | P2 |
| SendGrid | Email | Notifications · `EmailProvider` | key | — | sync/async | P2 |

## BASELINE OPTIONAL INTEGRATIONS

| Provider | Purpose | Target boundary | Notes |
|----------|---------|-----------------|-------|
| AWS SES | Email (duplicate) | Notifications · `EmailProvider` | **DEPRECATE duplicate** — pick one email provider |
| Twilio | SMS (dup) + admin voice | Notifications/Admin | SMS duplicate of MSG91; voice optional |
| Dunzo | 3rd-party delivery | Delivery · `DeliveryPartner` port | webhook `/delivery/webhook/dunzo` |
| Porter | 3rd-party delivery | Delivery · `DeliveryPartner` port | **P1 risk** — headless-browser automation; isolate/replace with API-only where possible |
| Petpooja POS | Menu/order sync | Menus/Orders · `PosProvider` port | webhook |
| WhatsApp (MSG91) | WhatsApp login | Identity · `MessagingProvider` | optional |
| Rebrandly | Short links | cross-cutting | optional |
| PostHog/GA4/Meta | Analytics (client) | frontends | optional |
| OAuth2 provider | `/oauth2/authorize` | Identity | **UNKNOWN** purpose |

## DEFERRED FEATURE INTEGRATIONS (NOT baseline — do not design baseline around these)

| Provider/Service | Why deferred | Target boundary (future) |
|------------------|--------------|--------------------------|
| Delivery live-tracking (integration service + live-tracking socket) | delivery GPS; ties to deferred `amealio-nestjs-backend` (D-011) | Delivery module **extraction seam** → future tracking service |
| Delivery driver app (`amealio-self-delivery-app`) | deferred repo (D-011) | consumes Delivery module APIs later |
| Recommendations/AI engine | external repo not in workspace | `RecommendationProvider` **port** (external) |
| ONDC micro-server | owner-decision; large protocol surface | separate ONDC bounded context |

## Explicit separation
- **BASELINE INTEGRATION:** Razorpay, RazorpayX, MSG91, FCM, S3, Google Maps, SendGrid (+ optional Dunzo/Porter/Petpooja/Twilio/WhatsApp).
- **DEFERRED FEATURE INTEGRATION:** delivery tracking (integration service/live-tracking socket), driver app, recommendations engine, ONDC — attached later at extension seams, **not** part of baseline restoration.

## Cross-cutting
- **Webhooks** need signature verification + idempotency (esp. Razorpay/Dunzo) — **P0/P1**.
- **Market config** selects providers (India → Razorpay/MSG91) per [`localization-strategy.md`](../../architecture/localization-strategy.md).
- Integration-service **identity vs deferred Nest tracker** is an owner-decision ([11](./11-OWNER-DECISIONS.md)).

No integration code is written in this task.
