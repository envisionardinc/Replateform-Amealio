import { BadRequestException } from '@nestjs/common';
import type { AppliedOffer, OrderTypeName } from './ordering.types';

/**
 * Server-authoritative offer eligibility + discount calculation (P1.7.24).
 *
 * These are PURE functions over an already-loaded {@link AppliedOffer} and the
 * server-computed subtotal. The client may only supply the coupon INTENT; every
 * eligibility decision and the discount amount are decided here — never trusted
 * from the client (DEC-OFF-1). Only source-confirmed discount types are handled:
 * PERCENTAGE and FIXED, each with an optional maximum cap.
 */

/**
 * Validate that the resolved offer/coupon may be applied to this order. Throws a
 * BadRequestException with a specific reason when not. All checks are server-side.
 */
export function assertOfferEligible(
  offer: AppliedOffer,
  orderRestaurantId: string,
  orderMerchantId: string,
  subtotalMinor: bigint,
  orderType: OrderTypeName,
  now: Date,
): void {
  if (offer.deletedAt !== null) {
    throw new BadRequestException('Coupon is not valid'); // soft-deleted offer
  }
  if (!offer.active) {
    throw new BadRequestException('Offer is not active');
  }
  if (offer.validFrom && now < offer.validFrom) {
    throw new BadRequestException('Offer is not yet valid');
  }
  if (offer.validTo && now > offer.validTo) {
    throw new BadRequestException('Offer has expired');
  }

  // Scope: a global offer applies platform-wide; otherwise a restaurant-scoped
  // offer must match the order's restaurant, and a merchant-scoped offer must
  // match the order's merchant.
  if (!offer.isGlobal) {
    if (offer.restaurantId) {
      if (offer.restaurantId !== orderRestaurantId) {
        throw new BadRequestException('Offer is not valid for this restaurant');
      }
    } else if (offer.merchantId) {
      if (offer.merchantId !== orderMerchantId) {
        throw new BadRequestException('Offer is not valid for this merchant');
      }
    } else {
      // Non-global offer with neither restaurant nor merchant scope is unusable.
      throw new BadRequestException('Offer is not valid for this order');
    }
  }

  // Order-amount gates against the server-authoritative subtotal.
  if (offer.minOrderMinor !== null && subtotalMinor < offer.minOrderMinor) {
    throw new BadRequestException('Order does not meet the minimum amount for this offer');
  }
  if (offer.maxOrderMinor !== null && subtotalMinor > offer.maxOrderMinor) {
    throw new BadRequestException('Order exceeds the maximum amount for this offer');
  }

  // Service type: when configured, the offer applies only to the listed order
  // types. Tokens are matched against the canonical OrderType names (case-
  // insensitive); "ALL" is a wildcard. Empty/absent => applies to all types.
  if (offer.serviceTypes && offer.serviceTypes.length > 0) {
    const allowed = offer.serviceTypes.map((s) => s.trim().toUpperCase());
    if (!allowed.includes('ALL') && !allowed.includes(orderType)) {
      throw new BadRequestException('Offer is not valid for this service type');
    }
  }
}

/**
 * Compute the authoritative discount (minor units) for an eligible offer against
 * the server-computed subtotal. Percentage = floor(subtotal × pct / 100); fixed =
 * configured amount. The result is capped by `maxDiscountMinor` (when set) and can
 * never exceed the subtotal (discount is applied to items only).
 */
export function calculateDiscountMinor(offer: AppliedOffer, subtotalMinor: bigint): bigint {
  let discount: bigint;
  if (offer.discountPercent !== null) {
    if (offer.discountPercent <= 0) {
      throw new BadRequestException('Offer has an invalid discount configuration');
    }
    discount = (subtotalMinor * BigInt(offer.discountPercent)) / 100n; // floor (truncates)
  } else if (offer.discountMinor !== null) {
    discount = offer.discountMinor;
  } else {
    throw new BadRequestException('Offer has no discount configured');
  }

  if (offer.maxDiscountMinor !== null && discount > offer.maxDiscountMinor) {
    discount = offer.maxDiscountMinor;
  }
  if (discount < 0n) discount = 0n;
  if (discount > subtotalMinor) discount = subtotalMinor;
  return discount;
}
