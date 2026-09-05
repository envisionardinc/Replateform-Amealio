const ACCESS_KEY = 'amealio.staff.accessToken';
const REFRESH_KEY = 'amealio.staff.refreshToken';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

function notify() {
  window.dispatchEvent(new Event('amealio-staff-session'));
}

export function setSession(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
  notify();
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  notify();
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}
