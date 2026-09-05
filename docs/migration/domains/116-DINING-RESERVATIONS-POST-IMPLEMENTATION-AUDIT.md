# 116 — Dining / Reservations Runtime Slice 1 — Post-Implementation Forensic Audit

**Status:** READ-ONLY audit. No production, test, Prisma, or contract documents were modified.  
**Date:** 2026-09-05  
**Method:** Stage 116 L1–L4 reconciliation vs actual HEAD implementation.  
**Governing contract:** [116-DINING-RESERVATIONS-RECONCILIATION.md](./116-DINING-RESERVATIONS-RECONCILIATION.md)  
**Gap matrix:** [116-DINING-RESERVATIONS-GAP-MATRIX.json](./116-DINING-RESERVATIONS-GAP-MATRIX.json)  
**Implementation record:** [116-DINING-RESERVATIONS-IMPLEMENTATION.md](./116-DINING-RESERVATIONS-IMPLEMENTATION.md)  
**Foundation:** [44-SEATING-TABLE-SETUP-RECONCILIATION.md](./44-SEATING-TABLE-SETUP-RECONCILIATION.md), [45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md](./45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md)

This audit classifies Slice 1 behavior. It does **not** rewrite the Stage 116 contract, resolve owner decisions, or design Slice 2.

---

# 1. Audit Metadata

| Field | Value |
|---|---|
| Repository | `envisionardinc/replateform-amealio` (`Replateform-Amealio`) |
| Branch | `replatform/backend-consolidation` |
| Expected HEAD | `d2608045da64e6cd2a1f18c2b87e714795da4087` |
| Starting HEAD | `d2608045da64e6cd2a1f18c2b87e714795da4087` |
| Audited HEAD | `d2608045da64e6cd2a1f18c2b87e714795da4087` |
| Working tree at audit start | Clean (no uncommitted production or documentation diffs) |
| Branch / HEAD material difference | **None.** Audit proceeded. |

Slice 1 implementation commits after forensic stamp `1d969d8`:

| SHA | Role |
|---|---|
| `2a7b1ea` | API / consumer UI / merchant UI / seed fixtures |
| `fa08766` | `stage-116-dining-reservations-runtime.e2e-spec.ts` |
| `916be13` | Merchant Active-lane action visibility + implementation record |
| `d260804` | Implementation-doc HEAD stamp |

`prisma/schema.prisma` and `prisma/migrations/**` are **not** in `1d969d8..d260804`. Seed-only change: `prisma/seed.ts`.

---

# 2. Executive Verdict

**PASS WITH MINOR IMPLEMENTATION GAPS**

Slice 1 implements the approved Dining / Reservations runtime over the existing P1.7.16 `SeatingRequest` foundation. It does not invent a second booking engine, does not change Prisma, does not enforce reservation blocks, and does not accidentally close OD-SEAT-1..12.

The implementation matches the Stage 116 L4 contract **as narrowed by the approved Slice 1 GO**:

- Consumer JWT `POST/GET /api/v1/diner` + `PATCH /diner/:id/cancel`
- Merchant staff accept / seat / complete on `/api/v1/merchant/diner`
- Server-derived `WALK_IN` / `WAITLIST` from `walkin_waitlist.value`
- `RESERVATION` requires `reservationAt`
- Booking machine `PENDING → NOT_SEATED → SEATED → COMPLETED` plus consumer `CANCELLED`
- Table claim uses row lock + compare-and-set (real TOCTOU close on seat)
- Consumer ownership and merchant restaurant scope are enforced in the service, not only by decorators

Minor gaps that do **not** block the Slice 1 contract:

1. Same-day active `WALK_IN`/`WAITLIST` uniqueness is checked then written **outside** one transaction (L4 §9.6 asked for inside a transaction). Sequential create is rejected; a race window remains.
2. Consumer `RESERVATION`, `WALK_IN` (when `walkin_waitlist.value !== true`), seating-disabled 403, and same-day 409 are implemented but **not proven** by the Stage 116 e2e file.
3. Implementation-doc “Final HEAD” still names `916be13`; audited branch HEAD is the later stamp `d260804`.
4. A dead `waitlistFlag === false` branch sits after `deriveWalkInOrWaitlist()` already returned `WAITLIST` only when that flag is `true`.

None of these invent policy or resolve an owner decision. They are not BLOCKED-class second-engine or auth-isolation failures.

---

# 3. L1–L4 Conformance

| Contract Area | L1 | L2 | L3 | L4 | Implementation | Verdict |
|---|---|---|---|---|---|---|
| Diner model | Legacy unified `Diner` (`service_type` + `isWalkIn`) | One booking aggregate | Typed `SeatingType`; no second entity | One `SeatingRequest`; types `WALK_IN` / `WAITLIST` / `RESERVATION` | Same model; no `isWalkIn` column; type persisted on `SeatingRequest.type` | **IMPLEMENTATION MATCH** |
| Reservation | `RESERVATION` + `reservationTime` | Slots / blocks common in industry | First slice: persist time, no slot engine | `intent=RESERVATION` requires `reservationAt`; no blocks; no slot table | Required + ISO parse; `type=RESERVATION`; `tableId` null at create; no `ReservationBlock` read; no `OperatingHours` availability | **IMPLEMENTATION MATCH** |
| Walk-in | `SEATING` + `isWalkIn=true` | Immediate seat / walk-in queue | Client must not pick occupancy | Consumer sends `SEATING`; server may persist `WALK_IN` | Consumer DTO has no `WALK_IN`; derived when `walkin_waitlist.value !== true` | **IMPLEMENTATION MATCH** (default, see §7) |
| Waitlist | `SEATING` + `isWalkIn=false` | Waitlist product | Do not invent advanced waitlist | Same Book a Table entry; server derives `WAITLIST` | Derived when `walkin_waitlist.value === true`; no `wait_time`, ETA, or queue position | **IMPLEMENTATION MATCH** (default, see §7) |
| State machine | `PENDING/NOTSEATED/SEATED/COMPLETED` + reject/cancel | Host-stand machines vary | No INITIAL in food seating | L4 §9.2 plus Slice 1 GO without reject / merchant cancel / auto-accept | Slice 1 HTTP: create→PENDING→accept→NOT_SEATED→seat→SEATED→complete→COMPLETED; consumer cancel PENDING/NOT_SEATED→CANCELLED | **IMPLEMENTATION MATCH** to Slice 1 GO; reject / merchant cancel / auto-accept **DEFERRED CORRECTLY** |
| Table assignment | Bind at accept/seat; occupancy on `table[].status` | Allocator / optimization common | No OpenTable engine | Same restaurant; active; AVAILABLE; no double bind; complete → DIRTY when auto-sync ships | Seat transaction locks table + request; CAS AVAILABLE→OCCUPIED; complete OCCUPIED→DIRTY; accept does not bind | **IMPLEMENTATION MATCH** |
| Cancellation | Consumer PENDING/NOTSEATED | Industry often broader | Terminal stays terminal | Consumer (and later merchant) cancel PENDING/NOT_SEATED | Consumer only; CAS + optional table release; other user’s cancel is 404 | **IMPLEMENTATION MATCH** (merchant cancel deferred) |
| Merchant scope | Staff diner queues | Staff vs platform | Never trust body `merchantId` | `MerchantScopeService.assertRestaurantInScope` | List/get/accept/seat/complete resolve restaurant from the row or required `restaurantId` query, then assert scope | **IMPLEMENTATION MATCH** |
| Consumer ownership | Signed-in `/diner` + `/user/diner` | Account-owned bookings | No guest in first slice | JWT `userId`; list/get/cancel own only | `JwtConsumerGuard`; `userId` from principal; cross-user 404 | **IMPLEMENTATION MATCH** |
| Subscription gates | `casual_dining_status.seating.*` | Entitlement flags | DEC-2: no new policy table | `isSeatingEnabled` + reservation / walk-in flags **on create** | Create checks seating + reservation flag; walk-in/waitlist derived from existing `walkin_waitlist.value`; merchant mutations do not re-check (L4 says create) | **IMPLEMENTATION MATCH**; no new policy invented |
| UI | V2 Book a Table + merchant pending/floor/history | Host-stand UIs | No Super Admin stand, no Quick Seat | Existing design system; Book a Table + track; merchant pending/active/complete | Restaurant → Book a Table → status/cancel → list; merchant `/diner` Active/History with status-gated actions | **IMPLEMENTATION MATCH** |

L4 §9.4 **proposed** `/api/v1/seating/requests`. Approved Slice 1 GO and L1 required consumer `POST /diner`. Implementation followed the GO/L1 path. That is **not** a second engine and **not** a contract violation of the approved slice.

---

# 4. State Machine Audit

## 4.1 Implemented Slice 1 HTTP machine

```
create (consumer)                         → PENDING, tableId=null
merchant accept                           → NOT_SEATED (+ confirmedAt)
merchant seat + available in-scope table  → SEATED (+ tableId)
merchant complete                         → COMPLETED (bound table OCCUPIED → DIRTY)
consumer cancel (PENDING or NOT_SEATED)   → CANCELLED
  if a table was already bound            → ON_HOLD|OCCUPIED → AVAILABLE
```

Terminal for Slice 1 writes: `COMPLETED`, `CANCELLED`.  
`REJECTED` exists on the enum and is never written by Slice 1 HTTP.  
`INITIAL` is never written.

## 4.2 Comparison with Stage 116 L4 §9.2

| L4 transition | Slice 1 HTTP | Classification |
|---|---|---|
| create → PENDING | Yes | **MATCH** |
| auto-accept → NOT_SEATED | No | **DEFERRED CORRECTLY** (OD / later slice; L4 §22 exclude cron/auto) |
| merchant accept → NOT_SEATED | Yes, CAS `PENDING` only | **MATCH** |
| merchant seat + table → SEATED | Yes, only from `NOT_SEATED` | **MATCH** |
| merchant complete → COMPLETED | Yes, only from `SEATED` | **MATCH** |
| merchant reject PENDING/NOT_SEATED → REJECTED | No route | **DEFERRED CORRECTLY** vs approved Slice 1 GO (L4 §22 include listed reject; GO/implementation excluded it) |
| consumer cancel PENDING/NOT_SEATED → CANCELLED | Yes | **MATCH** |
| merchant cancel PENDING/NOT_SEATED → CANCELLED | No route | **DEFERRED CORRECTLY** for this slice |
| Consumer SEATED/COMPLETED | Impossible via consumer routes | **MATCH** |
| Merchant skip PENDING → SEATED / COMPLETED | Rejected 400 | **MATCH** |
| Repeat accept / complete | Second CAS miss → 400 | **MATCH** |
| Consumer cancel after SEATED/COMPLETED | 400 | **MATCH** |

## 4.3 Repeat / idempotency

Repeat accept and complete are **rejected**, not treated as idempotent success. That matches the implementation record and the e2e (“repeat accept / complete 400”). L4 §9.6 requires compare-and-set so the same request cannot apply the same side effect twice; rejection satisfies that.

## 4.4 Residual non-Slice-1 path

Staff foundation `SeatingService.updateSeatingRequest` / `createSeatingRequest` still exist for doc 45. They do **not** enforce the Slice 1 graph. They are **not** mounted on Slice 1 controllers (`SeatingModule` only registers `ConsumerDinerController` and `MerchantDinerController`). Foundation e2e calls the service directly. This is the documented P1.7.16 residual, not a Slice 1 HTTP bypass.

---

# 5. Table Concurrency Audit

## 5.1 Actual seat transaction

`SeatingRepository.seatRequestOnTable` runs inside `prisma.$transaction`:

1. `SELECT … FROM "RestaurantTable" t INNER JOIN "SeatingArea" a … FOR UPDATE OF t`
2. Reject if missing/deleted, `restaurantId` mismatch, `isActive=false`, or `status !== AVAILABLE`
3. `SELECT` other non-terminal (`PENDING`/`NOT_SEATED`/`SEATED`) requests on that `tableId` `FOR UPDATE`; reject if any
4. `SELECT` the diner row `FOR UPDATE`; require `NOT_SEATED` and same restaurant
5. `updateMany` request `status=NOT_SEATED → SEATED` + `tableId`; count ≠ 1 → conflict
6. `updateMany` table `AVAILABLE + isActive + not deleted → OCCUPIED`; count ≠ 1 → conflict

Service maps “not available / already assigned” to **409**, out-of-restaurant table to **400**, missing table to **404**.

## 5.2 Does this close TOCTOU?

**Yes, for table assignment.** Two concurrent seats on the same available table serialize on the table-row lock. The loser fails the AVAILABLE compare-and-set or the occupant lock. The concurrent e2e observes `{200, 409}` and exactly one `SEATED` row / one `OCCUPIED` table. That is a real lock+CAS, not a test-only appearance.

## 5.3 Complete and cancel

- Complete: lock request; require `SEATED`; CAS → `COMPLETED`; if `tableId` present, `OCCUPIED → DIRTY` (count ignored if already not OCCUPIED — residual, not a double-assign hole).
- Consumer cancel: lock request; require `userId` match and `PENDING|NOT_SEATED`; CAS → `CANCELLED`; bound table `ON_HOLD|OCCUPIED → AVAILABLE`.
- Accept does **not** bind a table and does **not** set `ON_HOLD`. That matches Slice 1 / L4 “until auto-sync ships” and the implementation record.

## 5.4 Same-day create (not table assignment)

`findActiveSeatingSameLocalDay` then `createRequest` are **not** wrapped in one transaction and do **not** lock a uniqueness row. L4 §9.6 required rejection **inside a transaction**. Sequential duplicates are rejected (36h lookback + restaurant timezone local-date filter). Concurrent double-create of two active `WALK_IN`/`WAITLIST` rows for the same user+restaurant+local day remains a race.

**Classification:** **IMPLEMENTATION GAP** (IMPROVE). Not a second allocator. Not a table TOCTOU failure.

---

# 6. Authorization Audit

## 6.1 Consumer ownership

| Check | Actual | Verdict |
|---|---|---|
| Auth | Class-level `JwtConsumerGuard` | MATCH |
| `userId` | `principal.userId` only; missing → 401 | MATCH |
| Create | `merchantId` from `Restaurant.merchantId`; `userId` from JWT; client `userId`/`merchantId`/`type`/`status`/`tableId` forbidden by `ValidationPipe` whitelist + `forbidNonWhitelisted` | MATCH |
| List | `listRequestsByUser(userId)` | MATCH |
| Get / cancel other user | `getMine` 404 if `row.userId !== jwt`; cancel re-checks `userId` inside the lock | MATCH |
| Consumer merchant actions | Consumer JWT on `/merchant/diner` → 401 | MATCH |

Proven by e2e: unauthenticated create 401; cross-user get/cancel 404; row remains `PENDING` for the owner.

## 6.2 Merchant scope

| Check | Actual | Verdict |
|---|---|---|
| Auth | `JwtStaffGuard` + `StaffAuthorizationGuard` + `@RequireStaffRoles('MERCHANT_OWNER','MERCHANT_STAFF')` | MATCH |
| Scope | Every list/get/accept/seat/complete calls `assertRestaurantInScope` | MATCH |
| List | Requires query `restaurantId` (DTO `@IsUUID()`). Restaurant is loaded; `merchantId` is taken from that row, never from body | MATCH |
| Cross-merchant list/accept | 403 (`Cross-merchant access denied`) | MATCH |
| Other merchant’s restaurant as query | 403 | MATCH |
| Consumer JWT | 401 | MATCH |
| Out-of-scope table | 400 | MATCH |

`StaffAuthorizationGuard` `@MerchantScoped` is **not** on this controller. Isolation is **not** decorator-only: `MerchantScopeService` in the service is the authority. That is the correct target pattern.

Missing `restaurantId` on list is **400** (validation), not 403. Harmless; not an escape.

## 6.3 SUPER_ADMIN

Established architecture (unchanged by Slice 1):

- `isSuperAdmin` = `staffRole === SUPER_ADMIN && merchantId === null`
- Role/permission gates short-circuit
- `assertRestaurantInScope` **returns immediately** for SUPER_ADMIN — any existing restaurant is a valid explicit target
- L4: “Super Admin remains platform-scoped explicit restaurant target — not a silent merchant”
- OD-SEAT-8 default: no Super Admin host-stand impersonation

Slice 1:

- No Super Admin diner UI. `DinerQueueScreen` redirects Super Admin to `/global-catalog`
- No `/Admin/diner` clone
- API would allow a platform SUPER_ADMIN staff JWT to accept/seat/complete a diner if called directly, because restaurant-scope assertion passes

This follows the **existing** staff architecture and the OD-SEAT-8 **default** (no host stand). It does **not** resolve whether Super Admin should operate diner APIs at all. **Untested** on diner routes.

---

# 7. Walk-In / Waitlist Audit

## 7.1 What each layer does

| Layer | Behavior |
|---|---|
| Consumer sends | `intent: 'SEATING' \| 'RESERVATION'` plus party fields. Never `WALK_IN`, `WAITLIST`, or `isWalkIn` |
| Server derives | `RESERVATION` → persist `RESERVATION` (after reservation flag + `reservationAt`). `SEATING` → `deriveWalkInOrWaitlist(config)` |
| Persist | `SeatingRequest.type` = `WAITLIST` if `casual_dining_status.seating.walkin_waitlist.value === true`, else `WALK_IN`. `reservationAt` null for seating intent. `status=PENDING`, `tableId=null`, `userId` from JWT |
| Merchant sees | Serialized `type` (`WAITLIST` or `WALK_IN` or `RESERVATION`). UI label collapses non-reservation to “Book a Table” |
| Transitions | Type does **not** change the state machine. Reservation is never reclassified as walk-in/waitlist |

## 7.2 Is this OD-SEAT-10 resolution?

**No. It is contract-preserving use of the forced-ship default. It is not an accidental owner-decision resolution.**

OD-SEAT-10 question: client chooses WALK_IN vs WAITLIST **versus** server derives from restaurant `seatingWaitingTime`.

Forced-ship default (116 §21.2): **server derives** from restaurant wait-time config when the consumer sends a SEATING-equivalent; merchant Add Diner may set type explicitly.

What Slice 1 actually did:

- Consumer cannot choose `WALK_IN` vs `WAITLIST` (**follows default**)
- There is **no** `seatingWaitingTime` column and **no** migration (**does not invent the OD’s named config**)
- Proxy used: existing DEC-2 `Subscription.config` path `walkin_waitlist.value`
- Implementation comment and implementation doc still list OD-SEAT-10 as **unresolved**
- Merchant Add Diner / explicit merchant type on the consumer path was **not** added

The remaining OD is whether a restaurant wait-time field should replace this subscription-flag proxy. Code that had to ship chose the documented default without closing that question.

**Classification:** **FOLLOWED EXISTING DEFAULT** / contract-preserving implementation detail. **Not** ACCIDENTALLY RESOLVED. **Not** a defect.

Dead branch: after derive returns `WAITLIST`, a second `waitlistFlag === false` Forbidden check can never fire. Harmless. **IMPROVE** later; do not treat as a gate bypass. When the flag is not `true`, create persists `WALK_IN` without a separate walk-in entitlement check — that **is** the stated otherwise-WALK_IN default, not a new policy.

Seed and e2e both set `walkin_waitlist.value: true`, so the live smoke and the seven e2e creates persist `WAITLIST`. The `WALK_IN` branch is untested (see §10).

---

# 8. Owner Decision Audit

Do not mark an OD resolved merely because code has behavior. Slice 1 used §21.2 defaults. The implementation record still lists all twelve as unresolved. This audit agrees.

| OD | Status after Slice 1 | Evidence | Was it intentionally resolved? |
|---|---|---|---|
| **OD-SEAT-1** geo | **FOLLOWED EXISTING DEFAULT** | Create DTO has no coordinates. No geolib / radius / maps in `apps/api/src/modules/seating/**` or consumer diner screens | No. Default “no hard geofence” used. Still unresolved whether geo should be required later |
| **OD-SEAT-2** NOTSEATED / no-show | **FOLLOWED EXISTING DEFAULT** | No cron, no `setTimeout`, no no-show helper in seating module. `NOT_SEATED` stays until merchant seat/complete or consumer cancel | No. Default “no NOTSEATED auto-cancel” used. PENDING timeout also not shipped (L4 deferred cron) |
| **OD-SEAT-3** reservation blocks | **FOLLOWED EXISTING DEFAULT** | `ReservationBlock` model exists from foundation; Slice 1 does not read or enforce it. No availability/slot route | No |
| **OD-SEAT-4** guest OTP | **FOLLOWED EXISTING DEFAULT** | `JwtConsumerGuard` on all consumer diner routes. Book a Table redirects anonymous users to login. No OTP / guest create | No. Signed-in first. Guest OTP still later |
| **OD-SEAT-5** INITIAL | **FOLLOWED EXISTING DEFAULT** | Enum and writes never include `INITIAL` | No |
| **OD-SEAT-6** `seat[]` | **FOLLOWED EXISTING DEFAULT** | No seat array on schema or API | No |
| **OD-SEAT-7** order link | **FOLLOWED EXISTING DEFAULT** | `SeatingRequest` has no `orderId` / `cross_ref_id`. No Order writes in seating module | No |
| **OD-SEAT-8** Super Admin host stand | **FOLLOWED EXISTING DEFAULT** | No admin diner UI; merchant screen redirects Super Admin. API still uses existing SA restaurant-target short-circuit (see §6.3) | No. Host stand not implemented. SA API capability remains the pre-existing architecture, not a new stand |
| **OD-SEAT-9** notifications / sockets | **FOLLOWED EXISTING DEFAULT** | No seating notification/socket/SMS code. Seed still has unrelated `ORDER_CONFIRMED` template | No |
| **OD-SEAT-10** server-derived walk-in vs waitlist | **FOLLOWED EXISTING DEFAULT** | Server derives via `walkin_waitlist.value` proxy; no `seatingWaitingTime` column; OD still listed unresolved in implementation doc | **No.** See §7. Not accidentally resolved |
| **OD-SEAT-11** `wait_time` | **FOLLOWED EXISTING DEFAULT** | No `wait_time` column, no ETA field, no accept-time quote | No |
| **OD-SEAT-12** Book a Table entry | **FOLLOWED EXISTING DEFAULT** | Single restaurant “Book a Table” link; one form; SEATING vs RESERVATION intent; walk-in/waitlist not a second consumer product | No. Preserves V2 label. Type still depends on unresolved OD-SEAT-10 proxy |

No OD is **ACCIDENTALLY RESOLVED**. None is **PARTIALLY RESOLVED** in the sense of closing the owner question. All twelve remain **REQUIRES OWNER DECISION** for any behavior beyond the forced-ship default.

---

# 9. Scope-Deviation Audit

Searched Slice 1 seating module, diner screens, and `1d969d8..d260804` file list.

| Deferred / forbidden feature | Present in Slice 1? | Notes |
|---|---|---|
| PENDING timeout | No | |
| Cron / `setTimeout` diner reject | No | |
| No-show / NOTSEATED enforcement | No | |
| Reservation-block enforcement | No | Model unused |
| Geo / maps | No | |
| Guest OTP | No | |
| QR | No | |
| Quick Seat | No | |
| Notifications / sockets | No | |
| ETA / `wait_time` | No | |
| Order / Experience / Event linkage | No | |
| Payments / food ordering / delivery | No | |
| Advanced waitlist | No | Type only |
| Table reflow / AI / OpenTable optimization | No | Manual table pick |
| Stage H / Stage K / J remainder | No | |
| Hidden availability/slot engine | No | |
| Second booking entity | No | |
| Prisma migration / schema edit | No | Seed fixtures only |
| Super Admin host stand | No | UI redirect away |

**No unapproved feature was accidentally implemented.**

Merchant **reject** appears in L4 §22 include and the gap-matrix smallest-slice list. The approved Slice 1 implementation task and the shipped HTTP explicitly excluded it. **DEFERRED CORRECTLY** for this slice; not a silent drop of a shipped route.

---

# 10. Test Coverage Audit

File: `apps/api/test/stage-116-dining-reservations-runtime.e2e-spec.ts`  
Seven HTTP cases. This audit does **not** treat “7 passed” as proof. Coverage below is from reading the assertions.

## Proven

- Authenticated consumer create (`intent=SEATING`) → `PENDING`, `tableId=null`, `type=WAITLIST` (because fixture sets `walkin_waitlist.value=true`)
- Consumer list contains only the created row; get by id
- Consumer cancel PENDING → `CANCELLED`, `canCancel=false`
- Unauthenticated create 401
- Cross-user get/cancel 404; owner row stays `PENDING`
- Client `type` / `status` / `merchantId` / `userId` / `tableId` → 400
- Merchant cannot seat/complete from PENDING; must accept first
- Accept → `NOT_SEATED`; repeat accept 400
- Seat in-scope AVAILABLE table → `SEATED`, table `OCCUPIED`
- Complete → `COMPLETED`, table `DIRTY`; repeat complete 400; consumer cancel after complete 400
- Cross-merchant list/accept 403; unauthenticated merchant 401; consumer JWT on merchant accept 401
- Owner listing another merchant’s `restaurantId` 403
- Out-of-restaurant table 400; occupied table 409; sequential second seat on same table 409
- Concurrent double-seat: statuses `{200,409}`, one `SEATED`, table `OCCUPIED`

## Partially proven

- Walk-in/waitlist derivation: only the `WAITLIST` side (flag true). Client cannot *send* `WALK_IN`, but server `WALK_IN` persist is untested
- Consumer ownership of list: one-user happy path only (no second user’s row injected into the same list)
- `canCancel` true/false around PENDING cancel only (not around NOT_SEATED)
- Merchant list filter by `status=PENDING` (other statuses implicit via later actions)
- Table active flag (`isActive=false`) not asserted (only OCCUPIED and foreign restaurant)

## Untested (important contract behavior)

- `intent=RESERVATION` + required `reservationAt`
- Invalid / missing `reservationAt` on RESERVATION
- Reservation is **not** stored as `WALK_IN`/`WAITLIST`
- `walkin_waitlist.value !== true` → persist `WALK_IN`
- `isSeatingEnabled` false / reservation flag false → 403
- Same-day second active `WALK_IN`/`WAITLIST` → 409
- Consumer cancel from `NOT_SEATED`
- SUPER_ADMIN diner API
- Merchant reject (not implemented — correctly absent)
- Merchant complete without a bound table (possible if foundation wrote `SEATED` with null table)
- Concurrent same-day create race
- Inactive table (`isActive=false`) 409

Do not add tests in this audit.

---

# 11. Documentation Audit

| Source | Claim | Reality | Classification |
|---|---|---|---|
| 116 reconciliation L4 §9.4 | Proposed `/seating/requests` | Shipped `/diner` and `/merchant/diner` per L1 + approved GO | **DOCUMENTATION GAP** in L4 naming vs GO; implementation followed GO. Do not rewrite forensic in this task |
| 116 §22 include | Staff reject; transactional same-day create | Reject not shipped; same-day check exists but is not transactional | Reject = **DEFERRED CORRECTLY** for Slice 1 GO. Same-day = **IMPLEMENTATION GAP** vs L4 §9.6 |
| 116 implementation §Final HEAD | `916be13` | Branch HEAD `d260804` (docs-only stamp of the same record) | **DOCUMENTATION GAP** |
| 116 implementation §12 | OD-SEAT-1..12 unresolved; OD-SEAT-10 proxy described | Matches code | **MATCH** |
| 116 implementation §5 | Foundation `updateSeatingRequest` unconstrained | True; not on Slice 1 HTTP | **MATCH** |
| 116 implementation §8 | Lists the seven e2e themes | Accurate; overstates proof of reservation/WALK_IN (those are not in the file) | **DOCUMENTATION GAP** (test inventory vs implied completeness) |
| Gap matrix `ownerDecisionsUnresolved` | All OD-SEAT-1..12 | Still correct after Slice 1 | **MATCH** |
| Gap matrix smallest-slice include | Includes reject + transactional guards | Slice 1 GO narrowed reject out; table guard is transactional; same-day is not | Same as above |

Forensic reconciliation documents were **not** rewritten.

---

# 12. Findings

| ID | Finding | Class | Do now? |
|---|---|---|---|
| F-1 | Slice 1 HTTP, UI, types, and table lock match the approved Stage 116 Slice 1 contract | **PRESERVE** | No change |
| F-2 | Server-derived WAITLIST/WALK_IN via `walkin_waitlist.value` follows OD-SEAT-10 default without closing the OD | **PRESERVE** | Do not change; do not mark OD resolved |
| F-3 | No schema/migration; existing `SeatingRequest` is sufficient | **PRESERVE** | No change |
| F-4 | Deferred remainder (cron, geo, OTP, blocks, notifications, reject, slots, Super Admin stand, Stage H/K) stayed out | **FUTURE** | Do not implement from this audit |
| F-5 | Same-day active seating uniqueness is not inside one transaction | **IMPROVE** | Do not fix in this audit |
| F-6 | Dead `waitlistFlag === false` branch after derive | **IMPROVE** | Do not fix in this audit |
| F-7 | Stage 116 e2e does not prove RESERVATION, WALK_IN, seating-disabled, or same-day 409 | **IMPROVE** | Do not add tests in this audit |
| F-8 | Implementation-doc Final HEAD / implied test completeness | **IMPROVE** | Docs-only later; not this file’s rewrite of the implementation record |
| F-9 | Foundation `updateSeatingRequest` still skips the Slice 1 graph (service-only) | **PRESERVE** (doc 45 residual) | Do not “fix” by inventing a second machine |
| F-10 | L4 §9.4 path names vs shipped `/diner` | **PRESERVE** implementation; forensic naming leftover | Do not silently “correct” L4 in this task |
| F-11 | OD-SEAT-1..12 remain owner questions | **OWNER DECISION** | Do not resolve in code |
| F-12 | SUPER_ADMIN can call merchant diner API as platform restaurant target | **OWNER DECISION** (OD-SEAT-8) / existing architecture | Do not change |

No **CORRECT** finding requires an emergency production patch from this audit. Isolation, reservation-vs-seating split, and table double-assign are not broken.

---

# 13. Slice 2 Readiness

**OWNER DECISION REQUIRED**

Slice 1 is stable enough that this audit can stop. Slice 2 is the deferred remainder (reject, timers, blocks, notifications, geo, guest OTP, wait-time, Super Admin stand, and any replacement of the OD-SEAT-10 proxy). Those items are still owner decisions. This audit must not define Slice 2.

Blockers to *implementing* Slice 2 from here:

- OD-SEAT-1..12 remain unresolved beyond forced-ship defaults
- No written Slice 2 GO
- Optional Slice 1 gaps (F-5, F-7) are not Slice 2 features and must not be used as a vehicle to expand dining

---

# 14. Recommended Next Action

Owner reviews this audit and issues a written decision on whether the two Slice 1 gaps (transactional same-day create, and e2e proof of `RESERVATION` / `WALK_IN` / gate 403) must be closed before any Slice 2 design; do not start Slice 2 from this audit.

---

# Appendix A — Traceability of major Slice 1 behaviors

| Behavior | Legacy evidence | Stage 116 | Target architecture | Implementation choice | Owner decision |
|---|---|---|---|---|---|
| Unified `SeatingRequest` | Legacy `Diner` | L4 §9.1 PRESERVE | 02-DOMAIN-BOUNDARIES CORE dining | Reuse P1.7.16 model | DEC-2 / unified diner already resolved |
| Consumer `POST /diner` | L1 live `/diner` | §10 / approved GO | Extend seating module | Path `/diner` not proposed `/seating/requests` | — |
| Intent SEATING vs RESERVATION | `service_type` | L4 + OD-SEAT-12 | One consumer entry | DTO `intent` | OD-SEAT-12 default |
| Server type derive | Legacy `isWalkIn` + wait config | OD-SEAT-10 default | DEC-2 config | `walkin_waitlist.value` proxy | OD-SEAT-10 still open |
| `reservationAt` required | Legacy reservation time | L4 §9.7 / §22 | Existing column | ISO parse only; no future-date rule | — |
| PENDING first | Legacy create | L4 §9.2 | Existing default | Always PENDING | — |
| Accept / seat / complete | Legacy merchant PATCH | L4 §9.2 | Docs 44/45 occupancy | Dedicated CAS methods | — |
| Consumer cancel | Legacy `PATCH /user/diner` | L4 §9.2 | — | Own-row CAS | — |
| No table at create | Legacy + 45 | L4 §9.3 | — | `tableId=null` | Already resolved |
| Table lock + OCCUPIED/DIRTY | Legacy table status | L4 §9.3 + 45 deferred auto-sync | `RestaurantTable.status` | Slice 1 ships seat/complete sync only | — |
| JWT consumer / staff scope | Target auth (not Alexa bypass) | L4 §9.5 CORRECT | Existing guards | Service-level scope | OD-SEAT-4 / OD-SEAT-8 defaults |
| Subscription gates on create | Legacy subscription flags | L4 §9.5 / DEC-2 | Existing `SubscriptionConfigService` | `isSeatingEnabled` + reservation flag | — |
| No cron / geo / OTP / blocks | Mixed live vs dead legacy | L4 exclude + ODs | — | Omitted | OD-SEAT-1,2,3,4,9 |
| Seed T1/T2 + seating subscription | N/A | Seed fixtures allowed | — | Dev/test only | — |

No generic industry host-stand behavior was used as proof of amealio legacy behavior.

---

# Appendix B — Database

| Check | Result |
|---|---|
| Slice 1 migration | **None** |
| `schema.prisma` in Slice 1 commits | **Unchanged** |
| Existing models sufficient | Yes: `SeatingRequest`, `SeatingType`, `SeatingStatus`, `RestaurantTable.status`, `Subscription.config` |
| Hidden production semantic mutation | **No** |
| Seed | Consumer password, SEATING subscription gates, Main Hall `T1`/`T2` upserts — fixtures only |

`ReservationBlock` remains unused. No `wait_time` / `seatingWaitingTime` / `isWalkIn` / `orderId` columns were added.
