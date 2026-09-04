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
import { CartService } from '../application/cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Controller({ path: 'cart', version: '1' })
@UseGuards(JwtConsumerGuard)
export class CartController {
  constructor(private readonly carts: CartService) {}

  private userId(principal?: Principal): string {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    return principal.userId;
  }

  @Get()
  get(@CurrentUser() principal: Principal) {
    return this.carts.getCart(this.userId(principal));
  }

  @Post('items')
  add(@CurrentUser() principal: Principal, @Body() body: AddCartItemDto) {
    return this.carts.addItem(this.userId(principal), body);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.carts.updateItem(this.userId(principal), id, body.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.carts.removeItem(this.userId(principal), id);
  }
}
