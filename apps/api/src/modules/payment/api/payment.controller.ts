import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/security/security.decorators';
import { PaymentService } from '../application/payment.service';
import { PaymentsEnabledGuard } from './payments-enabled.guard';
import { CreatePaymentIntentDto, VerifyCaptureDto } from './dto/payment.dto';
import type { CaptureResult, PaymentIntentRecord } from '../domain/payment.types';

/**
 * Payment foundation endpoints (P1.7.28) — gated by PAYMENTS_ENABLED, not wired to
 * production. `/payments/verify` is safe to accept because it is only actioned on a
 * valid Razorpay signature (client cannot assert success). BigInt money is
 * serialized as a decimal string to preserve exact minor-unit precision.
 * Production authn/authorization wiring is deferred (foundation only).
 */
@Controller({ path: 'payments', version: '1' })
@UseGuards(PaymentsEnabledGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Public()
  @Post('intents')
  @HttpCode(HttpStatus.CREATED)
  async createIntent(@Body() dto: CreatePaymentIntentDto) {
    const intent = await this.payments.createIntent({
      orderId: dto.orderId,
      razorpayOrderId: dto.razorpayOrderId,
    });
    return serializeIntent(intent);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyCaptureDto) {
    const result = await this.payments.verifyAndCapture({
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      razorpaySignature: dto.razorpaySignature,
      amountMinor: dto.amountMinor !== undefined ? BigInt(dto.amountMinor) : undefined,
      currencyCode: dto.currencyCode,
      idempotencyKey: dto.idempotencyKey,
    });
    return serializeCapture(result);
  }
}

function serializeIntent(i: PaymentIntentRecord) {
  return {
    id: i.id,
    orderId: i.orderId,
    amountMinor: i.amountMinor.toString(),
    currencyCode: i.currencyCode,
    status: i.status,
    method: i.method,
    razorpayOrderId: i.razorpayOrderId,
    createdAt: i.createdAt,
  };
}

function serializeCapture(r: CaptureResult) {
  return {
    created: r.created,
    transactionId: r.transactionId || null,
    intent: serializeIntent(r.intent),
    attempt: {
      id: r.attempt.id,
      paymentIntentId: r.attempt.paymentIntentId,
      status: r.attempt.status,
      amountMinor: r.attempt.amountMinor.toString(),
      currencyCode: r.attempt.currencyCode,
      razorpayPaymentId: r.attempt.razorpayPaymentId,
    },
  };
}
