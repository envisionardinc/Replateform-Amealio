import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type AddressRow = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  lat: number | null;
  lon: number | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AddressWrite = {
  label?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  isDefault?: boolean;
};

export const ADDRESS_SELECT = {
  id: true,
  label: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  pinCode: true,
  lat: true,
  lon: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  listMine(userId: string): Promise<AddressRow[]> {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      select: ADDRESS_SELECT,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  countLive(tx: Prisma.TransactionClient, userId: string): Promise<number> {
    return tx.address.count({ where: { userId, deletedAt: null } });
  }

  findActiveMine(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    id: string,
  ): Promise<AddressRow | null> {
    return tx.address.findFirst({
      where: { id, userId, deletedAt: null },
      select: ADDRESS_SELECT,
    });
  }

  clearDefaults(
    tx: Prisma.TransactionClient,
    userId: string,
    exceptId?: string,
  ): Promise<Prisma.BatchPayload> {
    return tx.address.updateMany({
      where: {
        userId,
        deletedAt: null,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  createMine(
    tx: Prisma.TransactionClient,
    userId: string,
    data: AddressWrite & { line1: string; isDefault: boolean },
  ): Promise<AddressRow> {
    return tx.address.create({
      data: {
        userId,
        label: data.label ?? null,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        pinCode: data.pinCode ?? null,
        isDefault: data.isDefault,
      },
      select: ADDRESS_SELECT,
    });
  }

  updateMine(tx: Prisma.TransactionClient, id: string, data: AddressWrite): Promise<AddressRow> {
    return tx.address.update({
      where: { id },
      data,
      select: ADDRESS_SELECT,
    });
  }

  async softDeleteMine(userId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.address.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.address.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
    return true;
  }
}
