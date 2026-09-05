import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { EventsModule } from './common/events/events.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ConsumerAuthModule } from './modules/identity/authentication/consumer-auth.module';
import { StaffAuthModule } from './modules/identity/staff-authentication/staff-auth.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PlatformCatalogModule } from './modules/platform-catalog/platform-catalog.module';
import { PlatformExperienceCatalogueModule } from './modules/platform-experience-catalogue/platform-experience-catalogue.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ConsumerProfileModule } from './modules/user-profile/consumer-profile.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { OrderVerticalModule } from './modules/ordering/order-vertical.module';
import { SeatingModule } from './modules/seating/seating.module';
import { ExperienceModule } from './modules/experience/experience.module';
import { OfferModule } from './modules/offer/offer.module';
import { PaymentModule } from './modules/payment/payment.module';
import { TipModule } from './modules/tip/tip.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { LoggingInterceptor } from './common/logging/logging.interceptor';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';

/**
 * Root application module (P1.6 foundation).
 * Wires cross-cutting infrastructure and recovered domain modules.
 *
 * Dependency direction (enforced by convention; see docs 21):
 *   controller -> application/use-case -> domain -> infrastructure/provider adapters
 * Domain logic must never import external providers directly (use ports).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
      // Monorepo: the API workspace may run with cwd=apps/api (via Turbo) or the
      // repo root. Load the root .env in both cases (the repo keeps a single .env).
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    EventsModule,
    HealthModule,
    IdentityModule,
    ConsumerAuthModule,
    StaffAuthModule,
    MerchantModule,
    SubscriptionModule,
    ReferenceDataModule,
    CatalogModule,
    DiscoveryModule,
    PlatformCatalogModule,
    PlatformExperienceCatalogueModule,
    OnboardingModule,
    UserProfileModule,
    ConsumerProfileModule,
    FavoritesModule,
    AddressesModule,
    OrderingModule,
    OrderVerticalModule,
    SeatingModule,
    ExperienceModule,
    OfferModule,
    PaymentModule,
    TipModule,
    SettlementModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
