/**
 * Settlement & payout foundation domain types (P1.7.31). Settlement is DERIVED
 * from the authoritative target payment/refund ledger (P1.7.28–P1.7.30): a merchant
 * is settled the NET-of-refund amount of its CAPTURED payments, minus commission.
 * Money is exact BigInt minor units (no floating point). Settlement (accrual) is
 * distinct from Payout (disbursement); a settlement being created never implies the
 * money reached the merchant. No coupon logic; no historical migration.
 */

export type SettlementStatusName = 'PENDING' | 'PARTIAL' | 'FAILED' | 'COMPLETED';

/** Initiate a restaurant settlement run (SUPER_ADMIN only). The commission rate is
 *  resolved from authoritative config (`Restaurant.commissionBps`) — callers can
 *  NOT supply it. `restaurantId` is required (commission is restaurant-scoped). */
export interface SettleMerchantInput {
  merchantId: string;
  restaurantId: string;
}

export interface SettlementResult {
  settlementId: string;
  merchantId: string;
  restaurantId: string | null;
  grossAmountMinor: bigint; // Σ per-payment net-of-refund contributions (= Σ items = payout pool)
  commissionBasisMinor: bigint; // Σ per-order (subtotal − vendor discount) — commissionable basis
  commissionMinor: bigint; // floor(commissionBasisMinor × commissionBps / 10000)
  commissionBps: number;
  netAmountMinor: bigint; // gross − commission = payout amount
  currencyCode: string;
  itemCount: number;
  status: SettlementStatusName;
}

export type TipBeneficiaryPolicyName = 'MERCHANT' | 'DELIVERY_PERSON' | 'SHARED_POOLED';

/** Route a collected tip to its beneficiary (SUPER_ADMIN only). The beneficiary is
 *  read from the tip's SNAPSHOT (never caller-supplied); only MERCHANT is routable
 *  today (DELIVERY_PERSON / SHARED_POOLED are BLOCKED — no foundation). */
export interface RouteTipInput {
  tipPaymentId: string;
}

/** Result of routing a collected tip into an ORDER_TIP merchant settlement. */
export interface TipRoutingResult {
  tipPaymentId: string;
  beneficiaryPolicy: TipBeneficiaryPolicyName;
  settlement: SettlementResult; // payoutType=ORDER_TIP; commission 0; gross=net=tip
  /** true when this call created the routing; false on idempotent replay. */
  created: boolean;
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
