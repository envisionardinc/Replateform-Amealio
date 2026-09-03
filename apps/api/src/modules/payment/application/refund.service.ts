import { BadRequestException, Injectable } from '@nestjs/common';
import { RefundRepository, isUniqueViolation } from '../infrastructure/refund.repository';
import type { RefundInput, RefundResult } from '../domain/refund.types';

/**
 * Refund + wallet-credit foundation (P1.7.29). Issues a WALLET refund against a
 * CAPTURED PaymentIntent: atomic Refund + WalletEntry(CREDIT) + Transaction
 * (REFUND/CREDIT), plus ACTIVE→REVERSED coupon reversal on a FULL refund (OD-REF-1).
 * Idempotent via `Refund.idempotencyKey @unique`; concurrency-safe via the
 * repository's per-intent + per-wallet row locks. Never moves the order-placement
 * coupon commit point; no settlement; no historical migration.
 */
@Injectable()
export class RefundService {
  constructor(private readonly repo: RefundRepository) {}

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!input.paymentIntentId) throw new BadRequestException('paymentIntentId is required');
    if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
      throw new BadRequestException('idempotencyKey is required');
    }
    if (input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor <= 0n) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    // Idempotency: a prior refund with this key returns its existing state without
    // re-applying any wallet/transaction/coupon effect.
    const existing = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
    if (existing) return existing;

    try {
      return await this.repo.processRefund({
        paymentIntentId: input.paymentIntentId,
        requestedAmountMinor: input.amountMinor ?? null,
        idempotencyKey: input.idempotencyKey.trim(),
      });
    } catch (e) {
      // Concurrency: another request with the SAME key won the unique constraint;
      // its transaction committed and ours rolled back — return the winner's state.
      if (isUniqueViolation(e)) {
        const winner = await this.repo.findRefundByIdempotencyKey(input.idempotencyKey.trim());
        if (winner) return winner;
      }
      throw e;
    }
  }
}
