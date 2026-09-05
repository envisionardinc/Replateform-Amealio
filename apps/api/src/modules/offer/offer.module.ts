import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { OfferRepository } from './infrastructure/offer.repository';
import { OfferService } from './application/offer.service';
import { PromotionEvaluationService } from './application/promotion-evaluation.service';
import { PromotionApplicationService } from './application/promotion-application.service';
import { PromotionEvaluationRepository } from './infrastructure/promotion-evaluation.repository';

/**
 * Merchant Offer & Coupon configuration (P1.7.22) plus the Phase 1 evaluation
 * kernel and Phase 2 application adapter (docs 101 / 108). The kernel remains
 * read-only; ledger writes stay on the existing order/payment path.
 */
@Module({
  imports: [MerchantModule],
  providers: [
    OfferRepository,
    OfferService,
    PromotionEvaluationRepository,
    PromotionEvaluationService,
    PromotionApplicationService,
  ],
  exports: [
    OfferService,
    OfferRepository,
    PromotionEvaluationService,
    PromotionApplicationService,
  ],
})
export class OfferModule {}
