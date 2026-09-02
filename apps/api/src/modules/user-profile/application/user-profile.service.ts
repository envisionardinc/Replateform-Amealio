import { BadRequestException, Injectable } from '@nestjs/common';
import { UserProfileRepository } from '../infrastructure/user-profile.repository';
import type { ProfilePreferences, UserProfileRecord } from '../domain/user-profile.types';

/**
 * User profile / onboarding-state service (P1.7.8). Operates strictly on the
 * given `userId` (the authenticated consumer's own id — user ownership); it
 * never accepts another user's id as an authorization source. Preference
 * updates merge (preserving unrelated keys). No discovery/taxonomy logic.
 */
@Injectable()
export class UserProfileService {
  constructor(private readonly repo: UserProfileRepository) {}

  getProfile(userId: string): Promise<UserProfileRecord | null> {
    return this.repo.findByUserId(userId);
  }

  /**
   * Update completion state. `completionPercentage` (legacy `profile_percentage`)
   * is a percentage; reject clearly out-of-range values (0..100) — a target
   * invariant. Legacy stored an int without a DB constraint, so this is enforced
   * only at the service layer.
   */
  async updateState(
    userId: string,
    data: { detailsSubmitted?: boolean; completionPercentage?: number },
  ): Promise<UserProfileRecord> {
    if (
      data.completionPercentage !== undefined &&
      (!Number.isInteger(data.completionPercentage) ||
        data.completionPercentage < 0 ||
        data.completionPercentage > 100)
    ) {
      throw new BadRequestException('completionPercentage must be an integer between 0 and 100');
    }
    return this.repo.upsertState(userId, data);
  }

  /** Merge preference keys, preserving existing unrelated keys. */
  mergePreferences(userId: string, patch: ProfilePreferences): Promise<UserProfileRecord> {
    return this.repo.mergePreferences(userId, patch);
  }
}
