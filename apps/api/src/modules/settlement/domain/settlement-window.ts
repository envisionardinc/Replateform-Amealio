/**
 * Deferred-settlement window (P1.7.32) — pure, no I/O.
 *
 * Reconciled from legacy source (doc 61): a payment becomes settleable at
 * `moment(capturedAt).endOf('day').add(N, 'days')` — i.e. **end-of-day of the
 * capture day plus N calendar days**, in **Asia/Kolkata (IST, UTC+05:30)**
 * (`process.env.TZ='Asia/Kolkata'` + bare moment). N defaults to 2 (VERIFIED).
 *
 * The target deliberately anchors on the **payment capture** instant (an
 * authoritative financial event), not legacy's order-creation instant (technical
 * debt — settleAfter set before payment). No business-day/holiday logic (legacy
 * has none). IST has no DST, so a fixed +05:30 offset is exact.
 */

const IST_OFFSET_MS = 330 * 60_000; // +05:30, no DST

/**
 * The instant at/after which a payment captured at `capturedAt` is settleable:
 * 23:59:59.999 IST of `(IST calendar day of capturedAt) + delayDays`, as a UTC
 * instant. Server-derived only — never client-supplied.
 */
export function computeSettleAfter(capturedAt: Date, delayDays: number): Date {
  const days = Number.isInteger(delayDays) && delayDays >= 0 ? delayDays : 2;
  // IST civil day of capturedAt (read civil fields via the UTC getters after shift).
  const ist = new Date(capturedAt.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  // Start of IST civil day (d + days + 1), as UTC-ms, then back to a UTC instant,
  // minus 1ms = 23:59:59.999 IST of day (d + days). Date.UTC normalizes overflow.
  const nextDayStartCivil = Date.UTC(y, m, d + days + 1);
  return new Date(nextDayStartCivil - IST_OFFSET_MS - 1);
}

/** Whether a payment captured at `capturedAt` is settleable as of `asOf`. */
export function isSettleable(capturedAt: Date, delayDays: number, asOf: Date): boolean {
  return asOf.getTime() >= computeSettleAfter(capturedAt, delayDays).getTime();
}
