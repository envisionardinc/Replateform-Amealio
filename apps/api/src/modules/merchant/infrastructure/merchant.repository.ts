import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { MerchantRecord } from '../domain/merchant.types';

const MERCHANT_SELECT = {
  id: true,
  legacyId: true,
  organizationId: true,
  legalName: true,
  email: true,
  phone: true,
  isBlocked: true,
  deletedAt: true,
} as const;

/**
 * Read access to the existing `Merchant` tenant table (P1.7.2). Lookups only —
 * no merchant CRUD/onboarding is built in this foundation slice. `legacyId` is
 * preserved for a future controlled import from the legacy platform.
 */
@Injectable()
export class MerchantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MerchantRecord | null> {
    try {
      return await this.prisma.merchant.findUnique({ where: { id }, select: MERCHANT_SELECT });
    } catch {
      return null; // malformed id -> not found
    }
  }

  findByLegacyId(legacyId: string): Promise<MerchantRecord | null> {
    return this.prisma.merchant.findUnique({ where: { legacyId }, select: MERCHANT_SELECT });
  }

  /** An "active" merchant exists, is not blocked, and is not soft-deleted. */
  async existsActive(id: string): Promise<boolean> {
    const m = await this.findById(id);
    return !!m && !m.isBlocked && m.deletedAt === null;
  }
}
