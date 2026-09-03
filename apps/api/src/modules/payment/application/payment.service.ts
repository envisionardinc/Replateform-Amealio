import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { verifyPaymentSignature } from '../domain/razorpay-signature';
import type {
  CaptureResult,
  CreatePaymentIntentInput,
  PaymentIntentRecord,
  VerifyCaptureInput,
} from '../domain/payment.types';

/**
 * Payment foundation (P1.7.28): create a `PaymentIntent` for an order and perform
 * a SERVER-VERIFIED Razorpay capture. The server never trusts a client "success"
 * flag (doc 56 §8) — it verifies the signature, the intent ownership, and the
 * amount/currency before creating any authoritative `Transaction`. Coupon
 * redemption stays committed at ORDER PLACEMENT (OD-REF-1); nothing here touches
 * CouponRedemption/Offer, refunds, wallet, or settlement.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Create a payment intent for an existing order. Amount + currency are derived
   * from the ORDER (server-authoritative), never from client input. Idempotent per
   * Razorpay order id.
   */
  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentRecord> {
    if (!input.orderId) throw new BadRequestException('orderId is required');
    if (!input.razorpayOrderId || input.razorpayOrderId.trim().length === 0) {
      throw new BadRequestException('razorpayOrderId is required');
    }
    const order = await this.repo.findOrderForPayment(input.orderId);
    if (!order) throw new NotFoundException('Order not found');

    const { intent } = await this.repo.createIntent({
      orderId: order.id,
      amountMinor: order.grandTotalMinor,
      currencyCode: order.currencyCode,
      method: input.method ?? 'RAZORPAY',
      razorpayOrderId: input.razorpayOrderId.trim(),
    });
    return intent;
  }

  /**
   * Verify a Razorpay client handoff and capture. Rejects (no Transaction created)
   * on invalid signature, unknown intent, wrong order/payment id, or amount/
   * currency mismatch. Idempotent: a repeated capture of the same provider payment
   * returns the existing captured state instead of creating a duplicate.
   */
  async verifyAndCapture(input: VerifyCaptureInput): Promise<CaptureResult> {
    if (!input.razorpayOrderId || !input.razorpayPaymentId || !input.razorpaySignature) {
      throw new BadRequestException(
        'razorpayOrderId, razorpayPaymentId and signature are required',
      );
    }

    // 1) Signature (proves Razorpay authorized this order+payment pair).
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET')!;
    const signatureOk = verifyPaymentSignature({
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
      keySecret,
    });
    if (!signatureOk) throw new BadRequestException('Invalid payment signature');

    // 2) Intent ownership (the payment must belong to a known intent/order).
    const intent = await this.repo.findIntentByRazorpayOrderId(input.razorpayOrderId);
    if (!intent) throw new BadRequestException('Unknown payment intent for razorpayOrderId');

    // 3) Amount + currency (exact BigInt equality; never floating point).
    if (input.amountMinor !== undefined && input.amountMinor !== intent.amountMinor) {
      throw new BadRequestException('Captured amount does not match the payment intent');
    }
    if (input.currencyCode !== undefined && input.currencyCode !== intent.currencyCode) {
      throw new BadRequestException('Captured currency does not match the payment intent');
    }

    return this.captureForIntent(intent, input.razorpayPaymentId, input.idempotencyKey);
  }

  /**
   * Idempotent capture recording for an already-verified intent + provider payment.
   * Shared by the client-handoff path and the webhook path. Returns the existing
   * state (created=false) when the provider payment was already captured.
   */
  async captureForIntent(
    intent: PaymentIntentRecord,
    razorpayPaymentId: string,
    idempotencyKey?: string,
  ): Promise<CaptureResult> {
    const existing = await this.repo.findAttemptByRazorpayPaymentId(razorpayPaymentId);
    if (existing) {
      const currentIntent = (await this.repo.findIntentById(existing.paymentIntentId)) ?? intent;
      return {
        intent: currentIntent,
        attempt: existing,
        transactionId: '',
        created: false,
      };
    }

    const order = intent.orderId ? await this.repo.findOrderForPayment(intent.orderId) : null;
    const key = idempotencyKey ?? `capture:${razorpayPaymentId}`;

    try {
      const {
        attempt,
        intent: updated,
        transactionId,
      } = await this.repo.recordCapture({
        intentId: intent.id,
        orderId: intent.orderId,
        userId: order?.userId ?? null,
        merchantId: order?.merchantId ?? null,
        amountMinor: intent.amountMinor,
        currencyCode: intent.currencyCode,
        razorpayPaymentId,
        idempotencyKey: key,
      });
      return { intent: updated, attempt, transactionId, created: true };
    } catch (e) {
      // Concurrency: another writer captured the same provider payment first. The
      // unique(razorpayPaymentId) rolled our transaction back — return their state.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.repo.findAttemptByRazorpayPaymentId(razorpayPaymentId);
        const currentIntent = (await this.repo.findIntentById(intent.id)) ?? intent;
        if (winner) {
          return { intent: currentIntent, attempt: winner, transactionId: '', created: false };
        }
      }
      throw e;
    }
  }
}
