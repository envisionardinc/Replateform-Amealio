import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { ExperienceRepository } from './infrastructure/experience.repository';
import { ExperienceService } from './application/experience.service';

/**
 * Merchant Experience configuration foundation module (P1.7.20).
 *
 * Merchant-scoped create/update/publish/soft-delete of the new `Experience`
 * (+ `ExperienceMenu` custom-menu references) over the target schema. Reuses
 * P1.7.2 `MerchantScopeService` + P1.7.4 `Category` + P1.7.18 `Menu(type=CUSTOM)`.
 * No controllers/UI, no booking/payment/refund/Diner/Order, no media, no
 * scheduling engine, no packages, no events/scraped-events.
 */
@Module({
  imports: [MerchantModule],
  providers: [ExperienceRepository, ExperienceService],
  exports: [ExperienceService, ExperienceRepository],
})
export class ExperienceModule {}
