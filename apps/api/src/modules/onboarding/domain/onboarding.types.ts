/**
 * Merchant onboarding-state read models (P1.7.8). Additive state over the
 * existing Merchant/Restaurant models (no new entity). Maps legacy:
 *   - Merchant.onboardingSubmitted   ← VendorUser.have_vendor_submitted_details (bool)
 *   - Restaurant.onboardingStep      ← restaurant.page_completed_till (int step)
 *   - Restaurant.softOnboarding      ← restaurant.softOnboarding (bool)
 */

export interface RestaurantOnboardingState {
  restaurantId: string;
  merchantId: string;
  onboardingStep: number;
  softOnboarding: boolean;
}

export interface MerchantOnboardingState {
  merchantId: string;
  onboardingSubmitted: boolean;
  restaurants: RestaurantOnboardingState[];
}
