import { Module } from '@nestjs/common';
import { SubscriptionRepository } from './infrastructure/subscription.repository';
import { SubscriptionConfigService } from './application/subscription-config.service';
import { SubscriptionService } from './application/subscription.service';

/**
 * Merchant Subscription & Configuration foundation module (P1.7.3).
 *
 * Read access to the EXISTING `Subscription` table + a safe, unknown-preserving
 * config accessor + merchant-tenant-scoped access. No schema change, no billing,
 * no CRUD/controllers, no frontend, no table_setup normalization. Authorization
 * stays server-derived per P1.7.1F; staff/consumer auth untouched.
 */
@Module({
  providers: [SubscriptionRepository, SubscriptionConfigService, SubscriptionService],
  exports: [SubscriptionRepository, SubscriptionConfigService, SubscriptionService],
})
export class SubscriptionModule {}
