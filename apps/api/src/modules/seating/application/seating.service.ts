import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { SubscriptionConfigService } from '../../subscription/application/subscription-config.service';
import { SubscriptionRepository } from '../../subscription/infrastructure/subscription.repository';
import { SeatingRepository } from '../infrastructure/seating.repository';
import type {
  CreateConsumerDinerInput,
  CreateSeatingAreaInput,
  CreateSeatingRequestInput,
  CreateTableInput,
  ListMerchantDinerQuery,
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

const CONSUMER_CANCEL_FROM: SeatingStatusName[] = ['PENDING', 'NOT_SEATED'];

/**
 * Merchant seating configuration + seating-request foundation (P1.7.16) and
 * Dining / Reservations Runtime Slice 1 (116).
 *
 * Inventory and staff create/update paths are unchanged. Slice 1 adds consumer
 * create/track/cancel and merchant accept/seat/complete on the SAME
 * SeatingRequest aggregate and existing status names. Feature gates stay in
 * Subscription.config. Table occupancy stays on RestaurantTable.status.
 */
@Injectable()
export class SeatingService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly repo: SeatingRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly subscriptionConfig: SubscriptionConfigService,
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

  // ---- Booking requests (foundation staff write; preserved) ----
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
   * is intentionally NOT performed here (deferred; see doc 45). Slice 1 accept /
   * seat / complete use dedicated methods with compare-and-set + occupancy sync.
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

  // ---- Slice 1: consumer ----
  async createConsumerRequest(
    userId: string,
    input: CreateConsumerDinerInput,
  ): Promise<SeatingRequestRecord> {
    if (!userId) {
      throw new ForbiddenException('Consumer authentication required');
    }
    if (input.intent !== 'SEATING' && input.intent !== 'RESERVATION') {
      throw new BadRequestException('intent must be SEATING or RESERVATION');
    }
    if (!Number.isInteger(input.partySize) || input.partySize < 1) {
      throw new BadRequestException('partySize must be a positive integer');
    }
    if (input.kidsCount != null && (!Number.isInteger(input.kidsCount) || input.kidsCount < 0)) {
      throw new BadRequestException('kidsCount must be a non-negative integer');
    }
    if (input.highChairs != null && (!Number.isInteger(input.highChairs) || input.highChairs < 0)) {
      throw new BadRequestException('highChairs must be a non-negative integer');
    }

    const restaurant = await this.restaurants.findById(input.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }

    const config = await this.loadMerchantSeatingConfig(restaurant.merchantId, restaurant.id);
    if (!this.subscriptionConfig.isSeatingEnabled(config)) {
      throw new ForbiddenException('Seating is not enabled for this restaurant');
    }

    let type: SeatingTypeName;
    let reservationAt: Date | null = null;
    if (input.intent === 'RESERVATION') {
      const reservationFlag = this.subscriptionConfig.getPath(config, [
        'casual_dining_status',
        'seating',
        'reservation',
        'value',
      ]);
      if (reservationFlag === false) {
        throw new ForbiddenException('Reservations are not enabled for this restaurant');
      }
      if (!input.reservationAt) {
        throw new BadRequestException('reservationAt is required for a RESERVATION');
      }
      reservationAt = new Date(input.reservationAt);
      if (Number.isNaN(reservationAt.getTime())) {
        throw new BadRequestException('reservationAt is not a valid date');
      }
      type = 'RESERVATION';
    } else {
      type = this.deriveWalkInOrWaitlist(config);
      if (type === 'WAITLIST') {
        const waitlistFlag = this.subscriptionConfig.getPath(config, [
          'casual_dining_status',
          'seating',
          'walkin_waitlist',
          'value',
        ]);
        if (waitlistFlag === false) {
          throw new ForbiddenException('Walk-in / waitlist is not enabled for this restaurant');
        }
      }
    }

    if (type === 'WALK_IN' || type === 'WAITLIST') {
      const timeZone = await this.repo.findRestaurantTimezone(restaurant.id);
      const existing = await this.repo.findActiveSeatingSameLocalDay({
        userId,
        restaurantId: restaurant.id,
        timeZone,
      });
      if (existing.length > 0) {
        throw new ConflictException('An active table request already exists for this restaurant today');
      }
    }

    return this.repo.createRequest({
      merchantId: restaurant.merchantId,
      restaurantId: restaurant.id,
      userId,
      type,
      status: 'PENDING',
      partySize: input.partySize,
      kidsCount: input.kidsCount ?? null,
      highChairs: input.highChairs ?? null,
      specialRequests: input.specialRequests?.trim() ? input.specialRequests.trim() : null,
      reservationAt,
      tableId: null,
      legacyId: null,
    });
  }

  async listMine(userId: string): Promise<SeatingRequestRecord[]> {
    if (!userId) throw new ForbiddenException('Consumer authentication required');
    return this.repo.listRequestsByUser(userId);
  }

  async getMine(userId: string, requestId: string): Promise<SeatingRequestRecord> {
    if (!userId) throw new ForbiddenException('Consumer authentication required');
    const req = await this.repo.findRequestRecord(requestId);
    if (!req || req.userId !== userId) {
      throw new NotFoundException('Seating request not found');
    }
    return req;
  }

  async cancelMine(
    userId: string,
    requestId: string,
    cancelReason?: string | null,
  ): Promise<SeatingRequestRecord> {
    const current = await this.getMine(userId, requestId);
    if (!CONSUMER_CANCEL_FROM.includes(current.status)) {
      throw new BadRequestException(`Cannot cancel a diner in status ${current.status}`);
    }
    const cancelled = await this.repo.cancelOwnRequest({
      requestId,
      userId,
      cancelReason: cancelReason?.trim() ? cancelReason.trim() : null,
    });
    if (!cancelled) {
      throw new BadRequestException(`Cannot cancel a diner in status ${current.status}`);
    }
    return cancelled;
  }

  // ---- Slice 1: merchant ----
  async listMerchantRequests(
    principal: StaffPrincipal,
    query: ListMerchantDinerQuery,
  ): Promise<SeatingRequestRecord[]> {
    if (query.status && !SEATING_STATUSES.has(query.status)) {
      throw new BadRequestException('invalid seating status');
    }
    await this.assertRestaurant(principal, query.restaurantId);
    return this.repo.listRequestsByRestaurant(query.restaurantId, query.status);
  }

  async getMerchantRequest(
    principal: StaffPrincipal,
    requestId: string,
  ): Promise<SeatingRequestRecord> {
    const req = await this.requireMerchantRequest(principal, requestId);
    return req;
  }

  async acceptRequest(principal: StaffPrincipal, requestId: string): Promise<SeatingRequestRecord> {
    const req = await this.requireMerchantRequest(principal, requestId);
    if (req.status !== 'PENDING') {
      throw new BadRequestException(`Cannot accept a diner in status ${req.status}`);
    }
    const next = await this.repo.transitionRequest({
      requestId,
      from: ['PENDING'],
      to: 'NOT_SEATED',
      confirmedAt: new Date(),
    });
    if (!next) {
      throw new BadRequestException(`Cannot accept a diner in status ${req.status}`);
    }
    return next;
  }

  async seatRequest(
    principal: StaffPrincipal,
    requestId: string,
    tableId: string,
  ): Promise<SeatingRequestRecord> {
    if (!tableId) {
      throw new BadRequestException('tableId is required');
    }
    const req = await this.requireMerchantRequest(principal, requestId);
    if (req.status !== 'NOT_SEATED') {
      throw new BadRequestException(`Cannot seat a diner in status ${req.status}`);
    }
    try {
      return await this.repo.seatRequestOnTable({
        requestId,
        tableId,
        restaurantId: req.restaurantId,
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        const message = err.message;
        if (message === 'Table not found') throw new NotFoundException('Table not found');
        if (message === 'table does not belong to this restaurant') {
          throw new BadRequestException('table does not belong to this restaurant');
        }
        if (message.startsWith('Cannot seat')) {
          throw new BadRequestException(message);
        }
        throw err;
      }
      throw err;
    }
  }

  async completeRequest(
    principal: StaffPrincipal,
    requestId: string,
  ): Promise<SeatingRequestRecord> {
    const req = await this.requireMerchantRequest(principal, requestId);
    if (req.status !== 'SEATED') {
      throw new BadRequestException(`Cannot complete a diner in status ${req.status}`);
    }
    const next = await this.repo.completeSeatedRequest(requestId);
    if (!next) {
      throw new BadRequestException(`Cannot complete a diner in status ${req.status}`);
    }
    return next;
  }

  // ---- helpers ----

  private async requireMerchantRequest(
    principal: StaffPrincipal,
    requestId: string,
  ): Promise<SeatingRequestRecord> {
    const req = await this.repo.findRequestRecord(requestId);
    if (!req) {
      throw new NotFoundException('Seating request not found');
    }
    await this.assertRestaurant(principal, req.restaurantId);
    return req;
  }

  private async loadMerchantSeatingConfig(merchantId: string, restaurantId: string) {
    const rows = await this.subscriptions.findActiveByMerchant(merchantId);
    const forRestaurant = rows.find((r) => r.restaurantId === restaurantId);
    return (forRestaurant ?? rows[0])?.config ?? null;
  }

  /**
   * OD-SEAT-10 Slice 1 default: consumer SEATING intent cannot choose WALK_IN vs
   * WAITLIST. There is no restaurant seatingWaitingTime column (no migration).
   * If walkin_waitlist.value is true → WAITLIST; otherwise WALK_IN (legacy when
   * wait time is missing).
   */
  private deriveWalkInOrWaitlist(
    config: Parameters<SubscriptionConfigService['getPath']>[0],
  ): 'WALK_IN' | 'WAITLIST' {
    const waitlist = this.subscriptionConfig.getPath(config, [
      'casual_dining_status',
      'seating',
      'walkin_waitlist',
      'value',
    ]);
    return waitlist === true ? 'WAITLIST' : 'WALK_IN';
  }

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
