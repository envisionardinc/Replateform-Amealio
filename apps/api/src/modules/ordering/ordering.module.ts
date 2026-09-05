import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OfferModule } from '../offer/offer.module';
import { OrderRepository } from './infrastructure/order.repository';
import { OrderService } from './application/order.service';

/**
 * Ordering foundation module (P1.7.12).
 *
 * Canonical Order creation + native OrderStatus lifecycle over the EXISTING
 * target `Order`/`OrderItem`/`OrderStatusEvent` (no schema change). Money is
 * exact BigInt minor units; creation and transitions are transactional. Reuses
 * P1.7.2 `MerchantScopeService` (tenancy) and P1.7.5 catalog reads (item
 * validation). Payment/delivery/POS/realtime/cart/ONDC are DEFERRED; no
 * separate rider state machine (ON_THE_WAY/DELIVERED are native OrderStatus).
 */
@Module({
  imports: [MerchantModule, CatalogModule, OfferModule],
  providers: [OrderRepository, OrderService],
  exports: [OrderService, OrderRepository],
})
export class OrderingModule {}
