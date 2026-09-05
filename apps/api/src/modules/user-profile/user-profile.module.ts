import { Module } from '@nestjs/common';
import { UserProfileRepository } from './infrastructure/user-profile.repository';
import { UserProfileService } from './application/user-profile.service';

/**
 * User profile / onboarding-state foundation (P1.7.8). Additive state over the
 * existing `UserProfile` (no new entity). Consumer HTTP lives in
 * ConsumerProfileModule so foundation tests do not boot auth routes.
 */
@Module({
  providers: [UserProfileRepository, UserProfileService],
  exports: [UserProfileRepository, UserProfileService],
})
export class UserProfileModule {}
