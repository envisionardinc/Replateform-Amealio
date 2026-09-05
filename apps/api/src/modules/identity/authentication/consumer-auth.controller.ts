import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/security/security.decorators';
import { CurrentUser } from '../authorization/current-user.decorator';
import type { Principal } from '../authorization/principal';
import { ConsumerAuthService } from './consumer-auth.service';
import { ConsumerAuthEnabledGuard } from './guards/consumer-auth-enabled.guard';
import { JwtConsumerGuard } from './guards/jwt-consumer.guard';
import { LoginConsumerDto, LogoutDto, RefreshDto, RegisterConsumerDto } from './dto/auth.dto';

/**
 * Consumer authentication endpoints (P1.7.1B) — target platform only.
 * Contract is `Authorization: Bearer <token>` (NOT the legacy raw header).
 * Routes: /api/v1/auth/consumer/*  (gated by the CONSUMER_AUTH_ENABLED flag).
 */
@Controller({ path: 'auth/consumer', version: '1' })
@UseGuards(ConsumerAuthEnabledGuard)
export class ConsumerAuthController {
  constructor(private readonly auth: ConsumerAuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterConsumerDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginConsumerDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @UseGuards(JwtConsumerGuard)
  @Get('me')
  me(@CurrentUser() principal: Principal) {
    return this.auth.me(principal.userId);
  }
}
