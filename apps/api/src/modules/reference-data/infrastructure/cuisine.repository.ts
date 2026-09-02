import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { CuisineRecord } from '../domain/reference-data.types';

const CUISINE_SELECT = {
  id: true,
  legacyId: true,
  name: true,
  description: true,
  icon: true,
  status: true,
} as const;

/**
 * Read access to the platform `Cuisine` lookup (P1.7.4). Read-only. Kept as a
 * dedicated lookup per P1.4; the legacy overlap between the `Cusine` collection
 * and cuisine-as-`Sub Category` is an owner decision (doc 31), not resolved here.
 */
@Injectable()
export class CuisineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CuisineRecord | null> {
    try {
      return await this.prisma.cuisine.findUnique({ where: { id }, select: CUISINE_SELECT });
    } catch {
      return null;
    }
  }

  findByLegacyId(legacyId: string): Promise<CuisineRecord | null> {
    return this.prisma.cuisine.findUnique({ where: { legacyId }, select: CUISINE_SELECT });
  }

  findByName(name: string): Promise<CuisineRecord | null> {
    return this.prisma.cuisine.findUnique({ where: { name }, select: CUISINE_SELECT });
  }

  listAll(): Promise<CuisineRecord[]> {
    return this.prisma.cuisine.findMany({ select: CUISINE_SELECT, orderBy: { name: 'asc' } });
  }
}
