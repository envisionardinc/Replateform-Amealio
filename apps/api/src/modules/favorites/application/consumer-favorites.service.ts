import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { FavouriteRepository, type FavouriteRow } from '../infrastructure/favourite.repository';

export type FavoriteRestaurantView = {
  id: string;
  name: string;
  city: string | null;
  status: string;
};

export type FavoriteItemView = {
  id: string;
  name: string;
  restaurantId: string;
  availability: string;
  isPublished: boolean;
};

export type FavoriteView = {
  id: string;
  targetType: 'RESTAURANT' | 'MENU_ITEM';
  targetId: string;
  createdAt: string;
  restaurant: FavoriteRestaurantView | null;
  item: FavoriteItemView | null;
};

@Injectable()
export class ConsumerFavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FavouriteRepository,
  ) {}

  async listMine(userId: string, targetType?: 'RESTAURANT' | 'MENU_ITEM'): Promise<FavoriteView[]> {
    this.requireUserId(userId);
    const rows = await this.repo.listMine(userId, targetType);
    return this.hydrate(rows);
  }

  async putMine(
    userId: string,
    targetType: 'RESTAURANT' | 'MENU_ITEM',
    targetId: string,
  ): Promise<FavoriteView> {
    this.requireUserId(userId);
    await this.requireTarget(targetType, targetId);
    const existing = await this.repo.findMine(userId, targetType, targetId);
    const row = existing ?? (await this.repo.addMine(userId, targetType, targetId));
    return (await this.hydrate([row]))[0];
  }

  async deleteMine(
    userId: string,
    targetType: 'RESTAURANT' | 'MENU_ITEM',
    targetId: string,
  ): Promise<{ targetType: 'RESTAURANT' | 'MENU_ITEM'; targetId: string }> {
    this.requireUserId(userId);
    await this.requireTarget(targetType, targetId);
    await this.repo.removeMine(userId, targetType, targetId);
    return { targetType, targetId };
  }

  private requireUserId(userId: string): void {
    if (!userId) throw new UnauthorizedException('Consumer authentication required');
  }

  private async requireTarget(
    targetType: 'RESTAURANT' | 'MENU_ITEM',
    targetId: string,
  ): Promise<void> {
    if (targetType === 'RESTAURANT') {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true },
      });
      if (!restaurant) throw new NotFoundException('Restaurant not found');
      return;
    }
    const item = await this.prisma.menuItem.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item not found');
  }

  private async hydrate(rows: FavouriteRow[]): Promise<FavoriteView[]> {
    const restaurantIds = [
      ...new Set(rows.filter((row) => row.targetType === 'RESTAURANT').map((row) => row.targetId)),
    ];
    const itemIds = [
      ...new Set(rows.filter((row) => row.targetType === 'MENU_ITEM').map((row) => row.targetId)),
    ];
    const [restaurants, items] = await Promise.all([
      restaurantIds.length
        ? this.prisma.restaurant.findMany({
            where: { id: { in: restaurantIds } },
            select: { id: true, name: true, city: true, status: true },
          })
        : Promise.resolve([]),
      itemIds.length
        ? this.prisma.menuItem.findMany({
            where: { id: { in: itemIds } },
            select: {
              id: true,
              name: true,
              restaurantId: true,
              availability: true,
              isPublished: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const restaurantById = new Map(restaurants.map((row) => [row.id, row]));
    const itemById = new Map(items.map((row) => [row.id, row]));
    return rows.map((row) => {
      const restaurant =
        row.targetType === 'RESTAURANT' ? (restaurantById.get(row.targetId) ?? null) : null;
      const item = row.targetType === 'MENU_ITEM' ? (itemById.get(row.targetId) ?? null) : null;
      return {
        id: row.id,
        targetType: row.targetType as 'RESTAURANT' | 'MENU_ITEM',
        targetId: row.targetId,
        createdAt: row.createdAt.toISOString(),
        restaurant,
        item: item
          ? {
              id: item.id,
              name: item.name,
              restaurantId: item.restaurantId,
              availability: item.availability,
              isPublished: item.isPublished,
            }
          : null,
      };
    });
  }
}
