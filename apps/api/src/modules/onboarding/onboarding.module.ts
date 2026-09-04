import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { IdentityModule } from '../identity/identity.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { MerchantOnboardingRepository } from './infrastructure/merchant-onboarding.repository';
import { MerchantOnboardingService } from './application/merchant-onboarding.service';
import { MerchantProvisioningRepository } from './infrastructure/merchant-provisioning.repository';
import { MerchantProvisioningService } from './application/merchant-provisioning.service';
import { MerchantOwnerRepository } from './infrastructure/merchant-owner.repository';
import { MerchantOwnerService } from './application/merchant-owner.service';
import { OnboardingController } from './onboarding.controller';

/**
 * Merchant onboarding foundation module (P1.7.8 state + P1.7.10 creation +
 * P1.7.14 owner provisioning/activation + restaurant-profile/subscription-config
 * update).
 *
 * The controller is the first staff-facing HTTP control-plane surface for these
 * existing capabilities. Authentication/RBAC is composed from the shared
 * StaffAuthModule; service-level authorization remains the final tenant boundary.
 */
@Module({
  imports: [MerchantModule, IdentityModule, StaffAuthModule],
  controllers: [OnboardingController],
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
