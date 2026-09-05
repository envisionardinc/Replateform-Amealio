import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  SeatingAreaRecord,
  SeatingRequestRecord,
  SeatingStatusName,
  SeatingTypeName,
  TableRecord,
  TableStatusName,
} from '../domain/seating.types';

const AREA_SELECT = {
  id: true,
  restaurantId: true,
  name: true,
  legacyId: true,
  deletedAt: true,
} as const;
const TABLE_SELECT = {
  id: true,
  seatingAreaId: true,
  code: true,
  name: true,
  floor: true,
  shape: true,
  capacity: true,
  isActive: true,
  status: true,
  legacyId: true,
  deletedAt: true,
} as const;
const REQUEST_SELECT = {
  id: true,
  merchantId: true,
  restaurantId: true,
  userId: true,
  type: true,
  status: true,
  partySize: true,
  kidsCount: true,
  highChairs: true,
  specialRequests: true,
  reservationAt: true,
  tableId: true,
  confirmedAt: true,
  cancelReason: true,
  deletedAt: true,
  createdAt: true,
  table: { select: { code: true } },
} as const;

const ACTIVE_BOOKING: SeatingStatusName[] = ['PENDING', 'NOT_SEATED', 'SEATED'];

type LockedTable = {
  id: string;
  status: string;
  isActive: boolean;
  deletedAt: Date | null;
  seatingAreaId: string;
  restaurantId: string;
};

type LockedRequest = {
  id: string;
  status: string;
  restaurantId: string;
  tableId: string | null;
  deletedAt: Date | null;
};

/**
 * Write/read access for seating inventory (SeatingArea/RestaurantTable), the
 * physical-table RUNTIME status, and SeatingRequest bookings (P1.7.16 + 116
 * Slice 1). Reuses the EXISTING models; authorization/tenancy is enforced by
 * SeatingService. Table claim uses row locks + compare-and-set (no new allocator).
 */
@Injectable()
export class SeatingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Seating areas ----
  async createArea(data: {
    restaurantId: string;
    name: string;
    legacyId: string | null;
  }): Promise<SeatingAreaRecord> {
    const row = await this.prisma.seatingArea.create({
      data: { restaurantId: data.restaurantId, name: data.name, legacyId: data.legacyId },
      select: AREA_SELECT,
    });
    return this.toArea(row);
  }

  async findArea(
    id: string,
  ): Promise<{ id: string; restaurantId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.seatingArea.findUnique({
        where: { id },
        select: { id: true, restaurantId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  async listAreas(restaurantId: string): Promise<SeatingAreaRecord[]> {
    const rows = await this.prisma.seatingArea.findMany({
      where: { restaurantId, deletedAt: null },
      select: AREA_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toArea(r));
  }

  // ---- Tables ----
  async createTable(data: {
    seatingAreaId: string;
    code: string;
    name: string | null;
    floor: string | null;
    shape: string | null;
    capacity: number;
    isActive: boolean;
    legacyId: string | null;
  }): Promise<TableRecord> {
    const row = await this.prisma.restaurantTable.create({ data, select: TABLE_SELECT });
    return this.toTable(row);
  }

  async findTable(
    id: string,
  ): Promise<{ id: string; seatingAreaId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.restaurantTable.findUnique({
        where: { id },
        select: { id: true, seatingAreaId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  async setTableStatus(id: string, status: TableStatusName): Promise<TableRecord> {
    const row = await this.prisma.restaurantTable.update({
      where: { id },
      data: { status },
      select: TABLE_SELECT,
    });
    return this.toTable(row);
  }

  async listTablesByRestaurant(restaurantId: string): Promise<TableRecord[]> {
    const rows = await this.prisma.restaurantTable.findMany({
      where: { seatingArea: { restaurantId }, deletedAt: null },
      select: TABLE_SELECT,
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => this.toTable(r));
  }

  // ---- Seating requests ----
  async createRequest(data: {
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
    legacyId: string | null;
  }): Promise<SeatingRequestRecord> {
    const row = await this.prisma.seatingRequest.create({ data, select: REQUEST_SELECT });
    return this.toRequest(row);
  }

  async findRequest(
    id: string,
  ): Promise<{ id: string; restaurantId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.seatingRequest.findUnique({
        where: { id },
        select: { id: true, restaurantId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  async findRequestRecord(id: string): Promise<SeatingRequestRecord | null> {
    try {
      const row = await this.prisma.seatingRequest.findFirst({
        where: { id, deletedAt: null },
        select: REQUEST_SELECT,
      });
      return row ? this.toRequest(row) : null;
    } catch {
      return null;
    }
  }

  async listRequestsByUser(userId: string): Promise<SeatingRequestRecord[]> {
    const rows = await this.prisma.seatingRequest.findMany({
      where: { userId, deletedAt: null },
      select: REQUEST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toRequest(r));
  }

  async listRequestsByRestaurant(
    restaurantId: string,
    status?: SeatingStatusName,
  ): Promise<SeatingRequestRecord[]> {
    const rows = await this.prisma.seatingRequest.findMany({
      where: { restaurantId, deletedAt: null, ...(status ? { status } : {}) },
      select: REQUEST_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toRequest(r));
  }

  async findRestaurantTimezone(restaurantId: string): Promise<string> {
    const row = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    return row?.timezone || 'Asia/Kolkata';
  }

  async findActiveSeatingSameLocalDay(args: {
    userId: string;
    restaurantId: string;
    timeZone: string;
  }): Promise<SeatingRequestRecord[]> {
    return this.findActiveSeatingSameLocalDayOn(this.prisma, args);
  }

  /**
   * Create a consumer WALK_IN/WAITLIST only when no active same-local-day row
   * exists for the same user+restaurant. Serializes concurrent creates with a
   * transaction-scoped advisory lock (existing schema; no unique index).
   * RESERVATION must not use this path.
   */
  async createWalkInOrWaitlistIfNoActiveSameDay(data: {
    merchantId: string;
    restaurantId: string;
    userId: string;
    type: 'WALK_IN' | 'WAITLIST';
    status: SeatingStatusName;
    partySize: number;
    kidsCount: number | null;
    highChairs: number | null;
    specialRequests: string | null;
    reservationAt: Date | null;
    tableId: string | null;
    legacyId: string | null;
    timeZone: string;
  }): Promise<SeatingRequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const today = localDateKey(new Date(), data.timeZone);
      const lockKey = `seating-same-day:${data.userId}:${data.restaurantId}:${today}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await this.findActiveSeatingSameLocalDayOn(tx, {
        userId: data.userId,
        restaurantId: data.restaurantId,
        timeZone: data.timeZone,
      });
      if (existing.length > 0) {
        throw new ConflictException(
          'An active table request already exists for this restaurant today',
        );
      }

      const row = await tx.seatingRequest.create({
        data: {
          merchantId: data.merchantId,
          restaurantId: data.restaurantId,
          userId: data.userId,
          type: data.type,
          status: data.status,
          partySize: data.partySize,
          kidsCount: data.kidsCount,
          highChairs: data.highChairs,
          specialRequests: data.specialRequests,
          reservationAt: data.reservationAt,
          tableId: data.tableId,
          legacyId: data.legacyId,
        },
        select: REQUEST_SELECT,
      });
      return this.toRequest(row);
    });
  }

  private async findActiveSeatingSameLocalDayOn(
    db: {
      seatingRequest: {
        findMany: PrismaService['seatingRequest']['findMany'];
      };
    },
    args: {
      userId: string;
      restaurantId: string;
      timeZone: string;
    },
  ): Promise<SeatingRequestRecord[]> {
    const since = new Date(Date.now() - 36 * 3600_000);
    const rows = await db.seatingRequest.findMany({
      where: {
        userId: args.userId,
        restaurantId: args.restaurantId,
        type: { in: ['WALK_IN', 'WAITLIST'] },
        status: { in: ACTIVE_BOOKING },
        deletedAt: null,
        createdAt: { gte: since },
      },
      select: REQUEST_SELECT,
    });
    const today = localDateKey(new Date(), args.timeZone);
    return rows
      .filter((r) => localDateKey(r.createdAt, args.timeZone) === today)
      .map((r) => this.toRequest(r));
  }

  async updateRequest(
    id: string,
    data: {
      status?: SeatingStatusName;
      tableId?: string | null;
      confirmedAt?: Date | null;
      cancelReason?: string | null;
    },
  ): Promise<SeatingRequestRecord> {
    const row = await this.prisma.seatingRequest.update({
      where: { id },
      data,
      select: REQUEST_SELECT,
    });
    return this.toRequest(row);
  }

  /**
   * Compare-and-set booking status. Returns null when the current status is not
   * one of `from` (invalid / raced transition).
   */
  async transitionRequest(args: {
    requestId: string;
    from: SeatingStatusName[];
    to: SeatingStatusName;
    tableId?: string | null;
    confirmedAt?: Date | null;
    cancelReason?: string | null;
  }): Promise<SeatingRequestRecord | null> {
    const updated = await this.prisma.seatingRequest.updateMany({
      where: { id: args.requestId, status: { in: args.from }, deletedAt: null },
      data: {
        status: args.to,
        ...(args.tableId !== undefined ? { tableId: args.tableId } : {}),
        ...(args.confirmedAt !== undefined ? { confirmedAt: args.confirmedAt } : {}),
        ...(args.cancelReason !== undefined ? { cancelReason: args.cancelReason } : {}),
      },
    });
    if (updated.count !== 1) return null;
    return this.findRequestRecord(args.requestId);
  }

  /**
   * Seat a diner onto an AVAILABLE table in the same restaurant. Serializes
   * concurrent claims with FOR UPDATE on the table row, then compare-and-set
   * both the request (NOT_SEATED → SEATED) and the table (AVAILABLE → OCCUPIED).
   */
  async seatRequestOnTable(args: {
    requestId: string;
    tableId: string;
    restaurantId: string;
  }): Promise<SeatingRequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const tables = await tx.$queryRaw<LockedTable[]>`
        SELECT t.id,
               t.status::text AS status,
               t."isActive",
               t."deletedAt",
               t."seatingAreaId",
               a."restaurantId"
        FROM "RestaurantTable" t
        INNER JOIN "SeatingArea" a ON a.id = t."seatingAreaId"
        WHERE t.id = ${args.tableId}::uuid
        FOR UPDATE OF t
      `;
      const table = tables[0];
      if (!table || table.deletedAt !== null) {
        throw new ConflictException('Table not found');
      }
      if (table.restaurantId !== args.restaurantId) {
        throw new ConflictException('table does not belong to this restaurant');
      }
      if (!table.isActive) {
        throw new ConflictException('Table is not active');
      }
      if (table.status !== 'AVAILABLE') {
        throw new ConflictException('Table is not available');
      }

      const occupants = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "SeatingRequest"
        WHERE "tableId" = ${args.tableId}::uuid
          AND status::text IN ('PENDING', 'NOT_SEATED', 'SEATED')
          AND "deletedAt" IS NULL
          AND id <> ${args.requestId}::uuid
        FOR UPDATE
      `;
      if (occupants.length > 0) {
        throw new ConflictException('Table is already assigned to another diner');
      }

      const requests = await tx.$queryRaw<LockedRequest[]>`
        SELECT id, status::text AS status, "restaurantId", "tableId", "deletedAt"
        FROM "SeatingRequest"
        WHERE id = ${args.requestId}::uuid
        FOR UPDATE
      `;
      const req = requests[0];
      if (!req || req.deletedAt !== null) {
        throw new ConflictException('Seating request not found');
      }
      if (req.restaurantId !== args.restaurantId) {
        throw new ConflictException('table does not belong to this restaurant');
      }
      if (req.status !== 'NOT_SEATED') {
        throw new ConflictException(`Cannot seat a diner in status ${req.status}`);
      }

      const seated = await tx.seatingRequest.updateMany({
        where: { id: args.requestId, status: 'NOT_SEATED', deletedAt: null },
        data: { status: 'SEATED', tableId: args.tableId },
      });
      if (seated.count !== 1) {
        throw new ConflictException('Cannot seat a diner in the current status');
      }

      const occupied = await tx.restaurantTable.updateMany({
        where: {
          id: args.tableId,
          status: 'AVAILABLE',
          isActive: true,
          deletedAt: null,
        },
        data: { status: 'OCCUPIED' },
      });
      if (occupied.count !== 1) {
        throw new ConflictException('Table is not available');
      }

      const row = await tx.seatingRequest.findUniqueOrThrow({
        where: { id: args.requestId },
        select: REQUEST_SELECT,
      });
      return this.toRequest(row);
    });
  }

  async completeSeatedRequest(requestId: string): Promise<SeatingRequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const requests = await tx.$queryRaw<LockedRequest[]>`
        SELECT id, status::text AS status, "restaurantId", "tableId", "deletedAt"
        FROM "SeatingRequest"
        WHERE id = ${requestId}::uuid
        FOR UPDATE
      `;
      const req = requests[0];
      if (!req || req.deletedAt !== null) return null;
      if (req.status !== 'SEATED') return null;

      const updated = await tx.seatingRequest.updateMany({
        where: { id: requestId, status: 'SEATED', deletedAt: null },
        data: { status: 'COMPLETED' },
      });
      if (updated.count !== 1) return null;

      if (req.tableId) {
        await tx.restaurantTable.updateMany({
          where: { id: req.tableId, status: 'OCCUPIED', deletedAt: null },
          data: { status: 'DIRTY' },
        });
      }

      const row = await tx.seatingRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: REQUEST_SELECT,
      });
      return this.toRequest(row);
    });
  }

  async cancelOwnRequest(args: {
    requestId: string;
    userId: string;
    cancelReason?: string | null;
  }): Promise<SeatingRequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const requests = await tx.$queryRaw<(LockedRequest & { userId: string | null })[]>`
        SELECT id, status::text AS status, "restaurantId", "tableId", "deletedAt", "userId"
        FROM "SeatingRequest"
        WHERE id = ${args.requestId}::uuid
        FOR UPDATE
      `;
      const req = requests[0];
      if (!req || req.deletedAt !== null) return null;
      if (req.userId !== args.userId) return null;
      if (req.status !== 'PENDING' && req.status !== 'NOT_SEATED') return null;

      const updated = await tx.seatingRequest.updateMany({
        where: {
          id: args.requestId,
          userId: args.userId,
          status: { in: ['PENDING', 'NOT_SEATED'] },
          deletedAt: null,
        },
        data: { status: 'CANCELLED', cancelReason: args.cancelReason ?? null },
      });
      if (updated.count !== 1) return null;

      if (req.tableId) {
        await tx.restaurantTable.updateMany({
          where: { id: req.tableId, status: { in: ['ON_HOLD', 'OCCUPIED'] }, deletedAt: null },
          data: { status: 'AVAILABLE' },
        });
      }

      const row = await tx.seatingRequest.findUniqueOrThrow({
        where: { id: args.requestId },
        select: REQUEST_SELECT,
      });
      return this.toRequest(row);
    });
  }

  private toArea(row: {
    id: string;
    restaurantId: string;
    name: string;
    legacyId: string | null;
  }): SeatingAreaRecord {
    return { id: row.id, restaurantId: row.restaurantId, name: row.name, legacyId: row.legacyId };
  }

  private toTable(row: {
    id: string;
    seatingAreaId: string;
    code: string;
    name: string | null;
    floor: string | null;
    shape: string | null;
    capacity: number;
    isActive: boolean;
    status: string;
    legacyId: string | null;
  }): TableRecord {
    return {
      id: row.id,
      seatingAreaId: row.seatingAreaId,
      code: row.code,
      name: row.name,
      floor: row.floor,
      shape: row.shape,
      capacity: row.capacity,
      isActive: row.isActive,
      status: row.status as TableStatusName,
      legacyId: row.legacyId,
    };
  }

  private toRequest(row: {
    id: string;
    merchantId: string;
    restaurantId: string;
    userId: string | null;
    type: string;
    status: string;
    partySize: number;
    kidsCount: number | null;
    highChairs: number | null;
    specialRequests: string | null;
    reservationAt: Date | null;
    tableId: string | null;
    confirmedAt: Date | null;
    cancelReason: string | null;
    createdAt: Date;
    table?: { code: string } | null;
  }): SeatingRequestRecord {
    return {
      id: row.id,
      merchantId: row.merchantId,
      restaurantId: row.restaurantId,
      userId: row.userId,
      type: row.type as SeatingTypeName,
      status: row.status as SeatingStatusName,
      partySize: row.partySize,
      kidsCount: row.kidsCount,
      highChairs: row.highChairs,
      specialRequests: row.specialRequests,
      reservationAt: row.reservationAt,
      tableId: row.tableId,
      tableCode: row.table?.code ?? null,
      confirmedAt: row.confirmedAt,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
    };
  }
}

function localDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
