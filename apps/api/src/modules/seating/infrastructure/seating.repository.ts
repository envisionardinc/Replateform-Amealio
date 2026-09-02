import { Injectable } from '@nestjs/common';
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
} as const;

/**
 * Write/read access for seating inventory (SeatingArea/RestaurantTable), the
 * physical-table RUNTIME status, and SeatingRequest bookings (P1.7.16). Reuses
 * the EXISTING models; authorization/tenancy is enforced by SeatingService.
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
      confirmedAt: row.confirmedAt,
      cancelReason: row.cancelReason,
    };
  }
}
