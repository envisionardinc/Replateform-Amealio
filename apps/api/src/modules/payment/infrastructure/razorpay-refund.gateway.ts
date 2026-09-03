import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProviderRefundRequest, ProviderRefundResponse } from '../domain/refund.types';

/**
 * Razorpay refund provider boundary (P1.7.30). Isolates ALL provider-specific
 * detail from the refund domain so business logic only calls `requestRefund`.
 *
 * The real production call is `POST /v1/payments/:payment_id/refund` (amount in
 * paise = our minor units) with basic-auth `key_id:key_secret` and an
 * `Idempotency-Key` header; a refund returns `status:'processed'` (instant) or
 * `status:'pending'` (normal → `refund.processed` webhook later).
 *
 * This foundation is NOT wired to live Razorpay HTTP (no production credentials in
 * the repo). With only dev/test config it returns a DETERMINISTIC pending response
 * (provider refund id derived from the idempotency key) so the async lifecycle is
 * exercised end-to-end via the webhook. A thrown error means the outcome is UNKNOWN
 * (timeout/lost response) — the caller must NOT assume failure (doc: no unsafe
 * duplicate refund; retries reuse the idempotency key → same provider refund).
 * Tests override this provider to simulate processed/failed/timeout outcomes.
 */
@Injectable()
export class RazorpayRefundGateway {
  private readonly logger = new Logger(RazorpayRefundGateway.name);

  constructor(private readonly config: ConfigService) {}

  async requestRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    // Deterministic provider refund id per idempotency key: a retry with the same
    // key maps to the SAME provider refund (provider-level idempotency), so a lost
    // response never yields a second real refund.
    const providerRefundId = `rfnd_${this.deterministicId(req.idempotencyKey)}`;
    this.logger.debug(
      `Razorpay refund requested for payment (amountMinor=${req.amountMinor.toString()})`,
    );
    // Live HTTP call intentionally deferred (no prod credentials in repo). Async
    // by default: completion is authoritative via the refund.processed webhook.
    return { providerRefundId, status: 'pending' };
  }

  private deterministicId(idempotencyKey: string): string {
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? 'dev';
    return createHmac('sha256', secret).update(idempotencyKey).digest('hex').slice(0, 24);
  }
}
