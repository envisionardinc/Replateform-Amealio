/**
 * Seating domain types (P1.7.16). Canonical merchant seating inventory
 * (SeatingArea → RestaurantTable), physical-table RUNTIME status, and the
 * seating/booking request foundation (SeatingRequest), over the EXISTING target
 * models. Hybrid boundary (DEC-2, doc 44): seating feature gates/timers/rules
 * remain in `Subscription.config` (P1.7.3/P1.7.14) — NOT here.
 */

export type TableStatusName = 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'ON_HOLD' | 'UNAVAILABLE';

export type SeatingTypeName = 'WALK_IN' | 'WAITLIST' | 'RESERVATION';

export type SeatingStatusName =
  'PENDING' | 'NOT_SEATED' | 'SEATED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface CreateSeatingAreaInput {
  restaurantId: string;
  name: string; // legacy `table_setup.*.area`
  legacyId?: string | null;
}

export interface CreateTableInput {
  seatingAreaId: string;
  code: string; // legacy `table[].table_number`
  name?: string | null;
  floor?: string | null; // legacy `table[].floor_number`
  shape?: string | null;
  capacity?: number; // legacy `table[].pax_value`
  isActive?: boolean; // legacy `table[].active`
  legacyId?: string | null;
}

export interface CreateSeatingRequestInput {
  restaurantId: string;
  type: SeatingTypeName; // WALK_IN/WAITLIST (legacy SEATING+isWalkIn) | RESERVATION
  partySize: number;
  kidsCount?: number | null;
  highChairs?: number | null;
  specialRequests?: string | null;
  reservationAt?: string | Date | null; // required for RESERVATION
  userId?: string | null; // optional customer attribution
  legacyId?: string | null;
}

export interface UpdateSeatingRequestInput {
  status?: SeatingStatusName;
  tableId?: string | null; // physical table binding (accept/seat)
  confirmedAt?: string | Date | null;
  cancelReason?: string | null;
}

/** Consumer Book a Table / Reservation create. Client may not send occupancy or type authority. */
export type ConsumerDinerIntent = 'SEATING' | 'RESERVATION';

export interface CreateConsumerDinerInput {
  restaurantId: string;
  intent: ConsumerDinerIntent;
  partySize: number;
  kidsCount?: number | null;
  highChairs?: number | null;
  specialRequests?: string | null;
  reservationAt?: string | Date | null;
}

export interface ListMerchantDinerQuery {
  restaurantId: string;
  status?: SeatingStatusName;
}

export interface SeatingAreaRecord {
  id: string;
  restaurantId: string;
  name: string;
  legacyId: string | null;
}

export interface TableRecord {
  id: string;
  seatingAreaId: string;
  code: string;
  name: string | null;
  floor: string | null;
  shape: string | null;
  capacity: number;
  isActive: boolean;
  status: TableStatusName;
  legacyId: string | null;
}

export interface SeatingRequestRecord {
  id: string;
  merchantId: string;
  restaurantId: string;
  userId: string | null;
  type: SeatingTypeName;
  status: SeatingStatusName;
  partySize: number;
  kidsCount: number | null;
  highChairs: number | null;
  specialRequests: string | null;
  reservationAt: Date | null;
  tableId: string | null;
  tableCode: string | null;
  confirmedAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
}
