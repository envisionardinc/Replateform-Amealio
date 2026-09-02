import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  MerchantOnboardingState,
  RestaurantOnboardingState,
} from '../domain/onboarding.types';

/**
 * Read/write access to merchant + restaurant onboarding STATE (P1.7.8). Only the
 * onboarding-state fields are touched — no other Merchant/Restaurant behavior.
 * Tenancy is enforced by `MerchantOnboardingService`, not here.
 */
@Injectable()
export class MerchantOnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getState(merchantId: string): Promise<MerchantOnboardingState | null> {
    try {
      const m = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: {
          id: true,
          onboardingSubmitted: true,
          restaurants: {
            where: { deletedAt: null },
            select: { id: true, merchantId: true, onboardingStep: true, softOnboarding: true },
            orderBy: { name: 'asc' },
          },
        },
      });
      if (!m) return null;
      return {
        merchantId: m.id,
        onboardingSubmitted: m.onboardingSubmitted,
        restaurants: m.restaurants.map((r) => ({
          restaurantId: r.id,
          merchantId: r.merchantId,
          onboardingStep: r.onboardingStep,
          softOnboarding: r.softOnboarding,
        })),
      };
    } catch {
      return null;
    }
  }

  async setSubmitted(merchantId: string, submitted: boolean): Promise<void> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { onboardingSubmitted: submitted },
    });
  }

  /** Read a restaurant's ownership + onboarding state (for scope checks + updates). */
  async getRestaurant(restaurantId: string): Promise<RestaurantOnboardingState | null> {
    try {
      const r = await this.prisma.restaurant.findFirst({
        where: { id: restaurantId, deletedAt: null },
        select: { id: true, merchantId: true, onboardingStep: true, softOnboarding: true },
      });
      return r
        ? {
            restaurantId: r.id,
            merchantId: r.merchantId,
            onboardingStep: r.onboardingStep,
            softOnboarding: r.softOnboarding,
          }
        : null;
    } catch {
      return null;
    }
  }

  async setRestaurantProgress(
    restaurantId: string,
    data: { onboardingStep?: number; softOnboarding?: boolean },
  ): Promise<void> {
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(data.onboardingStep !== undefined ? { onboardingStep: data.onboardingStep } : {}),
        ...(data.softOnboarding !== undefined ? { softOnboarding: data.softOnboarding } : {}),
      },
    });
  }
}
