import type { AddressCheckoutSource } from '../../addresses/application/consumer-addresses.service';

export const DELIVERY_ADDRESS_SNAPSHOT_SCHEMA = 'deliveryAddress.v1' as const;

export const ADDRESS_REQUIRED_ORDER_TYPES = ['HOME_DELIVERY', 'CATERING'] as const;

export type AddressRequiredOrderType = (typeof ADDRESS_REQUIRED_ORDER_TYPES)[number];

export type DeliveryAddressSnapshot = {
  schema: typeof DELIVERY_ADDRESS_SNAPSHOT_SCHEMA;
  sourceAddressId: string;
  snapshottedAt: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  lat: number | null;
  lon: number | null;
};

export function requiresCheckoutAddress(type: string): type is AddressRequiredOrderType {
  return (ADDRESS_REQUIRED_ORDER_TYPES as readonly string[]).includes(type);
}

export function snapshotDeliveryAddress(
  source: AddressCheckoutSource,
  at: Date = new Date(),
): DeliveryAddressSnapshot {
  return {
    schema: DELIVERY_ADDRESS_SNAPSHOT_SCHEMA,
    sourceAddressId: source.id,
    snapshottedAt: at.toISOString(),
    label: source.label,
    line1: source.line1,
    line2: source.line2,
    city: source.city,
    state: source.state,
    pinCode: source.pinCode,
    lat: source.lat,
    lon: source.lon,
  };
}
