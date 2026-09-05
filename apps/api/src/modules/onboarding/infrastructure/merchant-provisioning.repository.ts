import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  CreateMerchantInput,
  CreateRestaurantInput,
  CreateSubscriptionInput,
  CreatedMerchant,
  CreatedRestaurant,
  CreatedSubscription,
} from '../domain/provisioning.types';

/**
 * Canonical create (write) access for Merchant / Restaurant / Subscription
 * (P1.7.10). Writes only the confirmed creation fields; onboarding-state fields
 * take their schema defaults (Merchant.onboardingSubmitted=false,
 * Restaurant.onboardingStep=0, softOnboarding=false). Authorization/tenancy is
 * enforced by MerchantProvisioningService, not here.
 */
@Injectable()
export class MerchantProvisioningRepository {
  constructor(private readonly prisma: PrismaService) {}

  async merchantExists(merchantId: string): Promise<boolean> {
    try {
      const m = await this.prisma.merchant.findFirst({
        where: { id: merchantId, deletedAt: null },
        select: { id: true },
      });
      return !!m;
    } catch {
      return false;
    }
  }

  async createMerchant(input: CreateMerchantInput): Promise<CreatedMerchant> {
    const m = await this.prisma.merchant.create({
      data: {
        legalName: input.legalName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        organizationId: input.organizationId ?? null,
        legacyId: input.legacyId ?? null,
      },
      select: { id: true, legalName: true, email: true, phone: true, onboardingSubmitted: true },
    });
    return m;
  }

  async createRestaurant(input: CreateRestaurantInput): Promise<CreatedRestaurant> {
    const r = await this.prisma.restaurant.create({
      data: {
        merchantId: input.merchantId,
        name: input.name,
        city: input.city ?? null,
        state: input.state ?? null,
        pinCode: input.pinCode ?? null,
        // country/timezone/currencyCode fall back to schema defaults (IN/Asia-Kolkata/INR)
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode ?? 'INR' } : {}),
        lat: input.lat ?? null,
        lon: input.lon ?? null,
        chainId: input.chainId ?? null,
        legacyId: input.legacyId ?? null,
      },
      select: {
        id: true,
        merchantId: true,
        name: true,
        status: true,
        onboardingStep: true,
        softOnboarding: true,
      },
    });
    return r;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreatedSubscription> {
    const s = await this.prisma.subscription.create({
      data: {
        merchantId: input.merchantId,
        restaurantId: input.restaurantId ?? null,
        productType: input.productType,
        ...(input.status !== undefined ? { status: input.status } : {}),
        config: (input.config ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: {
        id: true,
        merchantId: true,
        restaurantId: true,
        productType: true,
        status: true,
      },
    });
    return s;
  }
}
