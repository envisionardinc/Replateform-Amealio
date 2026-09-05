import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { OfferRepository } from './infrastructure/offer.repository';
import { OfferService } from './application/offer.service';
import { PromotionEvaluationService } from './application/promotion-evaluation.service';
import { PromotionEvaluationRepository } from './infrastructure/promotion-evaluation.repository';

/**
 * Merchant Offer & Coupon configuration (P1.7.22) plus Phase 1 promotion
 * evaluation (doc 101). Evaluation is quote-only — no HTTP, no ledger writes,
 * no checkout/cart/payment integration.
 */
@Module({
  imports: [MerchantModule],
  providers: [
    OfferRepository,
    OfferService,
    PromotionEvaluationRepository,
    PromotionEvaluationService,
  ],
  exports: [OfferService, OfferRepository, PromotionEvaluationService],
})
export class OfferModule {}
