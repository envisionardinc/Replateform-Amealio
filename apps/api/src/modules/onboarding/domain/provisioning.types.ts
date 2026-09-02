/**
 * Canonical creation (write) inputs for the merchant-owned foundation (P1.7.10).
 * These map the legacy onboarding create-path (VendorUser/admin creates a vendor;
 * restaurant + subscription created during onboarding) onto the existing target
 * Merchant/Restaurant/Subscription models — no schema change, no new entity.
 * Geography stays string-oriented (P1.7.7); Subscription.config stays JSON (P1.7.3).
 */

export interface CreateMerchantInput {
  legalName: string;
  email?: string | null;
  phone?: string | null;
  organizationId?: string | null;
  legacyId?: string | null;
}

export interface CreateRestaurantInput {
  merchantId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  country?: string | null;
  timezone?: string | null;
  currencyCode?: string | null;
  lat?: number | null;
  lon?: number | null;
  chainId?: string | null;
  legacyId?: string | null;
}

export interface CreateSubscriptionInput {
  merchantId: string;
  restaurantId?: string | null;
  productType: string; // ORDERING | SEATING | EVENT | SCAN_PAY
  status?: string;
  config?: Record<string, unknown> | null;
}

export interface CreatedMerchant {
  id: string;
  legalName: string;
  email: string | null;
  phone: string | null;
  onboardingSubmitted: boolean;
}

export interface CreatedRestaurant {
  id: string;
  merchantId: string;
  name: string;
  status: string;
  onboardingStep: number;
  softOnboarding: boolean;
}

export interface CreatedSubscription {
  id: string;
  merchantId: string;
  restaurantId: string | null;
  productType: string;
  status: string;
}
