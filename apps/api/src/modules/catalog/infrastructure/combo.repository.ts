import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  ComboComponentAvailability,
  ComboRecord,
} from '../domain/combo';
import type { ItemAvailabilityName } from '../domain/catalog-write.types';
import type { OrderChannel } from '../domain/catalog.types';

const COMBO_INCLUDE = {
  slots: { include: { options: true }, orderBy: { sortOrder: 'asc' as const } },
  sections: true,
} as const;

@Injectable()
export class ComboRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    merchantId: string;
    restaurantId: string;
    name: string;
    description?: string | null;
    isPublished?: boolean;
    availability?: ItemAvailabilityName;
    substitutable?: boolean;
    comboPriceMinor: bigint;
    currencyCode?: string;
    sortOrder?: number;
    slots: Array<{
      name?: string | null;
      sortOrder?: number;
      options: Array<{ menuItemId: string; isDefault?: boolean; sortOrder?: number }>;
    }>;
    sectionIds?: string[];
  }): Promise<ComboRecord> {
    const row = await this.prisma.combo.create({
      data: {
        merchantId: data.merchantId,
        restaurantId: data.restaurantId,
        name: data.name,
        description: data.description ?? null,
        isPublished: data.isPublished ?? false,
        availability: data.availability ?? 'AVAILABLE',
        substitutable: data.substitutable ?? false,
        comboPriceMinor: data.comboPriceMinor,
        currencyCode: data.currencyCode ?? 'INR',
        sortOrder: data.sortOrder ?? 0,
        slots: {
          create: data.slots.map((slot, index) => ({
            name: slot.name ?? null,
            sortOrder: slot.sortOrder ?? index,
            options: {
              create: slot.options.map((option, optionIndex) => ({
                menuItemId: option.menuItemId,
                isDefault: option.isDefault ?? optionIndex === 0,
                sortOrder: option.sortOrder ?? optionIndex,
              })),
            },
          })),
        },
        sections: data.sectionIds?.length
          ? { create: data.sectionIds.map((menuSectionId) => ({ menuSectionId })) }
          : undefined,
      },
      include: COMBO_INCLUDE,
    });
    return this.toRecord(row);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      isPublished?: boolean;
      availability?: ItemAvailabilityName;
      substitutable?: boolean;
      comboPriceMinor?: bigint;
      sortOrder?: number;
      deletedAt?: Date | null;
    },
  ): Promise<ComboRecord> {
    const row = await this.prisma.combo.update({
      where: { id },
      data,
      include: COMBO_INCLUDE,
    });
    return this.toRecord(row);
  }

  async findById(id: string): Promise<ComboRecord | null> {
    const row = await this.prisma.combo.findUnique({ where: { id }, include: COMBO_INCLUDE });
    return row ? this.toRecord(row) : null;
  }

  async listForRestaurant(restaurantId: string, publishedOnly = false): Promise<ComboRecord[]> {
    const rows = await this.prisma.combo.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        ...(publishedOnly ? { isPublished: true } : {}),
      },
      include: COMBO_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async listForSections(sectionIds: string[]): Promise<ComboRecord[]> {
    if (sectionIds.length === 0) return [];
    const rows = await this.prisma.combo.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
        sections: { some: { menuSectionId: { in: sectionIds } } },
      },
      include: COMBO_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async loadComponents(
    menuItemIds: string[],
    channel?: OrderChannel,
  ): Promise<ComboComponentAvailability[]> {
    if (menuItemIds.length === 0) return [];
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: {
        variants: true,
        channelConfigs: channel ? { where: { channel } } : true,
      },
    });
    return items.map((item) => {
      const config = channel
        ? item.channelConfigs.find((row) => row.channel === channel)
        : undefined;
      return {
        menuItemId: item.id,
        restaurantId: item.restaurantId,
        merchantId: item.merchantId,
        deletedAt: item.deletedAt,
        isPublished: item.isPublished,
        availability: item.availability,
        channelEnabled: channel ? (config?.enabled ?? true) : null,
        hasAvailableVariant: item.variants.some((variant) => variant.available),
        name: item.name,
      };
    });
  }

  async assertItemsInRestaurant(menuItemIds: string[], restaurantId: string, merchantId: string) {
    const count = await this.prisma.menuItem.count({
      where: { id: { in: menuItemIds }, restaurantId, merchantId, deletedAt: null },
    });
    return count === new Set(menuItemIds).size;
  }

  async assertSectionsInRestaurant(sectionIds: string[], restaurantId: string) {
    if (sectionIds.length === 0) return true;
    const count = await this.prisma.menuSection.count({
      where: { id: { in: sectionIds }, menu: { restaurantId, deletedAt: null } },
    });
    return count === new Set(sectionIds).size;
  }

  private toRecord(row: {
    id: string;
    merchantId: string;
    restaurantId: string;
    name: string;
    description: string | null;
    isPublished: boolean;
    availability: string;
    substitutable: boolean;
    comboPriceMinor: bigint;
    currencyCode: string;
    sortOrder: number;
    deletedAt: Date | null;
    slots: Array<{
      id: string;
      name: string | null;
      sortOrder: number;
      options: Array<{
        id: string;
        menuItemId: string;
        isDefault: boolean;
        sortOrder: number;
      }>;
    }>;
    sections: Array<{ menuSectionId: string }>;
  }): ComboRecord {
    return {
      id: row.id,
      merchantId: row.merchantId,
      restaurantId: row.restaurantId,
      name: row.name,
      description: row.description,
      isPublished: row.isPublished,
      availability: row.availability as ComboRecord['availability'],
      substitutable: row.substitutable,
      comboPriceMinor: row.comboPriceMinor,
      currencyCode: row.currencyCode,
      sortOrder: row.sortOrder,
      deletedAt: row.deletedAt,
      slots: row.slots.map((slot) => ({
        id: slot.id,
        name: slot.name,
        sortOrder: slot.sortOrder,
        options: slot.options.map((option) => ({
          id: option.id,
          menuItemId: option.menuItemId,
          isDefault: option.isDefault,
          sortOrder: option.sortOrder,
        })),
      })),
      sectionIds: row.sections.map((section) => section.menuSectionId),
    };
  }
}

export type ComboCreateData = Parameters<ComboRepository['create']>[0];
