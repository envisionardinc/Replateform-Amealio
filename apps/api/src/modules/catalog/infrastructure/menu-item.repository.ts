import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CheckoutCatalogLine,
  ItemAvailabilityName,
  ItemChannelConfigRecord,
  ItemVariantRecord,
  MenuItemDetail,
  MenuItemRecord,
  OrderChannel,
} from '../domain/catalog.types';

const ITEM_SELECT = {
  id: true,
  legacyId: true,
  merchantId: true,
  restaurantId: true,
  menuSectionId: true,
  name: true,
  description: true,
  availability: true,
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
        uomId: true,
        priceMinor: true,
        currencyCode: true,
        pax: true,
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
              priceMinor: true,
              currencyCode: true,
              available: true,
            },
            orderBy: { priceMinor: 'asc' },
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
          addOns: {
            select: {
              id: true,
              addOnGroupId: true,
              name: true,
              priceMinor: true,
              currencyCode: true,
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { ...item, variants, channelConfigs, addOnGroups: groups };
  }
}
