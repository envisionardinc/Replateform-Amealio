import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { SettlementRepository, isUniqueViolation } from '../infrastructure/settlement.repository';
import { RazorpayxPayoutGateway } from '../infrastructure/razorpayx-payout.gateway';
import { isSettleable } from '../domain/settlement-window';
import type {
  PayoutRequestInput,
  PayoutResult,
  RouteTipInput,
  SettleMerchantInput,
  SettlementResult,
  TipBeneficiaryPolicyName,
  TipRoutingResult,
} from '../domain/settlement.types';

/**
 * Settlement & payout foundation (P1.7.31). Platform-admin (SUPER_ADMIN) settles a
 * merchant the NET-of-refund amount of its CAPTURED payments, minus commission
 * (exact BigInt), and disburses via a separate Payout (RazorpayX boundary).
 * Settlement is DERIVED from the authoritative payment/refund ledger — never from
 * client/UI/legacy totals. A payment settles at most once; a payout instruction
 * yields at most one provider payout. Coupon logic is untouched.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly repo: SettlementRepository,
    private readonly gateway: RazorpayxPayoutGateway,
    private readonly config: ConfigService,
  ) {}

  async settleMerchant(
    principal: StaffPrincipal,
    input: SettleMerchantInput,
  ): Promise<SettlementResult> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only SUPER_ADMIN may run merchant settlement');
    }
    if (!input.merchantId) throw new BadRequestException('merchantId is required');
    if (!input.restaurantId) throw new BadRequestException('restaurantId is required');

    // Commission rate is resolved from AUTHORITATIVE config (Restaurant.commissionBps)
    // — never a caller-supplied value. Snapshotted onto the Settlement below so the
    // economics stay stable if the rate changes later.
    const restaurant = await this.repo.getRestaurantForSettlement(input.restaurantId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.merchantId !== input.merchantId) {
      throw new BadRequestException('Restaurant does not belong to the merchant');
    }
    const commissionBps = restaurant.commissionBps ?? 0; // null ⇒ platform default 0
    if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
      throw new BadRequestException('Configured commissionBps must be an integer in [0, 10000]');
    }

    // Server-derived settlement window: only payments past their settleAfter
    // (end-of-day IST of capture + SETTLEMENT_DELAY_DAYS) are eligible. No client
    // date, no override; premature payments are deterministically excluded.
    const delayDays = this.config.get<number>('SETTLEMENT_DELAY_DAYS') ?? 2;
    const now = new Date();
    const all = await this.repo.findEligibleContributions(input.merchantId, input.restaurantId);
    const contributions = all.filter(
      (c) => c.capturedAt !== null && isSettleable(c.capturedAt, delayDays, now),
    );
    if (contributions.length === 0) {
      throw new BadRequestException(
        'No settleable captured payments (none past their settlement window)',
      );
    }

    // Exact monetary arithmetic (no floating point). Commission is charged on the
    // COMMISSIONABLE BASIS (Σ subtotal − vendor discount; VERIFIED legacy), NOT on
    // the tax/delivery-inclusive captured amount. `gross` is the net-of-refund
    // payout pool. GST-on-commission is DEFERRED (DR-03a).
    const gross = contributions.reduce((a, c) => a + c.netMinor, 0n);
    const commissionBasis = contributions.reduce((a, c) => a + c.commissionBasisMinor, 0n);
    const commission = (commissionBasis * BigInt(commissionBps)) / 10000n;
    const net = gross - commission;
    const currencyCode = contributions[0].currencyCode;

    try {
      return await this.repo.createSettlement({
        merchantId: input.merchantId,
        restaurantId: input.restaurantId,
        currencyCode,
        commissionBps,
        commissionBasisMinor: commissionBasis,
        commissionMinor: commission,
        grossAmountMinor: gross,
        netAmountMinor: net,
        items: contributions.map((c) => ({
          paymentIntentId: c.paymentIntentId,
          orderId: c.orderId,
          amountMinor: c.netMinor,
        })),
      });
    } catch (e) {
      // Concurrency: a competing run settled one of these payments first (unique
      // SettlementItem.paymentIntentId) — this settlement rolled back.
      if (isUniqueViolation(e)) {
        throw new BadRequestException('Payments already being settled concurrently; retry');
      }
      throw e;
    }
  }

  /**
   * Route a collected tip to its beneficiary (P1.7.39), SUPER_ADMIN-only. The
   * beneficiary is read from the tip's SNAPSHOT (never caller-supplied, never the
   * merchant's *current* config), so a later config change cannot alter how an
   * already-collected tip routes. Only a CAPTURED tip is routable. A MERCHANT tip
   * becomes a dedicated ORDER_TIP settlement (0% commission; gross=net=tip) reusing
   * the existing settlement/payout architecture; the tip's order economics,
   * grandTotal, commission, and order settlement are untouched. DELIVERY_PERSON and
   * SHARED_POOLED are explicitly BLOCKED (no foundation) and NEVER routed to the
   * merchant. Idempotent: a tip routes to at most one settlement
   * (`SettlementItem.tipPaymentId @unique`).
   */
  async routeTip(principal: StaffPrincipal, input: RouteTipInput): Promise<TipRoutingResult> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only SUPER_ADMIN may route a collected tip');
    }
    if (!input.tipPaymentId) throw new BadRequestException('tipPaymentId is required');

    const tip = await this.repo.findRoutableTip(input.tipPaymentId);
    if (!tip) throw new NotFoundException('Tip payment not found');
    const policy = tip.beneficiaryPolicy as TipBeneficiaryPolicyName;

    // Idempotent replay: the tip was already routed to an ORDER_TIP settlement.
    if (tip.existingSettlementId) {
      const settlement = await this.repo.getSettlement(tip.existingSettlementId);
      return { tipPaymentId: tip.id, beneficiaryPolicy: policy, settlement, created: false };
    }

    // Only a CAPTURED tip carries collected money that can be routed. FAILED /
    // CREATED (uncollected) and REFUNDED / PARTIALLY_REFUNDED (money returned) are
    // rejected — routing must never manufacture money.
    if (tip.status !== 'CAPTURED') {
      throw new BadRequestException(`Tip is not routable in status ${tip.status}`);
    }

    // Beneficiary branching from the SNAPSHOT — blocked branches never fall through
    // to merchant routing.
    if (policy === 'DELIVERY_PERSON') {
      throw new BadRequestException(
        'DELIVERY_PERSON tip routing is BLOCKED — requires a delivery assignment + ' +
          'immutable assignment-history foundation (P1.7.41); tip left unrouted',
      );
    }
    if (policy === 'SHARED_POOLED') {
      throw new BadRequestException(
        'SHARED_POOLED tip routing is BLOCKED — requires a pool membership/allocation ' +
          'foundation; tip left unrouted',
      );
    }
    if (policy !== 'MERCHANT') {
      throw new BadRequestException(`Unknown tip beneficiary policy ${policy}`);
    }

    try {
      const settlement = await this.repo.createTipSettlement({
        merchantId: tip.merchantId,
        restaurantId: tip.restaurantId,
        orderId: tip.orderId,
        tipPaymentId: tip.id,
        amountMinor: tip.amountMinor,
        currencyCode: tip.currencyCode,
      });
      return { tipPaymentId: tip.id, beneficiaryPolicy: policy, settlement, created: true };
    } catch (e) {
      // Concurrency: another writer routed this tip first (unique tipPaymentId).
      if (isUniqueViolation(e)) {
        const reloaded = await this.repo.findRoutableTip(tip.id);
        if (reloaded?.existingSettlementId) {
          const settlement = await this.repo.getSettlement(reloaded.existingSettlementId);
          return { tipPaymentId: tip.id, beneficiaryPolicy: policy, settlement, created: false };
        }
      }
      throw e;
    }
  }

  /** Request a payout for a settlement (SUPER_ADMIN). Idempotent; a settlement
   *  being paid out never means the money reached the merchant. */
  async requestPayout(principal: StaffPrincipal, input: PayoutRequestInput): Promise<PayoutResult> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only SUPER_ADMIN may request a payout');
    }
    if (!input.settlementId) throw new BadRequestException('settlementId is required');
    if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const existing = await this.repo.findPayoutByIdempotencyKey(input.idempotencyKey.trim());
    if (existing) return existing;

    const settlement = await this.repo.loadSettlementForPayout(input.settlementId);
    if (settlement.amountMinor <= 0n) {
      throw new BadRequestException('Settlement net amount must be positive to pay out');
    }

    let payoutId: string;
    try {
      payoutId = await this.repo.reservePayout(
        settlement.id,
        settlement.amountMinor,
        input.idempotencyKey.trim(),
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        const winner = await this.repo.findPayoutByIdempotencyKey(input.idempotencyKey.trim());
        if (winner) return winner;
      }
      throw e;
    }

    let provider;
    try {
      provider = await this.gateway.createPayout({
        amountMinor: settlement.amountMinor,
        currencyCode: 'INR',
        idempotencyKey: input.idempotencyKey.trim(),
      });
    } catch {
      // UNKNOWN outcome: leave the payout PENDING (reserved). A retry with the same
      // key returns it without issuing a second provider payout.
      throw new BadGatewayException('Payout provider request failed; payout left PENDING');
    }

    await this.repo.attachProviderPayoutId(
      payoutId,
      provider.providerPayoutId,
      (provider.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    );
    if (provider.status === 'failed') {
      await this.repo.failPayout(provider.providerPayoutId);
    } else if (provider.status === 'processed') {
      await this.repo.completePayout(provider.providerPayoutId);
    }
    return { ...(await this.repo.getPayout(payoutId)), created: true };
  }

  /** Provider callback (webhook) hooks — idempotent. Wiring the live RazorpayX
   *  payout webhook route is deferred (see doc 60). */
  async markPayoutProcessed(providerPayoutId: string): Promise<void> {
    await this.repo.completePayout(providerPayoutId);
  }

  async markPayoutFailed(providerPayoutId: string): Promise<void> {
    await this.repo.failPayout(providerPayoutId);
  }
}
