import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { OfferRepository } from '../infrastructure/offer.repository';
import type {
  CreateOfferInput,
  OfferRecord,
  SettlementTypeName,
  UpdateOfferInput,
  UseFrequencyName,
} from '../domain/offer.types';

const SETTLEMENTS = new Set<SettlementTypeName>(['MERCHANT', 'ADMIN', 'SPLIT']);
const FREQUENCIES = new Set<UseFrequencyName>(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

/**
 * Merchant Offer & Coupon CONFIGURATION foundation (P1.7.22). Create/update/
 * activate/soft-delete an Offer definition + its coupon code over the EXISTING
 * `Offer`(+`Coupon`) models. Merchant-tenant-scoped (P1.7.1F/P1.7.2 conventions):
 * merchant staff operate only within their merchant; `isGlobal` offers are
 * SUPER_ADMIN-only; server-derived scope; cross-merchant/deleted rejected;
 * activation gate (P1.7.14) upstream. Configuration ONLY — NO redemption, NO
 * discount calculation, NO `CouponRedemption`, NO usage counters, NO SPLIT calc.
 */
@Injectable()
export class OfferService {
  constructor(
    private readonly restaurants: RestaurantRepository,
    private readonly repo: OfferRepository,
  ) {}

  async createOffer(principal: StaffPrincipal, input: CreateOfferInput): Promise<OfferRecord> {
    if (!nonEmpty(input.title)) throw new BadRequestException('title is required');
    this.validateConfig(input, true);
    if (
      input.couponCode !== undefined &&
      input.couponCode !== null &&
      !nonEmpty(input.couponCode)
    ) {
      throw new BadRequestException('couponCode cannot be empty');
    }

    const scope = await this.resolveCreateScope(principal, input);

    return this.repo.create(
      {
        legacyId: input.legacyId ?? null,
        merchantId: scope.merchantId,
        restaurantId: scope.restaurantId,
        isGlobal: scope.isGlobal,
        title: input.title.trim(),
        description: input.description ?? null,
        termsAndConditions: input.termsAndConditions ?? null,
        active: input.active ?? false,
        settlementType: input.settlementType ?? 'MERCHANT',
        discountPercent: input.discountPercent ?? null,
        discountMinor: input.discountMinor ?? null,
        maxDiscountMinor: input.maxDiscountMinor ?? null,
        minOrderMinor: input.minOrderMinor ?? null,
        maxOrderMinor: input.maxOrderMinor ?? null,
        serviceTypes: input.serviceTypes ?? null,
        validFrom: toDate(input.validFrom),
        validTo: toDate(input.validTo),
        maxUsageLimit: input.maxUsageLimit ?? null,
        perUserLimit: input.perUserLimit ?? null,
        useLimit: input.useLimit ?? null,
        useFrequency: input.useFrequency ?? null,
      },
      input.couponCode ? input.couponCode.trim() : null,
    );
  }

  async getOffer(principal: StaffPrincipal, id: string): Promise<OfferRecord | null> {
    const scope = await this.repo.offerScope(id);
    if (!scope || scope.deletedAt !== null) return null; // soft-deleted / unknown => absent
    this.assertAccess(principal, scope);
    return this.repo.findById(id);
  }

  async listMerchantOffers(principal: StaffPrincipal, merchantId?: string): Promise<OfferRecord[]> {
    const target = this.resolveTargetMerchant(principal, merchantId);
    return this.repo.listByMerchant(target);
  }

  async listGlobalOffers(principal: StaffPrincipal): Promise<OfferRecord[]> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only platform SUPER_ADMIN may list global offers');
    }
    return this.repo.listGlobal();
  }

  async updateOffer(
    principal: StaffPrincipal,
    id: string,
    input: UpdateOfferInput,
  ): Promise<OfferRecord> {
    const scope = await this.assertOffer(principal, id);
    if (input.title !== undefined && !nonEmpty(input.title)) {
      throw new BadRequestException('title cannot be empty');
    }
    this.validateConfig(input, false);
    if (input.restaurantId) {
      if (scope.isGlobal)
        throw new BadRequestException('a global offer cannot target a restaurant');
      await this.assertRestaurant(input.restaurantId, scope.merchantId);
    }
    let coupon: { set: string | null } | undefined;
    if (input.couponCode !== undefined) {
      if (input.couponCode !== null && !nonEmpty(input.couponCode)) {
        throw new BadRequestException('couponCode cannot be empty');
      }
      coupon = { set: input.couponCode ? input.couponCode.trim() : null };
    }
    return this.repo.update(id, this.toWritePatch(input), coupon);
  }

  async setActive(principal: StaffPrincipal, id: string, active: boolean): Promise<OfferRecord> {
    await this.assertOffer(principal, id);
    return this.repo.setActive(id, active);
  }

  async deleteOffer(principal: StaffPrincipal, id: string): Promise<void> {
    await this.assertOffer(principal, id);
    await this.repo.softDelete(id);
  }

  // ---- scope / tenancy ----
  private async resolveCreateScope(
    principal: StaffPrincipal,
    input: CreateOfferInput,
  ): Promise<{ merchantId: string | null; restaurantId: string | null; isGlobal: boolean }> {
    if (input.isGlobal) {
      // Platform-wide offers are SUPER_ADMIN-only and not merchant/restaurant scoped.
      if (!isSuperAdmin(principal)) {
        throw new ForbiddenException('Only platform SUPER_ADMIN may create a global offer');
      }
      if (input.restaurantId) {
        throw new BadRequestException('a global offer cannot target a restaurant');
      }
      return { merchantId: null, restaurantId: null, isGlobal: true };
    }
    const merchantId = this.resolveTargetMerchant(principal, input.merchantId ?? undefined);
    let restaurantId: string | null = null;
    if (input.restaurantId) {
      await this.assertRestaurant(input.restaurantId, merchantId);
      restaurantId = input.restaurantId;
    }
    return { merchantId, restaurantId, isGlobal: false };
  }

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

  private async assertOffer(
    principal: StaffPrincipal,
    id: string,
  ): Promise<{ merchantId: string | null; isGlobal: boolean }> {
    const scope = await this.repo.offerScope(id);
    if (!scope || scope.deletedAt !== null) throw new NotFoundException('Offer not found');
    this.assertAccess(principal, scope);
    return { merchantId: scope.merchantId, isGlobal: scope.isGlobal };
  }

  private assertAccess(
    principal: StaffPrincipal,
    scope: { merchantId: string | null; isGlobal: boolean },
  ): void {
    if (isSuperAdmin(principal)) return;
    if (scope.isGlobal) {
      throw new ForbiddenException('Only platform SUPER_ADMIN may access a global offer');
    }
    if (!principal.merchantId || scope.merchantId !== principal.merchantId) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
  }

  private async assertRestaurant(restaurantId: string, merchantId: string | null): Promise<void> {
    const restaurant = await this.restaurants.findById(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    if (!merchantId || restaurant.merchantId !== merchantId) {
      throw new ForbiddenException('Restaurant does not belong to this merchant');
    }
  }

  // ---- validation ----
  private validateConfig(input: CreateOfferInput | UpdateOfferInput, isCreate: boolean): void {
    const hasPercent = input.discountPercent !== undefined && input.discountPercent !== null;
    const hasFixed = input.discountMinor !== undefined && input.discountMinor !== null;
    // On create, exactly one discount is required; on update, at most one may be set.
    if (hasPercent && hasFixed) {
      throw new BadRequestException('provide exactly one of discountPercent or discountMinor');
    }
    if (isCreate && !hasPercent && !hasFixed) {
      throw new BadRequestException('a discount (percent or fixed) is required');
    }
    if (hasPercent) {
      const p = input.discountPercent as number;
      if (!Number.isInteger(p) || p < 1 || p > 100) {
        throw new BadRequestException('discountPercent must be an integer 1..100');
      }
    }
    if (hasFixed && (input.discountMinor as bigint) <= 0n) {
      throw new BadRequestException('discountMinor must be > 0');
    }
    for (const [k, v] of Object.entries({
      maxDiscountMinor: input.maxDiscountMinor,
      minOrderMinor: input.minOrderMinor,
      maxOrderMinor: input.maxOrderMinor,
    })) {
      if (v != null && (v as bigint) < 0n) throw new BadRequestException(`${k} must be >= 0`);
    }
    if (
      input.minOrderMinor != null &&
      input.maxOrderMinor != null &&
      input.maxOrderMinor < input.minOrderMinor
    ) {
      throw new BadRequestException('maxOrderMinor cannot be less than minOrderMinor');
    }
    const from = toDate(input.validFrom);
    const to = toDate(input.validTo);
    if (from && to && to <= from) {
      throw new BadRequestException('validTo must be after validFrom');
    }
    if (input.serviceTypes != null) {
      if (!Array.isArray(input.serviceTypes) || input.serviceTypes.some((s) => !nonEmpty(s))) {
        throw new BadRequestException('serviceTypes must be an array of non-empty strings');
      }
    }
    for (const [k, v] of Object.entries({
      maxUsageLimit: input.maxUsageLimit,
      perUserLimit: input.perUserLimit,
      useLimit: input.useLimit,
    })) {
      if (v != null && (!Number.isInteger(v) || (v as number) < 0)) {
        throw new BadRequestException(`${k} must be a non-negative integer`);
      }
    }
    if (input.useFrequency != null && !FREQUENCIES.has(input.useFrequency)) {
      throw new BadRequestException('useFrequency must be DAILY, WEEKLY, MONTHLY, or YEARLY');
    }
    if (input.settlementType !== undefined && !SETTLEMENTS.has(input.settlementType)) {
      throw new BadRequestException('invalid settlementType');
    }
  }

  private toWritePatch(input: UpdateOfferInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const keys: (keyof UpdateOfferInput)[] = [
      'title',
      'description',
      'termsAndConditions',
      'active',
      'settlementType',
      'discountPercent',
      'discountMinor',
      'maxDiscountMinor',
      'minOrderMinor',
      'maxOrderMinor',
      'serviceTypes',
      'maxUsageLimit',
      'perUserLimit',
      'useLimit',
      'useFrequency',
      'restaurantId',
    ];
    for (const k of keys) {
      if (input[k] !== undefined) patch[k] = input[k];
    }
    if (input.validFrom !== undefined) patch.validFrom = toDate(input.validFrom);
    if (input.validTo !== undefined) patch.validTo = toDate(input.validTo);
    return patch;
  }
}

function nonEmpty(s?: string): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}
function toDate(v?: string | Date | null): Date | null {
  if (v === undefined || v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
