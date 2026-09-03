/**
 * Tip collection/capture domain types (P1.7.38, per the P1.7.42 approved policy).
 *
 * A tip is a SEPARATE payment component, financially isolated from the order
 * payment: it never enters `Order.grandTotalMinor`, the order `PaymentIntent`,
 * the commission basis, or merchant settlement. The approved "total order amount"
 * tip basis maps to the existing canonical `Order.grandTotalMinor` (no new
 * order-total concept). Beneficiary routing is DEFERRED to P1.7.39; the beneficiary
 * policy is only SNAPSHOTTED here for historical integrity. Money is exact BigInt
 * minor units. Donations are OUT OF SCOPE (future capability).
 */

export type PaymentStatusName =
  'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';

export type RefundStatusName = 'INITIATED' | 'PROCESSED' | 'FAILURE';

export type TipBeneficiaryPolicyName = 'MERCHANT' | 'DELIVERY_PERSON' | 'SHARED_POOLED';

/** Approved tip percentage options (basis points): 10% / 15% / 20%. */
export const APPROVED_TIP_PERCENT_BPS: readonly number[] = [1000, 1500, 2000];

/**
 * Create a separate tip payment for an order. Exactly one of `percentBps` (an
 * approved option) or `customAmountMinor` (a positive integer) must be supplied.
 * The tip amount is ALWAYS server-calculated from `Order.grandTotalMinor`; a
 * client-calculated amount is never trusted. The beneficiary is server-resolved
 * from merchant configuration (not a client input).
 */
export interface CreateTipInput {
  orderId: string;
  percentBps?: number | null;
  customAmountMinor?: bigint | null;
  // Provider order id for the SEPARATE tip payment (`order_...`); idempotency key.
  razorpayOrderId: string;
}

/** Verify a Razorpay client handoff for the tip payment and mark it COLLECTED. */
export interface VerifyCaptureTipInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  // Optional provider-reported amount; when supplied MUST equal the tip amount.
  amountMinor?: bigint;
  currencyCode?: string;
}

export interface TipPaymentRecord {
  id: string;
  orderId: string;
  merchantId: string;
  basisMinor: bigint;
  percentBps: number | null;
  isCustom: boolean;
  amountMinor: bigint;
  currencyCode: string;
  status: PaymentStatusName;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  capturedAt: Date | null;
  refundedAmountMinor: bigint;
  refundStatus: RefundStatusName | null;
  providerRefundId: string | null;
  refundedAt: Date | null;
  beneficiaryPolicy: TipBeneficiaryPolicyName;
  createdAt: Date;
}

export interface TipCaptureResult {
  tip: TipPaymentRecord;
  /** true when this call performed the capture; false when it was already captured. */
  created: boolean;
}
