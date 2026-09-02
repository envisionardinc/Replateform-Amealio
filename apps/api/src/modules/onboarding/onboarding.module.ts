import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { MerchantOnboardingRepository } from './infrastructure/merchant-onboarding.repository';
import { MerchantOnboardingService } from './application/merchant-onboarding.service';
import { MerchantProvisioningRepository } from './infrastructure/merchant-provisioning.repository';
import { MerchantProvisioningService } from './application/merchant-provisioning.service';

/**
 * Merchant onboarding foundation module (P1.7.8 state + P1.7.10 creation).
 * - Onboarding-STATE read/write (onboardingSubmitted / onboardingStep / softOnboarding).
 * - Canonical CREATION of Merchant / Restaurant / Subscription (write foundation).
 * Merchant-tenant-scoped via P1.7.2 `MerchantScopeService`; merchant creation is
 * platform (SUPER_ADMIN) only. No onboarding UI/workflow engine, no controllers,
 * no new entity, no geography/media/discovery, no billing.
 */
@Module({
  imports: [MerchantModule],
  providers: [
    MerchantOnboardingRepository,
    MerchantOnboardingService,
    MerchantProvisioningRepository,
    MerchantProvisioningService,
  ],
  exports: [
    MerchantOnboardingRepository,
    MerchantOnboardingService,
    MerchantProvisioningRepository,
    MerchantProvisioningService,
  ],
})
export class OnboardingModule {}
