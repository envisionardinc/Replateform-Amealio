import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay signature verification (P1.7.28) — pure, no I/O. The legacy backend
 * NEVER verified signatures (doc 56 §8); this closes that gap. Comparisons are
 * constant-time. Secrets are passed in from configuration (never hardcoded/logged).
 */

/** Constant-time hex-string comparison (length-safe). */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify the Razorpay client-handoff signature:
 * `expected = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)`.
 */
export function verifyPaymentSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  if (!args.razorpayOrderId || !args.razorpayPaymentId || !args.signature) return false;
  const expected = createHmac('sha256', args.keySecret)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest('hex');
  return safeEqualHex(expected, args.signature);
}

/**
 * Verify a Razorpay webhook signature: `HMAC_SHA256(rawBody, webhookSecret)` hex,
 * compared to the `x-razorpay-signature` header. The RAW request body must be used
 * (not a re-serialized object) so the HMAC matches byte-for-byte.
 */
export function verifyWebhookSignature(args: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  if (!args.rawBody || !args.signature) return false;
  const expected = createHmac('sha256', args.webhookSecret).update(args.rawBody).digest('hex');
  return safeEqualHex(expected, args.signature);
}

/** Convenience for tests / provider-order recording: compute a handoff signature. */
export function computePaymentSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  keySecret: string;
}): string {
  return createHmac('sha256', args.keySecret)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest('hex');
}

/** Convenience for tests: compute a webhook body signature. */
export function computeWebhookSignature(args: { rawBody: string; webhookSecret: string }): string {
  return createHmac('sha256', args.webhookSecret).update(args.rawBody).digest('hex');
}
