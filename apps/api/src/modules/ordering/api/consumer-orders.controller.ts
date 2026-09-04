import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtConsumerGuard } from '../../identity/authentication/guards/jwt-consumer.guard';
import { CurrentUser } from '../../identity/authorization/current-user.decorator';
import type { Principal } from '../../identity/authorization/principal';
import { ConsumerOrderService } from '../application/consumer-order.service';
import { ListOrdersQueryDto } from './dto/orders.dto';
import { CancelConsumerOrderDto } from './dto/cart.dto';
import { serializeOrder } from './order-http.serialize';

@Controller({ path: 'me/orders', version: '1' })
@UseGuards(JwtConsumerGuard)
export class ConsumerOrdersController {
  constructor(private readonly mine: ConsumerOrderService) {}

  private userId(principal?: Principal): string {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    return principal.userId;
  }

  @Get()
  async list(@CurrentUser() principal: Principal, @Query() query: ListOrdersQueryDto) {
    const rows = await this.mine.listMine(this.userId(principal), query);
    return { data: rows.map(serializeOrder) };
  }

  @Get(':id')
  async get(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return serializeOrder(await this.mine.getMine(this.userId(principal), id));
  }

  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelConsumerOrderDto,
  ) {
    return serializeOrder(
      await this.mine.cancelMine(this.userId(principal), id, {
        expectedStatus: body.expectedStatus,
        reason: body.reason,
      }),
    );
  }
}
