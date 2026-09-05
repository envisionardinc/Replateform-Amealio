# 06 — Integrations, Payments, Delivery, Notifications, Storage

External services and integration points across the platform. Payments, delivery, notifications, storage, search, and reporting are included here because they are integration-heavy. Env var names are from `config/default.js` and client env files.

## 1. External services matrix (backend)

| Integration | Purpose | Where | Env / config keys |
|-------------|---------|-------|--------------------|
| **Razorpay** | Payment order/capture, webhooks | `/razorpay`, `/razorpay-webhook`, ONDC refunds | `RAZORPAY_API_KEY_*` (nested) |
| **RazorpayX** | Payouts (settlements, withdrawals) | `/razorpayx-service`, settlement/withdraw crons | RazorpayX keys + payout mode/status enums |
| **Twilio** | SMS + voice (TwiML) | `/sms`, `/token/voice` | `TWACCOUNTSID`, `TWAUTHTOKEN`, `TWPHONE`, `TWIMLSID` |
| **MSG91** | SMS/OTP (primary), WhatsApp | `/msg91`, OTP, WhatsApp auth | `MSG91_*`, WhatsApp keys |
| **SendGrid** | Transactional email | `/email` | `SENDGRIDAPIKEY` |
| **AWS SES** | Email (alt path) | `src/common/SES/emailService.ts` | dedicated SES keys **`UNKNOWN — REQUIRES REVIEW`** |
| **AWS S3** | Image/doc/video storage | upload services, reels | `S3CRED_*`, `SHORT_VIDEOS_S3_CREDENTIALS_*` |
| **Firebase / FCM** | Push notifications | `src/common/PushNotifications/*` | `FCMKEY`, `FCMID`, `VENDOR_FCM`, `DELIVER_PERSON_FCM_KEY` |
| **Dunzo** | 3rd-party delivery | `/dunzo*` | `DELIVERY_PARTNERS_DUNZO_*` |
| **Porter** | 3rd-party delivery + browser automation | `/logistics/porter/*`, Python automation | `DELIVERY_PARTNERS_PORTER_*`, `PORTER_*`, Porter Redis host/port |
| **Petpooja POS** | Menu/order POS sync | `/pos/*`, `src/helpers/petpooja.ts` | `PET_POOJA_*`, `PET_POOJA_CALLBACK_URL` |
| **ONDC micro-server** | ONDC/Beckn protocol relay | `/ondc/*`, crons | `ONDC_MICRO_SERVER_URL`, `ONDC_*`, `BAP_ID`, `BAP_URL`, signing keys |
| **Google Maps** | Geocoding, nearby search | restaurant search, unregister flow | `GOOGLEKEY` |
| **Rebrandly** | Short-link cleanup | short-link cron | via `deleteShortLink` helper |
| **OAuth2 provider** | `/oauth2/authorize` | oauth service | `OAUTH2_*` |
| **Integration service** | Delivery create/availability/track | order/cart flows | `INTEGRATION_SERVICE_BASE_URL`, `INTEGRATON_SERVICE_SECRET_KEY` (typo preserved) |
| **Firebase Dynamic Links** | Deep links | `/firebasedynamiclinks` | in-service config |

> **No PostHog** usage found in the backend (analytics is client-side only).

## 2. Payments

- **Gateways:** Razorpay (collections) and RazorpayX (payouts). Payment methods observed: UPI, cards, netbanking, wallet; plus **scan-and-pay** and **direct merchant payment**.
- **Wallet:** internal `wallet` with balance/credits/KYC/PIN; wallet-funded payments via `/payment/wallet`.
- **Ledger:** `transactional` records every money movement (`transaction_type` `WALLET`/`RAZORPAY`/`SCAN_AND_PAY`); `t_type` numeric enum (env-driven → **`UNKNOWN — REQUIRES REVIEW`**).
- **Settlements/payouts:** batched via `settlement_process`, executed via RazorpayX; withdrawal requests need admin approval.
- **Client:** consumer & merchant apps use `react-razorpay` with `RAZORPAY_LIVE_KEY`/`RAZORPAY_TEST_KEY` and a `LIVE_RAZOR` toggle.
- **US market:** consumer app localization references `paymentProvider: "STRIPE"` for US, but **no Stripe SDK/code exists** — US payments are **`UNKNOWN — REQUIRES REVIEW`** and out of scope for the India-first target.

## 3. Delivery

- **Self-delivery:** `deliverypersons` fleet; assignment on order; delivery-boy app drives status + GPS.
- **Dunzo:** task creation, webhooks, quotes, settlements, credit.
- **Porter:** API booking plus a **headless-browser automation** worker backed by a Redis queue (fragility risk).
- **Tracking:** Nest `/tracking` WebSocket ingests driver GPS; backend calls the **integration service** to create tracking records and check availability; consumer app subscribes to a live-tracking socket for `locationUpdated`.
- **Delivery methods:** `SELF_DELIVERY`, `THIRD_PARTY_DELIVERY`, `AGENT_DELIVERY`.

## 4. Notifications

| Channel | Provider | Notes |
|---------|----------|-------|
| Push | Firebase/FCM | separate FCM keys for user / vendor / delivery person |
| SMS | Twilio + MSG91 | MSG91 primary for OTP/flows (`flow_id`) |
| Email | SendGrid + AWS SES | two email paths |
| WhatsApp | MSG91 | magic-link login + outbound templates |
| In-app | internal | `inAppNotification` + admin geo-targeted broadcasts |

Scheduled template dispatch via cron (SMS/push/email). Template config in `notifications`, `smsTemplate`, `emailTemplate`, `notificationTemplate`.

## 5. File / image / video storage

- **AWS S3** via `aws-sdk` `uploadToS3()` with prefixes (`categoryicons/`, `thumbnail/`, `shorts/`); separate bucket option for short videos.
- **Uploads** via Express + multer routes (`/upload-assets`, `/upload/reels`, `/upload-assets-video`), 100 MB limit.
- **Video transcoding** with `fluent-ffmpeg` on reel upload.
- **Petpooja** images fetched from URL → re-uploaded to S3.

## 6. Search

- Restaurant text/geo search (`/searchRestaurant`, `/searchRestaurantCard`, `/searchGlobal`, `/filter-restaurant`) using MongoDB queries + `geolib` distance/radius.
- Sort/filter weights via `filterEnum` (`RELEVANCE`, `WAITTIME`, `COSTFORTWO`, `HASOFFER`, `OPENNOW`, `RATING`).
- No dedicated search engine (e.g. Elasticsearch/OpenSearch) found. AI "restaurant info" endpoint (`/restaurantInfo`) and the consumer recommendations API back onto **unknown** services — **`UNKNOWN — REQUIRES REVIEW`**.

## 7. Reporting & exports

- CSV (`csv`, `csv-parser`) and Excel (`exceljs`) exports.
- Many report services across orders, diners, experiences, offers, settlements, transactions; merchant statements.
- No separate analytics/warehouse store — reports read operational collections directly.

## 8. Client-side analytics & integrations

| Tool | App(s) | Env |
|------|--------|-----|
| PostHog | consumer, admin/merchant, delivery | `*_POSTHOG_*` (consumer: prod-only) |
| GA4 | consumer | `REACT_APP_GA4_MEASUREMENT_ID` |
| Meta Pixel | consumer | `REACT_APP_META_PIXEL_ID` |
| Firebase Auth | consumer (Google/Apple/Facebook) | `REACT_APP_FIREBASE_*` |
| Google Maps JS | consumer, delivery | `NEXT_PUBLIC_GOOGLE_API` / hardcoded JS key |
| IP geolocation | delivery | `NEXT_PUBLIC_IPAPI_*` |
| Browser fingerprint | consumer | `get-browser-fingerprint` |

## 9. Integration risks (see also [10](./10-migration-risks.md))

- **Porter browser automation** is brittle and infra-coupled (Redis + headless browser).
- **ONDC** is a large, protocol-bound surface with its own settlement/reconciliation.
- **Secrets in source:** multiple reference repos commit live-looking keys (Razorpay, Firebase, Google, MSG91) in env files — a security workstream is required (rotate; never carry into target).
- **Integration service** relationship to the Nest tracking service is unconfirmed.
- **Two email providers** (SendGrid + SES) and **two SMS providers** (Twilio + MSG91) — consolidate in target.
