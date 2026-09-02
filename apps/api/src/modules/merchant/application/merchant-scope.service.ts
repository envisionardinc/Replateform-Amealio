import { ForbiddenException, Injectable } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { RestaurantRepository } from '../infrastructure/restaurant.repository';

/**
 * Data-aware merchant tenancy for staff/admin (P1.7.2). Builds on the P1.7.1F
 * authorization foundation: scope is ALWAYS derived from the server-side
 * `StaffPrincipal` (never from request input). This adds the missing
 * Merchant↔Restaurant check that string-only merchant-id comparison cannot do:
 * confirming a target restaurant actually belongs to the staff's merchant.
 *
 * SUPER_ADMIN (merchantId = null) is platform-scoped and not confined here
 * (acting AS a specific merchant — impersonation — remains deferred).
 */
@Injectable()
export class MerchantScopeService {
  constructor(private readonly restaurants: RestaurantRepository) {}

  /** The trusted merchant scope for the principal (null ⇒ platform SUPER_ADMIN). */
  resolveMerchantScope(principal: StaffPrincipal): string | null {
    return principal.merchantId;
  }

  /**
   * Ensure `restaurantId` is within the principal's merchant scope. SUPER_ADMIN
   * passes (platform scope). Merchant staff must have a merchant scope and the
   * restaurant must belong to it; otherwise 403. Never trusts request-supplied
   * merchant ids — ownership is resolved from the Restaurant record.
   */
  async assertRestaurantInScope(principal: StaffPrincipal, restaurantId: string): Promise<void> {
    if (isSuperAdmin(principal)) return;
    if (!principal.merchantId) {
      throw new ForbiddenException('Merchant scope required');
    }
    const ok = await this.restaurants.belongsToMerchant(restaurantId, principal.merchantId);
    if (!ok) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
  }
}
