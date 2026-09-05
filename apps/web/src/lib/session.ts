const ACCESS_KEY = 'amealio.accessToken';
const REFRESH_KEY = 'amealio.refreshToken';
const CHECKOUT_KEY = 'amealio.checkoutIdempotencyKey';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

function notifySession() {
  window.dispatchEvent(new Event('amealio-session'));
}

export function setSession(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
  notifySession();
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  notifySession();
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ck-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Persist one checkout key so a retry does not create a second order. */
export function getOrCreateCheckoutKey(): string {
  const existing = sessionStorage.getItem(CHECKOUT_KEY);
  if (existing) return existing;
  const next = newIdempotencyKey();
  sessionStorage.setItem(CHECKOUT_KEY, next);
  return next;
}

export function clearCheckoutKey(): void {
  sessionStorage.removeItem(CHECKOUT_KEY);
}
