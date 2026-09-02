import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { SeatingRepository } from './infrastructure/seating.repository';
import { SeatingService } from './application/seating.service';

/**
 * Seating configuration & request foundation module (P1.7.16).
 *
 * Canonical merchant seating inventory (SeatingArea → RestaurantTable), physical
 * table RUNTIME status, and seating/booking requests (SeatingRequest) over the
 * EXISTING target models. Merchant-tenant-scoped via P1.7.2 `MerchantScopeService`.
 * Feature gates/timers/rules stay in `Subscription.config` (DEC-2 hybrid; P1.7.14).
 * No controllers, no customer/merchant UI, no reservation workflow engine, no
 * auto-cancel cron, no ordering/experience integration.
 */
@Module({
  imports: [MerchantModule],
  providers: [SeatingRepository, SeatingService],
  exports: [SeatingService, SeatingRepository],
})
export class SeatingModule {}
