import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { SeatingRepository } from '../infrastructure/seating.repository';
import type {
  CreateSeatingAreaInput,
  CreateSeatingRequestInput,
  CreateTableInput,
  SeatingAreaRecord,
  SeatingRequestRecord,
  SeatingStatusName,
  SeatingTypeName,
  TableRecord,
  TableStatusName,
  UpdateSeatingRequestInput,
} from '../domain/seating.types';

const SEATING_TYPES = new Set<SeatingTypeName>(['WALK_IN', 'WAITLIST', 'RESERVATION']);
const SEATING_STATUSES = new Set<SeatingStatusName>([
  'PENDING',
  'NOT_SEATED',
  'SEATED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
]);
const TABLE_STATUSES = new Set<TableStatusName>([
  'AVAILABLE',
  'OCCUPIED',
  'DIRTY',
  'ON_HOLD',
  'UNAVAILABLE',
]);

/**
 * Merchant seating configuration + seating-request foundation (P1.7.16).
 *
 * Normalizes seating inventory (SeatingArea → RestaurantTable) and represents
 * booking requests (SeatingRequest: WALK_IN/WAITLIST/RESERVATION) over the
 * EXISTING target models. Merchant-tenant-scoped (P1.7.1F/P1.7.2): merchant
 * staff operate only within their merchant; SUPER_ADMIN targets a restaurant
 * explicitly; cross-merchant/deleted/unknown are rejected. No client-supplied
 * merchant scope, no act-as.
 *
 * Boundary (DEC-2, doc 44): feature gates/timers/rules stay in
 * `Subscription.config` (P1.7.14) — untouched here. `RestaurantTable.status` is
 * RUNTIME state with an explicit merchant setter (legacy manual table PATCH);
 * booking-lifecycle → table-status auto-sync and auto-cancel cron are DEFERRED.
 */
@Injectable()
export class SeatingService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly repo: SeatingRepository,
  ) {}

  // ---- Inventory: seating areas ----
  async createSeatingArea(
    principal: StaffPrincipal,
    input: CreateSeatingAreaInput,
  ): Promise<SeatingAreaRecord> {
    await this.assertRestaurant(principal, input.restaurantId);
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
    return this.repo.createArea({
      restaurantId: input.restaurantId,
      name: input.name.trim(),
      legacyId: input.legacyId ?? null,
    });
  }

  listSeatingAreas(principal: StaffPrincipal, restaurantId: string): Promise<SeatingAreaRecord[]> {
    return this.assertRestaurant(principal, restaurantId).then(() =>
      this.repo.listAreas(restaurantId),
    );
  }

  // ---- Inventory: tables ----
  async createTable(principal: StaffPrincipal, input: CreateTableInput): Promise<TableRecord> {
    const area = await this.repo.findArea(input.seatingAreaId);
    if (!area || area.deletedAt !== null) {
      throw new NotFoundException('Seating area not found');
    }
    await this.assertRestaurant(principal, area.restaurantId);
    if (!input.code || input.code.trim().length === 0) {
      throw new BadRequestException('code is required');
    }
    if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
      throw new BadRequestException('capacity must be a positive integer');
    }
    return this.repo.createTable({
      seatingAreaId: input.seatingAreaId,
      code: input.code.trim(),
      name: input.name ?? null,
      floor: input.floor ?? null,
      shape: input.shape ?? null,
      capacity: input.capacity ?? 2,
      isActive: input.isActive ?? true,
      legacyId: input.legacyId ?? null,
    });
  }

  listTables(principal: StaffPrincipal, restaurantId: string): Promise<TableRecord[]> {
    return this.assertRestaurant(principal, restaurantId).then(() =>
      this.repo.listTablesByRestaurant(restaurantId),
    );
  }

  /** RUNTIME state change (legacy manual merchant table PATCH). Not configuration. */
  async setTableStatus(
    principal: StaffPrincipal,
    tableId: string,
    status: TableStatusName,
  ): Promise<TableRecord> {
    if (!TABLE_STATUSES.has(status)) {
      throw new BadRequestException('invalid table status');
    }
    const restaurantId = await this.resolveTableRestaurant(tableId);
    await this.assertRestaurant(principal, restaurantId);
    return this.repo.setTableStatus(tableId, status);
  }

  // ---- Booking requests ----
  async createSeatingRequest(
    principal: StaffPrincipal,
    input: CreateSeatingRequestInput,
  ): Promise<SeatingRequestRecord> {
    if (!SEATING_TYPES.has(input.type)) {
      throw new BadRequestException('type must be WALK_IN, WAITLIST, or RESERVATION');
    }
    if (!Number.isInteger(input.partySize) || input.partySize < 1) {
      throw new BadRequestException('partySize must be a positive integer');
    }
    let reservationAt: Date | null = null;
    if (input.type === 'RESERVATION') {
      if (!input.reservationAt) {
        throw new BadRequestException('reservationAt is required for a RESERVATION');
      }
      reservationAt = new Date(input.reservationAt);
      if (Number.isNaN(reservationAt.getTime())) {
        throw new BadRequestException('reservationAt is not a valid date');
      }
    }
    const merchantId = await this.assertRestaurant(principal, input.restaurantId);
    // Reservations/walk-ins begin at restaurant/capacity level — NO physical table
    // is bound at creation (legacy: table assigned later at accept/seat).
    return this.repo.createRequest({
      merchantId,
      restaurantId: input.restaurantId,
      userId: input.userId ?? null,
      type: input.type,
      status: 'PENDING',
      partySize: input.partySize,
      kidsCount: input.kidsCount ?? null,
      highChairs: input.highChairs ?? null,
      specialRequests: input.specialRequests ?? null,
      reservationAt,
      tableId: null,
      legacyId: input.legacyId ?? null,
    });
  }

  /**
   * Minimal booking write path: status transition and/or physical-table binding
   * (accept/seat). Not a workflow engine; booking-status → table-status auto-sync
   * is intentionally NOT performed here (deferred; see doc 45).
   */
  async updateSeatingRequest(
    principal: StaffPrincipal,
    requestId: string,
    input: UpdateSeatingRequestInput,
  ): Promise<SeatingRequestRecord> {
    const req = await this.repo.findRequest(requestId);
    if (!req || req.deletedAt !== null) {
      throw new NotFoundException('Seating request not found');
    }
    await this.assertRestaurant(principal, req.restaurantId);

    if (input.status !== undefined && !SEATING_STATUSES.has(input.status)) {
      throw new BadRequestException('invalid seating status');
    }
    const tableId: string | null | undefined = input.tableId;
    if (tableId) {
      // Physical table binding must reference a table in the SAME restaurant.
      const tableRestaurant = await this.resolveTableRestaurant(tableId);
      if (tableRestaurant !== req.restaurantId) {
        throw new BadRequestException('table does not belong to this restaurant');
      }
    }
    return this.repo.updateRequest(requestId, {
      status: input.status,
      tableId,
      confirmedAt: input.confirmedAt !== undefined ? toDateOrNull(input.confirmedAt) : undefined,
      cancelReason: input.cancelReason,
    });
  }

  // ---- helpers ----

  /** Resolve + assert the restaurant is in scope and not soft-deleted; return merchantId. */
  private async assertRestaurant(principal: StaffPrincipal, restaurantId: string): Promise<string> {
    const restaurant = await this.restaurants.findById(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    return restaurant.merchantId;
  }

  private async resolveTableRestaurant(tableId: string): Promise<string> {
    const table = await this.repo.findTable(tableId);
    if (!table || table.deletedAt !== null) {
      throw new NotFoundException('Table not found');
    }
    const area = await this.repo.findArea(table.seatingAreaId);
    if (!area || area.deletedAt !== null) {
      throw new NotFoundException('Seating area not found');
    }
    return area.restaurantId;
  }
}

function toDateOrNull(v: string | Date | null): Date | null {
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
