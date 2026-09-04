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
import { JwtStaffGuard } from '../../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../../identity/staff-authentication/authorization/staff-authorization.guard';
import { RequireStaffRoles } from '../../identity/staff-authentication/authorization/staff-authorization.decorators';
import { CurrentStaff } from '../../identity/staff-authentication/current-staff.decorator';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { OrderManagementService } from '../application/order-management.service';
import { ListOrdersQueryDto, PatchOrderStatusDto } from './dto/orders.dto';
import { serializeOrder } from './order-http.serialize';

@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
@RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
export class OrdersController {
  constructor(private readonly management: OrderManagementService) {}

  private staff(principal?: StaffPrincipal): StaffPrincipal {
    if (!principal) throw new UnauthorizedException('Staff authentication required');
    return principal;
  }

  @Get()
  async list(@CurrentStaff() principal: StaffPrincipal, @Query() query: ListOrdersQueryDto) {
    const rows = await this.management.listOrders(this.staff(principal), query);
    return { data: rows.map(serializeOrder) };
  }

  @Get(':id')
  async get(@CurrentStaff() principal: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return serializeOrder(await this.management.getOrder(this.staff(principal), id));
  }

  @Patch(':id/status')
  async patchStatus(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchOrderStatusDto,
  ) {
    const order = await this.management.transitionMerchant(this.staff(principal), id, body.toStatus, {
      expectedStatus: body.expectedStatus,
      reason: body.reason,
      reasonCode: body.reasonCode,
    });
    return serializeOrder(order);
  }
}
