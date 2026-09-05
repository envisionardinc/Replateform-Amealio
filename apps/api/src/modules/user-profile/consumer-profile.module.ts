import { Module } from '@nestjs/common';
import { ConsumerAuthModule } from '../identity/authentication/consumer-auth.module';
import { ConsumerProfileController } from './api/consumer-profile.controller';
import { ConsumerProfileService } from './application/consumer-profile.service';
import { UserProfileModule } from './user-profile.module';

/**
 * Consumer profile HTTP (doc 96). JWT subject owns GET/PATCH /me/profile.
 * Preferences stay on existing UserProfile.preferences Json.
 */
@Module({
  imports: [UserProfileModule, ConsumerAuthModule],
  controllers: [ConsumerProfileController],
  providers: [ConsumerProfileService],
  exports: [ConsumerProfileService],
})
export class ConsumerProfileModule {}
