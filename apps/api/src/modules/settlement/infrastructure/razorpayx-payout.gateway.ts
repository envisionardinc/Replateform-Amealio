import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProviderPayoutRequest, ProviderPayoutResponse } from '../domain/settlement.types';

/**
 * RazorpayX payout provider boundary (P1.7.31). Isolates ALL provider-specific
 * detail so settlement business logic only calls `createPayout`.
 *
 * The real production call is the RazorpayX Payouts API (amount in paise = our
 * minor units, basic-auth `key_id:key_secret`, an idempotency header, a
 * fund-account id); a payout returns `processed` (instant) or `pending`/`queued`
 * (async → `payout.processed`/`payout.failed` webhook later).
 *
 * This is a TARGET FOUNDATION — NOT wired to live RazorpayX HTTP (no production
 * credentials in the repo). With dev/test config it returns a DETERMINISTIC pending
 * response (payout id derived from the idempotency key), so the payout lifecycle is
 * exercised without a real disbursement. Live payout capability is NOT
 * production-ready. A thrown error = UNKNOWN outcome (no unsafe duplicate: retries
 * reuse the idempotency key → same provider payout). Tests override this provider.
 */
@Injectable()
export class RazorpayxPayoutGateway {
  private readonly logger = new Logger(RazorpayxPayoutGateway.name);

  constructor(private readonly config: ConfigService) {}

  async createPayout(req: ProviderPayoutRequest): Promise<ProviderPayoutResponse> {
    const providerPayoutId = `pout_${this.deterministicId(req.idempotencyKey)}`;
    this.logger.debug(`RazorpayX payout requested (amountMinor=${req.amountMinor.toString()})`);
    // Live HTTP intentionally deferred (no prod credentials). Async by default:
    // completion is authoritative via the payout webhook / provider callback.
    return { providerPayoutId, status: 'pending' };
  }

  private deterministicId(idempotencyKey: string): string {
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? 'dev';
    return createHmac('sha256', secret)
      .update(`payout:${idempotencyKey}`)
      .digest('hex')
      .slice(0, 24);
  }
}
