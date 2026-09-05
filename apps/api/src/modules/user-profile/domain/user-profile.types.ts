/**
 * User profile / onboarding-state read model (P1.7.8). Additive state over the
 * existing `UserProfile` (no new entity). Maps legacy `User Service`:
 *   - detailsSubmitted     ← have_submited_details_profile (bool)
 *   - completionPercentage ← profile_percentage (int)
 *   - preferences (existing Json) holds legacy preference arrays
 *     (dietary_preferences / selected_cuisine / celebration_subcategory /
 *      outing_preferences / experience_preference / language). Values are
 *     preserved as-is; NO taxonomy is invented or normalized here.
 */
export type ProfilePreferences = Record<string, unknown>;

export interface UserProfileRecord {
  userId: string;
  detailsSubmitted: boolean;
  completionPercentage: number;
  preferences: ProfilePreferences | null;
}
