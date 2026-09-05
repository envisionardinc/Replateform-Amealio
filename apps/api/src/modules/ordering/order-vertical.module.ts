import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CatalogModule } from '../catalog/catalog.module';
import { ConsumerAuthModule } from '../identity/authentication/consumer-auth.module';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentModule } from '../payment/payment.module';
import { OfferModule } from '../offer/offer.module';
import { AddressesModule } from '../addresses/addresses.module';
import { OrderingModule } from './ordering.module';
import { CartRepository } from './infrastructure/cart.repository';
import { CartService } from './application/cart.service';
import { CheckoutService } from './application/checkout.service';
import { ConsumerOrderService } from './application/consumer-order.service';
import { DeliveryAccessTokenService } from './application/delivery-access-token.service';
import { DeliveryService } from './application/delivery.service';
import { OrderManagementService } from './application/order-management.service';
import { CartController } from './api/cart.controller';
import { CheckoutController } from './api/checkout.controller';
import { ConsumerOrdersController } from './api/consumer-orders.controller';
import { DeliveryController } from './api/delivery.controller';
import { JwtDeliveryGuard } from './api/jwt-delivery.guard';
import { OrdersController } from './api/orders.controller';

/**
 * Order vertical HTTP (docs 88 + 90 + 91). OrderingModule stays payment-free so
 * foundation tests still boot without PaymentModule.
 */
@Module({
  imports: [
    OrderingModule,
    PaymentModule,
    OfferModule,
    CatalogModule,
    MerchantModule,
    StaffAuthModule,
    ConsumerAuthModule,
    AddressesModule,
    JwtModule.register({}),
  ],
  controllers: [
    OrdersController,
    CartController,
    CheckoutController,
    ConsumerOrdersController,
    DeliveryController,
  ],
  providers: [
    OrderManagementService,
    CartRepository,
    CartService,
    CheckoutService,
    ConsumerOrderService,
    DeliveryAccessTokenService,
    DeliveryService,
    JwtDeliveryGuard,
  ],
  exports: [
    OrderManagementService,
    CartService,
    CheckoutService,
    ConsumerOrderService,
    DeliveryService,
  ],
})
export class OrderVerticalModule {}
