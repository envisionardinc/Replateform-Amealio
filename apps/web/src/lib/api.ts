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
  const res = await fetch(`${apiBase}/api/v1/auth/consumer/refresh`, {
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
  opts: { retryOn401?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (res.status === 401 && opts.retryOn401 !== false && getRefreshToken()) {
    const ok = await refreshAccess();
    if (ok) return api<T>(path, init, { retryOn401: false });
  }
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(messageFromBody(body, res.statusText || 'Request failed'), res.status, body);
  }
  return body as T;
}

export type Restaurant = {
  id: string;
  name: string;
  city: string | null;
  status: string;
};

export type ItemVariant = {
  id: string;
  size: string | null;
  priceMinor: string;
  currencyCode: string;
  available: boolean;
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  availability: string;
  isPublished: boolean;
  variants: ItemVariant[];
};

export type HomeFeed = {
  source: 'CANONICAL' | 'RECOMMENDATION';
  sections: Array<{ id: string; title: string; restaurants: Restaurant[] }>;
};

export type AuthUser = {
  id: string;
  phoneCountryCode: string;
  phone: string;
  email: string | null;
  isVerified: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
};

export type PricedCartItem = {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  name: string | null;
  variantSnapshot: string | null;
  quantity: number;
  unitPriceMinor: string;
  lineTotalMinor: string;
  currencyCode: string;
  available: boolean;
};

export type PricedCart = {
  id: string;
  restaurantId: string | null;
  merchantId: string | null;
  type: string | null;
  currencyCode: string;
  subtotalMinor: string;
  items: PricedCartItem[];
};

export type Order = {
  id: string;
  orderNumber: string | null;
  restaurantId: string;
  status: string;
  type: string;
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
    razorpayOrderId: string | null;
  }>;
};

export type CheckoutResult = {
  settlement: string;
  order: Order;
  payment: {
    id: string;
    status: string;
    method: string;
    amountMinor: string;
    currencyCode: string;
    razorpayOrderId: string | null;
  } | null;
};

export const discoverApi = {
  home: (q?: { city?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (q?.city) params.set('city', q.city);
    if (q?.q) params.set('q', q.q);
    const qs = params.toString();
    return api<HomeFeed>(`/api/v1/discover/home${qs ? `?${qs}` : ''}`);
  },
  restaurant: (id: string) => api<Restaurant>(`/api/v1/discover/restaurants/${id}`),
  menu: (id: string) =>
    api<{ restaurantId: string; items: MenuItem[] }>(`/api/v1/discover/restaurants/${id}/menu`),
  item: (id: string) => api<MenuItem>(`/api/v1/discover/items/${id}`),
};

export const authApi = {
  register: (body: { phoneCountryCode: string; phone: string; password: string; email?: string }) =>
    api<AuthUser>('/api/v1/auth/consumer/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { phoneCountryCode: string; phone: string; password: string }) =>
    api<AuthTokens>('/api/v1/auth/consumer/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => api<AuthUser>('/api/v1/auth/consumer/me'),
  logout: async (refreshToken: string) => {
    await api<unknown>('/api/v1/auth/consumer/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },
};

export const cartApi = {
  get: () => api<PricedCart>('/api/v1/cart'),
  add: (body: { variantId: string; quantity: number; restaurantId?: string; type?: string }) =>
    api<PricedCart>('/api/v1/cart/items', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, quantity: number) =>
    api<PricedCart>(`/api/v1/cart/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  remove: (id: string) => api<PricedCart>(`/api/v1/cart/items/${id}`, { method: 'DELETE' }),
};

export const checkoutApi = {
  place: (
    body: {
      restaurantId?: string;
      type?: string;
      settlement: 'COD' | 'PREPAID' | 'PAY_LATER';
      tipMinor?: number;
      couponCode?: string;
    },
    idempotencyKey: string,
  ) =>
    api<CheckoutResult>('/api/v1/checkout', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    }),
};

export const ordersApi = {
  get: (id: string) => api<Order>(`/api/v1/me/orders/${id}`),
  list: () => api<{ data: Order[] }>('/api/v1/me/orders'),
};
