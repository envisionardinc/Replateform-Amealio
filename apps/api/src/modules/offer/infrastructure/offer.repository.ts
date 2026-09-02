import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { OfferRecord, SettlementTypeName } from '../domain/offer.types';

const OFFER_INCLUDE = { coupons: { select: { id: true, code: true } } } as const;

interface OfferWriteData {
  legacyId: string | null;
  merchantId: string | null;
  restaurantId: string | null;
  isGlobal: boolean;
  title: string;
  description: string | null;
  termsAndConditions: string | null;
  active: boolean;
  settlementType: SettlementTypeName;
  discountPercent: number | null;
  discountMinor: bigint | null;
  maxDiscountMinor: bigint | null;
  minOrderMinor: bigint | null;
  maxOrderMinor: bigint | null;
  serviceTypes: string[] | null;
  validFrom: Date | null;
  validTo: Date | null;
  maxUsageLimit: number | null;
  perUserLimit: number | null;
  useLimit: number | null;
  useFrequency: string | null;
}

/**
 * Write/read access for Offer configuration (P1.7.22) over the EXISTING `Offer`
 * (+ `Coupon` for the code). `CouponRedemption` is NOT touched. Offer + its single
 * coupon are created/replaced atomically. Authorization is enforced by OfferService.
 */
@Injectable()
export class OfferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async offerScope(
    id: string,
  ): Promise<{ merchantId: string | null; isGlobal: boolean; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.offer.findUnique({
        where: { id },
        select: { merchantId: true, isGlobal: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  async create(data: OfferWriteData, couponCode: string | null): Promise<OfferRecord> {
    const created = await this.prisma.offer.create({
      data: {
        ...this.toCreateInput(data),
        ...(couponCode ? { coupons: { create: [{ code: couponCode }] } } : {}),
      },
      select: { id: true },
    });
    return this.findByIdOrThrow(created.id);
  }

  async findById(id: string): Promise<OfferRecord | null> {
    try {
      const row = await this.prisma.offer.findUnique({ where: { id }, include: OFFER_INCLUDE });
      return row ? toRecord(row) : null;
    } catch {
      return null;
    }
  }

  private async findByIdOrThrow(id: string): Promise<OfferRecord> {
    const row = await this.prisma.offer.findUniqueOrThrow({
      where: { id },
      include: OFFER_INCLUDE,
    });
    return toRecord(row);
  }

  async listByMerchant(merchantId: string): Promise<OfferRecord[]> {
    const rows = await this.prisma.offer.findMany({
      where: { merchantId, deletedAt: null },
      include: OFFER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async listGlobal(): Promise<OfferRecord[]> {
    const rows = await this.prisma.offer.findMany({
      where: { isGlobal: true, deletedAt: null },
      include: OFFER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  /** Update offer fields; when `couponCode` is provided, replace the offer's coupon. */
  async update(
    id: string,
    data: Partial<OfferWriteData>,
    coupon: { set: string | null } | undefined,
  ): Promise<OfferRecord> {
    const patch = this.toUpdateInput(data);
    if (coupon === undefined) {
      await this.prisma.offer.update({ where: { id }, data: patch });
    } else {
      await this.prisma.$transaction([
        this.prisma.coupon.deleteMany({ where: { offerId: id } }),
        this.prisma.offer.update({
          where: { id },
          data: {
            ...patch,
            ...(coupon.set ? { coupons: { create: [{ code: coupon.set }] } } : {}),
          },
        }),
      ]);
    }
    return this.findByIdOrThrow(id);
  }

  async setActive(id: string, active: boolean): Promise<OfferRecord> {
    await this.prisma.offer.update({ where: { id }, data: { active } });
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.offer.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private toCreateInput(d: OfferWriteData): Prisma.OfferCreateInput {
    return {
      legacyId: d.legacyId,
      ...(d.merchantId ? { merchant: { connect: { id: d.merchantId } } } : {}),
      ...(d.restaurantId ? { restaurant: { connect: { id: d.restaurantId } } } : {}),
      isGlobal: d.isGlobal,
      title: d.title,
      description: d.description,
      termsAndConditions: d.termsAndConditions,
      active: d.active,
      settlementType: d.settlementType,
      discountPercent: d.discountPercent,
      discountMinor: d.discountMinor,
      maxDiscountMinor: d.maxDiscountMinor,
      minOrderMinor: d.minOrderMinor,
      maxOrderMinor: d.maxOrderMinor,
      serviceTypes: (d.serviceTypes ?? undefined) as Prisma.InputJsonValue | undefined,
      validFrom: d.validFrom,
      validTo: d.validTo,
      maxUsageLimit: d.maxUsageLimit,
      perUserLimit: d.perUserLimit,
      useLimit: d.useLimit,
      useFrequency: d.useFrequency,
    };
  }

  private toUpdateInput(d: Partial<OfferWriteData>): Prisma.OfferUpdateInput {
    const patch: Prisma.OfferUpdateInput = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (d.termsAndConditions !== undefined) patch.termsAndConditions = d.termsAndConditions;
    if (d.active !== undefined) patch.active = d.active;
    if (d.settlementType !== undefined) patch.settlementType = d.settlementType;
    if (d.discountPercent !== undefined) patch.discountPercent = d.discountPercent;
    if (d.discountMinor !== undefined) patch.discountMinor = d.discountMinor;
    if (d.maxDiscountMinor !== undefined) patch.maxDiscountMinor = d.maxDiscountMinor;
    if (d.minOrderMinor !== undefined) patch.minOrderMinor = d.minOrderMinor;
    if (d.maxOrderMinor !== undefined) patch.maxOrderMinor = d.maxOrderMinor;
    if (d.serviceTypes !== undefined)
      patch.serviceTypes = (d.serviceTypes ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    if (d.validFrom !== undefined) patch.validFrom = d.validFrom;
    if (d.validTo !== undefined) patch.validTo = d.validTo;
    if (d.maxUsageLimit !== undefined) patch.maxUsageLimit = d.maxUsageLimit;
    if (d.perUserLimit !== undefined) patch.perUserLimit = d.perUserLimit;
    if (d.useLimit !== undefined) patch.useLimit = d.useLimit;
    if (d.useFrequency !== undefined) patch.useFrequency = d.useFrequency;
    if (d.restaurantId !== undefined)
      patch.restaurant = d.restaurantId
        ? { connect: { id: d.restaurantId } }
        : { disconnect: true };
    return patch;
  }
}

function toRecord(row: {
  id: string;
  legacyId: string | null;
  merchantId: string | null;
  restaurantId: string | null;
  isGlobal: boolean;
  title: string;
  description: string | null;
  termsAndConditions: string | null;
  active: boolean;
  settlementType: string;
  discountPercent: number | null;
  discountMinor: bigint | null;
  maxDiscountMinor: bigint | null;
  minOrderMinor: bigint | null;
  maxOrderMinor: bigint | null;
  serviceTypes: unknown;
  validFrom: Date | null;
  validTo: Date | null;
  maxUsageLimit: number | null;
  perUserLimit: number | null;
  useLimit: number | null;
  useFrequency: string | null;
  coupons: Array<{ id: string; code: string }>;
}): OfferRecord {
  return {
    id: row.id,
    legacyId: row.legacyId,
    merchantId: row.merchantId,
    restaurantId: row.restaurantId,
    isGlobal: row.isGlobal,
    title: row.title,
    description: row.description,
    termsAndConditions: row.termsAndConditions,
    active: row.active,
    settlementType: row.settlementType as SettlementTypeName,
    discountPercent: row.discountPercent,
    discountMinor: row.discountMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    minOrderMinor: row.minOrderMinor,
    maxOrderMinor: row.maxOrderMinor,
    serviceTypes: Array.isArray(row.serviceTypes) ? (row.serviceTypes as string[]) : null,
    validFrom: row.validFrom,
    validTo: row.validTo,
    maxUsageLimit: row.maxUsageLimit,
    perUserLimit: row.perUserLimit,
    useLimit: row.useLimit,
    useFrequency: row.useFrequency,
    coupons: row.coupons,
  };
}
