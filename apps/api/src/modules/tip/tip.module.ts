import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { TipRepository } from './infrastructure/tip.repository';
import { TipService } from './application/tip.service';
import { TipController } from './api/tip.controller';
import { PaymentsEnabledGuard } from '../payment/api/payments-enabled.guard';

/**
 * Tip Collection/Capture Foundation (P1.7.38) — a SEPARATE, financially isolated
 * tip payment component over the new `TipPayment` model. Server-authoritative tip
 * calculation (basis = `Order.grandTotalMinor`), server-verified Razorpay capture,
 * idempotent collection, beneficiary-policy snapshot, and a refund-state
 * foundation. Tip money never enters the order payment, `grandTotalMinor`, the
 * commission basis, or settlement. Beneficiary routing (P1.7.39) and donations
 * (future) are out of scope. Gated by PAYMENTS_ENABLED; not wired to production.
 */
@Module({
  imports: [PrismaModule],
  controllers: [TipController],
  providers: [TipRepository, TipService, PaymentsEnabledGuard],
  exports: [TipService],
})
export class TipModule {}
