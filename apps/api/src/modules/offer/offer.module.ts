import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { OfferRepository } from './infrastructure/offer.repository';
import { OfferService } from './application/offer.service';

/**
 * Merchant Offer & Coupon configuration foundation module (P1.7.22).
 *
 * Merchant/admin-scoped create/update/activate/soft-delete of an Offer definition
 * (+ its coupon code via the existing `Coupon`) over the target schema. Reuses
 * P1.7.2 `RestaurantRepository` for restaurant validation. Configuration ONLY —
 * no redemption, no `CouponRedemption`, no discount calculation, no order/payment
 * integration, no controllers/UI.
 */
@Module({
  imports: [MerchantModule],
  providers: [OfferRepository, OfferService],
  exports: [OfferService, OfferRepository],
})
export class OfferModule {}
