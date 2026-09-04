import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { DeliveryPrincipal } from '../application/delivery-access-token.service';
import type { RequestWithDeliveryPrincipal } from './jwt-delivery.guard';

export const CurrentDelivery = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DeliveryPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithDeliveryPrincipal>();
    return req.deliveryPrincipal;
  },
);
