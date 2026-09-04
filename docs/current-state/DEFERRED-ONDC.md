# DEFERRED — ONDC Integration (Existing in Current Platform)

**Classification:** DEFERRED — EXISTING INTEGRATION  
**Replatform scope:** Document only; do not migrate in current replatform phase.

---

## Where ONDC Exists

| Repository | Location | Role |
|------------|----------|------|
| `amealio-vendordashboard` | `src/services/ondc/` (30+ classes) | Protocol handler, buyer app APIs, admin |
| `amealio-vendordashboard` | `src/models/ondc-*.model.ts` (15+ models) | ONDC data |
| `amealio-vendordashboard` | `src/enums/ondcEnums.ts` | ONDC enums |
| `amealio-vendordashboard` | `src/cron.ts` | ONDC refund cron (daily 18:00, commented start) |
| `amealio-vendordashboard` | `src/common/constants.ts` | Cancel commission 5%, refund delay 3 days |
| `amealio_web_app` | `/ondc/*` routes, `ondcSlice` | Customer buyer app UI |
| `amealiodashboardmvp-` | `SuperAdminONDC/` components | Admin ONDC management |

**NOT found in:** nestjs-backend, self-delivery-app, homepage-v2-rag-server, replatform-amealio

---

## Backend API Endpoints

### ONDC Network Callbacks (Seller/BPP side)
| Path | Handler class |
|------|---------------|
| `/ondc/on_search` | ondc.class.ts |
| `/ondc/on_select` | on_select_ondc.class.ts |
| `/ondc/on_init` | on_init_ondc.class.ts |
| `/ondc/on_confirm` | on_confirm_ondc.class.ts |
| `/ondc/on_status` | on_status_ondc.class.ts |
| `/ondc/on_track` | on_track_ondc.class.ts |
| `/ondc/on_cancel` | on_cancel_ondc.class.ts |
| `/ondc/on_update` | on_update_ondc.class.ts |
| `/ondc/on_issue` | on_issue_ondc.class.ts |
| `/ondc/on_issue_status` | on_issue_status.class.ts |
| `/ondc/on_settle` | on_settle_ondc.class.ts |
| `/ondc/on_report` | on_report_ondc.class.ts |
| `/ondc/on_recon` | on_recon_ondc.class.ts |

### Buyer App (Customer-facing)
| Path | Purpose |
|------|---------|
| `/ondc/restaurant` | ONDC restaurant discovery |
| `/ondc/user/cart` | ONDC cart |
| `/ondc/user/delivery` | Delivery selection |
| `/ondc/user/order` | Order placement/tracking |
| `/ondc/user/issue` | Issue/dispute creation |
| `/ondc/order/return` | Returns |

### Admin
| Path | Purpose |
|------|---------|
| `/ondc/admin/restaurants` | Restaurant management |
| `/ondc/admin/orders` | Order management |
| `/ondc/admin/dispute` | Dispute management |
| `/ondc/admin/snp` | SNP management |
| `/ondc/admin/settlements` | Settlements |
| `/ondc/admin/order-refunds` | Refund management |
| `/ondc/cities` | City management |
| `/ondc/rsf/settle`, `/ondc/rsf/report`, `/ondc/rsf/recon` | Reconciliation |

**Evidence:** `ondc.service.ts` lines 74–111

---

## Socket Events

```typescript
ONDC_EVENTS = [
  "ondc_on_search", "ondc_on_select", "ondc_on_init", "ondc_on_confirm",
  "ondc_on_status", "order_trigger", "ondc_on_track", "pending_notification",
  "patched", "order_update", "issue_update"
]
```

Customer web app listens on Feathers `ondc` service.

---

## Data Models

| Model | Purpose |
|-------|---------|
| ondc-restaurant | ONDC restaurant catalog |
| ondc-restaurant-menu, ondc-restaurant-item | Menu sync |
| ondc-user-cart, ondc-cart-item, ondc-cart-quote | Cart |
| ondc-user-order | Orders |
| ondc-order-issue | Issues/disputes |
| ondc-settlements, ondc-new-settlements, ondc-settlement_record | Financial settlement |
| ondc_reconciliation | Reconciliation records |
| ondc-snps, ondc-cites | Network participants |
| ondc-custom-group | Menu grouping |

---

## Business Rules (Code-Enforced)

| Rule | Value | Source |
|------|-------|--------|
| User cancel commission | 5% | ONDC_CANCEL_COMMISSION_PERCENT |
| Refund processing delay | 3 days | ONDC_REFUND_DELAY_DAYS |
| Revenue split | 97% / 3% | ONDC_INTER_PARTICIPANT_RATIO, ONDC_COLLECTOR_RATIO |
| Refund cron | Daily 18:00 UTC | cron.ts ondcRefundsCronJob |

---

## Customer Impact

- ONDC marketplace accessible at `/ondc/*` routes in web_app
- Gated by `REACT_APP_COUNTRY=IN` (shouldShowOndc)
- Full flow: search → menu → cart → checkout → track → cancel/issue
- Separate from native Amealio restaurant ordering

---

## Merchant Impact

- ONDC restaurants managed via admin dashboard (SuperAdminONDC)
- ONDC catalog sync via on_search callbacks
- No separate merchant ONDC dashboard identified in audit (admin-centric)

---

## Admin Impact

- SuperAdminONDC components for merchants, orders, settlements, refunds
- Dispute and SNP management
- Reconciliation reports

---

## Dependencies on Other Functionality

| Dependency | Risk if ONDC ignored |
|------------|---------------------|
| Shared payment infrastructure (razorpay, transactional) | Refund/settlement overlap |
| Shared notification system | ONDC order notifications |
| ordering model enums | ONDC orders may reference order patterns |
| Admin reporting | Settlement reports include ONDC |
| Cron infrastructure | ONDC refund cron shares cron.ts |

**ONDC is largely isolated** in dedicated models/services but shares payment, notification, and admin reporting infrastructure.

---

## Status

| Aspect | Status |
|--------|--------|
| ONDC protocol handlers | IMPLEMENTED |
| Customer buyer UI | IMPLEMENTED (IN market) |
| Admin management UI | IMPLEMENTED |
| Data models | IMPLEMENTED |
| Reconciliation/settlement | IMPLEMENTED |
| Replatform migration | DEFERRED |
