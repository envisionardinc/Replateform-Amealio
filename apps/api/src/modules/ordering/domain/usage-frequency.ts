/**
 * Offer usage-frequency period windows (P1.7.26B).
 *
 * Reconciled from legacy source (doc 55 / P1.7.26A): `useLimit`/`useFrequency`
 * cap a single user's redemptions within the CURRENT calendar period, where the
 * period boundaries are computed in **Asia/Kolkata (IST, UTC+05:30)** — the legacy
 * process pins `process.env.TZ="Asia/Kolkata"` and uses bare `moment().startOf/
 * endOf(unit)`. WEEKLY weeks are **Sunday→Saturday** (moment default `en` locale).
 *
 * These are PURE functions over an instant (`now`). IST has no DST, so a fixed
 * +05:30 offset is exact. The DB stores `CouponRedemption.createdAt` in UTC, so
 * the returned boundaries are absolute UTC instants; the interval is half-open
 * `[start, endExclusive)` (semantically identical to an inclusive calendar period).
 */

export type UsageFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface UsagePeriodWindow {
  /** Inclusive start of the current IST calendar period, as a UTC instant. */
  start: Date;
  /** Exclusive start of the next IST calendar period, as a UTC instant. */
  endExclusive: Date;
}

const IST_OFFSET_MS = 330 * 60_000; // +05:30, no DST

function isUsageFrequency(value: string): value is UsageFrequency {
  return value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY' || value === 'YEARLY';
}

/**
 * The current IST calendar period for `frequency` containing `now`, returned as a
 * half-open UTC interval. Returns null for an unrecognized frequency (caller then
 * skips enforcement rather than inventing a window).
 *
 * DAILY   → IST 00:00:00 today            .. IST 00:00:00 tomorrow
 * WEEKLY  → IST 00:00:00 Sunday           .. IST 00:00:00 next Sunday
 * MONTHLY → IST 00:00:00 1st of month     .. IST 00:00:00 1st of next month
 * YEARLY  → IST 00:00:00 Jan 1            .. IST 00:00:00 Jan 1 next year
 */
export function istUsagePeriodWindow(frequency: string, now: Date): UsagePeriodWindow | null {
  const freq = frequency.toUpperCase();
  if (!isUsageFrequency(freq)) return null;

  // Shift the instant into IST civil time; read civil fields via the UTC getters.
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth(); // 0-11
  const d = ist.getUTCDate();
  const dow = ist.getUTCDay(); // 0=Sunday .. 6=Saturday (IST civil weekday)

  // Civil boundaries expressed as UTC-ms (as if the IST wall-clock were UTC), then
  // converted back to absolute UTC instants by subtracting the IST offset. Date.UTC
  // normalizes day/month overflow (negative or beyond month length).
  const window = (startCivil: number, endCivil: number): UsagePeriodWindow => ({
    start: new Date(startCivil - IST_OFFSET_MS),
    endExclusive: new Date(endCivil - IST_OFFSET_MS),
  });

  switch (freq) {
    case 'DAILY':
      return window(Date.UTC(y, m, d), Date.UTC(y, m, d + 1));
    case 'WEEKLY': // Sunday-start (dow 0), Saturday-end
      return window(Date.UTC(y, m, d - dow), Date.UTC(y, m, d - dow + 7));
    case 'MONTHLY':
      return window(Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1));
    case 'YEARLY':
      return window(Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1));
  }
}
