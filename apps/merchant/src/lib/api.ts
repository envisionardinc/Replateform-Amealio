import { clearSession, getAccessToken, getRefreshToken, setSession } from './session';

export const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
    if (Array.isArray(rec.message) && rec.message.length) return String(rec.message[0]);
    if (typeof rec.error === 'string' && rec.error.trim()) return rec.error;
  }
  return fallback;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function refreshAccess(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${apiBase}/api/v1/auth/staff/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const body = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!body.accessToken || !body.refreshToken) {
    clearSession();
    return false;
  }
  setSession(body.accessToken, body.refreshToken);
  return true;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  opts: { retryOn401?: boolean; token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = opts.token ?? getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (res.status === 401 && opts.retryOn401 !== false && !opts.token && getRefreshToken()) {
    const ok = await refreshAccess();
    if (ok) return api<T>(path, init, { retryOn401: false });
  }
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(messageFromBody(body, res.statusText || 'Request failed'), res.status, body);
  }
  return body as T;
}

export type Staff = {
  id: string;
  name: string;
  email: string | null;
  merchantId: string | null;
  staffRole: string;
};

export type StaffAuth = {
  accessToken: string;
  refreshToken: string;
  staff: Staff;
};

export type MerchantOrder = {
  id: string;
  orderNumber: string | null;
  restaurantId: string;
  merchantId: string;
  status: string;
  type: string;
  cancelReason: string | null;
  deliveryPersonId: string | null;
  deliveryPerson: { id: string; name: string; phone: string | null; isOnline: boolean } | null;
  currencyCode: string;
  subtotalMinor: string;
  taxTotalMinor: string;
  discountTotalMinor: string;
  feeTotalMinor: string;
  deliveryChargeMinor: string;
  grandTotalMinor: string;
  tipMinor: string;
  items: Array<{
    id: string;
    nameSnapshot: string | null;
    variantSnapshot: string | null;
    quantity: number;
    unitPriceMinor: string;
    lineTotalMinor: string;
  }>;
  paymentIntents: Array<{
    id: string;
    status: string;
    method: string;
    amountMinor: string;
    currencyCode: string;
  }>;
  statusEvents: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    reason: string | null;
    createdAt: string;
  }>;
};

export type DeliveryPerson = {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
  occupied: boolean;
};

export const staffAuthApi = {
  login: (body: { email: string; password: string }) =>
    api<StaffAuth>('/api/v1/auth/staff/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: async (refreshToken: string) => {
    await api<unknown>('/api/v1/auth/staff/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },
};

export const merchantOrdersApi = {
  list: (query: { status?: string; type?: string; lane?: string } = {}) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.type) params.set('type', query.type);
    if (query.lane) params.set('lane', query.lane);
    const qs = params.toString();
    return api<{ data: MerchantOrder[] }>(`/api/v1/orders${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api<MerchantOrder>(`/api/v1/orders/${id}`),
  transition: (
    id: string,
    body: { toStatus: string; expectedStatus?: string; reason?: string; reasonCode?: string },
  ) =>
    api<MerchantOrder>(`/api/v1/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  assign: (id: string, body: { deliveryPersonId: string; expectedStatus?: string }) =>
    api<MerchantOrder>(`/api/v1/orders/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

export const deliveryApi = {
  people: () => api<{ data: DeliveryPerson[] }>('/api/v1/delivery/people'),
  session: (deliveryPersonId: string) =>
    api<{ accessToken: string }>('/api/v1/delivery/sessions', {
      method: 'POST',
      body: JSON.stringify({ deliveryPersonId }),
    }),
  riderStatus: (id: string, token: string, body: { toStatus: string; expectedStatus?: string }) =>
    api<MerchantOrder>(
      `/api/v1/delivery/orders/${id}/status`,
      { method: 'PATCH', body: JSON.stringify(body) },
      { token },
    ),
};
