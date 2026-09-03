import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { SettlementRepository } from './infrastructure/settlement.repository';
import { RazorpayxPayoutGateway } from './infrastructure/razorpayx-payout.gateway';
import { SettlementService } from './application/settlement.service';

/**
 * Settlement & payout foundation (P1.7.31) over the EXISTING `Settlement`/
 * `SettlementItem`/`Payout`. Settlement is DERIVED from the P1.7.28–P1.7.30
 * payment/refund ledger (captured − refunds − commission); payout is a separate
 * disbursement layer via the isolated RazorpayX gateway. SUPER_ADMIN-scoped.
 * No historical migration; live RazorpayX HTTP + payout webhook route deferred.
 */
@Module({
  imports: [PrismaModule],
  providers: [SettlementRepository, RazorpayxPayoutGateway, SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
