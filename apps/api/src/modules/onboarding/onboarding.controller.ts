import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import {
  PlatformOnly,
  RequireStaffRoles,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import type {
  RequestWithStaffPrincipal,
  StaffPrincipal,
} from '../identity/staff-authentication/staff-principal';
import { MerchantProvisioningService } from './application/merchant-provisioning.service';
import { MerchantOwnerService } from './application/merchant-owner.service';
import type {
  CreateMerchantInput,
  CreateRestaurantInput,
  CreateSubscriptionInput,
} from './domain/provisioning.types';
import type {
  ProvisionOwnerInput,
  UpdateRestaurantProfileInput,
  UpdateSubscriptionConfigInput,
} from './domain/owner-provisioning.types';

/**
 * Staff-facing merchant control-plane HTTP surface.
 *
 * Authorization is deliberately layered:
 * - JWT guard authenticates the staff principal.
 * - StaffAuthorizationGuard enforces route metadata.
 * - Application services remain the final server-derived tenant/business-rule
 *   boundary, so direct service calls cannot bypass merchant isolation.
 *
 * This controller exposes only capabilities already implemented in the
 * onboarding foundation; it does not introduce new onboarding business rules.
 */
@Controller('onboarding')
@UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
export class OnboardingController {
  constructor(
    private readonly provisioning: MerchantProvisioningService,
    private readonly owner: MerchantOwnerService,
  ) {}

  private principal(req: Request & RequestWithStaffPrincipal): StaffPrincipal {
    if (!req.staffPrincipal) {
      throw new Error('Authenticated staff principal missing');
    }
    return req.staffPrincipal;
  }

  @Post('merchants')
  @PlatformOnly()
  async createMerchant(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Body() input: CreateMerchantInput,
  ) {
    return this.provisioning.createMerchant(this.principal(req), input);
  }

  @Post('merchants/:merchantId/owner')
  @PlatformOnly()
  async provisionOwner(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('merchantId') merchantId: string,
    @Body() input: Omit<ProvisionOwnerInput, 'merchantId'>,
  ) {
    return this.owner.provisionOwner(this.principal(req), { ...input, merchantId });
  }

  @Patch('merchants/:merchantId/activation')
  @PlatformOnly()
  async setActivation(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('merchantId') merchantId: string,
    @Body() input: { active: boolean },
  ) {
    return input.active
      ? this.owner.activateMerchant(this.principal(req), merchantId)
      : this.owner.deactivateMerchant(this.principal(req), merchantId);
  }

  @Post('restaurants')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  async createRestaurant(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Body() input: CreateRestaurantInput,
  ) {
    return this.provisioning.createRestaurant(this.principal(req), input);
  }

  @Post('subscriptions')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  async createSubscription(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Body() input: CreateSubscriptionInput,
  ) {
    return this.provisioning.createSubscription(this.principal(req), input);
  }

  @Patch('restaurants/:restaurantId/profile')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  async updateRestaurantProfile(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('restaurantId') restaurantId: string,
    @Body() input: UpdateRestaurantProfileInput,
  ) {
    return this.owner.updateRestaurantProfile(this.principal(req), restaurantId, input);
  }

  @Patch('subscriptions/:subscriptionId/config')
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  async updateSubscriptionConfig(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('subscriptionId') subscriptionId: string,
    @Body() input: UpdateSubscriptionConfigInput,
  ) {
    return this.owner.updateSubscriptionConfig(this.principal(req), subscriptionId, input);
  }
}
