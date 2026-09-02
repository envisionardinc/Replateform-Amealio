import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityModule } from '../identity.module';
import { ConsumerAuthController } from './consumer-auth.controller';
import { ConsumerAuthService } from './consumer-auth.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { SessionRepository } from './session.repository';
import { JwtConsumerGuard } from './guards/jwt-consumer.guard';
import { ConsumerAuthEnabledGuard } from './guards/consumer-auth-enabled.guard';

/**
 * Consumer authentication module (P1.7.1B). Depends on IdentityModule for the
 * user repository, password hasher, and register/get use-cases. Local/dev only;
 * not wired to production.
 */
@Module({
  imports: [IdentityModule, JwtModule.register({})],
  controllers: [ConsumerAuthController],
  providers: [
    ConsumerAuthService,
    AccessTokenService,
    RefreshTokenService,
    SessionRepository,
    JwtConsumerGuard,
    ConsumerAuthEnabledGuard,
  ],
  exports: [AccessTokenService, JwtConsumerGuard],
})
export class ConsumerAuthModule {}
