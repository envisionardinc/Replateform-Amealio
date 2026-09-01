# 15 — Baseline Acceptance Criteria

Observable, **behavioral** acceptance criteria for every capability classified **REQUIRED** in the [Capability Matrix](./14-CAPABILITY-MATRIX.md). Criteria describe *behavior that must be preserved from the existing India baseline*, not implementation tasks. Specification only — nothing is implemented here.

> Convention: "**AC-x.y**" ids; each is phrased as a checkable behavior. Order/payment statuses are referenced by **behavior** (env-driven integer values are `UNKNOWN — REQUIRES REVIEW`). "Baseline behavior" = the behavior evidenced in the source repos ([07](./07-BUSINESS-RULES.md), [11](./11-END-TO-END-WORKFLOWS.md)).

## A. Consumer

- **AC-C1 Registration/login:** A new user can register and authenticate via phone OTP, and (where configured) via Google/Apple/Facebook and WhatsApp magic-link; a guest can browse and build a cart without an account, and on login the guest cart merges into the user cart.
- **AC-C2 Logout/session:** A logged-in user can log out; an expired/invalid token is rejected and refresh produces a new valid session per baseline token lifetime.
- **AC-C3 Discovery:** The home screen renders mood/craving/curation sections and the user can search and receive restaurant results filtered by location, matching baseline discovery behavior.
- **AC-C4 Restaurant & menu:** A user can open a restaurant, see its details (hours/availability), browse the menu with categories, items, variants/sizes, add-ons, and per-channel pricing.
- **AC-C5 Cart→order:** A user can add items (with modifiers) to the cart, choose an order type (dine-in/takeaway/curbside/skip-line/delivery), see correct charges/taxes/surcharges, and place an order.
- **AC-C6 Payment:** The user can pay via Razorpay (and wallet where enabled); on success the order is confirmed; on failure the user sees a failure state and no order is falsely confirmed.
- **AC-C7 Order status/history:** After ordering, the user sees live status transitions (via realtime) and the order appears in order history with correct details.
- **AC-C8 Reservation:** A user can submit a waitlist/reservation request for a restaurant (with party details; reservation with date/time honoring blackout windows) and track its status to seated/completed/cancelled.
- **AC-C9 Notifications:** The user receives order and reservation notifications (in-app/push, and SMS where applicable) at the baseline trigger points.
- **AC-C10 Profile:** The user can view/edit profile and manage saved addresses.

## B. Merchant

- **AC-M1 Onboarding:** A merchant can log in (portal MERCHANT) and onboard a restaurant (location/map, basic info, subscription selection), after which the restaurant becomes discoverable to consumers per baseline behavior.
- **AC-M2 Restaurant config:** A merchant can edit restaurant profile, operating hours, and availability, and these changes are reflected in consumer discovery/availability.
- **AC-M3 Menu management:** A merchant can create/edit menus, categories, items (with variants, add-ons, per-channel pricing) and toggle item availability/sold-out; changes appear in the consumer menu.
- **AC-M4 Order management:** A merchant receives new orders in real time, and can accept/prepare/hold/substitute and advance an order through its lifecycle; state changes propagate to the consumer.
- **AC-M5 Reservation management:** A merchant can view and manage waitlist/reservation requests and assign tables; status changes propagate to the consumer.
- **AC-M6 Staff & roles:** A merchant can create roles (with permissions) and assign staff, and permissions gate the corresponding merchant actions.
- **AC-M7 Settlements/withdrawals:** A merchant can view earnings/statements and request a withdrawal; approved withdrawals result in a payout record per baseline settlement behavior.

## C. Admin (super-admin)

- **AC-A1 Login:** A super-admin can log in (portal ADMIN + OTP) and is denied merchant-only access boundaries per baseline portal rules.
- **AC-A2 Merchant lifecycle:** An admin can review/approve pending vendors and create/edit vendor records; approved vendors can operate.
- **AC-A3 User/restaurant administration:** An admin can view/manage users and restaurants and apply operational controls (e.g. block) per baseline.
- **AC-A4 Settlements/payouts:** An admin can process settlements and approve withdrawals, producing RazorpayX payouts per baseline behavior.
- **AC-A5 Impersonation:** An admin can act as a merchant (vendorAccess) with the action auditable, per baseline.
- **AC-A6 Configuration:** An admin can maintain reference/taxonomy data used across the platform.

## D. Backend / API

- **AC-B1 Service parity:** The REQUIRED consumer/merchant/admin services respond with the same resource shapes and pagination envelope the current clients depend on (`amealio_web_app/src/common/api/urls.js`, admin/merchant action creators).
- **AC-B2 Error contract:** Error responses preserve the `AmealioError { name, message, code, className, errors }` contract (or a documented mapping) so clients handle them unchanged.
- **AC-B3 Realtime contract:** Socket.IO event names/payloads consumed by clients (`order_trigger`, `pending_notification`, `diner_trigger`, `requestUpdate`, `chat.created`, etc.) are emitted with equivalent semantics.
- **AC-B4 Business rules preserved:** Order lifecycle, reservation lifecycle, availability, pricing/charges, cancellation, and settlement rules behave as documented in [07](./07-BUSINESS-RULES.md).
- **AC-B5 Jobs:** Scheduled behaviors (order auto-cancel, completion, diner transitions, settlement, notification dispatch, wallet monthly reset) run and produce baseline-equivalent effects.

## E. Database / data

- **AC-D1 Entity integrity:** Every migrated business entity ([05](./05-DATA-MODEL.md)) is represented with its relationships intact (no orphaned orders/transactions/settlements); tenancy (`merchant`/`restaurant`) resolves for every scoped record.
- **AC-D2 Enum fidelity:** Order/payment/reservation statuses map 1:1 to the confirmed baseline values (blocked until enum mapping is resolved — see Open Questions).
- **AC-D3 Financial correctness:** Wallet balances, ledger (`transactionals`), settlements, and refunds reconcile to baseline totals for a validation sample.
- **AC-D4 Soft-delete/audit:** Soft-deletion and audit/history semantics are preserved (unified from the legacy 5-flag conventions) with no unintended exposure of deleted records.

## F. Integrations

- **AC-I1 Payments:** Razorpay initiation/confirmation/failure and the payment webhook function against test credentials; RazorpayX payouts succeed for merchant settlement in a test flow.
- **AC-I2 Messaging:** OTP via MSG91 delivers and verifies; push via FCM delivers; transactional email delivers.
- **AC-I3 Media:** Image/media upload to S3 works and URLs render in both frontends.
- **AC-I4 Maps:** Geo search/geocoding via Google Maps returns results used by discovery.
- **AC-I5 No production side effects:** All integration validation uses non-production credentials; no production systems are touched.

## G. Workflows

- **AC-W1..W#:** Each **baseline-critical journey** in [16](./16-END-TO-END-BASELINE-JOURNEYS.md) completes end-to-end with baseline-equivalent behavior (registration→discovery→menu→order→payment→status; merchant order management; reservation; settlement; notifications; admin operations). Optional journeys (celebrations/events/ONDC) are validated only if the owner includes them in the wave.

---

## DEFINITION OF DONE — INDIA BASELINE

The India baseline may be declared **restored** only when **all** of the following measurable conditions hold. (This is the target-state checklist for a *future* restoration phase; it is defined now, satisfied later.)

1. **Required capabilities implemented** — every capability classified **REQUIRED** in [14](./14-CAPABILITY-MATRIX.md) is present and behaves per its acceptance criteria (A–F above).
2. **Required workflows working** — every **baseline-critical** journey in [16](./16-END-TO-END-BASELINE-JOURNEYS.md) passes end-to-end.
3. **Data integrity validated** — AC-D1..D4 pass on a representative dataset; no orphaned financial/order records; tenancy resolves for all scoped rows.
4. **Authentication validated** — AC-C1/C2, AC-M1, AC-A1: consumer, merchant, and admin auth (OTP/social/WhatsApp; portal rules; token lifecycle) behave per baseline.
5. **Authorization validated** — role/permission and portal boundaries (AC-M6, AC-A1, AC-A5) enforce baseline access; no privilege escalation.
6. **APIs validated** — AC-B1..B5: REQUIRED endpoints, error contract, realtime contract, and business rules match baseline for the current clients.
7. **Frontend validated** — consumer and merchant/admin UIs complete the required journeys with baseline-equivalent behavior.
8. **Integrations validated** — AC-I1..I5 pass against **non-production** credentials.
9. **Regression tests passing** — an agreed baseline regression suite (to be created in a later phase) passes; no critical regressions vs baseline behavior.
10. **Database migration validated** — the data migration for REQUIRED entities completes with reconciliation checks passing (financial totals, counts, referential integrity).
11. **No critical baseline gaps** — no REQUIRED capability or baseline-critical journey is missing or broken.
12. **Documented exceptions** — any deviation from baseline behavior is explicitly listed, justified, and approved (e.g. deferred delivery tracking, ONDC decision, deprecated legacy flows), with owner sign-off.

**Explicitly out of scope for "baseline restored"** (must not block DoD): deferred delivery driver app + live GPS tracking, external AI recommendation engine, ONDC (unless owner includes it), legacy duplicate flows (deprecated), US-market behavior, and any `UNKNOWN` capability pending owner decision.

## Open questions (block specific ACs)
- **Enum mapping** (blocks AC-D2, parts of AC-B4): numeric order/payment status/method values are env-driven and unconfirmed.
- **Celebrations/Events/Ticketing/ONDC inclusion** in the first wave (owner decision) — determines which optional journeys are in DoD.
- **Integration service identity** (is it the deferred Nest tracker?) — affects delivery/tracking scope.
- **AmealioError code catalogue** clients rely on (affects AC-B2).
