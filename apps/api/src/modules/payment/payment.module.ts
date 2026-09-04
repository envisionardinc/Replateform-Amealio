import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentRepository } from './infrastructure/payment.repository';
import { RefundRepository } from './infrastructure/refund.repository';
import { RazorpayRefundGateway } from './infrastructure/razorpay-refund.gateway';
import { PaymentService } from './application/payment.service';
import { RefundService } from './application/refund.service';
import { RazorpayWebhookService } from './application/razorpay-webhook.service';
import { PaymentController } from './api/payment.controller';
import { RazorpayWebhookController } from './api/razorpay-webhook.controller';
import { PaymentsEnabledGuard } from './api/payments-enabled.guard';

/**
 * Payment Intent & Verified-Capture foundation (P1.7.28) over the EXISTING target
 * `PaymentIntent`/`PaymentAttempt`/`Transaction`/`WebhookEvent` (no schema change).
 * Server-verified Razorpay capture + idempotent webhook ingestion. Order placement
 * remains the coupon-redemption commit point (OD-REF-1). Refund/wallet/settlement
 * and historical payment-data migration are DEFERRED (docs 56). Gated by
 * PAYMENTS_ENABLED; not wired to production.
 */
@Module({
  imports: [PrismaModule, MerchantModule],
  controllers: [PaymentController, RazorpayWebhookController],
  providers: [
    PaymentRepository,
    RefundRepository,
    RazorpayRefundGateway,
    PaymentService,
    RefundService,
    RazorpayWebhookService,
    PaymentsEnabledGuard,
  ],
  exports: [PaymentService, RefundService, RazorpayWebhookService],
})
export class PaymentModule {}
