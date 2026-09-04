import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import { RequireStaffRoles } from '../identity/staff-authentication/authorization/staff-authorization.decorators';
import type { RequestWithStaffPrincipal, StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { ExperienceService } from './application/experience.service';
import type { CreateExperienceInput, ExperienceMenuLinkInput, UpdateExperienceInput } from './domain/experience.types';

/**
 * Staff-facing merchant Experience configuration surface.
 *
 * This exposes only behavior already implemented by ExperienceService. Media,
 * booking, ticketing, seating allocation, payment, packages, scheduling
 * engines, and event runtime remain separate domains.
 */
@Controller('experiences')
@UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
@RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
export class ExperienceController {
  constructor(private readonly service: ExperienceService) {}

  private principal(req: Request & RequestWithStaffPrincipal): StaffPrincipal {
    if (!req.staffPrincipal) throw new Error('Authenticated staff principal missing');
    return req.staffPrincipal;
  }

  @Get('restaurant/:restaurantId')
  async list(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.service.listExperiences(this.principal(req), restaurantId);
  }

  @Get(':id')
  async get(@Req() req: Request & RequestWithStaffPrincipal, @Param('id') id: string) {
    return this.service.getExperience(this.principal(req), id);
  }

  @Post()
  async create(@Req() req: Request & RequestWithStaffPrincipal, @Body() input: CreateExperienceInput) {
    return this.service.createExperience(this.principal(req), normalizeMoney(input));
  }

  @Patch(':id')
  async update(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateExperienceInput,
  ) {
    return this.service.updateExperience(this.principal(req), id, normalizeMoney(input));
  }

  @Post(':id/publish')
  async publish(@Req() req: Request & RequestWithStaffPrincipal, @Param('id') id: string) {
    return this.service.publishExperience(this.principal(req), id);
  }

  @Post(':id/unpublish')
  async unpublish(@Req() req: Request & RequestWithStaffPrincipal, @Param('id') id: string) {
    return this.service.unpublishExperience(this.principal(req), id);
  }

  @Patch(':id/custom-menus')
  async setCustomMenus(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('id') id: string,
    @Body() links: ExperienceMenuLinkInput[],
  ) {
    return this.service.setCustomMenus(this.principal(req), id, links);
  }

  @Post(':id/delete')
  async remove(@Req() req: Request & RequestWithStaffPrincipal, @Param('id') id: string) {
    await this.service.deleteExperience(this.principal(req), id);
    return { success: true };
  }
}

function normalizeMoney<T extends Record<string, unknown>>(input: T): T {
  const output = { ...input } as T;
  for (const key of ['listingPriceMinor', 'adultPriceMinor', 'kidsPriceMinor', 'occasionPriceMinor']) {
    const value = output[key];
    if (value !== undefined && value !== null && typeof value !== 'bigint') {
      output[key] = BigInt(value as string | number) as T[Extract<keyof T, string>];
    }
  }
  return output;
}
