import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { MenuRecord, MenuSectionRecord, MenuTypeName } from '../domain/catalog.types';

const MENU_SELECT = {
  id: true,
  legacyId: true,
  merchantId: true,
  restaurantId: true,
  name: true,
  type: true,
  visibility: true,
  deletedAt: true,
} as const;

const SECTION_SELECT = {
  id: true,
  menuId: true,
  categoryId: true,
  name: true,
  sortOrder: true,
} as const;

type MenuRow = Omit<MenuRecord, 'type'> & { type: string };

function toMenu(row: MenuRow): MenuRecord {
  return { ...row, type: row.type as MenuTypeName };
}

/**
 * Read access to merchant-owned `Menu` + `MenuSection` (P1.7.5). Read-only — no
 * menu CRUD/publishing. "Visible" listings exclude soft-deleted (`deletedAt`)
 * and `visibility=false` menus. Tenancy is enforced by `CatalogService`, not here.
 */
@Injectable()
export class MenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MenuRecord | null> {
    try {
      const row = await this.prisma.menu.findUnique({ where: { id }, select: MENU_SELECT });
      return row ? toMenu(row) : null;
    } catch {
      return null;
    }
  }

  async findByLegacyId(legacyId: string): Promise<MenuRecord | null> {
    const row = await this.prisma.menu.findUnique({ where: { legacyId }, select: MENU_SELECT });
    return row ? toMenu(row) : null;
  }

  /** Non-deleted menus for a restaurant. `visibleOnly` also drops hidden menus. */
  async listByRestaurant(restaurantId: string, visibleOnly = false): Promise<MenuRecord[]> {
    const rows = await this.prisma.menu.findMany({
      where: { restaurantId, deletedAt: null, ...(visibleOnly ? { visibility: true } : {}) },
      select: MENU_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toMenu);
  }

  /** Non-deleted menus for a merchant (across its restaurants). */
  async listByMerchant(merchantId: string): Promise<MenuRecord[]> {
    const rows = await this.prisma.menu.findMany({
      where: { merchantId, deletedAt: null },
      select: MENU_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toMenu);
  }

  /** Sections of a menu (ordered by sortOrder), incl. optional Category link. */
  listSections(menuId: string): Promise<MenuSectionRecord[]> {
    return this.prisma.menuSection.findMany({
      where: { menuId },
      select: SECTION_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Consumer Custom Menus only. Persisted STANDARD rows are never the à-la-carte projection. */
  async listVisibleCustomMenus(restaurantId: string): Promise<MenuRecord[]> {
    const rows = await this.prisma.menu.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        visibility: true,
        type: 'CUSTOM',
      },
      select: MENU_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toMenu);
  }

  async findVisibleCustomMenu(
    menuId: string,
  ): Promise<(MenuRecord & { sections: MenuSectionRecord[] }) | null> {
    try {
      const row = await this.prisma.menu.findFirst({
        where: { id: menuId, deletedAt: null, visibility: true, type: 'CUSTOM' },
        select: {
          ...MENU_SELECT,
          sections: { select: SECTION_SELECT, orderBy: { sortOrder: 'asc' } },
        },
      });
      return row ? { ...toMenu(row), sections: row.sections } : null;
    } catch {
      return null;
    }
  }
}
