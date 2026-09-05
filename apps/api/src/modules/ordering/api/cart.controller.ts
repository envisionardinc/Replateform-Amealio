import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  get(@CurrentUser() principal: Principal, @Query('couponCode') couponCode?: string) {
    return this.carts.getCart(this.userId(principal), couponCode);
  }

  @Post('items')
  add(
    @CurrentUser() principal: Principal,
    @Body() body: AddCartItemDto,
    @Query('couponCode') couponCode?: string,
  ) {
    return this.carts.addItem(this.userId(principal), { ...body, couponCode });
  }

  @Patch('items/:id')
  update(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCartItemDto,
    @Query('couponCode') couponCode?: string,
  ) {
    return this.carts.updateItem(this.userId(principal), id, body.quantity, couponCode);
  }

  @Delete('items/:id')
  remove(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('couponCode') couponCode?: string,
  ) {
    return this.carts.removeItem(this.userId(principal), id, couponCode);
  }
}
