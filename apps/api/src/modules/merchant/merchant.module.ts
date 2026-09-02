import { Module } from '@nestjs/common';
import { MerchantRepository } from './infrastructure/merchant.repository';
import { RestaurantRepository } from './infrastructure/restaurant.repository';
import { MerchantScopeService } from './application/merchant-scope.service';

/**
 * Merchant & Location foundation module (P1.7.2).
 *
 * Provides read access to the EXISTING `Merchant` (tenant) and `Restaurant`
 * (location) tables plus a data-aware merchant tenancy service, for later
 * domain migrations to build on. No schema change, no merchant/onboarding CRUD,
 * no controllers, no frontend. Authorization/scope stays server-derived per
 * P1.7.1F; no change to staff/consumer auth.
 */
@Module({
  providers: [MerchantRepository, RestaurantRepository, MerchantScopeService],
  exports: [MerchantRepository, RestaurantRepository, MerchantScopeService],
})
export class MerchantModule {}
