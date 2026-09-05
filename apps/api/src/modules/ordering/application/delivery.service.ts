import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrderRepository } from '../infrastructure/order.repository';
import type { OrderRecord, OrderStatusName, TransitionOptions } from '../domain/ordering.types';
import {
  DeliveryAccessTokenService,
  type DeliveryPrincipal,
} from './delivery-access-token.service';
import { OrderService } from './order.service';

const OCCUPIED_STATUSES: OrderStatusName[] = ['READY', 'ON_THE_WAY'];

@Injectable()
export class DeliveryService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly orderService: OrderService,
    private readonly tokens: DeliveryAccessTokenService,
  ) {}

  async issueSession(principal: StaffPrincipal, deliveryPersonId: string) {
    const rider = await this.prisma.deliveryPerson.findFirst({
      where: { id: deliveryPersonId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery person not found');
    if (!rider.merchantId) {
      throw new BadRequestException('Delivery person is not scoped to a merchant');
    }
    if (principal.merchantId && principal.merchantId !== rider.merchantId) {
      throw new ForbiddenException('Cross-merchant delivery access denied');
    }
    const accessToken = await this.tokens.issue({ id: rider.id, merchantId: rider.merchantId });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: this.tokens.lifetimeSeconds,
      deliveryPerson: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        isOnline: rider.isOnline,
        merchantId: rider.merchantId,
      },
    };
  }

  async assign(
    principal: StaffPrincipal,
    orderId: string,
    deliveryPersonId: string,
    expectedStatus?: OrderStatusName,
  ): Promise<OrderRecord> {
    const order = await this.orderService.getOrder(principal, orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.type !== 'HOME_DELIVERY') {
      throw new BadRequestException('Assignment is only valid for HOME_DELIVERY');
    }
    if (expectedStatus && order.status !== expectedStatus) {
      throw new ConflictException(
        `expectedStatus ${expectedStatus} does not match current ${order.status}`,
      );
    }
    if (order.status !== 'READY') {
      throw new BadRequestException('Assignment is only allowed while READY');
    }
    if (order.deliveryPersonId === deliveryPersonId) {
      return order;
    }

    const rider = await this.prisma.deliveryPerson.findFirst({
      where: { id: deliveryPersonId, deletedAt: null },
    });
    if (!rider) throw new NotFoundException('Delivery person not found');
    if (rider.merchantId !== order.merchantId) {
      throw new ForbiddenException('Cross-merchant assignment denied');
    }
    if (!rider.isOnline) {
      throw new BadRequestException('Delivery person is offline');
    }

    const occupied = await this.prisma.order.findFirst({
      where: {
        deliveryPersonId: rider.id,
        status: { in: OCCUPIED_STATUSES },
        NOT: { id: orderId },
      },
      select: { id: true },
    });
    if (occupied) {
      throw new ConflictException('Delivery person is occupied');
    }

    const next = await this.orders.assignDeliveryPerson(orderId, rider.id);
    if (!next) {
      throw new ConflictException('Concurrent assignment or status change');
    }
    return next;
  }

  async listPeople(principal: StaffPrincipal) {
    if (!principal.merchantId) return [];
    const riders = await this.prisma.deliveryPerson.findMany({
      where: { merchantId: principal.merchantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    const occupied = await this.prisma.order.findMany({
      where: {
        merchantId: principal.merchantId,
        deliveryPersonId: { in: riders.map((r) => r.id) },
        status: { in: OCCUPIED_STATUSES },
      },
      select: { deliveryPersonId: true },
    });
    const busy = new Set(occupied.map((row) => row.deliveryPersonId).filter(Boolean));
    return riders.map((rider) => ({
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      isOnline: rider.isOnline,
      occupied: busy.has(rider.id),
    }));
  }

  async riderTransition(
    principal: DeliveryPrincipal | undefined,
    orderId: string,
    toStatus: OrderStatusName,
    options?: TransitionOptions,
  ): Promise<OrderRecord> {
    if (!principal) throw new UnauthorizedException('Delivery authentication required');
    return this.orderService.applyTransition(
      {
        kind: 'DELIVERY',
        actor: {
          actorType: 'DELIVERY',
          deliveryPersonId: principal.deliveryPersonId,
          merchantId: principal.merchantId,
        },
      },
      orderId,
      toStatus,
      options,
    );
  }

  async riderGet(principal: DeliveryPrincipal | undefined, orderId: string): Promise<OrderRecord> {
    if (!principal) throw new UnauthorizedException('Delivery authentication required');
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.merchantId !== principal.merchantId) {
      throw new ForbiddenException('Cross-merchant delivery access denied');
    }
    if (order.deliveryPersonId !== principal.deliveryPersonId) {
      throw new ForbiddenException('Delivery person is not assigned to this order');
    }
    return order;
  }
}
