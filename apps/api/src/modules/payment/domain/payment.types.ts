/**
 * Payment foundation domain types (P1.7.28). Verified Razorpay capture over the
 * EXISTING target `PaymentIntent`/`PaymentAttempt`/`Transaction`/`WebhookEvent`
 * (no schema change). New writes use the CANONICAL target enums — legacy numeric
 * `payment_status`/`payment_method`/`t_type` codes are NOT reproduced (DR-02b/c/d
 * remain BLOCKED for historical migration; doc 56). Money is exact BigInt minor
 * units (paise for INR). Order placement remains the coupon-redemption commit
 * point (OD-REF-1); this slice never touches CouponRedemption/Offer.
 */

export type PaymentStatusName =
  'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';

export type PaymentMethodName = 'RAZORPAY' | 'WALLET' | 'SCAN_AND_PAY' | 'DIRECT_MERCHANT';

/** Create a payment intent for an existing order (amount is server-derived). */
export interface CreatePaymentIntentInput {
  orderId: string;
  // The Razorpay provider order id (`order_...`). In production this is returned
  // by the Razorpay `orders.create` call (deferred provider hook, doc 56 §36); the
  // foundation records the provider order id supplied by that step.
  razorpayOrderId: string;
  method?: PaymentMethodName; // default RAZORPAY
}

/** Verify a Razorpay client handoff and capture atomically. */
export interface VerifyCaptureInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  // HMAC-SHA256(`${razorpayOrderId}|${razorpayPaymentId}`, key_secret), hex.
  razorpaySignature: string;
  // Provider-reported captured amount (minor units); MUST equal the intent amount.
  // Optional here because the client handoff signature covers order+payment ids,
  // not amount; when omitted the authoritative intent amount is used and no
  // client-supplied amount is trusted.
  amountMinor?: bigint;
  currencyCode?: string;
  // Caller idempotency token (optional; a deterministic one is derived when absent).
  idempotencyKey?: string;
}

export interface PaymentIntentRecord {
  id: string;
  orderId: string | null;
  amountMinor: bigint;
  currencyCode: string;
  status: PaymentStatusName;
  method: PaymentMethodName;
  razorpayOrderId: string | null;
  createdAt: Date;
}

export interface PaymentAttemptRecord {
  id: string;
  paymentIntentId: string;
  amountMinor: bigint;
  currencyCode: string;
  status: PaymentStatusName;
  razorpayPaymentId: string | null;
  idempotencyKey: string;
  createdAt: Date;
}

export interface CaptureResult {
  intent: PaymentIntentRecord;
  attempt: PaymentAttemptRecord;
  transactionId: string;
  /** true when this call performed the capture; false when it was already captured. */
  created: boolean;
}

export interface WebhookIngestResult {
  webhookEventId: string;
  providerEventId: string;
  type: string;
  /** true when the event was seen before (idempotent no-op). */
  duplicate: boolean;
  processingStatus: 'RECEIVED' | 'PROCESSED' | 'FAILED';
}
