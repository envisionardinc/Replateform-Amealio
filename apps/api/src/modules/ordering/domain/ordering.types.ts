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
  discountTotalMinor?: bigint;
  feeTotalMinor?: bigint;
  deliveryChargeMinor?: bigint;
  currencyCode?: string;
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
  currencyCode: string;
  items: OrderItemRecord[];
  statusEvents: OrderStatusEventRecord[];
}
