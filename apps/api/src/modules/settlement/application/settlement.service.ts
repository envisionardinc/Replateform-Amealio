import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isSuperAdmin } from '../../identity/staff-authentication/authorization/merchant-scope';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { SettlementRepository, isUniqueViolation } from '../infrastructure/settlement.repository';
import { RazorpayxPayoutGateway } from '../infrastructure/razorpayx-payout.gateway';
import type {
  PayoutRequestInput,
  PayoutResult,
  SettleMerchantInput,
  SettlementResult,
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
  ) {}

  async settleMerchant(
    principal: StaffPrincipal,
    input: SettleMerchantInput,
  ): Promise<SettlementResult> {
    if (!isSuperAdmin(principal)) {
      throw new ForbiddenException('Only SUPER_ADMIN may run merchant settlement');
    }
    if (!input.merchantId) throw new BadRequestException('merchantId is required');
    const commissionBps = input.commissionBps ?? 0;
    if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
      throw new BadRequestException('commissionBps must be an integer in [0, 10000]');
    }

    const contributions = await this.repo.findEligibleContributions(
      input.merchantId,
      input.restaurantId ?? null,
    );
    if (contributions.length === 0) {
      throw new BadRequestException('No eligible captured payments to settle');
    }

    // Exact monetary arithmetic (no floating point). Commission is floored.
    const gross = contributions.reduce((a, c) => a + c.netMinor, 0n);
    const commission = (gross * BigInt(commissionBps)) / 10000n;
    const net = gross - commission;
    const currencyCode = contributions[0].currencyCode;

    try {
      return await this.repo.createSettlement({
        merchantId: input.merchantId,
        restaurantId: input.restaurantId ?? null,
        currencyCode,
        commissionBps,
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
