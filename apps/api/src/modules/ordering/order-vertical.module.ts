import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ConsumerAuthModule } from '../identity/authentication/consumer-auth.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderingModule } from './ordering.module';
import { CartRepository } from './infrastructure/cart.repository';
import { CartService } from './application/cart.service';
import { CheckoutService } from './application/checkout.service';
import { ConsumerOrderService } from './application/consumer-order.service';
import { OrderManagementService } from './application/order-management.service';
import { CartController } from './api/cart.controller';
import { CheckoutController } from './api/checkout.controller';
import { ConsumerOrdersController } from './api/consumer-orders.controller';
import { OrdersController } from './api/orders.controller';

/**
 * Order vertical HTTP (docs 88 + 90). OrderingModule stays payment-free so
 * foundation tests still boot without PaymentModule. Consumer checkout and
 * merchant order HTTP compose here.
 */
@Module({
  imports: [
    OrderingModule,
    PaymentModule,
    CatalogModule,
    MerchantModule,
    StaffAuthModule,
    ConsumerAuthModule,
  ],
  controllers: [OrdersController, CartController, CheckoutController, ConsumerOrdersController],
  providers: [
    OrderManagementService,
    CartRepository,
    CartService,
    CheckoutService,
    ConsumerOrderService,
  ],
  exports: [OrderManagementService, CartService, CheckoutService, ConsumerOrderService],
})
export class OrderVerticalModule {}
