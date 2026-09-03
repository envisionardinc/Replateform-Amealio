import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/security/security.decorators';
import { PaymentsEnabledGuard } from '../../payment/api/payments-enabled.guard';
import { TipService } from '../application/tip.service';
import { CreateTipDto, VerifyTipCaptureDto } from './dto/tip.dto';
import type { TipCaptureResult, TipPaymentRecord } from '../domain/tip.types';

/**
 * Tip collection endpoints (P1.7.38) — gated by PAYMENTS_ENABLED, not wired to
 * production (foundation only; production customer-auth wiring is deferred exactly
 * as the P1.7.28 payment foundation deferred it). The tip amount is server-derived
 * from the order and the capture is only actioned on a valid Razorpay signature
 * (a client cannot assert collection). BigInt money is serialized as a decimal
 * string to preserve exact minor-unit precision.
 */
@Controller({ path: 'tips', version: '1' })
@UseGuards(PaymentsEnabledGuard)
export class TipController {
  constructor(private readonly tips: TipService) {}

  @Public()
  @Post('intents')
  @HttpCode(HttpStatus.CREATED)
  async createIntent(@Body() dto: CreateTipDto) {
    const tip = await this.tips.createTip({
      orderId: dto.orderId,
      razorpayOrderId: dto.razorpayOrderId,
      percentBps: dto.percentBps ?? null,
      customAmountMinor: dto.customAmountMinor !== undefined ? BigInt(dto.customAmountMinor) : null,
    });
    return serializeTip(tip);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyTipCaptureDto) {
    const result = await this.tips.verifyAndCaptureTip({
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      razorpaySignature: dto.razorpaySignature,
      amountMinor: dto.amountMinor !== undefined ? BigInt(dto.amountMinor) : undefined,
      currencyCode: dto.currencyCode,
    });
    return serializeCapture(result);
  }
}

function serializeTip(t: TipPaymentRecord) {
  return {
    id: t.id,
    orderId: t.orderId,
    merchantId: t.merchantId,
    basisMinor: t.basisMinor.toString(),
    percentBps: t.percentBps,
    isCustom: t.isCustom,
    amountMinor: t.amountMinor.toString(),
    currencyCode: t.currencyCode,
    status: t.status,
    razorpayOrderId: t.razorpayOrderId,
    razorpayPaymentId: t.razorpayPaymentId,
    capturedAt: t.capturedAt,
    beneficiaryPolicy: t.beneficiaryPolicy,
  };
}

function serializeCapture(r: TipCaptureResult) {
  return { created: r.created, tip: serializeTip(r.tip) };
}
