import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { EventsModule } from './common/events/events.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ConsumerAuthModule } from './modules/identity/authentication/consumer-auth.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { LoggingInterceptor } from './common/logging/logging.interceptor';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';

/**
 * Root application module (P1.6 foundation).
 * Wires cross-cutting infrastructure only. NO business/domain modules yet —
 * those are added independently in P1.7+ under a future `modules/` directory.
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
