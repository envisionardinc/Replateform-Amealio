# 08 — Integrations

External integrations used by the approved baseline. All backend integrations are owned by `amealio-vendordashboard` (config in `config/default.js`, code in `src/common/**`, `src/services/**`, `src/helpers/**`). Client-side integrations live in the frontends. Credentials are configured via environment variables — **committed secrets exist in the reference repos and must be rotated, never reused** ([12](./12-GAPS-RISKS.md)).

Legend: **Mech** = mechanism; **Status** = observed; **Risk** = migration risk.

| Provider | Purpose | Repo | Mech (API/webhook) | Config keys | Business dependency | Status | Risk |
|----------|---------|------|--------------------|-------------|---------------------|--------|------|
| **Razorpay** | Customer payments (orders, experiences) | backend + web (SDK) | REST + **webhook** (`/razorpay-webhook`) | `RAZORPAY_API_KEY_*`; web `RAZORPAY_LIVE_KEY`/`_TEST_KEY`,`LIVE_RAZOR` | Critical (revenue) | Active | High (financial correctness) |
| **RazorpayX** | Payouts (settlements, withdrawals) | backend | REST | RazorpayX keys, payout mode/status enums | Critical (merchant payouts) | Active | High |
| **Twilio** | SMS + voice (admin browser calling) | backend + admin (`twilio-client`) | REST + TwiML `/token/voice` | `TWACCOUNTSID`,`TWAUTHTOKEN`,`TWPHONE`,`TWIMLSID` | Medium | Active | Medium |
| **MSG91** | SMS/OTP (primary), WhatsApp | backend | REST (`flow_id`) | `MSG91_*`, WhatsApp keys | Critical (login OTP) | Active | Medium |
| **SendGrid** | Transactional email | backend | REST | `SENDGRIDAPIKEY` | Medium | Active | Low |
| **AWS SES** | Email (alt path) | backend | SDK | SES keys **UNKNOWN — REQUIRES REVIEW** | Low–Med | Active | Low |
| **AWS S3** | Image/doc/video storage | backend | SDK (`uploadToS3`) | `S3CRED_*`,`SHORT_VIDEOS_S3_CREDENTIALS_*` | High (media) | Active | Medium |
| **Firebase / FCM** | Push notifications | backend + web/admin (auth+msg) | Admin SDK / web SDK | `FCMKEY`,`FCMID`,`VENDOR_FCM`,`DELIVER_PERSON_FCM_KEY`; `REACT_APP_FIREBASE_*` | High | Active | Medium |
| **Dunzo** | Third-party delivery | backend + admin | REST + **webhook** (`/dunzoWebHook`) | `DELIVERY_PARTNERS_DUNZO_*` | Medium | Active | Medium |
| **Porter** | Third-party delivery | backend + merchant | REST **+ headless-browser automation** (Redis queue) | `DELIVERY_PARTNERS_PORTER_*`,`PORTER_*`, Redis host/port | Medium | Active | **High** (brittle automation) |
| **Petpooja POS** | Menu/order POS sync | backend + admin | REST + **webhook** (`/pos/webhook/:posId/:action`) | `PET_POOJA_*`,`PET_POOJA_CALLBACK_URL` | Medium | Active | Medium |
| **ONDC micro-server** | ONDC/Beckn protocol relay | backend + web/admin | REST + protocol callbacks (`/ondc/*`) | `ONDC_MICRO_SERVER_URL`,`ONDC_*`,`BAP_ID`,`BAP_URL`, signing keys | Medium (network) | Active | **High** (protocol, external repo) |
| **Google Maps** | Geocoding, nearby, JS maps | backend + web/admin | REST + JS SDK | `GOOGLEKEY`; `REACT_APP_GOOGLE_API_KEY`, hardcoded JS key | High | Active | Low |
| **Integration service** | Delivery create/availability/public-track | backend + web | REST | `INTEGRATION_SERVICE_BASE_URL`,`INTEGRATON_SERVICE_SECRET_KEY` (typo preserved); web `REACT_APP_INTEGRATION_SERVICE_URL` | Medium (delivery) | Active | Medium — **repo not in workspace**; relationship to deferred Nest tracker **UNKNOWN** |
| **Recommendations API** | AI home recommendations | web | REST | `REACT_APP_RECOMMENDATIONS_API_*` | Medium (personalization) | Active | Medium — **external, repo not in workspace** |
| **Live-tracking socket** | Delivery GPS to consumer | web | Socket.IO | `REACT_APP_LIVE_TRACKING_SOCKET_URL` | Medium | Active | Medium — external/deferred |
| **Rebrandly** | Short-link cleanup | backend | REST (cron) | via `deleteShortLink` | Low | Active | Low |
| **OAuth2 provider** | `/oauth2/authorize` | backend | REST | `OAUTH2_*` | Low | Present | Low |
| **Analytics: PostHog / GA4 / Meta** | Product/marketing analytics | web (+admin PostHog) | JS SDK | `*_POSTHOG_*`,`REACT_APP_GA4_MEASUREMENT_ID`,`REACT_APP_META_PIXEL_ID` | Low | Active (prod) | Low |

## Notes
- **No PostHog usage in the backend** (analytics is client-side only).
- **Two email providers** (SendGrid + SES) and **two SMS providers** (Twilio + MSG91) coexist — consolidation candidate.
- **Deferred-repo dependency:** the integration service and live-tracking socket are how the baseline reaches delivery tracking; the tracking service and driver app themselves are deferred (D-011). Whether `INTEGRATION_SERVICE_BASE_URL` == `amealio-nestjs-backend` is **UNKNOWN — REQUIRES REVIEW**.
