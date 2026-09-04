import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  DeliveryAccessTokenService,
  type DeliveryPrincipal,
} from '../application/delivery-access-token.service';

export interface RequestWithDeliveryPrincipal {
  deliveryPrincipal?: DeliveryPrincipal;
}

@Injectable()
export class JwtDeliveryGuard implements CanActivate {
  constructor(private readonly tokens: DeliveryAccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithDeliveryPrincipal>();
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Missing Bearer token');
    const claims = await this.tokens.verify(token);
    req.deliveryPrincipal = {
      actorType: 'DELIVERY',
      deliveryPersonId: claims.sub,
      merchantId: claims.mid,
    };
    return true;
  }
}
