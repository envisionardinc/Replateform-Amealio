# 116 — Dining / Reservations Runtime Slice 1 — Closure Audit

**Status:** READ-ONLY decision audit. No production, test, Prisma, or existing Stage 116 documents were modified.  
**Date:** 2026-09-05  
**Purpose:** Determine whether hardened Slice 1 is closed and whether a future Slice 2 is actually ready.  
**Does not:** implement Slice 2, resolve OD-SEAT-1..12, or redesign dining.

Governing sources: [00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md), [116-DINING-RESERVATIONS-RECONCILIATION.md](./116-DINING-RESERVATIONS-RECONCILIATION.md), [116-DINING-RESERVATIONS-GAP-MATRIX.json](./116-DINING-RESERVATIONS-GAP-MATRIX.json), [116-DINING-RESERVATIONS-IMPLEMENTATION.md](./116-DINING-RESERVATIONS-IMPLEMENTATION.md), [116-DINING-RESERVATIONS-POST-IMPLEMENTATION-AUDIT.md](./116-DINING-RESERVATIONS-POST-IMPLEMENTATION-AUDIT.md), [44-SEATING-TABLE-SETUP-RECONCILIATION.md](./44-SEATING-TABLE-SETUP-RECONCILIATION.md), [45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md](./45-SEATING-CONFIGURATION-REQUEST-FOUNDATION.md).

---

# 1. Audit Metadata

| Field | Value |
|---|---|
| Repository | `envisionardinc/replateform-amealio` (`Replateform-Amealio`) |
| Branch | `replatform/backend-consolidation` |
| Expected HEAD | `ec0730e108fb81f5aece4b4b3885beeba8d185ae` |
| Starting HEAD | `ec0730e108fb81f5aece4b4b3885beeba8d185ae` |
| Audited HEAD | `ec0730e108fb81f5aece4b4b3885beeba8d185ae` |
| Working tree at audit start | Clean |
| Branch / HEAD material difference | **None.** Audit proceeded. |

Hardening sequence after the post-implementation audit (`f0b744e`):

| SHA | Role |
|---|---|
| `105f0f0` | Atomic same-day create + focused e2e |
| `fbca3a8` | Cast advisory-lock result for Prisma |
| `e919e1f` | Implementation-doc hardening record |
| `ec0730e` | One-line Final HEAD stamp (`fbca3a8` → `e919e1f`) |

`prisma/schema.prisma` and `prisma/migrations/**` are unchanged across this sequence.

---

# 2. Final Verdict

**CLOSED WITH DOCUMENTATION GAP**

Slice 1 runtime is closed against the approved Stage 116 GO. Consumer create/track/cancel, merchant accept/seat/complete, server-derived types, `reservationAt`, subscription create-gates, tenant isolation, table lock+CAS, and same-day `WALK_IN`/`WAITLIST` atomicity are present in code and proven by `stage-116-dining-reservations-runtime.e2e-spec.ts` (13 cases at HEAD). No Prisma migration. No second booking engine. OD-SEAT-1..12 remain unresolved and were not silently closed. Slice 2 was not started.

The residual is documentation, not a contract failure:

1. Implementation-doc **Final HEAD** is `e919e1f` (hardening write-up). Branch tip is `ec0730e`, a stamp that only retargeted that field. Production code did not change after `fbca3a8`.
2. The post-implementation audit at `f0b744e` is a correct **pre-hardening** record. It still describes the check-then-write race as a live gap. Readers must not treat it as current atomicity state.
3. L4 §9.4 still proposes `/api/v1/seating/requests`. Approved Slice 1 shipped `/diner` per L1/GO. That leftover naming is unchanged and was not rewritten in this audit.

None of these reopen Slice 1 implementation.

Not **CLOSED** (unqualified): the SHA/audit-era mismatch can mislead a later reader.  
Not **NOT CLOSED**: no remaining Slice 1 runtime defect, auth hole, or unapproved feature was found at HEAD.

---

# 3. Slice 1 Contract Verification

| Capability | Expected (approved Slice 1 GO + L4 as narrowed) | Actual at `ec0730e` | Verdict |
|---|---|---|---|
| Consumer create | JWT `POST /api/v1/diner`; `intent` SEATING/RESERVATION; server sets `userId`, `type`, `PENDING`, `tableId=null` | `ConsumerDinerController` + `createConsumerRequest` | **CLOSED** |
| Consumer ownership | `userId` from JWT; list/get/cancel own only | `listMine` / `getMine` 404 / `cancelOwnRequest` re-checks `userId` | **CLOSED** |
| Consumer tracking | Get + list own rows; show type, status, `reservationAt`, bound table code | Serializer + `/diner`, `/diner/:id` | **CLOSED** |
| Consumer cancellation | PENDING or NOT_SEATED → CANCELLED | CAS + optional table release | **CLOSED** |
| Merchant pending/active | Staff list by restaurant (+ optional status) | `GET /merchant/diner?restaurantId=` + UI Active/History | **CLOSED** |
| Merchant accept | PENDING → NOT_SEATED | CAS `transitionRequest`; `confirmedAt` set | **CLOSED** |
| Merchant seat | NOT_SEATED + available in-scope table → SEATED | `seatRequestOnTable` lock+CAS | **CLOSED** |
| Merchant complete | SEATED → COMPLETED | `completeSeatedRequest`; table OCCUPIED → DIRTY | **CLOSED** |
| `reservationAt` | Required for RESERVATION; not a walk-in | Service 400 if missing; persisted on RESERVATION only | **CLOSED** |
| WALK_IN | SEATING + `walkin_waitlist.value !== true` | `deriveWalkInOrWaitlist` | **CLOSED** |
| WAITLIST | SEATING + `walkin_waitlist.value === true` | Same | **CLOSED** |
| Server-derived type | Client cannot choose WALK_IN vs WAITLIST | DTO has `intent` only; `type` forbidden by whitelist | **CLOSED** |
| State transitions | No skip-ahead; repeats rejected | Service pre-check + CAS | **CLOSED** |
| Table assignment | Bind at seat; same restaurant; active; AVAILABLE | Seat transaction | **CLOSED** |
| Table concurrency | At most one successful concurrent seat | `FOR UPDATE` + CAS; e2e `{200,409}` | **CLOSED** |
| Same-day uniqueness | Active WALK_IN/WAITLIST per user+restaurant+local day, transactional | Advisory xact lock + re-read + insert; RESERVATION excluded | **CLOSED** |
| Subscription gate | `isSeatingEnabled` (+ reservation flag) on create | Create 403; no new policy table | **CLOSED** |
| Merchant isolation | `MerchantScopeService`; no body `merchantId` grant | Restaurant loaded then asserted | **CLOSED** |
| UI action validity | Only legal actions rendered | Consumer `canCancel`; merchant status-gated buttons | **CLOSED** |
| Regression | A–G / I / J / 115 / orders / seating foundation | Implementation record: 104/104 on requested suites after hardening. This closure audit did not re-run them | **CLOSED** (evidence from hardening HEAD `fbca3a8`; no later code change) |
| Merchant reject | L4 §22 listed; Slice 1 GO excluded | No HTTP reject | **DEFERRED CORRECTLY** (not a Slice 1 closer) |
| Auto-accept / cron | L4 deferred | Absent | **DEFERRED CORRECTLY** |

---

# 4. Atomicity Verification

`SeatingRepository.createWalkInOrWaitlistIfNoActiveSameDay`:

1. `this.prisma.$transaction(async (tx) => { ... })` — one transaction.
2. Lock: `SELECT pg_advisory_xact_lock(hashtext($key))::text` on `tx`. **`pg_advisory_xact_lock` is transaction-scoped** and released on commit or rollback.
3. Key: `seating-same-day:${userId}:${restaurantId}:${localDateKey(now, restaurantTimezone)}`. Scoped to the L4 §9.6 invariant (user + restaurant + local day). `hashtext` collisions only extra-serialize unrelated keys; they do not weaken the re-read.
4. After lock: `findActiveSeatingSameLocalDayOn(tx, …)` — 36h lookback, types `WALK_IN`/`WAITLIST`, statuses `PENDING`/`NOT_SEATED`/`SEATED`, then filter to restaurant-local today.
5. If any row: `ConflictException` → HTTP **409**, same message as before. Insert does not run. Transaction rolls back.
6. Else: `tx.seatingRequest.create` **while the lock is held**.
7. Return ends the callback; Prisma commits; lock releases.

`createConsumerRequest` calls this **only** when derived `type` is `WALK_IN` or `WAITLIST`. `RESERVATION` uses `createRequest` and is not under this uniqueness rule. Sequential e2e creates a WAITLIST, then a RESERVATION (201), then a second SEATING (409).

This closes the pre-hardening check-then-write race. It is not a new booking engine and not a unique index / migration.

---

# 5. Type Derivation Verification

HTTP DTO `CreateDinerDto.intent`: `'SEATING' | 'RESERVATION'` only. No `type`, `isWalkIn`, `WALK_IN`, or `WAITLIST` field. Global `ValidationPipe` `{ whitelist: true, forbidNonWhitelisted: true }` rejects those extras (400).

| Consumer sends | Gate | Persisted `SeatingRequest.type` |
|---|---|---|
| `intent=SEATING` and `casual_dining_status.seating.walkin_waitlist.value === true` | seating enabled | `WAITLIST` |
| `intent=SEATING` and flag false or absent | seating enabled | `WALK_IN` |
| `intent=RESERVATION` + valid `reservationAt` | seating enabled; reservation flag not `false` | `RESERVATION` |

`deriveWalkInOrWaitlist` is the only consumer type chooser. The dead `waitlistFlag === false` branch after derive returns `WAITLIST` cannot fire (`WAITLIST` is only returned when that flag is already `true`). Harmless. Not a bypass.

This **follows the Stage 116 Slice 1 default** (OD-SEAT-10 forced-ship: server derives; OD-SEAT-12: one Book a Table entry). It **does not resolve OD-SEAT-10**. There is still no `seatingWaitingTime` column; the proxy remains `Subscription.config` `walkin_waitlist.value`. Implementation comments and the implementation doc still list the OD unresolved.

Client cannot force `type=WALK_IN`, `type=WAITLIST`, or `type=RESERVATION`. Persistence of `RESERVATION` comes from `intent`, not a client `type` field.

---

# 6. State Machine Verification

Slice 1 HTTP graph (unchanged by hardening):

```
create → PENDING
merchant accept → NOT_SEATED          (from PENDING only; + confirmedAt)
merchant seat + table → SEATED       (from NOT_SEATED only)
merchant complete → COMPLETED        (from SEATED only)
consumer cancel → CANCELLED          (from PENDING or NOT_SEATED only)
```

| Check | Behavior |
|---|---|
| Skip-ahead | PENDING → seat/complete 400; NOT_SEATED → complete 400 |
| Invalid repeats | Second accept/complete: CAS miss → 400 |
| Terminal mutation | COMPLETED/CANCELLED cancel 400; complete after complete 400 |
| Consumer escalation | No accept/seat/complete routes; consumer JWT on merchant routes 401 |
| Merchant escalation | Cannot skip required states via Slice 1 HTTP |
| REJECTED | Enum exists; Slice 1 never writes it |
| Timeout / no-show | No cron, no `setTimeout`, no NOTSEATED automation |
| INITIAL | Never written |

Foundation `updateSeatingRequest` still does not enforce this graph. It is **not** mounted on Slice 1 controllers (`SeatingModule` registers only diner controllers). Residual of doc 45; not a Slice 1 HTTP bypass.

---

# 7. Table Lifecycle Verification

Compatible with foundation doc 45: occupancy stays on `RestaurantTable.status`; booking stays on `SeatingRequest.status`; bind at seat, not create.

Seat (`seatRequestOnTable`), one transaction:

1. `SELECT … RestaurantTable JOIN SeatingArea FOR UPDATE OF t`
2. Same `restaurantId`; not deleted; `isActive`; `status=AVAILABLE`
3. Lock other non-terminal requests on that `tableId`; reject if present
4. Lock diner; require `NOT_SEATED`
5. CAS request `NOT_SEATED → SEATED` + `tableId`
6. CAS table `AVAILABLE → OCCUPIED`

Complete: lock request; `SEATED → COMPLETED`; if `tableId`, `OCCUPIED → DIRTY`.  
Accept does not bind a table and does not set `ON_HOLD` (doc 45 / L4: full auto-sync still deferred).  
Consumer cancel of a bound PENDING/NOT_SEATED row: `ON_HOLD|OCCUPIED → AVAILABLE`.

Concurrent seat e2e: `{200, 409}`, one `SEATED`, one `OCCUPIED`. Real lock+CAS.

This is Slice 1 seat/complete sync only. It does not invent the rest of the deferred 45 auto-sync matrix.

---

# 8. Authorization Verification

**Consumer**

- Class `JwtConsumerGuard`
- `userId` from `principal.userId` only
- List: `listRequestsByUser(userId)`
- Get/cancel other user: 404; cancel lock also requires `userId`
- Proven by e2e

**Merchant**

- `JwtStaffGuard` + `StaffAuthorizationGuard` + `@RequireStaffRoles('MERCHANT_OWNER','MERCHANT_STAFF')`
- Isolation is **service-level**: every list/get/accept/seat/complete calls `assertRestaurant` → `MerchantScopeService.assertRestaurantInScope`
- Restaurant ownership resolved from the Restaurant row, never from body `merchantId`
- List requires query `restaurantId` (DTO UUID). Missing query → 400 validation, not an escape
- Cross-merchant list/accept 403; unauthenticated 401; consumer JWT 401
- Proven by e2e

**SUPER_ADMIN**

- Existing architecture: role/permission short-circuit; `assertRestaurantInScope` allows any restaurant as an explicit platform target
- Matches L4 “platform-scoped explicit restaurant target — not a silent merchant”
- No Super Admin host-stand UI (`DinerQueueScreen` redirects Super Admin away)
- OD-SEAT-8 default followed; OD not resolved
- Diner API as SUPER_ADMIN is **untested** (not a Slice 1 closer; known architecture)

---

# 9. Subscription Gate Verification

Existing DEC-2 `Subscription.config` only. No new policy object.

| Gate | Path | Where | HTTP | Alternate route? |
|---|---|---|---|---|
| Seating enabled | `casual_dining_status.seating.value === true` via `isSeatingEnabled` | Consumer create only | 403 | Staff foundation `createSeatingRequest` still ungated (doc 45; not Slice 1 HTTP) |
| Reservation | `….seating.reservation.value === false` | Consumer create when `intent=RESERVATION` | 403 | No consumer bypass |
| Walk-in/waitlist derive | `….seating.walkin_waitlist.value === true` → WAITLIST else WALK_IN | Consumer create when `intent=SEATING` | n/a (derive) | Client cannot send type |

Merchant accept/seat/complete do **not** re-check gates. L4 §9.5 required gates **on create**. No new subscription behavior.

Seating-disabled 403 + zero rows is proven. Reservation-flag-false 403 is implemented and untested.

---

# 10. UI Verification

**Consumer (`apps/web`)**

Restaurant → Book a Table (`/restaurants/:id/book-a-table`) → `POST /diner` → `/diner/:id` → cancel if `canCancel` → `/diner` list.

- Actions match server: cancel only when `canCancel` (PENDING/NOT_SEATED)
- No table picker, no client `type`/`status`/`tableId`
- Anonymous submit redirects to login
- No guest, OTP, QR, timer, ETA, geo, or notification UI

**Merchant (`apps/merchant`)**

`/diner` → restaurant select → Active (`PENDING`/`NOT_SEATED`/`SEATED`) / History (terminal) → Accept / Seat / Complete.

- Accept only PENDING; Seat only NOT_SEATED; Complete only SEATED
- Seat dropdown: `isActive && AVAILABLE` from scoped `GET /merchant/diner/tables`
- Super Admin redirected to `/global-catalog` (no host stand)
- No QR, Quick Seat, wait quote, or notification UI

Hardening did not change UI. No UI defect from atomicity was found in code review.

---

# 11. Test Evidence

File: `apps/api/test/stage-116-dining-reservations-runtime.e2e-spec.ts` — **13 tests at HEAD**. This audit did not re-execute them; it inspected assertions against the code they call. Hardening run at `fbca3a8` reported 13/13; no test or production change followed.

### Proven

- Authenticated create/list/get/cancel (PENDING)
- Unauthenticated create 401; cross-user get/cancel 404
- Client `type` / `status` / `merchantId` / `userId` / `tableId` → 400
- PENDING → NOT_SEATED → SEATED → COMPLETED; skip-ahead and repeats 400
- Merchant isolation 403/401
- Out-of-scope table 400; occupied table 409; sequential and concurrent double-seat
- RESERVATION requires `reservationAt`; persisted type `RESERVATION`
- SEATING + `walkin_waitlist` false → `WALK_IN`
- SEATING + `walkin_waitlist` true → `WAITLIST`
- Seating disabled → 403 and no row
- Sequential same-day SEATING 409; RESERVATION still allowed
- Concurrent same-day SEATING → `{201, 409}`, one active row

### Partially proven

- Consumer list isolation (single-user happy path; no injected foreign row)
- `canCancel` around PENDING cancel only (NOT_SEATED cancel implemented, not e2e)
- Inactive table (`isActive=false`) not asserted (OCCUPIED and foreign restaurant are)
- Reservation-disabled 403 not asserted (reservation-required 400 is)

### Still untested

- Consumer cancel from `NOT_SEATED`
- SUPER_ADMIN diner API
- `reservation.value === false` → 403
- Complete of `SEATED` with null `tableId` (foundation residual)
- Invalid ISO `reservationAt` (DTO `@IsISO8601` likely blocks before service)

These leftovers do not reopen Slice 1 closure. They are optional follow-up proof, not missing contract.

---

# 12. Documentation Consistency

| Source | Claim | Reality | Assessment |
|---|---|---|---|
| Implementation **Final HEAD** | `e919e1f` | Branch tip `ec0730e` is a one-line stamp retargeting Final HEAD to `e919e1f` | **Historical stamp.** Not stale about behavior. Field is not the git tip. **DOCUMENTATION GAP** |
| Implementation status | IMPLEMENTED + HARDENED; no migration; ODs unresolved | Matches code at `fbca3a8`+ | **Consistent** |
| Implementation test count | 13 Stage 116 cases; 104 regression | Matches hardening log; not re-run in this audit | **Consistent** (era-stamped) |
| Post-implementation audit | Same-day create not transactional; reservation/WALK_IN untested | True at `f0b744e`; **false after `105f0f0`** | **Pre-hardening record.** Labelled as such. Misleading only if read as current |
| Reconciliation L4 §9.4 | Proposed `/seating/requests` | Shipped `/diner` | **Known leftover naming.** Implementation followed GO/L1 |
| Reconciliation §22 include | Staff reject | Not shipped | **Deferred by Slice 1 GO**, not a silent drop of a shipped route |
| Gap matrix ODs | OD-SEAT-1..12 unresolved | Still true | **Consistent** |
| Forensic SHA fields | Older accepted/final HEADs from the forensic-only task | Historical | **Do not treat as Slice 1 HEAD** |

This closure audit does not rewrite those documents.

---

# 13. Owner Decision Matrix

Do not mark an OD resolved because code has a default.

| OD | Current status | Evidence from implementation | Blocks Slice 1 closure? | Blocks future Slice 2? |
|---|---|---|---|---|
| **OD-SEAT-1** geo | **FOLLOWED DEFAULT** / **UNRESOLVED** | No coordinates on DTO; no geolib | No | Only if Slice 2 includes a geofence |
| **OD-SEAT-2** no-show | **FOLLOWED DEFAULT** / **UNRESOLVED** | No cron / NOTSEATED auto-cancel | No | **Yes, if** Slice 2 is a timer/no-show increment |
| **OD-SEAT-3** reservation blocks | **FOLLOWED DEFAULT** / **UNRESOLVED** | `ReservationBlock` unread | No | **Yes, if** Slice 2 is slots/blocks |
| **OD-SEAT-4** guest OTP | **FOLLOWED DEFAULT** / **UNRESOLVED** | JWT only; login redirect | No | Only if guest create is in scope |
| **OD-SEAT-5** INITIAL | **FOLLOWED DEFAULT** / **UNRESOLVED** | Never written | No | No for food-seating Slice 2 (Stage K) |
| **OD-SEAT-6** `seat[]` | **FOLLOWED DEFAULT** / **UNRESOLVED** | No array | No | Only if non-table seats are in scope |
| **OD-SEAT-7** order link | **FOLLOWED DEFAULT** / **UNRESOLVED** | No `orderId` | No | Only if dine-in order attach is in scope |
| **OD-SEAT-8** Super Admin host stand | **FOLLOWED DEFAULT** / **UNRESOLVED** | UI redirect; existing SA restaurant-target API | No | **Yes, if** Slice 2 is admin host-stand |
| **OD-SEAT-9** notifications | **FOLLOWED DEFAULT** / **UNRESOLVED** | No seating notify/socket | No | **Yes, if** Slice 2 is comms |
| **OD-SEAT-10** walk-in vs waitlist | **FOLLOWED DEFAULT** / **UNRESOLVED** | `walkin_waitlist.value` proxy; no `seatingWaitingTime` | No | **Yes, if** Slice 2 replaces the proxy or adds merchant Add Diner type |
| **OD-SEAT-11** `wait_time` | **FOLLOWED DEFAULT** / **UNRESOLVED** | No column; accept without quote | No | **Yes, if** Slice 2 persists wait |
| **OD-SEAT-12** Book a Table | **FOLLOWED DEFAULT** / **UNRESOLVED** | One consumer entry | No | No unless the entry model is reopened |

No OD is **PARTIALLY IMPLEMENTED** in the sense of closing the owner question. All remain **OWNER DECISION REQUIRED** for any behavior beyond the forced-ship default.

---

# 14. Slice 2 Readiness

**OWNER DECISION REQUIRED**

Slice 1 is not a technical blocker. Hardened create uniqueness, types, machine, tables, auth, and gates are in place.

Unresolved ODs do **not** each block a next increment. L4 already specified some leftovers without a new OD (merchant reject; merchant cancel). Timer/no-show, blocks/slots, geo, guest OTP, notifications, wait_time, host stand, and replacing the OD-SEAT-10 proxy **do** require owner answers before they can be implemented.

There is **no written Slice 2 GO** naming which deferred items are next. Implementing “the remainder” as a bundle would invent scope.

| Candidate blocker | Class |
|---|---|
| Remaining Slice 1 runtime defect | **NONE** |
| Schema/migration debt for Slice 1 | **NONE** |
| Same-day / table TOCTOU | **NONE** (closed) |
| Missing 13/13 contract e2e for Slice 1 | **NONE** (inspected; hardening reported pass) |
| Implementation Final HEAD ≠ git tip | **DOCUMENTATION** (does not block a GO) |
| Pre-hardening audit still describing the race | **DOCUMENTATION** (era label; do not treat as current) |
| No Slice 2 GO / selected remainder | **OWNER DECISION** / **BEHAVIORAL** |
| OD-SEAT-2/3/9/10/11 if those features are chosen | **OWNER DECISION** |
| OpenTable / AI / third-party reservation | **NONE** — not amealio target; do not use as next work |

This audit does not design Slice 2.

---

# 15. Recommended Next Action

Owner issues a written Slice 2 GO that names the next deferred increment (if any) and which OD-SEAT items that increment requires; do not start Slice 2 from this closure audit.

---

# Appendix — Scope confirmation

At audited HEAD, Slice 2 was not started. Absent from `apps/api/src/modules/seating/**` and diner screens: cron, timeout, no-show, reservation-block enforcement, geo, maps, guest OTP, QR, Quick Seat, notifications, sockets, ETA, `wait_time`, Order/Experience/Event linkage, payments, food ordering, delivery, advanced waitlist, AI/table reflow, Stage H, Stage K, J remainder.
