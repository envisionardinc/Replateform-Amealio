import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtStaffGuard } from '../../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../../identity/staff-authentication/authorization/staff-authorization.guard';
import { RequireStaffRoles } from '../../identity/staff-authentication/authorization/staff-authorization.decorators';
import { CurrentStaff } from '../../identity/staff-authentication/current-staff.decorator';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { DeliveryService } from '../application/delivery.service';
import { IssueDeliverySessionDto, PatchOrderStatusDto } from './dto/orders.dto';
import { CurrentDelivery } from './current-delivery.decorator';
import { JwtDeliveryGuard } from './jwt-delivery.guard';
import type { DeliveryPrincipal } from '../application/delivery-access-token.service';
import { serializeOrder } from './order-http.serialize';

@Controller({ path: 'delivery', version: '1' })
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('people')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  listPeople(@CurrentStaff() principal: StaffPrincipal) {
    if (!principal) throw new UnauthorizedException('Staff authentication required');
    return this.delivery.listPeople(principal).then((data) => ({ data }));
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  issueSession(@CurrentStaff() principal: StaffPrincipal, @Body() body: IssueDeliverySessionDto) {
    if (!principal) throw new UnauthorizedException('Staff authentication required');
    return this.delivery.issueSession(principal, body.deliveryPersonId);
  }

  @Get('orders/:id')
  @UseGuards(JwtDeliveryGuard)
  async get(
    @CurrentDelivery() principal: DeliveryPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return serializeOrder(await this.delivery.riderGet(principal, id));
  }

  @Patch('orders/:id/status')
  @UseGuards(JwtDeliveryGuard)
  async patchStatus(
    @CurrentDelivery() principal: DeliveryPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchOrderStatusDto,
  ) {
    return serializeOrder(
      await this.delivery.riderTransition(principal, id, body.toStatus, {
        expectedStatus: body.expectedStatus,
        reason: body.reason,
        reasonCode: body.reasonCode,
      }),
    );
  }
}
