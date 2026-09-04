import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { MerchantOnboardingRepository } from '../infrastructure/merchant-onboarding.repository';
import type { MerchantOnboardingState } from '../domain/onboarding.types';

/**
 * Merchant onboarding-state service (P1.7.8). Tenancy derives ONLY from the
 * server-side `StaffPrincipal` (P1.7.1F): merchant staff are confined to their
 * own merchant; a request-supplied merchant id can only reject a mismatch.
 * SUPER_ADMIN (merchantId = null) is platform-scoped and targets a merchant via
 * an explicit id. Restaurant-scoped writes reuse P1.7.2 `MerchantScopeService`.
 */
@Injectable()
export class MerchantOnboardingService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly repo: MerchantOnboardingRepository,
  ) {}

  private resolveTargetMerchant(principal: StaffPrincipal, requestedMerchantId?: string): string {
    if (isSuperAdmin(principal)) {
      if (!requestedMerchantId) {
        throw new BadRequestException('merchantId is required for platform-scoped access');
      }
      return requestedMerchantId;
    }
    if (!principal.merchantId) {
      throw new ForbiddenException('Merchant scope required');
    }
    if (requestedMerchantId && requestedMerchantId !== principal.merchantId) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
    return principal.merchantId;
  }

  async getState(
    principal: StaffPrincipal,
    requestedMerchantId?: string,
  ): Promise<MerchantOnboardingState | null> {
    const merchantId = this.resolveTargetMerchant(principal, requestedMerchantId);
    return this.repo.getState(merchantId);
  }

  async setMerchantSubmitted(
    principal: StaffPrincipal,
    submitted: boolean,
    requestedMerchantId?: string,
  ): Promise<MerchantOnboardingState | null> {
    const merchantId = this.resolveTargetMerchant(principal, requestedMerchantId);
    await this.repo.setSubmitted(merchantId, submitted);
    return this.repo.getState(merchantId);
  }

  /** Update a restaurant's onboarding progress within the staff's merchant scope. */
  async setRestaurantProgress(
    principal: StaffPrincipal,
    restaurantId: string,
    data: { onboardingStep?: number; softOnboarding?: boolean },
  ): Promise<void> {
    // assertRestaurantInScope confirms the restaurant belongs to the staff merchant
    // (or SUPER_ADMIN platform); it also rejects unknown restaurants.
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    const r = await this.repo.getRestaurant(restaurantId);
    if (!r) throw new ForbiddenException('Cross-merchant access denied');
    await this.repo.setRestaurantProgress(restaurantId, data);
  }
}
