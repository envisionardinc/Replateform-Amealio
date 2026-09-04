import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CreateExperienceInput,
  ExperienceRecord,
  ExperienceTypeName,
  ExperienceKindName,
  ExperienceFoodModeName,
  ExperienceMenuModeName,
} from '../domain/experience.types';

const EXPERIENCE_INCLUDE = {
  menus: { select: { id: true, menuId: true, isDefault: true } },
} as const;

interface ResolvedCreate {
  merchantId: string;
  input: CreateExperienceInput;
  menuLinks: Array<{ menuId: string; isDefault: boolean }>;
}

/**
 * Write/read access for the merchant Experience configuration (P1.7.20) over the
 * new `Experience` + `ExperienceMenu` models. Experience + its menu links are
 * created/replaced atomically. Authorization/tenancy is enforced by ExperienceService.
 */
@Injectable()
export class ExperienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- scope resolvers ----
  async experienceScope(
    id: string,
  ): Promise<{ restaurantId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.experience.findUnique({
        where: { id },
        select: { restaurantId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  async categoryExists(id: string): Promise<boolean> {
    try {
      const c = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
      return !!c;
    } catch {
      return false;
    }
  }

  /** True iff the menu is a non-deleted CUSTOM menu of the given restaurant. */
  async menuIsCustomInRestaurant(menuId: string, restaurantId: string): Promise<boolean> {
    try {
      const m = await this.prisma.menu.findUnique({
        where: { id: menuId },
        select: { restaurantId: true, type: true, deletedAt: true },
      });
      return !!m && m.deletedAt === null && m.type === 'CUSTOM' && m.restaurantId === restaurantId;
    } catch {
      return false;
    }
  }

  // ---- create ----
  async create(args: ResolvedCreate): Promise<ExperienceRecord> {
    const { merchantId, input, menuLinks } = args;
    const created = await this.prisma.experience.create({
      data: {
        merchantId,
        restaurantId: input.restaurantId,
        legacyId: input.legacyId ?? null,
        categoryId: input.categoryId ?? null,
        subCategoryId: input.subCategoryId ?? null,
        name: input.name,
        description: input.description ?? null,
        ...(input.type !== undefined ? { type: input.type } : {}),
        expType: input.expType ?? null,
        ...(input.foodMode !== undefined ? { foodMode: input.foodMode } : {}),
        ...(input.menuMode !== undefined ? { menuMode: input.menuMode } : {}),
        foodDescription: input.foodDescription ?? null,
        occasionText: input.occasionText ?? null,
        totalSeats: input.totalSeats ?? null,
        minSeats: input.minSeats ?? null,
        maxSeats: input.maxSeats ?? null,
        listingPriceMinor: input.listingPriceMinor ?? null,
        adultPriceMinor: input.adultPriceMinor ?? null,
        kidsPriceMinor: input.kidsPriceMinor ?? null,
        occasionPriceMinor: input.occasionPriceMinor ?? null,
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
        startAt: toDate(input.startAt),
        endAt: toDate(input.endAt),
        scheduleConfig: (input.scheduleConfig ?? undefined) as Prisma.InputJsonValue | undefined,
        ...(menuLinks.length
          ? {
              menus: {
                create: menuLinks.map((l) => ({ menuId: l.menuId, isDefault: l.isDefault })),
              },
            }
          : {}),
      },
      select: { id: true },
    });
    return this.findByIdOrThrow(created.id);
  }

  async findById(id: string): Promise<ExperienceRecord | null> {
    try {
      const row = await this.prisma.experience.findUnique({
        where: { id },
        include: EXPERIENCE_INCLUDE,
      });
      return row ? toRecord(row) : null;
    } catch {
      return null;
    }
  }

  private async findByIdOrThrow(id: string): Promise<ExperienceRecord> {
    const row = await this.prisma.experience.findUniqueOrThrow({
      where: { id },
      include: EXPERIENCE_INCLUDE,
    });
    return toRecord(row);
  }

  async findByLegacyId(legacyId: string): Promise<ExperienceRecord | null> {
    const row = await this.prisma.experience.findUnique({
      where: { legacyId },
      include: EXPERIENCE_INCLUDE,
    });
    return row ? toRecord(row) : null;
  }

  async listByRestaurant(restaurantId: string): Promise<ExperienceRecord[]> {
    const rows = await this.prisma.experience.findMany({
      where: { restaurantId, deletedAt: null },
      include: EXPERIENCE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async update(id: string, data: Prisma.ExperienceUpdateInput): Promise<ExperienceRecord> {
    await this.prisma.experience.update({ where: { id }, data });
    return this.findByIdOrThrow(id);
  }

  async setPublication(id: string, active: boolean, isDraft: boolean): Promise<ExperienceRecord> {
    await this.prisma.experience.update({ where: { id }, data: { active, isDraft } });
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.experience.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Replace the experience's custom-menu links atomically. */
  async replaceMenus(
    experienceId: string,
    menuLinks: Array<{ menuId: string; isDefault: boolean }>,
  ): Promise<ExperienceRecord> {
    await this.prisma.$transaction([
      this.prisma.experienceMenu.deleteMany({ where: { experienceId } }),
      ...menuLinks.map((l) =>
        this.prisma.experienceMenu.create({
          data: { experienceId, menuId: l.menuId, isDefault: l.isDefault },
        }),
      ),
    ]);
    return this.findByIdOrThrow(experienceId);
  }
}

function toDate(v?: string | Date | null): Date | null {
  if (v === undefined || v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toRecord(row: {
  id: string;
  legacyId: string | null;
  merchantId: string;
  restaurantId: string;
  categoryId: string | null;
  subCategoryId: string | null;
  name: string;
  description: string | null;
  type: string;
  expType: string | null;
  foodMode: string;
  menuMode: string;
  foodDescription: string | null;
  occasionText: string | null;
  totalSeats: number | null;
  minSeats: number | null;
  maxSeats: number | null;
  listingPriceMinor: bigint | null;
  adultPriceMinor: bigint | null;
  kidsPriceMinor: bigint | null;
  occasionPriceMinor: bigint | null;
  currencyCode: string;
  startAt: Date | null;
  endAt: Date | null;
  active: boolean;
  isDraft: boolean;
  menus: Array<{ id: string; menuId: string; isDefault: boolean }>;
}): ExperienceRecord {
  return {
    id: row.id,
    legacyId: row.legacyId,
    merchantId: row.merchantId,
    restaurantId: row.restaurantId,
    categoryId: row.categoryId,
    subCategoryId: row.subCategoryId,
    name: row.name,
    description: row.description,
    type: row.type as ExperienceTypeName,
    expType: row.expType as ExperienceKindName | null,
    foodMode: row.foodMode as ExperienceFoodModeName,
    menuMode: row.menuMode as ExperienceMenuModeName,
    foodDescription: row.foodDescription,
    occasionText: row.occasionText,
    totalSeats: row.totalSeats,
    minSeats: row.minSeats,
    maxSeats: row.maxSeats,
    listingPriceMinor: row.listingPriceMinor,
    adultPriceMinor: row.adultPriceMinor,
    kidsPriceMinor: row.kidsPriceMinor,
    occasionPriceMinor: row.occasionPriceMinor,
    currencyCode: row.currencyCode,
    startAt: row.startAt,
    endAt: row.endAt,
    active: row.active,
    isDraft: row.isDraft,
    menus: row.menus,
  };
}
