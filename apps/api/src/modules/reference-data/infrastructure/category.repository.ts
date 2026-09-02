import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { CategoryRecord } from '../domain/reference-data.types';

const CATEGORY_SELECT = {
  id: true,
  legacyId: true,
  name: true,
  code: true,
  type: true,
  description: true,
  icon: true,
  iconCode: true,
  hexColor: true,
  status: true,
  parentId: true,
  deletedAt: true,
} as const;

/**
 * Read access to the platform `Category` taxonomy (P1.7.4). Read-only — no
 * admin taxonomy CRUD is built in this foundation slice. "Active" listings
 * exclude soft-deleted rows; `status` is returned raw (not interpreted).
 */
@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CategoryRecord | null> {
    try {
      return await this.prisma.category.findUnique({ where: { id }, select: CATEGORY_SELECT });
    } catch {
      return null;
    }
  }

  findByLegacyId(legacyId: string): Promise<CategoryRecord | null> {
    return this.prisma.category.findUnique({ where: { legacyId }, select: CATEGORY_SELECT });
  }

  findByCode(code: string): Promise<CategoryRecord | null> {
    return this.prisma.category.findUnique({ where: { code }, select: CATEGORY_SELECT });
  }

  /** Top-level (parentless), non-deleted categories, optionally filtered by type. */
  listRoots(type?: string): Promise<CategoryRecord[]> {
    return this.prisma.category.findMany({
      where: { parentId: null, deletedAt: null, ...(type ? { type } : {}) },
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /** Non-deleted children of a parent category (e.g. the legacy Sub Category set). */
  listChildren(parentId: string): Promise<CategoryRecord[]> {
    return this.prisma.category.findMany({
      where: { parentId, deletedAt: null },
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /** Non-deleted categories of a given `type` (taxonomy kind). */
  listByType(type: string): Promise<CategoryRecord[]> {
    return this.prisma.category.findMany({
      where: { type, deletedAt: null },
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    });
  }
}
