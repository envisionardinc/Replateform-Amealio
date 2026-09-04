import type { OrderStatusName, OrderTypeName } from './ordering.types';

/**
 * Canonical OrderStatus graph (docs 40/41/88). ONE machine — kitchen, payment
 * promotion, rider hops, and cancel all write this same field. Do not add a
 * parallel DeliveryTask or numeric increment engine.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatusName, OrderStatusName[]> = {
  INITIAL: ['PENDING', 'CANCELLED'],
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['PACKING', 'READY', 'CANCELLED'],
  PACKING: ['READY', 'CANCELLED'],
  READY: ['ON_THE_WAY', 'COMPLETED', 'CANCELLED'],
  ON_THE_WAY: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'RETURNED'],
  COMPLETED: [],
  CANCELLED: [],
  RETURNED: [],
};

export const TERMINAL_ORDER_STATUSES: OrderStatusName[] = [
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
];

/** Pickup-like types: after READY the merchant may complete (no rider hop). */
export const PICKUP_LIKE_TYPES: ReadonlySet<OrderTypeName> = new Set([
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'CATERING',
]);

export function isAllowedTransition(from: OrderStatusName, to: OrderStatusName): boolean {
  return (ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalStatus(status: OrderStatusName): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function isPickupLike(type: OrderTypeName): boolean {
  return PICKUP_LIKE_TYPES.has(type);
}
