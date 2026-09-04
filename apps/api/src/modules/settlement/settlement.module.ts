import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { SettlementRepository } from './infrastructure/settlement.repository';
import { SettlementAdjustmentRepository } from './infrastructure/settlement-adjustment.repository';
import { RazorpayxPayoutGateway } from './infrastructure/razorpayx-payout.gateway';
import { SettlementService } from './application/settlement.service';

/**
 * Settlement & payout foundation (P1.7.31) plus the append-only settlement
 * adjustment foundation (P1.7.44). Historical settlements remain immutable;
 * adjustments provide the auditable debit/credit layer needed for post-settlement
 * order/tip refunds without mutating Settlement or Payout history.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    SettlementRepository,
    SettlementAdjustmentRepository,
    RazorpayxPayoutGateway,
    SettlementService,
  ],
  exports: [SettlementService, SettlementAdjustmentRepository],
})
export class SettlementModule {}
