import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { CurrencyRecord } from '../domain/reference-data.types';

const CURRENCY_SELECT = {
  id: true,
  legacyId: true,
  isoCode: true,
  symbol: true,
  name: true,
  countryName: true,
  description: true,
  isActive: true,
  deletedAt: true,
} as const;

/**
 * Read access to the platform `Currency` reference (P1.7.6). Read-only — no
 * admin CRUD, no FX/conversion, no merchant tenancy (platform-global reference
 * data). Canonical identity is `isoCode` (ISO 4217). "Active" excludes
 * soft-deleted (`deletedAt`) and `isActive = false`. Missing refs return null.
 */
@Injectable()
export class CurrencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CurrencyRecord | null> {
    try {
      return await this.prisma.currency.findUnique({ where: { id }, select: CURRENCY_SELECT });
    } catch {
      return null; // malformed id -> not found
    }
  }

  findByLegacyId(legacyId: string): Promise<CurrencyRecord | null> {
    return this.prisma.currency.findUnique({ where: { legacyId }, select: CURRENCY_SELECT });
  }

  /** Canonical lookup by ISO 4217 code. */
  findByIsoCode(isoCode: string): Promise<CurrencyRecord | null> {
    return this.prisma.currency.findUnique({ where: { isoCode }, select: CURRENCY_SELECT });
  }

  /** Active currencies (isActive AND not soft-deleted). */
  listActive(): Promise<CurrencyRecord[]> {
    return this.prisma.currency.findMany({
      where: { isActive: true, deletedAt: null },
      select: CURRENCY_SELECT,
      orderBy: { isoCode: 'asc' },
    });
  }

  listAll(): Promise<CurrencyRecord[]> {
    return this.prisma.currency.findMany({ select: CURRENCY_SELECT, orderBy: { isoCode: 'asc' } });
  }
}
