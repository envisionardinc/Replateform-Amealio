import type { SeatingRequestRecord, TableRecord } from '../domain/seating.types';

const CONSUMER_CANCEL_FROM = new Set(['PENDING', 'NOT_SEATED']);

export function serializeConsumerDiner(row: SeatingRequestRecord) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    type: row.type,
    status: row.status,
    partySize: row.partySize,
    kidsCount: row.kidsCount,
    highChairs: row.highChairs,
    specialRequests: row.specialRequests,
    reservationAt: row.reservationAt ? row.reservationAt.toISOString() : null,
    tableId: row.tableId,
    tableCode: row.tableCode,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    canCancel: CONSUMER_CANCEL_FROM.has(row.status),
  };
}

export function serializeMerchantDiner(row: SeatingRequestRecord) {
  return {
    ...serializeConsumerDiner(row),
    userId: row.userId,
    merchantId: row.merchantId,
  };
}

export function serializeTable(row: TableRecord) {
  return {
    id: row.id,
    seatingAreaId: row.seatingAreaId,
    code: row.code,
    name: row.name,
    floor: row.floor,
    shape: row.shape,
    capacity: row.capacity,
    isActive: row.isActive,
    status: row.status,
  };
}