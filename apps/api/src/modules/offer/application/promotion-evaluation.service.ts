import { Injectable } from '@nestjs/common';
import { istUsagePeriodWindow } from '../../ordering/domain/usage-frequency';
import {
  classifyPromotion,
  contextIsComplete,
  normalizePromoCode,
  quoteEligiblePromotion,
  rejected,
  resolveEligibleSubtotal,
  selectBestEligible,
  type EligiblePromotionQuote,
  type EvaluablePromotion,
  type PromotionEvaluationContext,
  type PromotionEvaluationResult,
  type PromotionUsageSnapshot,
} from '../domain/promotion-evaluation';
import { PromotionEvaluationRepository } from '../infrastructure/promotion-evaluation.repository';

/**
 * Phase 1 quote/evaluate service (doc 101).
 *
 * READ-ONLY. Does not create CouponRedemption, reserve capacity, or mutate
 * Offer / Coupon / User / Order. Phase 2 callers feed discountMinor into Stage D;
 * ledger writes stay on createOrder / promoteOnPaymentCapture.
 */
@Injectable()
export class PromotionEvaluationService {
  constructor(private readonly reader: PromotionEvaluationRepository) {}

  async evaluate(context: PromotionEvaluationContext): Promise<PromotionEvaluationResult> {
    if (!contextIsComplete(context)) {
      return rejected('MISSING_CONTEXT');
    }
    const subtotal = resolveEligibleSubtotal(context);
    if (!subtotal.ok) return rejected(subtotal.reason);

    const now = context.now ?? new Date();
    const rawCode = context.couponCode != null ? normalizePromoCode(context.couponCode) : '';

    if (rawCode) {
      return this.evaluateCode(rawCode, context, now, subtotal.subtotalMinor);
    }
    return this.evaluateAutomatic(context, now, subtotal.subtotalMinor);
  }

  private async evaluateCode(
    code: string,
    context: PromotionEvaluationContext,
    now: Date,
    subtotalMinor: bigint,
  ): Promise<PromotionEvaluationResult> {
    const resolved = await this.reader.findCouponByCodeInsensitive(code);
    if (!resolved) return rejected('INVALID_CODE');

    const usage = await this.loadUsage(resolved.promotion, context, now);
    const reason = classifyPromotion(resolved.promotion, context, usage, now, subtotalMinor);
    if (reason) {
      return rejected(reason, resolved.promotion.id, resolved.coupon.id);
    }
    return quoteEligiblePromotion(resolved.promotion, subtotalMinor, 'CODE');
  }

  private async evaluateAutomatic(
    context: PromotionEvaluationContext,
    now: Date,
    subtotalMinor: bigint,
  ): Promise<PromotionEvaluationResult> {
    const candidates = await this.reader.findAutomaticCandidates(
      context.restaurantId,
      context.merchantId,
    );
    const eligible: EligiblePromotionQuote[] = [];
    const priorities = new Map<string, number>();

    for (const promotion of candidates) {
      const usage = await this.loadUsage(promotion, context, now);
      const reason = classifyPromotion(promotion, context, usage, now, subtotalMinor);
      if (reason) continue;
      eligible.push(quoteEligiblePromotion(promotion, subtotalMinor, 'AUTOMATIC'));
      priorities.set(promotion.id, promotion.priority);
    }

    const winner = selectBestEligible(eligible, priorities);
    if (!winner) return rejected('NO_ELIGIBLE_PROMOTION');
    return winner;
  }

  private async loadUsage(
    promotion: EvaluablePromotion,
    context: PromotionEvaluationContext,
    now: Date,
  ): Promise<PromotionUsageSnapshot> {
    const couponId = promotion.coupon?.id;
    if (!couponId) {
      return { activeTotal: 0, activeForUser: 0, activeForUserInPeriod: 0 };
    }

    const activeTotal = await this.reader.countActiveRedemptions(couponId);
    const userId = context.userId ?? null;
    const activeForUser = userId
      ? await this.reader.countActiveRedemptionsForUser(couponId, userId)
      : 0;

    let activeForUserInPeriod = 0;
    if (userId && promotion.isGlobal && promotion.useLimit !== null && promotion.useFrequency) {
      const window = istUsagePeriodWindow(promotion.useFrequency, now);
      if (window) {
        activeForUserInPeriod = await this.reader.countActiveRedemptionsForUserInWindow(
          couponId,
          userId,
          window.start,
          window.endExclusive,
        );
      }
    }

    return { activeTotal, activeForUser, activeForUserInPeriod };
  }
}
