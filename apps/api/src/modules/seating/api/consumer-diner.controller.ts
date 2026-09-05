import {
  Body,
  Controller,
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
import { SeatingService } from '../application/seating.service';
import { CancelDinerDto, CreateDinerDto } from './dto/diner.dto';
import { serializeConsumerDiner } from './diner.serialize';

@Controller({ path: 'diner', version: '1' })
@UseGuards(JwtConsumerGuard)
export class ConsumerDinerController {
  constructor(private readonly seating: SeatingService) {}

  private userId(principal?: Principal): string {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    return principal.userId;
  }

  @Post()
  async create(@CurrentUser() principal: Principal, @Body() body: CreateDinerDto) {
    return serializeConsumerDiner(
      await this.seating.createConsumerRequest(this.userId(principal), {
        restaurantId: body.restaurantId,
        intent: body.intent,
        partySize: body.partySize,
        kidsCount: body.kidsCount,
        highChairs: body.highChairs,
        specialRequests: body.specialRequests,
        reservationAt: body.reservationAt,
      }),
    );
  }

  @Get()
  async list(@CurrentUser() principal: Principal) {
    const rows = await this.seating.listMine(this.userId(principal));
    return { data: rows.map(serializeConsumerDiner) };
  }

  @Get(':id')
  async get(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return serializeConsumerDiner(await this.seating.getMine(this.userId(principal), id));
  }

  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelDinerDto,
  ) {
    return serializeConsumerDiner(
      await this.seating.cancelMine(this.userId(principal), id, body.cancelReason),
    );
  }
}