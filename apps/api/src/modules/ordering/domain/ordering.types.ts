/**
 * Ordering domain types (P1.7.12). Canonical Order creation + status lifecycle
 * over the EXISTING target `Order`/`OrderItem`/`OrderStatusEvent` (no schema
 * change). Money is exact integer minor units (`bigint`). Native order lifecycle
 * = a single `OrderStatus` (P1.7.11: legacy numeric order_status, 1:1); rider
 * ON_THE_WAY/DELIVERED are the same field (no separate rider state machine).
 */

export type OrderTypeName =
  'DINE_IN' | 'TAKE_AWAY' | 'CURB_SIDE' | 'SKIP_LINE' | 'HOME_DELIVERY' | 'CATERING';

export type OrderStatusName =
  | 'INITIAL'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'PACKING'
  | 'READY'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURNED';

export interface CreateOrderItemInput {
  menuItemId?: string | null; // optional; if set, must belong to the order's restaurant
  nameSnapshot: string; // historical name at order time
  variantSnapshot?: string | null;
  unitPriceMinor: bigint;
  quantity: number;
  customization?: Record<string, unknown> | null;
  addOns?: unknown | null;
}

export interface CreateOrderInput {
  orderNumber: string; // caller-supplied order reference (unique); duplicate protection
  restaurantId: string;
  userId?: string | null; // optional customer attribution
  type: OrderTypeName;
  items: CreateOrderItemInput[];
  // optional order-level money components (default 0); grandTotal is derived
  taxTotalMinor?: bigint;
  // discountTotalMinor: client-supplied ad-hoc discount. IGNORED when `couponCode`
  // is supplied — the server computes the authoritative offer discount (P1.7.24).
  discountTotalMinor?: bigint;
  feeTotalMinor?: bigint;
  deliveryChargeMinor?: bigint;
  // Customer-funded tip / donation (P1.7.36). Recorded on the Order but held
  // OUTSIDE grandTotal and the commission basis (not merchant revenue). Default 0.
  tipMinor?: bigint;
  donationMinor?: bigint;
  currencyCode?: string;
  // Applied offer identity (client may supply the INTENT only). The server
  // validates the offer/coupon and calculates the discount; client-supplied
  // discount/total are NEVER trusted when this is present (P1.7.24).
  couponCode?: string | null;
}

export type RedemptionStatusName = 'ACTIVE' | 'REVERSED';

/**
 * A validated offer resolved from a coupon code, carrying exactly the fields the
 * server needs to compute the discount and enforce usage limits (P1.7.24). Kept
 * separate from P1.7.22 `OfferRecord` so that configuration types stay untouched.
 */
export interface AppliedOffer {
  offerId: string;
  couponId: string;
  active: boolean;
  deletedAt: Date | null;
  isGlobal: boolean;
  merchantId: string | null;
  restaurantId: string | null;
  discountPercent: number | null;
  discountMinor: bigint | null;
  maxDiscountMinor: bigint | null;
  minOrderMinor: bigint | null;
  maxOrderMinor: bigint | null;
  serviceTypes: string[] | null;
  validFrom: Date | null;
  validTo: Date | null;
  maxUsageLimit: number | null;
  perUserLimit: number | null;
  // Per-user, per-calendar-period usage cap (P1.7.26B). Enforced only for global
  // offers (legacy `isGlobal` gate); `useFrequency` ∈ DAILY|WEEKLY|MONTHLY|YEARLY.
  useLimit: number | null;
  useFrequency: string | null;
}

/** Server-resolved redemption directive persisted atomically with the Order. */
export interface RedemptionDirective {
  offerId: string;
  couponId: string;
  userId: string | null;
  discountAppliedMinor: bigint;
  maxUsageLimit: number | null;
  perUserLimit: number | null;
  // Global-only usage-frequency gate (P1.7.26B). `useLimit`/`useFrequency` are the
  // per-user, per-IST-calendar-period cap; only enforced when `isGlobal` is true.
  isGlobal: boolean;
  useLimit: number | null;
  useFrequency: string | null;
}

export interface RedemptionRecord {
  id: string;
  couponId: string;
  userId: string | null;
  orderId: string | null;
  status: RedemptionStatusName;
  discountAppliedMinor: bigint | null;
  reversedAt: Date | null;
  createdAt: Date;
}

export interface OrderItemRecord {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  variantSnapshot: string | null;
  unitPriceMinor: bigint;
  quantity: number;
  lineTotalMinor: bigint;
  currencyCode: string;
}

export interface OrderStatusEventRecord {
  id: string;
  fromStatus: OrderStatusName | null;
  toStatus: OrderStatusName;
  actorType: string | null;
  actorId: string | null;
  createdAt: Date;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  merchantId: string;
  restaurantId: string;
  userId: string | null;
  type: OrderTypeName;
  status: OrderStatusName;
  subtotalMinor: bigint;
  taxTotalMinor: bigint;
  discountTotalMinor: bigint;
  feeTotalMinor: bigint;
  deliveryChargeMinor: bigint;
  grandTotalMinor: bigint;
  tipMinor: bigint;
  donationMinor: bigint;
  currencyCode: string;
  offerId: string | null;
  couponId: string | null;
  items: OrderItemRecord[];
  statusEvents: OrderStatusEventRecord[];
}
