import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { MerchantOnboardingRepository } from './infrastructure/merchant-onboarding.repository';
import { MerchantOnboardingService } from './application/merchant-onboarding.service';

/**
 * Merchant onboarding-state foundation module (P1.7.8). Read/write access to the
 * additive onboarding-state fields on Merchant/Restaurant, merchant-tenant-scoped
 * via P1.7.2 `MerchantScopeService`. No onboarding UI/workflow, no controllers,
 * no new entity, no geography/media/discovery.
 */
@Module({
  imports: [MerchantModule],
  providers: [MerchantOnboardingRepository, MerchantOnboardingService],
  exports: [MerchantOnboardingRepository, MerchantOnboardingService],
})
export class OnboardingModule {}
