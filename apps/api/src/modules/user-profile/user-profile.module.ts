import { Module } from '@nestjs/common';
import { UserProfileRepository } from './infrastructure/user-profile.repository';
import { UserProfileService } from './application/user-profile.service';

/**
 * User profile / onboarding-state foundation module (P1.7.8). Read/write access
 * to the per-user `UserProfile` state (detailsSubmitted / completionPercentage /
 * preferences Json), user-owned. No new entity, no controllers, no discovery/
 * taxonomy normalization, no geography/media.
 */
@Module({
  providers: [UserProfileRepository, UserProfileService],
  exports: [UserProfileRepository, UserProfileService],
})
export class UserProfileModule {}
