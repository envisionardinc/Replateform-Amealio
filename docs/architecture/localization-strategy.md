# Localization & Market Strategy (Proposed — For Review)

Status: **DESIGN / FOR REVIEW.** Defines how the canonical model separates **core domain** from **market-specific configuration**, and how markets/locales are handled. The initial implementation targets **India (`IN`) only**; **no US-specific behavior is introduced now.**

## 1. Principle: configuration, not forks

Market and locale differences are expressed as **data/configuration**, never as branching code paths or per-market schemas. The core domain is market-agnostic; a thin market-configuration layer parameterizes it.

```
CORE DOMAIN (market-agnostic)  +  MARKET CONFIGURATION (data)  →  behavior for a given market
```

The legacy platform already hints at multi-market intent (`REACT_APP_COUNTRY` = `IN`/`US`, `prod-us`, per-entity `country`/`currency`/`timezone`, a Stripe reference for US with **no implementation**). We formalize that as configuration and **scope the first release to India**.

## 2. Core vs market-specific

| Aspect | Core domain (unchanged across markets) | Market-specific configuration |
|--------|----------------------------------------|-------------------------------|
| Entities | User, Merchant, Restaurant, Menu/Item, Order, Cart, Seating, Experience, Delivery, Wallet/Transaction, Offer | — |
| Money | amounts stored as integer minor units | `currencyCode`, currency formatting, minor-unit exponent |
| Geography | geo point, address structure | country/state/city reference data, address format, pincode rules |
| Payments | payment intent/ledger abstraction | provider selection (India → Razorpay/RazorpayX), supported methods |
| Messaging | notification template/log abstraction | SMS/OTP/WhatsApp provider (India → MSG91), sender IDs |
| Tax | tax lines on orders | tax regime & rates (India → GST) |
| Commerce networks | order/fulfilment abstraction | ONDC participation (India-only) |
| Locale | — | language, date/number formats, timezone (India → `Asia/Kolkata`) |
| Compliance/KYC | wallet/merchant KYC abstraction | India KYC rules |

## 3. Market configuration model (proposed)

A small, data-driven layer:

```prisma
// PROPOSED — illustrative only
model Market {
  code            String  @id            // "IN" (only IN seeded initially)
  name            String
  defaultCurrency String                 // "INR"
  defaultLocale   String                 // "en-IN"
  timezone        String                 // "Asia/Kolkata"
  paymentProvider String                 // "RAZORPAY"
  smsProvider     String                 // "MSG91"
  taxRegime       String                 // "GST"
  ondcEnabled     Boolean @default(true)
  config          Json                   // extensible per-market flags
}
```

- Market-scoped entities carry a `countryCode` (FK → `Market.code`), defaulting to `IN`.
- Provider selection, tax rules, and supported order types are **looked up from `Market`/config**, not hard-coded.
- **Only `IN` is seeded.** Adding `US` later is a data + provider-adapter task, not a schema change.

## 4. Provider abstraction (so markets stay data-driven)

| Capability | Interface (core) | India adapter (initial) | Future |
|------------|------------------|-------------------------|--------|
| Payments | `PaymentProvider` | Razorpay / RazorpayX | (US) deferred — no Stripe now |
| Messaging (SMS/OTP/WhatsApp) | `MessagingProvider` | MSG91 (+ Twilio where used) | per-market |
| Email | `EmailProvider` | SendGrid / SES (consolidate) | per-market |
| Push | `PushProvider` | Firebase/FCM | shared |
| Maps/geo | `GeoProvider` | Google Maps | shared |
| Tax | `TaxCalculator` | GST | per-market |

Core code depends on the interface; the market config selects the adapter. **No US adapters are built in this phase.**

## 5. Locale / i18n

- User-facing strings live in the frontends' i18n layer (target `packages/localization`); the backend returns **codes/keys** (e.g. status enums, error codes), not localized prose, so clients localize.
- Formatting (currency, dates, numbers) is locale-driven on the client using the market's `defaultLocale`.
- Timezone: store UTC; present in the market/restaurant timezone (India `Asia/Kolkata`).
- **`UNKNOWN — REQUIRES REVIEW`:** whether multi-language content (e.g. menu item names) is required for India initially; if so, add per-locale content tables later.

## 6. What is explicitly deferred (not built now)

- Any **US** behavior: Stripe integration, US tax logic, US address/pincode rules, `prod-us` specialization.
- Multi-currency checkout beyond INR.
- Multi-language content tables (unless India requires them — pending review).
- Region-based data residency/sharding.

## 7. Migration implications

- Seed a single `Market` = `IN`; backfill `countryCode = 'IN'` and `currencyCode = 'INR'` on market-scoped rows.
- Treat legacy US artifacts (Stripe reference, `prod-us`) as **out of scope**; do not port them.
- Keep ONDC (India network) inside India market configuration, in its own bounded context.

## 8. Open questions — `UNKNOWN — REQUIRES REVIEW`

- Confirm India is the only launch market and US is a later wave.
- Whether any existing data carries non-IN `country` values that must be handled at ETL.
- Multi-language requirement for India.
- Whether tax (GST) computation lives in core with market rates, or fully in the market adapter.
