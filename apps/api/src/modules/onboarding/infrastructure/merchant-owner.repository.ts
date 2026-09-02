import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  ProvisionedOwner,
  RestaurantProfileRecord,
  StaffAccountStatusName,
  UpdateRestaurantProfileInput,
} from '../domain/owner-provisioning.types';

const OWNER_PROFILE_SELECT = {
  id: true,
  merchantId: true,
  name: true,
  email: true,
  phone: true,
  staffRole: true,
  status: true,
} as const;

const RESTAURANT_PROFILE_SELECT = {
  id: true,
  merchantId: true,
  name: true,
  city: true,
  state: true,
  pinCode: true,
  country: true,
  timezone: true,
  currencyCode: true,
  lat: true,
  lon: true,
  status: true,
  deletedAt: true,
} as const;

/**
 * Write access for merchant owner provisioning + activation and the restaurant/
 * subscription onboarding update foundation (P1.7.14). Reuses the EXISTING
 * `StaffMember`/`StaffCredential`/`Restaurant`/`Subscription` models — no schema
 * change. Authorization/tenancy is enforced by MerchantOwnerService, not here.
 */
@Injectable()
export class MerchantOwnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Merchant existence + soft-delete state (owner association target). */
  async findMerchant(merchantId: string): Promise<{ id: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  /** The (single) non-deleted MERCHANT_OWNER for a merchant, if any. */
  async findOwner(merchantId: string): Promise<ProvisionedOwner | null> {
    const row = await this.prisma.staffMember.findFirst({
      where: { merchantId, staffRole: 'MERCHANT_OWNER', deletedAt: null },
      select: OWNER_PROFILE_SELECT,
    });
    return row ? this.toOwner(row) : null;
  }

  /**
   * Atomically create the owner StaffMember + its PASSWORD StaffCredential.
   * The two rows form one coherent, authenticatable owner (never a StaffMember
   * without its credential).
   */
  async provisionOwner(args: {
    merchantId: string;
    name: string;
    email: string | null;
    phone: string | null;
    secretHash: string;
    status: StaffAccountStatusName;
  }): Promise<ProvisionedOwner> {
    const id = await this.prisma.$transaction(async (tx) => {
      const staff = await tx.staffMember.create({
        data: {
          merchantId: args.merchantId,
          name: args.name,
          email: args.email,
          phone: args.phone,
          staffRole: 'MERCHANT_OWNER',
          status: args.status,
          credentials: {
            create: [{ type: 'PASSWORD', secretHash: args.secretHash }],
          },
        },
        select: { id: true },
      });
      return staff.id;
    });
    const row = await this.prisma.staffMember.findUniqueOrThrow({
      where: { id },
      select: OWNER_PROFILE_SELECT,
    });
    return this.toOwner(row);
  }

  /** Set the status of all non-deleted owners of a merchant (activation gate). */
  async setOwnerStatus(merchantId: string, status: StaffAccountStatusName): Promise<number> {
    const res = await this.prisma.staffMember.updateMany({
      where: { merchantId, staffRole: 'MERCHANT_OWNER', deletedAt: null },
      data: { status },
    });
    return res.count;
  }

  async findRestaurant(
    restaurantId: string,
  ): Promise<{ id: string; merchantId: string; deletedAt: Date | null } | null> {
    try {
      return await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, merchantId: true, deletedAt: true },
      });
    } catch {
      return null;
    }
  }

  /** Update only the provided profile fields (partial). */
  async updateRestaurantProfile(
    restaurantId: string,
    data: UpdateRestaurantProfileInput,
  ): Promise<RestaurantProfileRecord> {
    const patch: Prisma.RestaurantUpdateInput = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.city !== undefined) patch.city = data.city;
    if (data.state !== undefined) patch.state = data.state;
    if (data.pinCode !== undefined) patch.pinCode = data.pinCode;
    if (data.country !== undefined) patch.country = data.country;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (data.currencyCode !== undefined) patch.currencyCode = data.currencyCode ?? 'INR';
    if (data.lat !== undefined) patch.lat = data.lat;
    if (data.lon !== undefined) patch.lon = data.lon;
    const row = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: patch,
      select: RESTAURANT_PROFILE_SELECT,
    });
    return this.toRestaurantProfile(row);
  }

  async findSubscription(id: string): Promise<{
    id: string;
    merchantId: string;
    restaurantId: string | null;
    config: unknown;
  } | null> {
    try {
      return await this.prisma.subscription.findUnique({
        where: { id },
        select: { id: true, merchantId: true, restaurantId: true, config: true },
      });
    } catch {
      return null;
    }
  }

  async updateSubscription(
    id: string,
    data: { status?: string; config?: Prisma.InputJsonValue },
  ): Promise<{
    id: string;
    merchantId: string;
    restaurantId: string | null;
    status: string;
    config: unknown;
  }> {
    return this.prisma.subscription.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.config !== undefined ? { config: data.config } : {}),
      },
      select: { id: true, merchantId: true, restaurantId: true, status: true, config: true },
    });
  }

  private toOwner(row: {
    id: string;
    merchantId: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    staffRole: string;
    status: string;
  }): ProvisionedOwner {
    return {
      id: row.id,
      merchantId: row.merchantId as string,
      name: row.name,
      email: row.email,
      phone: row.phone,
      staffRole: 'MERCHANT_OWNER',
      status: row.status as StaffAccountStatusName,
    };
  }

  private toRestaurantProfile(row: {
    id: string;
    merchantId: string;
    name: string;
    city: string | null;
    state: string | null;
    pinCode: string | null;
    country: string | null;
    timezone: string | null;
    currencyCode: string;
    lat: number | null;
    lon: number | null;
    status: string;
  }): RestaurantProfileRecord {
    return {
      id: row.id,
      merchantId: row.merchantId,
      name: row.name,
      city: row.city,
      state: row.state,
      pinCode: row.pinCode,
      country: row.country,
      timezone: row.timezone,
      currencyCode: row.currencyCode,
      lat: row.lat,
      lon: row.lon,
      status: row.status,
    };
  }
}
