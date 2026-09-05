import type { PaymentMethodName } from '../../payment/domain/payment.types';
import type { RefundMethodName } from '../../payment/domain/refund.types';

/**
 * Isolated refund-rail adapter (OD-MOM-REFUND-RAIL / OD-COP-REFUND-RAIL).
 *
 * Owner-level policy is NOT decided here. We adapt the method ALREADY stored on
 * `PaymentIntent` onto the two rails `RefundService` already implements:
 *
 *   PaymentIntent.method === RAZORPAY → RefundService method RAZORPAY
 *     (async provider refund; INITIATED until refund.processed)
 *   PaymentIntent.method === WALLET   → RefundService method WALLET
 *     (synchronous wallet credit)
 *
 * Other stored methods (SCAN_AND_PAY, DIRECT_MERCHANT) have no dedicated refund
 * rail in the existing RefundService. They fall through to WALLET — the existing
 * `requestRefund` default — rather than inventing a new instrument rule.
 *
 * Change the mapping in THIS file only; order state orchestration stays unchanged.
 */
export function refundMethodFromPaymentIntent(method: PaymentMethodName): RefundMethodName {
  if (method === 'RAZORPAY') return 'RAZORPAY';
  return 'WALLET';
}

export const CAPTURED_PAYMENT_STATUSES = new Set(['CAPTURED', 'PARTIALLY_REFUNDED']);
