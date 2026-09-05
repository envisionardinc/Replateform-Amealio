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
import { SeatingService } from '../application/seating.service';
import { ListMerchantDinerQueryDto, ListMerchantTablesQueryDto, SeatDinerDto } from './dto/diner.dto';
import { serializeMerchantDiner, serializeTable } from './diner.serialize';

@Controller({ path: 'merchant/diner', version: '1' })
@UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
@RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
export class MerchantDinerController {
  constructor(private readonly seating: SeatingService) {}

  private staff(principal?: StaffPrincipal): StaffPrincipal {
    if (!principal) throw new UnauthorizedException('Staff authentication required');
    return principal;
  }

  @Get()
  async list(@CurrentStaff() principal: StaffPrincipal, @Query() query: ListMerchantDinerQueryDto) {
    const rows = await this.seating.listMerchantRequests(this.staff(principal), {
      restaurantId: query.restaurantId,
      status: query.status,
    });
    return { data: rows.map(serializeMerchantDiner) };
  }

  @Get('tables')
  async tables(
    @CurrentStaff() principal: StaffPrincipal,
    @Query() query: ListMerchantTablesQueryDto,
  ) {
    const rows = await this.seating.listTables(this.staff(principal), query.restaurantId);
    return { data: rows.map(serializeTable) };
  }

  @Get(':id')
  async get(@CurrentStaff() principal: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return serializeMerchantDiner(await this.seating.getMerchantRequest(this.staff(principal), id));
  }

  @Patch(':id/accept')
  async accept(@CurrentStaff() principal: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return serializeMerchantDiner(await this.seating.acceptRequest(this.staff(principal), id));
  }

  @Patch(':id/seat')
  async seat(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SeatDinerDto,
  ) {
    return serializeMerchantDiner(await this.seating.seatRequest(this.staff(principal), id, body.tableId));
  }

  @Patch(':id/complete')
  async complete(@CurrentStaff() principal: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return serializeMerchantDiner(await this.seating.completeRequest(this.staff(principal), id));
  }
}