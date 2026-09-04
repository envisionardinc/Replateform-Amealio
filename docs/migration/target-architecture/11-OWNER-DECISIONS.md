# 11 — Owner Decisions (carried forward)

These are **not resolved here.** Each is carried forward with evidence, architectural impact, the decision required, and whether it **blocks migration**. (See also `docs/migration/DECISIONS.md`.)

| ID | Item | Current evidence | Architectural impact | Decision required | Blocks migration? |
|----|------|------------------|----------------------|-------------------|-------------------|
| OD-1 | **Celebrations inclusion** (first wave) | Implemented (`experiences`/`expRequest`; WEB experience flows) — [14 §7](../india-baseline/14-CAPABILITY-MATRIX.md#7-celebrations-experiences) | Adds `celebrations` module + payment/settlement paths | Include in baseline wave or defer? | No (baseline core proceeds without it) |
| OD-2 | **Events inclusion** | Implemented (`events`/`event-handler`) | Adds event/attendee model | Include or defer? | No |
| OD-3 | **Ticketing (validation/capacity)** | Event tickets + QR exist; **validation/capacity UNKNOWN** ([14 §9](../india-baseline/14-CAPABILITY-MATRIX.md#9-ticketing)) | Determines whether ticketing is a real domain | Confirm scope + missing behavior | No (excluded until confirmed) |
| OD-4 | **ONDC** | Implemented (`ondc/*`, 15 models, external micro-server) | Large bounded context / separate service; own settlement | In baseline or later? in-core or separate service? | No for core; **Yes if declared baseline** |
| OD-5 | **Loyalty (points/tiers)** | Not evidenced beyond referrals/wallet cashback ([14 §11](../india-baseline/14-CAPABILITY-MATRIX.md#11-promotions)) | New domain only if it exists | Confirm existence/scope | No |
| OD-6 | **Wallet (consumer)** | Backend `wallet` implemented; **no dedicated web page** | Whether wallet is a baseline consumer capability | Confirm baseline inclusion + UI | No (OPTIONAL) |
| OD-7 | **US-market scope** | Stripe referenced, no code; `REACT_APP_COUNTRY=IN/US` | Provider abstraction + market config | Confirm India-only for baseline | No (India-first assumed) |
| OD-8 | **External recommendation engine** | `REACT_APP_RECOMMENDATIONS_API_*`; repo not in workspace | `RecommendationProvider` port; personalization scope | Provide repo / confirm integration | No (port stub) |
| OD-9 | **Deployment topology** | No orchestration manifest in the 3 repos; multi-env host family only | Infra/runtime target, CI/CD, scaling | Provide target deployment model | No for design; **Yes before go-live** |
| OD-10 | **Integration-service identity** | Backend calls `INTEGRATION_SERVICE_BASE_URL`; relationship to deferred Nest tracker UNKNOWN ([08](./08-INTEGRATION-MIGRATION-MAP.md)) | Delivery/tracking boundary + seam design | Confirm what the integration service is | No for baseline orchestration; affects Delivery seam |
| OD-11 | **Enum mapping** (order/payment status/method, `t_type`) | Env-driven; values absent from source ([05](../india-baseline/05-DATA-MODEL.md)) | Explicit target enums; data ETL | Provide authoritative mapping | **YES — blocks Orders/Payments data migration** |
| OD-12 | **Admin/Merchant app split** (D-006) | One repo, portal by hostname | One vs two frontend apps | Confirm split | No for backend; shapes frontend phase |
| OD-13 | **AmealioError code catalogue** | Custom error contract; full catalogue not enumerated | API error compatibility (AC-B2) | Confirm codes clients depend on | No (mapping can be derived) |

## Notes
- Only **OD-11 (enum mapping)** hard-blocks a migration step (Orders/Payments data). Others shape **scope** but do not block the CORE baseline.
- Owner-decision domains (Celebrations/Events/Ticketing/ONDC/Loyalty) have **reserved** modules/seams ([02](./02-DOMAIN-BOUNDARIES.md), [10](./10-MIGRATION-SEQUENCE.md)) but are **not designed-in** until decided.
- These items are **not silently resolved**; they must be answered by the owner and recorded in `docs/migration/DECISIONS.md`.
