import type { Staff } from './api';

const ACCESS_KEY = 'amealio.staff.accessToken';
const REFRESH_KEY = 'amealio.staff.refreshToken';
const STAFF_KEY = 'amealio.staff.profile';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function getStaff(): Staff | null {
  const raw = sessionStorage.getItem(STAFF_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Staff;
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event('amealio-staff-session'));
}

export function setSession(accessToken: string, refreshToken: string, staff?: Staff | null): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
  if (staff) sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff));
  notify();
}

export function setStaff(staff: Staff): void {
  sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff));
  notify();
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(STAFF_KEY);
  notify();
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function isSuperAdmin(): boolean {
  const staff = getStaff();
  return staff?.staffRole === 'SUPER_ADMIN' && staff.merchantId === null;
}

export function isMerchantStaff(): boolean {
  const staff = getStaff();
  return (
    (staff?.staffRole === 'MERCHANT_OWNER' || staff?.staffRole === 'MERCHANT_STAFF') &&
    Boolean(staff.merchantId)
  );
}
