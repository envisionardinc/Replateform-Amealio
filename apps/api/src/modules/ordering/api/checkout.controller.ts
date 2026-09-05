import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtConsumerGuard } from '../../identity/authentication/guards/jwt-consumer.guard';
import { CurrentUser } from '../../identity/authorization/current-user.decorator';
import type { Principal } from '../../identity/authorization/principal';
import { CheckoutService } from '../application/checkout.service';
import { serializeOrder } from './order-http.serialize';
import { CheckoutDto } from './dto/cart.dto';

@Controller({ path: 'checkout', version: '1' })
@UseGuards(JwtConsumerGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async place(
    @CurrentUser() principal: Principal,
    @Body() body: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    const result = await this.checkout.checkout(principal.userId, {
      restaurantId: body.restaurantId,
      type: body.type,
      settlement: body.settlement,
      couponCode: body.couponCode,
      tipMinor: body.tipMinor !== undefined ? BigInt(body.tipMinor) : undefined,
      donationMinor: body.donationMinor !== undefined ? BigInt(body.donationMinor) : undefined,
      items: body.items,
      addressId: body.addressId,
      idempotencyKey: idempotencyKey ?? null,
    });
    return {
      settlement: result.settlement,
      order: serializeOrder(result.order),
      payment: result.payment
        ? {
            id: result.payment.id,
            status: result.payment.status,
            method: result.payment.method,
            amountMinor: result.payment.amountMinor.toString(),
            currencyCode: result.payment.currencyCode,
            razorpayOrderId: result.payment.razorpayOrderId,
          }
        : null,
    };
  }
}
