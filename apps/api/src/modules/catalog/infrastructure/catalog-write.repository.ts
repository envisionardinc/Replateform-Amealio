import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  AddOnGroupRecord,
  AddOnRecord,
  ChannelConfigRecord,
  CreateItemInput,
  CreateMenuInput,
  CreateSectionInput,
  ItemRecord,
  ItemVariantRecord,
  MenuRecord,
  MenuTypeName,
  OrderTypeName,
  SectionRecord,
  UpdateItemInput,
  UpdateMenuInput,
  UpdateSectionInput,
  VariantInput,
} from '../domain/catalog-write.types';

const ITEM_INCLUDE = {
  variants: true,
  channelConfigs: true,
  addOnGroups: { include: { addOns: true } },
} as const;

/**
 * Write access for the merchant catalog (P1.7.18) over the EXISTING models.
 * Item creation with its variants/channel-configs/add-on groups is one atomic
 * nested write. Authorization/tenancy is enforced by CatalogWriteService.
 */
@Injectable()
export class CatalogWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- scope resolvers (return the owning restaurantId, or null) ----
  async menuRestaurant(
    id: string,
  ): Promise<{ restaurantId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.menu.findUnique({
        where: { id },
        select: { restaurantId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }
  async sectionRestaurant(id: string): Promise<{ menuId: string; restaurantId: string } | null> {
    try {
      const s = await this.prisma.menuSection.findUnique({
        where: { id },
        select: { menuId: true, menu: { select: { restaurantId: true } } },
      });
      return s ? { menuId: s.menuId, restaurantId: s.menu.restaurantId } : null;
    } catch {
      return null;
    }
  }
  async itemRestaurant(
    id: string,
  ): Promise<{ restaurantId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.menuItem.findUnique({
        where: { id },
        select: { restaurantId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }
  async variantRestaurant(
    id: string,
  ): Promise<{ menuItemId: string; restaurantId: string } | null> {
    try {
      const v = await this.prisma.itemVariant.findUnique({
        where: { id },
        select: { menuItemId: true, menuItem: { select: { restaurantId: true } } },
      });
      return v ? { menuItemId: v.menuItemId, restaurantId: v.menuItem.restaurantId } : null;
    } catch {
      return null;
    }
  }
  async groupRestaurant(id: string): Promise<{ menuItemId: string; restaurantId: string } | null> {
    try {
      const g = await this.prisma.addOnGroup.findUnique({
        where: { id },
        select: { menuItemId: true, menuItem: { select: { restaurantId: true } } },
      });
      return g ? { menuItemId: g.menuItemId, restaurantId: g.menuItem.restaurantId } : null;
    } catch {
      return null;
    }
  }
  async addOnRestaurant(
    id: string,
  ): Promise<{ addOnGroupId: string; restaurantId: string } | null> {
    try {
      const a = await this.prisma.addOn.findUnique({
        where: { id },
        select: {
          addOnGroupId: true,
          addOnGroup: { select: { menuItem: { select: { restaurantId: true } } } },
        },
      });
      return a
        ? { addOnGroupId: a.addOnGroupId, restaurantId: a.addOnGroup.menuItem.restaurantId }
        : null;
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

  // ---- Menu ----
  async createMenu(merchantId: string, input: CreateMenuInput): Promise<MenuRecord> {
    const row = await this.prisma.menu.create({
      data: {
        merchantId,
        restaurantId: input.restaurantId,
        name: input.name,
        description: input.description ?? null,
        type: (input.type ?? 'CUSTOM') as MenuTypeName,
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        legacyId: input.legacyId ?? null,
      },
      select: MENU_SELECT,
    });
    return toMenu(row);
  }
  async updateMenu(id: string, input: UpdateMenuInput): Promise<MenuRecord> {
    const row = await this.prisma.menu.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      },
      select: MENU_SELECT,
    });
    return toMenu(row);
  }

  // ---- Section ----
  async createSection(input: CreateSectionInput): Promise<SectionRecord> {
    const row = await this.prisma.menuSection.create({
      data: {
        menuId: input.menuId,
        name: input.name,
        description: input.description ?? null,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        categoryId: input.categoryId ?? null,
      },
      select: SECTION_SELECT,
    });
    return row as SectionRecord;
  }
  async updateSection(id: string, input: UpdateSectionInput): Promise<SectionRecord> {
    const row = await this.prisma.menuSection.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      },
      select: SECTION_SELECT,
    });
    return row as SectionRecord;
  }
  /** Batch section reorder within a single transaction. */
  async reorderSections(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.menuSection.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } }),
      ),
    );
  }
  async sectionMenuId(id: string): Promise<string | null> {
    const s = await this.prisma.menuSection.findUnique({ where: { id }, select: { menuId: true } });
    return s?.menuId ?? null;
  }

  // ---- Item (+ nested children, atomic) ----
  async createItem(merchantId: string, input: CreateItemInput): Promise<ItemRecord> {
    const row = await this.prisma.menuItem.create({
      data: {
        merchantId,
        restaurantId: input.restaurantId,
        menuSectionId: input.menuSectionId ?? null,
        name: input.name,
        description: input.description ?? null,
        ...(input.availability !== undefined ? { availability: input.availability } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        posItemId: input.posItemId ?? null,
        legacyId: input.legacyId ?? null,
        ...(input.variants && input.variants.length
          ? { variants: { create: input.variants.map(variantData) } }
          : {}),
        ...(input.channelConfigs && input.channelConfigs.length
          ? {
              channelConfigs: {
                create: input.channelConfigs.map((c) => ({
                  channel: c.channel,
                  ...(c.enabled !== undefined ? { enabled: c.enabled } : {}),
                  priceOverrideMinor: c.priceOverrideMinor ?? null,
                  surcharges: (c.surcharges ?? undefined) as Prisma.InputJsonValue | undefined,
                })),
              },
            }
          : {}),
        ...(input.addOnGroups && input.addOnGroups.length
          ? {
              addOnGroups: {
                create: input.addOnGroups.map((g) => ({
                  name: g.name,
                  ...(g.minSelect !== undefined ? { minSelect: g.minSelect } : {}),
                  maxSelect: g.maxSelect ?? null,
                  ...(g.addOns && g.addOns.length
                    ? {
                        addOns: {
                          create: g.addOns.map((a) => ({
                            name: a.name,
                            ...(a.priceMinor !== undefined ? { priceMinor: a.priceMinor } : {}),
                            ...(a.currencyCode !== undefined
                              ? { currencyCode: a.currencyCode }
                              : {}),
                          })),
                        },
                      }
                    : {}),
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });
    return this.findItem(row.id);
  }
  async updateItem(id: string, input: UpdateItemInput): Promise<ItemRecord> {
    await this.prisma.menuItem.update({
      where: { id },
      data: {
        ...(input.menuSectionId !== undefined ? { menuSectionId: input.menuSectionId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.availability !== undefined ? { availability: input.availability } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.posItemId !== undefined ? { posItemId: input.posItemId } : {}),
      },
    });
    return this.findItem(id);
  }
  async findItem(id: string): Promise<ItemRecord> {
    const row = await this.prisma.menuItem.findUniqueOrThrow({
      where: { id },
      include: ITEM_INCLUDE,
    });
    return toItem(row);
  }

  // ---- Variant ----
  async createVariant(menuItemId: string, input: VariantInput): Promise<ItemVariantRecord> {
    const row = await this.prisma.itemVariant.create({
      data: { menuItemId, ...variantData(input) },
      select: VARIANT_SELECT,
    });
    return row as ItemVariantRecord;
  }
  async updateVariant(id: string, input: Partial<VariantInput>): Promise<ItemVariantRecord> {
    const row = await this.prisma.itemVariant.update({
      where: { id },
      data: {
        ...(input.size !== undefined ? { size: input.size } : {}),
        ...(input.uomId !== undefined ? { uomId: input.uomId } : {}),
        ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
        ...(input.pax !== undefined ? { pax: input.pax } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.available !== undefined ? { available: input.available } : {}),
      },
      select: VARIANT_SELECT,
    });
    return row as ItemVariantRecord;
  }

  // ---- Channel config (upsert on [menuItemId, channel]) ----
  async upsertChannelConfig(
    menuItemId: string,
    channel: OrderTypeName,
    data: { enabled?: boolean; priceOverrideMinor?: bigint | null; surcharges?: unknown | null },
  ): Promise<ChannelConfigRecord> {
    const surcharges = (data.surcharges ?? undefined) as Prisma.InputJsonValue | undefined;
    const row = await this.prisma.itemChannelConfig.upsert({
      where: { menuItemId_channel: { menuItemId, channel } },
      create: {
        menuItemId,
        channel,
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        priceOverrideMinor: data.priceOverrideMinor ?? null,
        surcharges,
      },
      update: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.priceOverrideMinor !== undefined
          ? { priceOverrideMinor: data.priceOverrideMinor }
          : {}),
        ...(data.surcharges !== undefined ? { surcharges } : {}),
      },
      select: {
        id: true,
        menuItemId: true,
        channel: true,
        enabled: true,
        priceOverrideMinor: true,
      },
    });
    return row as ChannelConfigRecord;
  }

  // ---- Add-ons ----
  async createAddOnGroup(
    menuItemId: string,
    data: { name: string; minSelect?: number; maxSelect?: number | null },
  ): Promise<AddOnGroupRecord> {
    const row = await this.prisma.addOnGroup.create({
      data: {
        menuItemId,
        name: data.name,
        ...(data.minSelect !== undefined ? { minSelect: data.minSelect } : {}),
        maxSelect: data.maxSelect ?? null,
      },
      include: { addOns: true },
    });
    return toGroup(row);
  }
  async updateAddOnGroup(
    id: string,
    data: { name?: string; minSelect?: number; maxSelect?: number | null },
  ): Promise<AddOnGroupRecord> {
    const row = await this.prisma.addOnGroup.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.minSelect !== undefined ? { minSelect: data.minSelect } : {}),
        ...(data.maxSelect !== undefined ? { maxSelect: data.maxSelect } : {}),
      },
      include: { addOns: true },
    });
    return toGroup(row);
  }
  async createAddOn(
    addOnGroupId: string,
    data: { name: string; priceMinor?: bigint; currencyCode?: string },
  ): Promise<AddOnRecord> {
    const row = await this.prisma.addOn.create({
      data: {
        addOnGroupId,
        name: data.name,
        ...(data.priceMinor !== undefined ? { priceMinor: data.priceMinor } : {}),
        ...(data.currencyCode !== undefined ? { currencyCode: data.currencyCode } : {}),
      },
      select: ADDON_SELECT,
    });
    return row as AddOnRecord;
  }
  async updateAddOn(
    id: string,
    data: { name?: string; priceMinor?: bigint; currencyCode?: string },
  ): Promise<AddOnRecord> {
    const row = await this.prisma.addOn.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.priceMinor !== undefined ? { priceMinor: data.priceMinor } : {}),
        ...(data.currencyCode !== undefined ? { currencyCode: data.currencyCode } : {}),
      },
      select: ADDON_SELECT,
    });
    return row as AddOnRecord;
  }
}

const MENU_SELECT = {
  id: true,
  merchantId: true,
  restaurantId: true,
  name: true,
  description: true,
  type: true,
  visibility: true,
  legacyId: true,
} as const;
const SECTION_SELECT = {
  id: true,
  menuId: true,
  categoryId: true,
  name: true,
  description: true,
  sortOrder: true,
} as const;
const VARIANT_SELECT = {
  id: true,
  menuItemId: true,
  size: true,
  uomId: true,
  priceMinor: true,
  currencyCode: true,
  pax: true,
  isDefault: true,
  available: true,
} as const;
const ADDON_SELECT = {
  id: true,
  addOnGroupId: true,
  name: true,
  priceMinor: true,
  currencyCode: true,
} as const;

function variantData(input: VariantInput) {
  return {
    size: input.size ?? null,
    uomId: input.uomId ?? null,
    priceMinor: input.priceMinor,
    ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
    pax: input.pax ?? null,
    ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    ...(input.available !== undefined ? { available: input.available } : {}),
  };
}

function toMenu(row: {
  id: string;
  merchantId: string;
  restaurantId: string;
  name: string;
  description: string | null;
  type: string;
  visibility: boolean;
  legacyId: string | null;
}): MenuRecord {
  return { ...row, type: row.type as MenuTypeName };
}

function toItem(row: any): ItemRecord {
  return {
    id: row.id,
    merchantId: row.merchantId,
    restaurantId: row.restaurantId,
    menuSectionId: row.menuSectionId,
    name: row.name,
    description: row.description,
    availability: row.availability,
    isPublished: row.isPublished,
    posItemId: row.posItemId,
    legacyId: row.legacyId,
    variants: (row.variants ?? []) as ItemVariantRecord[],
    channelConfigs: (row.channelConfigs ?? []).map((c: any) => ({
      id: c.id,
      menuItemId: c.menuItemId,
      channel: c.channel,
      enabled: c.enabled,
      priceOverrideMinor: c.priceOverrideMinor,
    })),
    addOnGroups: (row.addOnGroups ?? []).map(toGroup),
  };
}

function toGroup(row: any): AddOnGroupRecord {
  return {
    id: row.id,
    menuItemId: row.menuItemId,
    name: row.name,
    minSelect: row.minSelect,
    maxSelect: row.maxSelect,
    addOns: (row.addOns ?? []).map((a: any) => ({
      id: a.id,
      addOnGroupId: a.addOnGroupId,
      name: a.name,
      priceMinor: a.priceMinor,
      currencyCode: a.currencyCode,
    })),
  };
}
