import { ForbiddenException, Injectable } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { SubscriptionRepository } from '../infrastructure/subscription.repository';
import type { SubscriptionRecord } from '../domain/subscription.types';

/**
 * Merchant-tenant-scoped subscription access (P1.7.3). Scope is ALWAYS derived
 * from the server-side `StaffPrincipal` (P1.7.1F); a request-supplied merchant
 * id is used only to REJECT a mismatch, never to grant access.
 *
 * - Merchant staff: confined to `StaffPrincipal.merchantId`.
 * - SUPER_ADMIN (merchantId = null): platform scope; may target a merchant only
 *   via an explicit `requestedMerchantId` (platform read; act-as is deferred).
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly repo: SubscriptionRepository) {}

  /** Resolve the merchant whose subscriptions may be read, per P1.7.1F tenancy. */
  resolveTargetMerchant(principal: StaffPrincipal, requestedMerchantId?: string): string | null {
    if (isSuperAdmin(principal)) {
      // Platform scope: only an explicitly requested merchant is targeted.
      return requestedMerchantId ?? null;
    }
    if (!principal.merchantId) {
      throw new ForbiddenException('Merchant scope required');
    }
    if (requestedMerchantId && requestedMerchantId !== principal.merchantId) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
    return principal.merchantId;
  }

  /** Subscriptions visible to the principal (empty for SUPER_ADMIN with no target). */
  async getForStaff(
    principal: StaffPrincipal,
    requestedMerchantId?: string,
  ): Promise<SubscriptionRecord[]> {
    const merchantId = this.resolveTargetMerchant(principal, requestedMerchantId);
    if (merchantId === null) return [];
    return this.repo.findByMerchant(merchantId);
  }

  /** Active subscriptions visible to the principal. */
  async getActiveForStaff(
    principal: StaffPrincipal,
    requestedMerchantId?: string,
  ): Promise<SubscriptionRecord[]> {
    const merchantId = this.resolveTargetMerchant(principal, requestedMerchantId);
    if (merchantId === null) return [];
    return this.repo.findActiveByMerchant(merchantId);
  }
}
