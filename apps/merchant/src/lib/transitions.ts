export type MerchantAction = {
  id: string;
  label: string;
  toStatus?: string;
  reasonCode?: string;
  kind: 'status' | 'assign' | 'rider';
};

const PICKUP = new Set(['DINE_IN', 'TAKE_AWAY', 'CURB_SIDE', 'SKIP_LINE', 'CATERING']);

export function merchantActions(order: {
  status: string;
  type: string;
  deliveryPersonId: string | null;
}): MerchantAction[] {
  const actions: MerchantAction[] = [];
  if (order.status === 'PENDING') {
    actions.push({ id: 'confirm', label: 'Accept', toStatus: 'CONFIRMED', kind: 'status' });
    actions.push({
      id: 'reject',
      label: 'Reject',
      toStatus: 'CANCELLED',
      reasonCode: 'MERCHANT_REJECT',
      kind: 'status',
    });
  }
  if (order.status === 'CONFIRMED') {
    actions.push({ id: 'prep', label: 'Start preparing', toStatus: 'PREPARING', kind: 'status' });
    actions.push({
      id: 'reject',
      label: 'Reject',
      toStatus: 'CANCELLED',
      reasonCode: 'MERCHANT_REJECT',
      kind: 'status',
    });
  }
  if (order.status === 'PREPARING') {
    actions.push({ id: 'pack', label: 'Pack', toStatus: 'PACKING', kind: 'status' });
    actions.push({ id: 'ready', label: 'Mark ready', toStatus: 'READY', kind: 'status' });
  }
  if (order.status === 'PACKING') {
    actions.push({ id: 'ready', label: 'Mark ready', toStatus: 'READY', kind: 'status' });
  }
  if (order.status === 'READY' && PICKUP.has(order.type)) {
    actions.push({ id: 'complete', label: 'Complete', toStatus: 'COMPLETED', kind: 'status' });
  }
  if (order.status === 'READY' && order.type === 'HOME_DELIVERY' && !order.deliveryPersonId) {
    actions.push({ id: 'assign', label: 'Assign rider', kind: 'assign' });
  }
  if (order.status === 'READY' && order.type === 'HOME_DELIVERY' && order.deliveryPersonId) {
    actions.push({ id: 'ofd', label: 'Rider: on the way', toStatus: 'ON_THE_WAY', kind: 'rider' });
  }
  if (order.status === 'ON_THE_WAY') {
    actions.push({
      id: 'delivered',
      label: 'Rider: delivered',
      toStatus: 'DELIVERED',
      kind: 'rider',
    });
  }
  if (order.status === 'DELIVERED') {
    actions.push({ id: 'complete', label: 'Complete', toStatus: 'COMPLETED', kind: 'status' });
  }
  return actions;
}
