import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { IdentityModule } from '../identity/identity.module';
import { MerchantOnboardingRepository } from './infrastructure/merchant-onboarding.repository';
import { MerchantOnboardingService } from './application/merchant-onboarding.service';
import { MerchantProvisioningRepository } from './infrastructure/merchant-provisioning.repository';
import { MerchantProvisioningService } from './application/merchant-provisioning.service';
import { MerchantOwnerRepository } from './infrastructure/merchant-owner.repository';
import { MerchantOwnerService } from './application/merchant-owner.service';

/**
 * Merchant onboarding foundation module (P1.7.8 state + P1.7.10 creation +
 * P1.7.14 owner provisioning/activation + restaurant-profile/subscription-config
 * update).
 * - Onboarding-STATE read/write (onboardingSubmitted / onboardingStep / softOnboarding).
 * - Canonical CREATION of Merchant / Restaurant / Subscription (write foundation).
 * - Owner provisioning (StaffMember + StaffCredential) + activation gate + the
 *   minimal restaurant-profile / subscription-config update writes.
 * Merchant-tenant-scoped via P1.7.2 `MerchantScopeService`; merchant creation +
 * owner provisioning/activation are platform (SUPER_ADMIN) only. Reuses the
 * shared bcrypt hasher (IdentityModule) + existing staff auth — no second auth
 * system, no schema change, no onboarding UI/workflow engine, no controllers.
 */
@Module({
  imports: [MerchantModule, IdentityModule],
  providers: [
    MerchantOnboardingRepository,
    MerchantOnboardingService,
    MerchantProvisioningRepository,
    MerchantProvisioningService,
    MerchantOwnerRepository,
    MerchantOwnerService,
  ],
  exports: [
    MerchantOnboardingRepository,
    MerchantOnboardingService,
    MerchantProvisioningRepository,
    MerchantProvisioningService,
    MerchantOwnerRepository,
    MerchantOwnerService,
  ],
})
export class OnboardingModule {}
