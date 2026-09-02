import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { RestaurantRecord } from '../domain/merchant.types';

const RESTAURANT_SELECT = {
  id: true,
  legacyId: true,
  merchantId: true,
  chainId: true,
  name: true,
  city: true,
  status: true,
  deletedAt: true,
} as const;

/**
 * Read access to the existing `Restaurant` (location) table (P1.7.2). Lookups
 * only. A restaurant belongs to exactly one merchant (Merchant 1 → N
 * Restaurant); `belongsToMerchant` is the tenancy primitive future domains use
 * to confine location access to the authenticated staff's merchant scope.
 */
@Injectable()
export class RestaurantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<RestaurantRecord | null> {
    try {
      return await this.prisma.restaurant.findUnique({ where: { id }, select: RESTAURANT_SELECT });
    } catch {
      return null; // malformed id -> not found
    }
  }

  findByLegacyId(legacyId: string): Promise<RestaurantRecord | null> {
    return this.prisma.restaurant.findUnique({ where: { legacyId }, select: RESTAURANT_SELECT });
  }

  /** Non-deleted restaurants owned by a merchant. */
  listByMerchant(merchantId: string): Promise<RestaurantRecord[]> {
    return this.prisma.restaurant.findMany({
      where: { merchantId, deletedAt: null },
      select: RESTAURANT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /** True iff a non-deleted restaurant exists AND is owned by `merchantId`. */
  async belongsToMerchant(restaurantId: string, merchantId: string): Promise<boolean> {
    const r = await this.findById(restaurantId);
    return !!r && r.deletedAt === null && r.merchantId === merchantId;
  }
}
