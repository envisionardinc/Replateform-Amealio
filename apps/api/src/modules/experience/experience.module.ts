import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { ExperienceRepository } from './infrastructure/experience.repository';
import { ExperienceService } from './application/experience.service';
import { ExperienceController } from './experience.controller';

/** Merchant Experience configuration and staff HTTP surface. */
@Module({
  imports: [MerchantModule, StaffAuthModule],
  controllers: [ExperienceController],
  providers: [ExperienceRepository, ExperienceService],
  exports: [ExperienceService, ExperienceRepository],
})
export class ExperienceModule {}
