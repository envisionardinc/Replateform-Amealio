import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { MerchantProvisioningRepository } from '../infrastructure/merchant-provisioning.repository';
import type {
  CreateMerchantInput,
  CreateRestaurantInput,
  CreateSubscriptionInput,
  CreatedMerchant,
  CreatedRestaurant,
  CreatedSubscription,
} from '../domain/provisioning.types';

const PRODUCT_TYPES = new Set(['ORDERING', 'SEATING', 'EVENT', 'SCAN_PAY']);

/**
 * Canonical creation of the merchant-owned foundation (P1.7.10).
 *
 * Authorization (representable by P1.7.1F — no new model):
 *   - createMerchant   → PLATFORM only (SUPER_ADMIN). A brand-new merchant has no
 *     tenant scope yet, so provisioning is a platform operation. (Public
 *     self-service merchant signup is a separate/deferred frontend+public-auth
 *     concern.)
 *   - createRestaurant / createSubscription → MERCHANT-scoped: merchant staff act
 *     within their own merchant; SUPER_ADMIN targets a merchant via explicit id.
 *
 * Creation does NOT set onboardingSubmitted (final submission is a separate,
 * frontend-driven state transition — P1.7.9; use MerchantOnboardingService).
 * No atomic Merchant+Restaurant+Subscription transaction is imposed: legacy
 * onboarding creates them across separate steps (partial creation is valid).
 */
@Injectable()
export class MerchantProvisioningService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly repo: MerchantProvisioningRepository,
  ) {}

  private resolveTargetMerchant(principal: StaffPrincipal, requestedMerchantId: string): string {
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

  /** Provision a new Merchant (platform/SUPER_ADMIN only). */
  async createMerchant(
    principal: StaffPrincipal,
    input: CreateMerchantInput,
  ): Promise<CreatedMerchant> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only platform SUPER_ADMIN may create a merchant');
    }
    if (!input.legalName || input.legalName.trim().length === 0) {
      throw new BadRequestException('legalName is required');
    }
    return this.repo.createMerchant(input);
  }

  /** Create a Restaurant within the caller's merchant scope. */
  async createRestaurant(
    principal: StaffPrincipal,
    input: CreateRestaurantInput,
  ): Promise<CreatedRestaurant> {
    const merchantId = this.resolveTargetMerchant(principal, input.merchantId);
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
    if (!(await this.repo.merchantExists(merchantId))) {
      throw new NotFoundException('Merchant not found');
    }
    // Never trust a request-supplied merchantId: force the server-resolved scope.
    return this.repo.createRestaurant({ ...input, merchantId });
  }

  /** Create a Subscription within the caller's merchant scope. */
  async createSubscription(
    principal: StaffPrincipal,
    input: CreateSubscriptionInput,
  ): Promise<CreatedSubscription> {
    const merchantId = this.resolveTargetMerchant(principal, input.merchantId);
    if (!PRODUCT_TYPES.has(input.productType)) {
      throw new BadRequestException('productType must be one of ORDERING|SEATING|EVENT|SCAN_PAY');
    }
    if (!(await this.repo.merchantExists(merchantId))) {
      throw new NotFoundException('Merchant not found');
    }
    // If a restaurant is specified, it must belong to the same merchant scope.
    if (input.restaurantId) {
      await this.scope.assertRestaurantInScope(principal, input.restaurantId);
    }
    return this.repo.createSubscription({ ...input, merchantId });
  }
}
