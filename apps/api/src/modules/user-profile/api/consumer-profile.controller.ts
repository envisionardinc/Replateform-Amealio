import { Body, Controller, Get, Patch, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtConsumerGuard } from '../../identity/authentication/guards/jwt-consumer.guard';
import { CurrentUser } from '../../identity/authorization/current-user.decorator';
import type { Principal } from '../../identity/authorization/principal';
import { ConsumerProfileService } from '../application/consumer-profile.service';
import { PatchConsumerProfileDto } from './dto/consumer-profile.dto';

@Controller({ path: 'me/profile', version: '1' })
@UseGuards(JwtConsumerGuard)
export class ConsumerProfileController {
  constructor(private readonly profiles: ConsumerProfileService) {}

  private userId(principal?: Principal): string {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    return principal.userId;
  }

  @Get()
  get(@CurrentUser() principal: Principal) {
    return this.profiles.getMine(this.userId(principal));
  }

  @Patch()
  patch(@CurrentUser() principal: Principal, @Body() body: PatchConsumerProfileDto) {
    return this.profiles.patchMine(this.userId(principal), body);
  }
}
