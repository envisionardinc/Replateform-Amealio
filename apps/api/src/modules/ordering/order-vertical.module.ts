import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderingModule } from './ordering.module';
import { OrderManagementService } from './application/order-management.service';
import { OrdersController } from './api/orders.controller';

/**
 * Phase 1 merchant order HTTP (doc 88). Reuses OrderingModule + PaymentModule.
 * Consumer checkout and self-delivery are Phase 2/3.
 */
@Module({
  imports: [OrderingModule, PaymentModule, CatalogModule, MerchantModule, StaffAuthModule],
  controllers: [OrdersController],
  providers: [OrderManagementService],
  exports: [OrderManagementService],
})
export class OrderVerticalModule {}
