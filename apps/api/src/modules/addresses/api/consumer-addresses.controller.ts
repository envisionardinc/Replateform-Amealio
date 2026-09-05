import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtConsumerGuard } from '../../identity/authentication/guards/jwt-consumer.guard';
import { CurrentUser } from '../../identity/authorization/current-user.decorator';
import type { Principal } from '../../identity/authorization/principal';
import { ConsumerAddressesService } from '../application/consumer-addresses.service';
import { CreateAddressDto, PatchAddressDto } from './dto/consumer-addresses.dto';

@Controller({ path: 'me/addresses', version: '1' })
@UseGuards(JwtConsumerGuard)
export class ConsumerAddressesController {
  constructor(private readonly addresses: ConsumerAddressesService) {}

  private userId(principal?: Principal): string {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    return principal.userId;
  }

  @Get()
  async list(@CurrentUser() principal: Principal) {
    return { data: await this.addresses.listMine(this.userId(principal)) };
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() body: CreateAddressDto) {
    return this.addresses.createMine(this.userId(principal), body);
  }

  @Patch(':id')
  patch(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchAddressDto,
  ) {
    return this.addresses.patchMine(this.userId(principal), id, body);
  }

  @Delete(':id')
  delete(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.deleteMine(this.userId(principal), id);
  }
}
