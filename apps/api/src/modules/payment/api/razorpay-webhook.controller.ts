import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/security/security.decorators';
import { RazorpayWebhookService } from '../application/razorpay-webhook.service';
import { PaymentsEnabledGuard } from './payments-enabled.guard';

/**
 * Razorpay webhook endpoint (P1.7.28): POST /api/v1/payments/razorpay/webhook.
 * Public (Razorpay calls it) but authenticated by the RAW-body HMAC in the
 * `x-razorpay-signature` header — no client-asserted success is trusted. Requires
 * `rawBody: true` at bootstrap so the HMAC matches byte-for-byte.
 */
@Controller({ path: 'payments/razorpay', version: '1' })
@UseGuards(PaymentsEnabledGuard)
export class RazorpayWebhookController {
  constructor(private readonly webhook: RazorpayWebhookService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? (req.body ? JSON.stringify(req.body) : '');
    if (!rawBody) throw new BadRequestException('Missing webhook body');
    return this.webhook.ingest(rawBody, signature ?? '');
  }
}
