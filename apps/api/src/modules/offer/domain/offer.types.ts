/**
 * Offer configuration domain types (P1.7.22). Merchant/admin CONFIGURATION of an
 * Offer definition + its coupon code over the EXISTING `Offer` (+ `Coupon` for the
 * code). Money is exact integer minor units (`bigint`). This is configuration only:
 * NO redemption, NO discount calculation, NO `CouponRedemption`, NO usage counters.
 */

export type SettlementTypeName = 'MERCHANT' | 'ADMIN' | 'SPLIT';
export type UseFrequencyName = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface CreateOfferInput {
  merchantId?: string | null; // SUPER_ADMIN explicit target (ignored for staff / global)
  restaurantId?: string | null; // optional single-restaurant scope (non-global)
  isGlobal?: boolean; // platform-wide (SUPER_ADMIN only)
  title: string;
  description?: string | null;
  termsAndConditions?: string | null;
  couponCode?: string | null; // optional; stored as a Coupon (code @unique)
  // Discount: exactly one of discountPercent (1..100) or discountMinor (>0).
  discountPercent?: number | null;
  discountMinor?: bigint | null;
  maxDiscountMinor?: bigint | null;
  minOrderMinor?: bigint | null;
  maxOrderMinor?: bigint | null;
  serviceTypes?: string[] | null; // free-form legacy service_type strings
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  active?: boolean;
  maxUsageLimit?: number | null;
  perUserLimit?: number | null;
  useLimit?: number | null;
  useFrequency?: UseFrequencyName | null;
  settlementType?: SettlementTypeName;
  legacyId?: string | null;
}

export interface UpdateOfferInput {
  title?: string;
  description?: string | null;
  termsAndConditions?: string | null;
  couponCode?: string | null; // replaces the offer's coupon code (null clears it)
  discountPercent?: number | null;
  discountMinor?: bigint | null;
  maxDiscountMinor?: bigint | null;
  minOrderMinor?: bigint | null;
  maxOrderMinor?: bigint | null;
  serviceTypes?: string[] | null;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  active?: boolean;
  maxUsageLimit?: number | null;
  perUserLimit?: number | null;
  useLimit?: number | null;
  useFrequency?: UseFrequencyName | null;
  settlementType?: SettlementTypeName;
  restaurantId?: string | null;
}

export interface OfferCouponRecord {
  id: string;
  code: string;
}

export interface OfferRecord {
  id: string;
  legacyId: string | null;
  merchantId: string | null;
  restaurantId: string | null;
  isGlobal: boolean;
  title: string;
  description: string | null;
  termsAndConditions: string | null;
  active: boolean;
  settlementType: SettlementTypeName;
  discountPercent: number | null;
  discountMinor: bigint | null;
  maxDiscountMinor: bigint | null;
  minOrderMinor: bigint | null;
  maxOrderMinor: bigint | null;
  serviceTypes: string[] | null;
  validFrom: Date | null;
  validTo: Date | null;
  maxUsageLimit: number | null;
  perUserLimit: number | null;
  useLimit: number | null;
  useFrequency: string | null;
  coupons: OfferCouponRecord[];
}
