import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PASSWORD_HASHER, PasswordHasher } from '../../identity/domain/ports/password-hasher';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { MerchantOwnerRepository } from '../infrastructure/merchant-owner.repository';
import type {
  ProvisionOwnerInput,
  ProvisionedOwner,
  RestaurantProfileRecord,
  UpdateRestaurantProfileInput,
  UpdateSubscriptionConfigInput,
} from '../domain/owner-provisioning.types';

/**
 * Merchant owner provisioning + activation + onboarding update foundation
 * (P1.7.14). Makes a P1.7.10-provisioned merchant able to become an
 * authenticated, activated operational merchant, over the EXISTING identity
 * (P1.7.1D/E/F) and merchant/subscription models — no schema change, no second
 * auth system, no act-as/switching.
 *
 * Legacy contract (source): the owner is a `VendorUser` (role, bcrypt password,
 * `has_admin_approved` default false; SUPER_ADMIN grants approval). Target:
 *   - owner  = one `StaffMember{staffRole: MERCHANT_OWNER, merchantId}` + one
 *              PASSWORD `StaffCredential` (bcrypt via the shared hasher);
 *   - approval/activation = owner `StaffMember.status` (BLOCKED = pending,
 *              ACTIVE = approved), enforced by the EXISTING staff auth guard.
 * Merchant scope is ALWAYS server-derived; SUPER_ADMIN is platform-scoped and
 * targets a merchant explicitly.
 */
@Injectable()
export class MerchantOwnerService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly repo: MerchantOwnerRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
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

  /**
   * Provision the merchant owner (platform/SUPER_ADMIN only — mirrors the
   * SUPER_ADMIN-driven merchant creation of P1.7.10; public self-signup is
   * deferred). Owner + credential are created atomically; the owner defaults to
   * BLOCKED (pending activation). Exactly one MERCHANT_OWNER per merchant.
   */
  async provisionOwner(
    principal: StaffPrincipal,
    input: ProvisionOwnerInput,
  ): Promise<ProvisionedOwner> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only platform SUPER_ADMIN may provision a merchant owner');
    }
    if (!input.merchantId) {
      throw new BadRequestException('merchantId is required');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('password is required (min 8 chars)');
    }
    if (!input.email && !input.phone) {
      throw new BadRequestException('a login identifier (email or phone) is required');
    }

    const merchant = await this.repo.findMerchant(input.merchantId);
    if (!merchant || merchant.deletedAt !== null) {
      throw new NotFoundException('Merchant not found');
    }
    // Owner cardinality: one MERCHANT_OWNER per merchant (source: one VendorUser
    // per signup; additional staff is a separate, out-of-scope concern).
    const existing = await this.repo.findOwner(input.merchantId);
    if (existing) {
      throw new ConflictException('Merchant already has an owner');
    }

    const secretHash = await this.hasher.hash(input.password);
    return this.repo.provisionOwner({
      merchantId: input.merchantId,
      name: input.name.trim(),
      email: input.email ?? null,
      phone: input.phone ?? null,
      secretHash,
      status: input.status ?? 'BLOCKED',
    });
  }

  /**
   * Activate (approve) a merchant: transition its owner(s) to ACTIVE so they can
   * authenticate/operate (the EXISTING staff guard rejects non-ACTIVE). SUPER_ADMIN
   * only — mirrors the legacy admin `approve` that sets `has_admin_approved`.
   */
  async activateMerchant(principal: StaffPrincipal, merchantId: string): Promise<ProvisionedOwner> {
    return this.setMerchantActivation(principal, merchantId, 'ACTIVE');
  }

  /** Deactivate/suspend a merchant: owner(s) → BLOCKED (revokes operation). */
  async deactivateMerchant(
    principal: StaffPrincipal,
    merchantId: string,
  ): Promise<ProvisionedOwner> {
    return this.setMerchantActivation(principal, merchantId, 'BLOCKED');
  }

  private async setMerchantActivation(
    principal: StaffPrincipal,
    merchantId: string,
    status: 'ACTIVE' | 'BLOCKED',
  ): Promise<ProvisionedOwner> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only platform SUPER_ADMIN may change merchant activation');
    }
    if (!merchantId) throw new BadRequestException('merchantId is required');
    const merchant = await this.repo.findMerchant(merchantId);
    if (!merchant || merchant.deletedAt !== null) {
      throw new NotFoundException('Merchant not found');
    }
    const owner = await this.repo.findOwner(merchantId);
    if (!owner) {
      throw new NotFoundException('Merchant has no owner to activate');
    }
    await this.repo.setOwnerStatus(merchantId, status);
    return { ...owner, status };
  }

  /**
   * Merchant-scoped restaurant profile update (onboarding/configuration). Only
   * the evidenced profile fields are writable; unknown fields are ignored.
   */
  async updateRestaurantProfile(
    principal: StaffPrincipal,
    restaurantId: string,
    data: UpdateRestaurantProfileInput,
  ): Promise<RestaurantProfileRecord> {
    const restaurant = await this.repo.findRestaurant(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    // Tenancy: restaurant must be within the caller's merchant scope.
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new BadRequestException('name cannot be empty');
    }
    return this.repo.updateRestaurantProfile(restaurantId, data);
  }

  /**
   * Merchant-scoped subscription configuration update. `config` is merged
   * NON-DESTRUCTIVELY into the existing JSON (unrelated keys preserved; only the
   * provided paths change). `table_setup` is NOT normalized here (DEC-2 deferred).
   */
  async updateSubscriptionConfig(
    principal: StaffPrincipal,
    subscriptionId: string,
    data: UpdateSubscriptionConfigInput,
  ): Promise<{
    id: string;
    merchantId: string;
    restaurantId: string | null;
    status: string;
    config: Record<string, unknown> | null;
  }> {
    const sub = await this.repo.findSubscription(subscriptionId);
    if (!sub) throw new NotFoundException('Subscription not found');
    // Tenancy: the subscription must belong to the caller's merchant.
    const merchantId = this.resolveTargetMerchant(principal, sub.merchantId);
    if (sub.merchantId !== merchantId) {
      throw new ForbiddenException('Cross-merchant access denied');
    }
    // If the subscription is tied to a restaurant, it must also be in scope.
    if (sub.restaurantId) {
      await this.scope.assertRestaurantInScope(principal, sub.restaurantId);
    }

    let mergedConfig: Prisma.InputJsonValue | undefined;
    if (data.config !== undefined) {
      const base =
        typeof sub.config === 'object' && sub.config !== null && !Array.isArray(sub.config)
          ? (sub.config as Record<string, unknown>)
          : {};
      mergedConfig = deepMerge(base, data.config) as Prisma.InputJsonValue;
    }

    const updated = await this.repo.updateSubscription(subscriptionId, {
      status: data.status,
      config: mergedConfig,
    });
    const cfg =
      typeof updated.config === 'object' &&
      updated.config !== null &&
      !Array.isArray(updated.config)
        ? (updated.config as Record<string, unknown>)
        : null;
    return {
      id: updated.id,
      merchantId: updated.merchantId,
      restaurantId: updated.restaurantId,
      status: updated.status,
      config: cfg,
    };
  }
}

/**
 * Recursive non-destructive merge: plain objects are merged key-by-key; arrays
 * and primitives in `patch` REPLACE the base value; `undefined` patch values are
 * ignored. Preserves unrelated existing configuration (P1.7.3/P1.7.13 intent).
 */
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
