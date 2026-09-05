import { Module } from '@nestjs/common';
import { ConsumerAuthModule } from '../identity/authentication/consumer-auth.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { MerchantModule } from '../merchant/merchant.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ConsumerDinerController } from './api/consumer-diner.controller';
import { MerchantDinerController } from './api/merchant-diner.controller';
import { SeatingRepository } from './infrastructure/seating.repository';
import { SeatingService } from './application/seating.service';

/**
 * Seating configuration + Dining / Reservations Runtime Slice 1 (P1.7.16 / 116).
 *
 * Canonical inventory (SeatingArea → RestaurantTable), RestaurantTable RUNTIME
 * status, and SeatingRequest bookings. Consumer HTTP is JWT-owned `/diner`.
 * Merchant HTTP is staff-scoped `/merchant/diner`. Feature gates remain in
 * Subscription.config. No second booking engine.
 */
@Module({
  imports: [MerchantModule, SubscriptionModule, StaffAuthModule, ConsumerAuthModule],
  controllers: [ConsumerDinerController, MerchantDinerController],
  providers: [SeatingRepository, SeatingService],
  exports: [SeatingService, SeatingRepository],
})
export class SeatingModule {}
