import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderTypeName } from '../../ordering/domain/ordering.types';
import {
  intentCouponCode,
  PromotionApplicationError,
  rejectionError,
  viewOf,
  type AppliedPromotionView,
} from '../domain/promotion-application';
import { PromotionEvaluationService } from './promotion-evaluation.service';

export interface PromotionResolveInput {
  restaurantId: string;
  merchantId: string;
  orderType: OrderTypeName;
  merchandiseSubtotalMinor: bigint;
  lines?: Array<{ lineTotalMinor: bigint }>;
  userId?: string | null;
  couponCode?: string | null;
}

export interface PromotionResolveResult {
  discountMinor: bigint;
  promotion: AppliedPromotionView | null;
}

/**
 * Phase 2 adapter (doc 108).
 *
 * Calls the Phase 1 kernel and returns a Stage D discount slot value.
 * Never writes CouponRedemption / Offer / Coupon. Never computes tax or fees.
 */
@Injectable()
export class PromotionApplicationService {
  constructor(private readonly evaluations: PromotionEvaluationService) {}

  async resolve(input: PromotionResolveInput): Promise<PromotionResolveResult> {
    const couponCode = intentCouponCode(input.couponCode);
    const result = await this.evaluations.evaluate({
      restaurantId: input.restaurantId,
      merchantId: input.merchantId,
      orderType: input.orderType,
      subtotalMinor: input.merchandiseSubtotalMinor,
      lines: input.lines,
      userId: input.userId ?? null,
      couponCode,
    });

    if (result.eligible) {
      return {
        discountMinor: result.discountMinor,
        promotion: viewOf(result),
      };
    }

    if (couponCode) {
      throw rejectionError(result.reason);
    }

    return { discountMinor: 0n, promotion: null };
  }

  toHttp(err: unknown): never {
    if (err instanceof PromotionApplicationError) {
      throw new BadRequestException({ message: err.message, code: err.code });
    }
    throw err;
  }
}
