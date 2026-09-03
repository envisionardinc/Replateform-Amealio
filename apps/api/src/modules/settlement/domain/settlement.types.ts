/**
 * Settlement & payout foundation domain types (P1.7.31). Settlement is DERIVED
 * from the authoritative target payment/refund ledger (P1.7.28–P1.7.30): a merchant
 * is settled the NET-of-refund amount of its CAPTURED payments, minus commission.
 * Money is exact BigInt minor units (no floating point). Settlement (accrual) is
 * distinct from Payout (disbursement); a settlement being created never implies the
 * money reached the merchant. No coupon logic; no historical migration.
 */

export type SettlementStatusName = 'PENDING' | 'PARTIAL' | 'FAILED' | 'COMPLETED';

/** Initiate a merchant settlement run (SUPER_ADMIN only). */
export interface SettleMerchantInput {
  merchantId: string;
  restaurantId?: string | null;
  /** Commission rate in basis points (1% = 100 bps). Default 0 (no commission).
   *  The authoritative rate SOURCE (per-merchant/restaurant config) is a deferred
   *  owner decision — this is an explicit input, never a hardcoded rate. */
  commissionBps?: number;
}

export interface SettlementResult {
  settlementId: string;
  merchantId: string;
  restaurantId: string | null;
  grossAmountMinor: bigint; // Σ per-payment net-of-refund contributions (= Σ items)
  commissionMinor: bigint;
  commissionBps: number;
  netAmountMinor: bigint; // gross − commission = payout amount
  currencyCode: string;
  itemCount: number;
  status: SettlementStatusName;
}

/** Request a payout for an approved settlement (SUPER_ADMIN only). */
export interface PayoutRequestInput {
  settlementId: string;
  idempotencyKey: string;
}

export interface PayoutResult {
  payoutId: string;
  settlementId: string;
  providerPayoutId: string | null;
  amountMinor: bigint;
  status: SettlementStatusName;
  /** true when this call created the payout; false on idempotent replay. */
  created: boolean;
}

/** Provider boundary contract (RazorpayX). `status`: `processed` (instant) or
 *  `pending` (async → payout.processed webhook). A thrown error = UNKNOWN. */
export interface ProviderPayoutRequest {
  amountMinor: bigint;
  currencyCode: string;
  idempotencyKey: string;
}

export interface ProviderPayoutResponse {
  providerPayoutId: string;
  status: 'processed' | 'pending' | 'failed';
  payload?: unknown;
}
