import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { SubscriptionConfig, SubscriptionRecord } from '../domain/subscription.types';

const SUBSCRIPTION_SELECT = {
  id: true,
  merchantId: true,
  restaurantId: true,
  productType: true,
  status: true,
  config: true,
} as const;

type Row = {
  id: string;
  merchantId: string;
  restaurantId: string | null;
  productType: string;
  status: string;
  config: unknown;
};

function toRecord(row: Row): SubscriptionRecord {
  const cfg =
    typeof row.config === 'object' && row.config !== null && !Array.isArray(row.config)
      ? (row.config as SubscriptionConfig)
      : null;
  return {
    id: row.id,
    merchantId: row.merchantId,
    restaurantId: row.restaurantId,
    productType: row.productType,
    status: row.status,
    config: cfg,
  };
}

/**
 * Read access to the existing `Subscription` table (P1.7.3). Read-only — no
 * subscription purchase/billing/renewal/CRUD is built in this foundation slice.
 * Missing subscriptions are handled safely (empty list / null / false).
 */
@Injectable()
export class SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SubscriptionRecord | null> {
    try {
      const row = await this.prisma.subscription.findUnique({
        where: { id },
        select: SUBSCRIPTION_SELECT,
      });
      return row ? toRecord(row) : null;
    } catch {
      return null; // malformed id -> not found
    }
  }

  async findByMerchant(merchantId: string): Promise<SubscriptionRecord[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { merchantId },
      select: SUBSCRIPTION_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  /** Current/active subscriptions for a merchant (target status string "ACTIVE"). */
  async findActiveByMerchant(merchantId: string): Promise<SubscriptionRecord[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { merchantId, status: 'ACTIVE' },
      select: SUBSCRIPTION_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async existsForMerchant(merchantId: string): Promise<boolean> {
    const n = await this.prisma.subscription.count({ where: { merchantId } });
    return n > 0;
  }
}
