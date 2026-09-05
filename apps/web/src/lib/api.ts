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

export function promoCodeFromError(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== 'object') return null;
  const code = (err.body as Record<string, unknown>).code;
  return typeof code === 'string' && code.trim() ? code : null;
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
  sku?: string | null;
  priceMinor: string;
  currencyCode: string;
  available: boolean;
};

export type CatalogModifier = {
  id: string;
  name: string;
  priceMinor: string;
  currencyCode: string;
  available: boolean;
  isDefault: boolean;
  sortOrder: number;
  variantPrices: Array<{ variantId: string; priceMinor: string }>;
};

export type CatalogModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  allowQuantity: boolean;
  available: boolean;
  sortOrder: number;
  required: boolean;
  singleSelect: boolean;
  modifiers: CatalogModifier[];
};

export type CrossSellItem = {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  availability: string;
  isPublished: boolean;
  orderable: boolean;
  soldOut?: boolean;
  requiresCustomization: boolean;
  relation: { id: string; type: 'CROSS_SELL'; sortOrder: number };
  variants: ItemVariant[];
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  availability: string;
  isPublished: boolean;
  visible?: boolean;
  orderable?: boolean;
  channelEnabled?: boolean | null;
  variants: ItemVariant[];
  modifierGroups?: CatalogModifierGroup[];
  soldOut?: boolean;
  pairsWellWith?: CrossSellItem[];
};

export type ComboSlotOption = {
  id: string;
  menuItemId: string;
  isDefault: boolean;
  sortOrder: number;
};

export type ComboSlot = {
  id: string;
  name: string | null;
  sortOrder: number;
  options: ComboSlotOption[];
};

export type ComboComponent = {
  menuItemId: string;
  name: string;
  available?: boolean;
};

export type ConsumerCombo = {
  id: string;
  restaurantId: string;
  merchantId: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  availability: string;
  substitutable: boolean;
  comboPriceMinor: string;
  currencyCode: string;
  sortOrder: number;
  sectionIds: string[];
  orderable?: boolean;
  slots: ComboSlot[];
  components?: ComboComponent[];
};

export type ComboSelectionPayload = {
  slotId: string;
  menuItemId: string;
};

export type ConsumerMenu = {
  kind: 'STANDARD' | 'CUSTOM';
  restaurantId: string;
  channel?: string | null;
  items: MenuItem[];
  combos?: ConsumerCombo[];
  menu?: { id: string; name: string; type: 'CUSTOM'; visibility: boolean };
  sections?: Array<{
    id: string;
    name: string;
    sortOrder: number;
    categoryId: string | null;
    items: MenuItem[];
    combos?: ConsumerCombo[];
  }>;
};

export type CustomMenuSummary = {
  id: string;
  name: string;
  type: 'CUSTOM';
  visibility: boolean;
};

export type ModifierGroupPayload = {
  groupId: string;
  selections: Array<{ modifierId: string; quantity?: number }>;
};

export type CommercialTaxLine = {
  code: string;
  rateBps: number;
  mode: string;
  amountMinor: string;
};

export type CommercialFeeLine = {
  type: string;
  recipient: string;
  amountMinor: string;
  taxTreatment: string;
};

export type AppliedPromotion = {
  offerId: string;
  couponId: string | null;
  couponCode: string | null;
  title: string;
  source: 'CODE' | 'AUTOMATIC';
};

export type MerchandiseQuote = {
  variantId?: string;
  menuItemId?: string | null;
  comboId?: string;
  restaurantId: string;
  name?: string;
  quantity: number;
  currencyCode: string;
  variantPriceMinor: string;
  modifierTotalMinor: string;
  unitMerchandiseMinor: string;
  lineMerchandiseMinor: string;
  merchandiseSubtotalMinor?: string;
  discountMinor?: string;
  taxableSubtotalMinor?: string;
  taxes?: CommercialTaxLine[];
  taxTotalMinor?: string;
  fees?: CommercialFeeLine[];
  feeTotalMinor?: string;
  deliveryChargeMinor?: string;
  grandTotalMinor?: string;
  promotion?: AppliedPromotion | null;
  selections?: Array<{
    groupId: string;
    modifierId: string;
    name: string;
    quantity: number;
    priceAdjustmentMinor: string;
  }>;
  components?: Array<{
    slotId: string;
    slotName: string | null;
    optionId: string;
    menuItemId: string;
    menuItemName: string;
  }>;
};

export type MerchandiseSnapshot = {
  schema?: string;
  variantId?: string;
  comboId?: string;
  modifierGroups?: ModifierGroupPayload[];
  components?: Array<{ slotId: string; menuItemId: string; menuItemName?: string }>;
};

export type TaxonomyChip = {
  id: string;
  label: string;
  type: string | null;
  available: boolean;
  restaurantCount: number;
};

export type HomeFeed = {
  source: 'CANONICAL' | 'RECOMMENDATION';
  taxonomy: { kind: 'CATEGORY'; chips: TaxonomyChip[] };
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
  comboId?: string | null;
  name: string | null;
  variantSnapshot: string | null;
  quantity: number;
  unitPriceMinor: string;
  lineTotalMinor: string;
  variantPriceMinor?: string;
  modifierTotalMinor?: string;
  currencyCode: string;
  available: boolean;
  addOns?: MerchandiseSnapshot | null;
};

export type PricedCart = {
  id: string;
  restaurantId: string | null;
  merchantId: string | null;
  type: string | null;
  currencyCode: string;
  subtotalMinor: string;
  merchandiseSubtotalMinor?: string;
  discountMinor?: string;
  taxableSubtotalMinor?: string;
  taxes?: CommercialTaxLine[];
  taxTotalMinor?: string;
  fees?: CommercialFeeLine[];
  feeTotalMinor?: string;
  deliveryChargeMinor?: string;
  grandTotalMinor?: string;
  promotion?: AppliedPromotion | null;
  items: PricedCartItem[];
};

export type OrderStatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorType: string;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
};

export type OrderDeliveryPerson = {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
};

export type Order = {
  id: string;
  orderNumber: string | null;
  restaurantId: string;
  status: string;
  type: string;
  cancelReason: string | null;
  currencyCode: string;
  subtotalMinor: string;
  taxTotalMinor: string;
  discountTotalMinor: string;
  feeTotalMinor: string;
  deliveryChargeMinor: string;
  grandTotalMinor: string;
  commercialSnapshot?: {
    schema?: string;
    merchandiseSubtotalMinor?: string;
    discountMinor?: string;
    taxTotalMinor?: string;
    feeTotalMinor?: string;
    grandTotalMinor?: string;
    taxes?: CommercialTaxLine[];
    fees?: CommercialFeeLine[];
    lines?: Array<{
      comboId?: string | null;
      name?: string;
      components?: Array<{ menuItemId: string; name: string }>;
    }>;
  } | null;
  tipMinor: string;
  deliveryPersonId: string | null;
  deliveryPerson: OrderDeliveryPerson | null;
  items: Array<{
    id: string;
    nameSnapshot: string | null;
    variantSnapshot: string | null;
    quantity: number;
    unitPriceMinor: string;
    lineTotalMinor: string;
    addOns?: MerchandiseSnapshot | null;
  }>;
  statusEvents: OrderStatusEvent[];
  paymentIntents: Array<{
    id: string;
    status: string;
    method: string;
    amountMinor: string;
    currencyCode?: string;
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
  home: (q?: { city?: string; q?: string; categoryId?: string }) => {
    const params = new URLSearchParams();
    if (q?.city) params.set('city', q.city);
    if (q?.q) params.set('q', q.q);
    if (q?.categoryId) params.set('categoryId', q.categoryId);
    const qs = params.toString();
    return api<HomeFeed>(`/api/v1/discover/home${qs ? `?${qs}` : ''}`);
  },
  restaurant: (id: string) => api<Restaurant>(`/api/v1/discover/restaurants/${id}`),
  menu: (id: string, type = 'HOME_DELIVERY') =>
    api<ConsumerMenu>(`/api/v1/discover/restaurants/${id}/menu?type=${type}`),
  customMenus: (id: string) =>
    api<{ restaurantId: string; menus: CustomMenuSummary[] }>(
      `/api/v1/discover/restaurants/${id}/menus`,
    ),
  customMenu: (menuId: string, type = 'HOME_DELIVERY') =>
    api<ConsumerMenu>(`/api/v1/discover/menus/${menuId}?type=${type}`),
  item: (id: string, type = 'HOME_DELIVERY') =>
    api<MenuItem>(`/api/v1/discover/items/${id}?type=${type}`),
  combo: (id: string, type = 'HOME_DELIVERY') =>
    api<ConsumerCombo>(`/api/v1/discover/combos/${id}?type=${type}`),
  quote: (body: {
    variantId?: string;
    comboId?: string;
    quantity: number;
    type?: string;
    modifierGroups?: ModifierGroupPayload[];
    selections?: ComboSelectionPayload[];
    couponCode?: string;
  }) =>
    api<MerchandiseQuote>('/api/v1/discover/quote', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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

function cartPath(path: string, couponCode?: string) {
  const code = couponCode?.trim();
  if (!code) return path;
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}couponCode=${encodeURIComponent(code)}`;
}

export const cartApi = {
  get: (couponCode?: string) => api<PricedCart>(cartPath('/api/v1/cart', couponCode)),
  add: (
    body: {
      variantId?: string;
      comboId?: string;
      quantity: number;
      restaurantId?: string;
      type?: string;
      modifierGroups?: ModifierGroupPayload[];
      selections?: ComboSelectionPayload[];
    },
    couponCode?: string,
  ) =>
    api<PricedCart>(cartPath('/api/v1/cart/items', couponCode), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, quantity: number, couponCode?: string) =>
    api<PricedCart>(cartPath(`/api/v1/cart/items/${id}`, couponCode), {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  remove: (id: string, couponCode?: string) =>
    api<PricedCart>(cartPath(`/api/v1/cart/items/${id}`, couponCode), { method: 'DELETE' }),
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

export type ConsumerProfile = {
  userId: string;
  phoneCountryCode: string;
  phone: string;
  email: string | null;
  isVerified: boolean;
  detailsSubmitted: boolean;
  completionPercentage: number;
  preferences: {
    dietary_preferences: string[];
    allergies: string[];
  };
};

export type ConsumerProfilePatch = {
  email?: string | null;
  preferences?: {
    dietary_preferences?: string[] | null;
    allergies?: string[] | null;
  };
};

export type FavoriteTargetType = 'RESTAURANT' | 'MENU_ITEM';

export type Favorite = {
  id: string;
  targetType: FavoriteTargetType;
  targetId: string;
  createdAt: string;
  restaurant: { id: string; name: string; city: string | null; status: string } | null;
  item: {
    id: string;
    name: string;
    restaurantId: string;
    availability: string;
    isPublished: boolean;
  } | null;
};

export const favoritesApi = {
  list: (targetType?: FavoriteTargetType) => {
    const qs = targetType ? `?targetType=${targetType}` : '';
    return api<{ data: Favorite[] }>(`/api/v1/me/favorites${qs}`);
  },
  put: (body: { targetType: FavoriteTargetType; targetId: string }) =>
    api<Favorite>('/api/v1/me/favorites', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (targetType: FavoriteTargetType, targetId: string) =>
    api<{ targetType: FavoriteTargetType; targetId: string }>(
      `/api/v1/me/favorites/${targetType}/${targetId}`,
      { method: 'DELETE' },
    ),
};

export type SavedAddress = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SavedAddressWrite = {
  label?: string | null;
  line1: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  isDefault?: boolean;
};

export const addressesApi = {
  list: () => api<{ data: SavedAddress[] }>('/api/v1/me/addresses'),
  create: (body: SavedAddressWrite) =>
    api<SavedAddress>('/api/v1/me/addresses', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patch: (id: string, body: Partial<SavedAddressWrite>) =>
    api<SavedAddress>(`/api/v1/me/addresses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (id: string) => api<{ id: string }>(`/api/v1/me/addresses/${id}`, { method: 'DELETE' }),
};

export const profileApi = {
  get: () => api<ConsumerProfile>('/api/v1/me/profile'),
  patch: (body: ConsumerProfilePatch) =>
    api<ConsumerProfile>('/api/v1/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

export const ordersApi = {
  get: (id: string) => api<Order>(`/api/v1/me/orders/${id}`),
  list: (query: { lane?: 'active' | 'history'; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (query.lane) params.set('lane', query.lane);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return api<{ data: Order[] }>(`/api/v1/me/orders${qs ? `?${qs}` : ''}`);
  },
  cancel: (id: string, body: { expectedStatus?: string; reason?: string }) =>
    api<Order>(`/api/v1/me/orders/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
