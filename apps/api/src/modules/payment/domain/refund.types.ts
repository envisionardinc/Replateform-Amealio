/**
 * Refund + wallet-credit foundation domain types (P1.7.29). A refund is a WALLET
 * credit against a CAPTURED PaymentIntent (matching the reconciled legacy ordering
 * behaviour — refunds are wallet-only; doc 56 §16). It creates one Refund, one
 * WalletEntry (CREDIT), and one Transaction (REFUND/CREDIT) atomically, and — when
 * the payment becomes FULLY refunded — reverses the order's ACTIVE CouponRedemption
 * (OD-REF-1). The order-placement coupon commit point is NOT moved. No settlement,
 * no historical migration. Money is exact BigInt minor units.
 */

export type RefundStatusName = 'INITIATED' | 'PROCESSED' | 'FAILURE';

export interface RefundInput {
  paymentIntentId: string;
  /** Refund amount in minor units. Omit (or null) for a FULL refund of the
   *  remaining refundable amount. Must be `0 < amount <= remaining`. */
  amountMinor?: bigint | null;
  /** Idempotency token (DB-unique). A repeat with the same key returns the same
   *  refund and never re-applies the wallet/transaction/coupon effects. */
  idempotencyKey: string;
}

export interface RefundResult {
  refundId: string;
  paymentIntentId: string;
  amountMinor: bigint;
  currencyCode: string;
  status: RefundStatusName;
  walletEntryId: string;
  transactionId: string;
  /** New wallet balance after this credit (minor units). */
  walletBalanceMinor: bigint;
  /** The PaymentIntent status after the refund (PARTIALLY_REFUNDED | REFUNDED). */
  intentStatus: string;
  /** True when this refund made the payment fully refunded. */
  fullyRefunded: boolean;
  /** True when a full refund reversed an ACTIVE coupon redemption on the order. */
  couponReversed: boolean;
  /** True when the call performed the refund; false when it was already processed
   *  (idempotent replay). */
  created: boolean;
}
