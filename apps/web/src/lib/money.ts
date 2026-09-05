/** Server money is minor units as strings (Nest cannot serialize bigint). */
export function formatMinor(minor: string | number | null | undefined, currency = 'INR'): string {
  const n = Number(minor ?? 0);
  if (!Number.isFinite(n)) return `${currency} —`;
  const major = n / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}
