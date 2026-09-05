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
  me: () => api<Staff>('/api/v1/auth/staff/me'),
  logout: async (refreshToken: string) => {
    await api<unknown>('/api/v1/auth/staff/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },
};

export type GlobalCatalog = {
  id: string;
  name: string;
  description: string | null;
  cuisineType: string | null;
  status: string;
};

export type GlobalCategory = {
  id: string;
  catalogId: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export type GlobalItem = {
  id: string;
  catalogId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  sourcePayload: unknown;
};

export type MerchantRestaurant = {
  id: string;
  name: string;
  city: string | null;
  status: string;
};

export type MerchantMenu = {
  id: string;
  name: string;
  restaurantId: string;
  type?: string;
  visibility?: boolean;
  description?: string | null;
};

export type MerchantSection = {
  id: string;
  menuId: string;
  name: string;
  sortOrder?: number;
  description?: string | null;
};

export const ORDER_CHANNELS = [
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
] as const;

export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export type MerchantVariant = {
  id: string;
  size: string | null;
  sku: string | null;
  priceMinor: string;
  currencyCode?: string;
  isDefault?: boolean;
  available?: boolean;
};

export type MerchantAddOnVariantPrice = {
  id: string;
  addOnId: string;
  variantId: string;
  priceMinor: string;
};

export type MerchantAddOn = {
  id: string;
  name: string;
  priceMinor: string;
  available?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  variantPrices?: MerchantAddOnVariantPrice[];
};

export type MerchantAddOnGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  allowQuantity?: boolean;
  available?: boolean;
  sortOrder?: number;
  addOns: MerchantAddOn[];
};

export type MerchantChannelConfig = {
  id: string;
  channel: string;
  enabled: boolean;
  priceOverrideMinor: string | null;
};

export type MerchantCatalogItem = {
  id: string;
  merchantId: string;
  restaurantId: string;
  menuSectionId: string | null;
  name: string;
  description: string | null;
  availability: string;
  isPublished: boolean;
  globalSource?: {
    sourceItemId: string;
    sourceItemName: string;
    catalogId: string;
    catalogName: string;
  } | null;
  variants?: MerchantVariant[];
  addOnGroups?: MerchantAddOnGroup[];
  channelConfigs?: MerchantChannelConfig[];
};

export const platformCatalogApi = {
  list: () => api<GlobalCatalog[]>('/api/v1/platform-catalog/global'),
  get: (id: string) =>
    api<{ catalog: GlobalCatalog; categories: GlobalCategory[]; items: GlobalItem[] }>(
      `/api/v1/platform-catalog/global/${id}`,
    ),
  create: (body: {
    name: string;
    description?: string | null;
    cuisineType?: string | null;
    status?: string;
  }) =>
    api<GlobalCatalog>('/api/v1/platform-catalog/global', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    body: {
      name?: string;
      description?: string | null;
      cuisineType?: string | null;
      status?: string;
    },
  ) =>
    api<GlobalCatalog>(`/api/v1/platform-catalog/global/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createCategory: (catalogId: string, body: { name: string; description?: string | null }) =>
    api<GlobalCategory>(`/api/v1/platform-catalog/global/${catalogId}/categories`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createItem: (
    catalogId: string,
    body: {
      name: string;
      description?: string | null;
      categoryId?: string | null;
      sourcePayload?: unknown;
    },
  ) =>
    api<GlobalItem>(`/api/v1/platform-catalog/global/${catalogId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getItem: (id: string) => api<GlobalItem>(`/api/v1/platform-catalog/global-items/${id}`),
  materialize: (
    sourceItemId: string,
    body: { restaurantId: string; catalogId?: string; menuSectionId?: string | null },
  ) =>
    api<{ menuItemId: string; materializationId: string }>(
      `/api/v1/platform-catalog/global-items/${sourceItemId}/materialize`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
};

export const merchantCatalogApi = {
  restaurants: () => api<MerchantRestaurant[]>('/api/v1/catalog/restaurants'),
  items: (restaurantId: string) =>
    api<MerchantCatalogItem[]>(`/api/v1/catalog/restaurants/${restaurantId}/items`),
  menus: (restaurantId: string) =>
    api<MerchantMenu[]>(`/api/v1/catalog/restaurants/${restaurantId}/menus`),
  sections: (menuId: string) => api<MerchantSection[]>(`/api/v1/catalog/menus/${menuId}/sections`),
  getItem: (id: string) => api<MerchantCatalogItem>(`/api/v1/catalog/items/${id}`),
  createItem: (body: {
    restaurantId: string;
    name: string;
    description?: string | null;
    menuSectionId?: string | null;
    availability?: string;
    isPublished?: boolean;
    variants?: Array<{
      size?: string | null;
      sku?: string | null;
      priceMinor: string;
      currencyCode?: string;
      isDefault?: boolean;
      available?: boolean;
    }>;
    channelConfigs?: Array<{
      channel: OrderChannel;
      enabled?: boolean;
      priceOverrideMinor?: string | null;
    }>;
    addOnGroups?: Array<{
      name: string;
      minSelect?: number;
      maxSelect?: number | null;
      allowQuantity?: boolean;
      available?: boolean;
      sortOrder?: number;
      addOns?: Array<{
        name: string;
        priceMinor?: string;
        available?: boolean;
        isDefault?: boolean;
        sortOrder?: number;
      }>;
    }>;
  }) =>
    api<MerchantCatalogItem>('/api/v1/catalog/items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateItem: (
    id: string,
    body: {
      name?: string;
      description?: string | null;
      isPublished?: boolean;
      availability?: string;
      menuSectionId?: string | null;
    },
  ) =>
    api<MerchantCatalogItem>(`/api/v1/catalog/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createVariant: (
    menuItemId: string,
    body: {
      size?: string | null;
      sku?: string | null;
      priceMinor: string;
      currencyCode?: string;
      isDefault?: boolean;
      available?: boolean;
    },
  ) =>
    api<MerchantVariant>(`/api/v1/catalog/items/${menuItemId}/variants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateVariant: (
    variantId: string,
    body: {
      size?: string | null;
      sku?: string | null;
      priceMinor?: string;
      isDefault?: boolean;
      available?: boolean;
    },
  ) =>
    api<MerchantVariant>(`/api/v1/catalog/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setChannelConfig: (
    menuItemId: string,
    body: { channel: OrderChannel; enabled?: boolean; priceOverrideMinor?: string | null },
  ) =>
    api<MerchantChannelConfig>(`/api/v1/catalog/items/${menuItemId}/channel-config`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createAddOnGroup: (
    menuItemId: string,
    body: {
      name: string;
      minSelect?: number;
      maxSelect?: number | null;
      allowQuantity?: boolean;
      available?: boolean;
      sortOrder?: number;
    },
  ) =>
    api<MerchantAddOnGroup>(`/api/v1/catalog/items/${menuItemId}/add-on-groups`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAddOnGroup: (
    groupId: string,
    body: {
      name?: string;
      minSelect?: number;
      maxSelect?: number | null;
      allowQuantity?: boolean;
      available?: boolean;
      sortOrder?: number;
    },
  ) =>
    api<MerchantAddOnGroup>(`/api/v1/catalog/add-on-groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createAddOn: (
    addOnGroupId: string,
    body: {
      name: string;
      priceMinor?: string;
      available?: boolean;
      isDefault?: boolean;
      sortOrder?: number;
    },
  ) =>
    api<MerchantAddOn>(`/api/v1/catalog/add-on-groups/${addOnGroupId}/add-ons`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAddOn: (
    addOnId: string,
    body: {
      name?: string;
      priceMinor?: string;
      available?: boolean;
      isDefault?: boolean;
      sortOrder?: number;
    },
  ) =>
    api<MerchantAddOn>(`/api/v1/catalog/add-ons/${addOnId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setAddOnVariantPrice: (addOnId: string, body: { variantId: string; priceMinor: string }) =>
    api<MerchantAddOn>(`/api/v1/catalog/add-ons/${addOnId}/variant-prices`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createMenu: (body: {
    restaurantId: string;
    name: string;
    description?: string | null;
    type?: 'CUSTOM' | 'STANDARD';
    visibility?: boolean;
  }) =>
    api<MerchantMenu>('/api/v1/catalog/menus', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMenu: (
    menuId: string,
    body: { name?: string; description?: string | null; type?: string; visibility?: boolean },
  ) =>
    api<MerchantMenu>(`/api/v1/catalog/menus/${menuId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createSection: (body: {
    menuId: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
  }) =>
    api<MerchantSection>('/api/v1/catalog/sections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSection: (
    sectionId: string,
    body: { name?: string; description?: string | null; sortOrder?: number },
  ) =>
    api<MerchantSection>(`/api/v1/catalog/sections/${sectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  reorderSections: (menuId: string, order: Array<{ sectionId: string; sortOrder: number }>) =>
    api<unknown>(`/api/v1/catalog/menus/${menuId}/sections/reorder`, {
      method: 'POST',
      body: JSON.stringify({ order }),
    }),
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
