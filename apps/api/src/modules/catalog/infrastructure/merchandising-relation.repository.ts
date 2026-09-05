import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  MerchandisingItemRef,
  MerchandisingRelationRecord,
  MerchandisingRelationStatusName,
  MerchandisingRelationTypeName,
} from '../domain/merchandising-relation';

const SELECT = {
  id: true,
  merchantId: true,
  restaurantId: true,
  type: true,
  sourceItemId: true,
  targetItemId: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = {
  id: string;
  merchantId: string;
  restaurantId: string;
  type: string;
  sourceItemId: string;
  targetItemId: string;
  sortOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: Row): MerchandisingRelationRecord {
  return {
    ...row,
    type: row.type as MerchandisingRelationTypeName,
    status: row.status as MerchandisingRelationStatusName,
  };
}

@Injectable()
export class MerchandisingRelationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MerchandisingRelationRecord | null> {
    const row = await this.prisma.merchandisingRelation.findUnique({
      where: { id },
      select: SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findPair(
    sourceItemId: string,
    targetItemId: string,
    type: MerchandisingRelationTypeName,
  ): Promise<MerchandisingRelationRecord | null> {
    const row = await this.prisma.merchandisingRelation.findUnique({
      where: { sourceItemId_targetItemId_type: { sourceItemId, targetItemId, type } },
      select: SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async listForSource(sourceItemId: string): Promise<MerchandisingRelationRecord[]> {
    const rows = await this.prisma.merchandisingRelation.findMany({
      where: { sourceItemId },
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async listForRestaurant(restaurantId: string): Promise<MerchandisingRelationRecord[]> {
    const rows = await this.prisma.merchandisingRelation.findMany({
      where: { restaurantId },
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async create(data: {
    merchantId: string;
    restaurantId: string;
    type: MerchandisingRelationTypeName;
    sourceItemId: string;
    targetItemId: string;
    sortOrder: number;
    status: MerchandisingRelationStatusName;
  }): Promise<MerchandisingRelationRecord> {
    const row = await this.prisma.merchandisingRelation.create({
      data,
      select: SELECT,
    });
    return toRecord(row);
  }

  async update(
    id: string,
    data: { sortOrder?: number; status?: MerchandisingRelationStatusName },
  ): Promise<MerchandisingRelationRecord> {
    const row = await this.prisma.merchandisingRelation.update({
      where: { id },
      data,
      select: SELECT,
    });
    return toRecord(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.merchandisingRelation.delete({ where: { id } });
  }

  async loadItem(id: string): Promise<MerchandisingItemRef | null> {
    const row = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, merchantId: true, restaurantId: true, deletedAt: true },
    });
    return row;
  }
}
