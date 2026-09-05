import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CheckoutCatalogLine,
  ConsumerCatalogItem,
  ItemAvailabilityName,
  ItemChannelConfigRecord,
  ItemVariantRecord,
  MenuItemDetail,
  MenuItemRecord,
  OrderChannel,
} from '../domain/catalog.types';
import type { CatalogMerchandiseItem } from '../domain/merchandise-configuration';

const ITEM_SELECT = {
  id: true,
  legacyId: true,
  merchantId: true,
  restaurantId: true,
  menuSectionId: true,
  name: true,
  description: true,
  availability: true,
  isPublished: true,
  posItemId: true,
  deletedAt: true,
} as const;

type ItemRow = Omit<MenuItemRecord, 'availability'> & { availability: string };

function toItem(row: ItemRow): MenuItemRecord {
  return { ...row, availability: row.availability as ItemAvailabilityName };
}

/**
 * Read access to merchant-owned `MenuItem` and its catalog sub-structure —
 * `ItemVariant` (money as exact `bigint` minor units), `ItemChannelConfig`
 * (per `OrderType` channel), `AddOnGroup`/`AddOn` (P1.7.5). Read-only; no
 * ordering/cart/POS behavior. Tenancy is enforced by `CatalogService`.
 */
@Injectable()
export class MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MenuItemRecord | null> {
    try {
      const row = await this.prisma.menuItem.findUnique({ where: { id }, select: ITEM_SELECT });
      return row ? toItem(row) : null;
    } catch {
      return null;
    }
  }

  async findByLegacyId(legacyId: string): Promise<MenuItemRecord | null> {
    const row = await this.prisma.menuItem.findUnique({
      where: { legacyId },
      select: ITEM_SELECT,
    });
    return row ? toItem(row) : null;
  }

  /**
   * Non-deleted items for a restaurant. `availableOnly` restricts to
   * `availability = AVAILABLE` (legacy sold-out/unavailable items excluded).
   */
  async listByRestaurant(restaurantId: string, availableOnly = false): Promise<MenuItemRecord[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        ...(availableOnly ? { availability: 'AVAILABLE' } : {}),
      },
      select: ITEM_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toItem);
  }

  /** Non-deleted items in a menu section. */
  async listBySection(menuSectionId: string): Promise<MenuItemRecord[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { menuSectionId, deletedAt: null },
      select: ITEM_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toItem);
  }

  listVariants(menuItemId: string): Promise<ItemVariantRecord[]> {
    return this.prisma.itemVariant.findMany({
      where: { menuItemId },
      select: {
        id: true,
        menuItemId: true,
        size: true,
        sku: true,
        uomId: true,
        priceMinor: true,
        currencyCode: true,
        pax: true,
        isDefault: true,
        available: true,
      },
      orderBy: { priceMinor: 'asc' },
    });
  }

  async listChannelConfigs(menuItemId: string): Promise<ItemChannelConfigRecord[]> {
    const rows = await this.prisma.itemChannelConfig.findMany({
      where: { menuItemId },
      select: {
        id: true,
        menuItemId: true,
        channel: true,
        enabled: true,
        priceOverrideMinor: true,
        surcharges: true,
      },
    });
    return rows.map((r) => ({ ...r, channel: r.channel as OrderChannel }));
  }

  /**
   * Consumer catalog rows for Standard (virtual) or Custom (section-scoped) menus.
   * Publication is applied here. Channel/orderability are evaluated by the caller
   * using the shared Stage B rule.
   */
  async listConsumerItems(input: {
    restaurantId: string;
    channel?: OrderChannel;
    menuSectionIds?: string[];
    itemId?: string;
  }): Promise<ConsumerCatalogItem[]> {
    try {
      const rows = await this.prisma.menuItem.findMany({
        where: {
          restaurantId: input.restaurantId,
          deletedAt: null,
          isPublished: true,
          ...(input.itemId ? { id: input.itemId } : {}),
          ...(input.menuSectionIds ? { menuSectionId: { in: input.menuSectionIds } } : {}),
        },
        select: {
          id: true,
          restaurantId: true,
          menuSectionId: true,
          name: true,
          description: true,
          availability: true,
          isPublished: true,
          deletedAt: true,
          variants: {
            select: {
              id: true,
              size: true,
              sku: true,
              priceMinor: true,
              currencyCode: true,
              available: true,
            },
            orderBy: { priceMinor: 'asc' },
          },
          channelConfigs: {
            where: input.channel ? { channel: input.channel } : undefined,
            select: { enabled: true },
          },
          addOnGroups: {
            select: {
              id: true,
              name: true,
              minSelect: true,
              maxSelect: true,
              allowQuantity: true,
              available: true,
              sortOrder: true,
              addOns: {
                select: {
                  id: true,
                  name: true,
                  priceMinor: true,
                  currencyCode: true,
                  available: true,
                  isDefault: true,
                  sortOrder: true,
                  variantPrices: { select: { variantId: true, priceMinor: true } },
                },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      });
      return rows.map((row) => {
        const cfg = input.channel ? (row.channelConfigs[0] ?? null) : null;
        return {
          id: row.id,
          restaurantId: row.restaurantId,
          menuSectionId: row.menuSectionId,
          name: row.name,
          description: row.description,
          availability: row.availability as ItemAvailabilityName,
          isPublished: row.isPublished,
          deletedAt: row.deletedAt,
          channelEnabled: cfg ? cfg.enabled : null,
          variants: row.variants,
          groups: row.addOnGroups.map((group) => ({
            id: group.id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            allowQuantity: group.allowQuantity,
            available: group.available,
            sortOrder: group.sortOrder,
            modifiers: group.addOns,
          })),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Consumer menu: published, not deleted. Includes variants for display prices.
   */
  async listPublishedByRestaurant(restaurantId: string) {
    const rows = await this.prisma.menuItem.findMany({
      where: { restaurantId, deletedAt: null, isPublished: true },
      select: {
        id: true,
        restaurantId: true,
        name: true,
        description: true,
        availability: true,
        isPublished: true,
        variants: {
          select: {
            id: true,
            size: true,
            priceMinor: true,
            currencyCode: true,
            available: true,
          },
          orderBy: { priceMinor: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      restaurantId: row.restaurantId,
      name: row.name,
      description: row.description,
      availability: row.availability as ItemAvailabilityName,
      isPublished: row.isPublished,
      variants: row.variants,
    }));
  }

  async findPublishedDetailById(id: string) {
    try {
      const row = await this.prisma.menuItem.findFirst({
        where: { id, deletedAt: null, isPublished: true },
        select: {
          id: true,
          restaurantId: true,
          name: true,
          description: true,
          availability: true,
          isPublished: true,
          variants: {
            select: {
              id: true,
              size: true,
              sku: true,
              priceMinor: true,
              currencyCode: true,
              available: true,
            },
            orderBy: { priceMinor: 'asc' },
          },
          addOnGroups: {
            where: { available: true },
            select: {
              id: true,
              name: true,
              minSelect: true,
              maxSelect: true,
              allowQuantity: true,
              available: true,
              sortOrder: true,
              addOns: {
                where: { available: true },
                select: {
                  id: true,
                  name: true,
                  priceMinor: true,
                  currencyCode: true,
                  available: true,
                  isDefault: true,
                  sortOrder: true,
                  variantPrices: {
                    select: { variantId: true, priceMinor: true },
                  },
                },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      });
      return row
        ? {
            id: row.id,
            restaurantId: row.restaurantId,
            name: row.name,
            description: row.description,
            availability: row.availability as ItemAvailabilityName,
            isPublished: row.isPublished,
            variants: row.variants,
            modifierGroups: row.addOnGroups.map((g) => ({
              id: g.id,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              allowQuantity: g.allowQuantity,
              available: g.available,
              sortOrder: g.sortOrder,
              required: g.minSelect >= 1,
              singleSelect: g.maxSelect === 1,
              modifiers: g.addOns.map((a) => ({
                id: a.id,
                name: a.name,
                priceMinor: a.priceMinor,
                currencyCode: a.currencyCode,
                available: a.available,
                isDefault: a.isDefault,
                sortOrder: a.sortOrder,
                variantPrices: a.variantPrices,
              })),
            })),
          }
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Server price authority for cart/checkout. Channel override wins when present.
   * Returns null for a missing variant (caller rejects).
   */
  async findVariantForCheckout(
    variantId: string,
    channel?: OrderChannel,
  ): Promise<CheckoutCatalogLine | null> {
    try {
      const row = await this.prisma.itemVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          size: true,
          priceMinor: true,
          currencyCode: true,
          available: true,
          menuItem: {
            select: {
              id: true,
              restaurantId: true,
              merchantId: true,
              name: true,
              availability: true,
              isPublished: true,
              deletedAt: true,
              channelConfigs: {
                where: channel ? { channel } : undefined,
                select: { enabled: true, priceOverrideMinor: true },
              },
            },
          },
        },
      });
      if (!row) return null;
      const cfg = row.menuItem.channelConfigs[0] ?? null;
      return {
        variantId: row.id,
        menuItemId: row.menuItem.id,
        restaurantId: row.menuItem.restaurantId,
        merchantId: row.menuItem.merchantId,
        name: row.menuItem.name,
        size: row.size,
        priceMinor: cfg?.priceOverrideMinor ?? row.priceMinor,
        currencyCode: row.currencyCode,
        availability: row.menuItem.availability as ItemAvailabilityName,
        isPublished: row.menuItem.isPublished,
        deletedAt: row.menuItem.deletedAt,
        variantAvailable: row.available,
        channelEnabled: cfg ? cfg.enabled : null,
        channelPriceOverrideMinor: cfg?.priceOverrideMinor ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Full item detail: variants + channel configs + add-on groups (with add-ons). */
  async findDetailById(id: string): Promise<MenuItemDetail | null> {
    const item = await this.findById(id);
    if (!item) return null;
    const [variants, channelConfigs, groups] = await Promise.all([
      this.listVariants(id),
      this.listChannelConfigs(id),
      this.prisma.addOnGroup.findMany({
        where: { menuItemId: id },
        select: {
          id: true,
          menuItemId: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          allowQuantity: true,
          available: true,
          sortOrder: true,
          addOns: {
            select: {
              id: true,
              addOnGroupId: true,
              name: true,
              priceMinor: true,
              currencyCode: true,
              available: true,
              isDefault: true,
              sortOrder: true,
              variantPrices: {
                select: { id: true, addOnId: true, variantId: true, priceMinor: true },
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return { ...item, variants, channelConfigs, addOnGroups: groups };
  }

  /**
   * Catalog snapshot used to quote a variant + modifiers. Channel override
   * applies to the variant base only (per-variant channel price remains deferred).
   */
  async findMerchandiseCatalog(
    variantId: string,
    channel?: OrderChannel,
  ): Promise<{ catalog: CatalogMerchandiseItem; itemName: string } | null> {
    try {
      const row = await this.prisma.itemVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          size: true,
          priceMinor: true,
          currencyCode: true,
          available: true,
          menuItem: {
            select: {
              id: true,
              name: true,
              restaurantId: true,
              merchantId: true,
              availability: true,
              isPublished: true,
              deletedAt: true,
              channelConfigs: {
                where: channel ? { channel } : undefined,
                select: { enabled: true, priceOverrideMinor: true },
              },
              addOnGroups: {
                select: {
                  id: true,
                  name: true,
                  minSelect: true,
                  maxSelect: true,
                  allowQuantity: true,
                  available: true,
                  addOns: {
                    select: {
                      id: true,
                      addOnGroupId: true,
                      name: true,
                      priceMinor: true,
                      available: true,
                      isDefault: true,
                      variantPrices: {
                        where: { variantId },
                        select: { priceMinor: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!row) return null;
      const cfg = row.menuItem.channelConfigs[0] ?? null;
      return {
        itemName: row.menuItem.name,
        catalog: {
          menuItemId: row.menuItem.id,
          merchantId: row.menuItem.merchantId,
          restaurantId: row.menuItem.restaurantId,
          isPublished: row.menuItem.isPublished,
          deletedAt: row.menuItem.deletedAt,
          availability: row.menuItem.availability as CatalogMerchandiseItem['availability'],
          variant: {
            id: row.id,
            size: row.size,
            priceMinor: cfg?.priceOverrideMinor ?? row.priceMinor,
            available: row.available,
            currencyCode: row.currencyCode,
          },
          channelEnabled: cfg ? cfg.enabled : null,
          groups: row.menuItem.addOnGroups.map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            available: g.available,
            allowQuantity: g.allowQuantity,
            modifiers: g.addOns.map((a) => ({
              id: a.id,
              groupId: a.addOnGroupId,
              name: a.name,
              defaultPriceMinor: a.priceMinor,
              available: a.available,
              isDefault: a.isDefault,
              variantPriceMinor: a.variantPrices[0]?.priceMinor ?? null,
            })),
          })),
        },
      };
    } catch {
      return null;
    }
  }
}
