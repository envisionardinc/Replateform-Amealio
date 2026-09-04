import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PlatformCatalogService } from './platform-catalog.service';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import {
  PlatformOnly,
  RequireStaffRoles,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';

interface StaffRequest extends Request {
  staffPrincipal?: StaffPrincipal;
}

@Controller('platform-catalog')
export class PlatformCatalogController {
  constructor(private readonly service: PlatformCatalogService) {}

  @Post('global')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  createGlobal(@Req() req: StaffRequest, @Body() body: Record<string, unknown>) {
    return this.service.createGlobalCatalog(this.principal(req), {
      name: String(body.name ?? ''),
      description: body.description == null ? null : String(body.description),
      cuisineType: body.cuisineType == null ? null : String(body.cuisineType),
      status: body.status == null ? undefined : String(body.status),
      legacyId: body.legacyId == null ? null : String(body.legacyId),
      sourcePayload: body.sourcePayload,
    });
  }

  @Post('global/:catalogId/categories')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  createCategory(@Req() req: StaffRequest, @Param('catalogId') catalogId: string, @Body() body: Record<string, unknown>) {
    return this.service.createGlobalCategory(this.principal(req), {
      catalogId,
      name: String(body.name ?? ''),
      description: body.description == null ? null : String(body.description),
      sortOrder: body.sortOrder == null ? undefined : Number(body.sortOrder),
      legacyId: body.legacyId == null ? null : String(body.legacyId),
      sourcePayload: body.sourcePayload,
    });
  }

  @Post('global/:catalogId/items')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  createItem(@Req() req: StaffRequest, @Param('catalogId') catalogId: string, @Body() body: Record<string, unknown>) {
    return this.service.createGlobalItem(this.principal(req), {
      catalogId,
      categoryId: body.categoryId == null ? null : String(body.categoryId),
      name: String(body.name ?? ''),
      description: body.description == null ? null : String(body.description),
      legacyId: body.legacyId == null ? null : String(body.legacyId),
      sourcePayload: body.sourcePayload,
    });
  }

  @Post('global-items/:sourceItemId/materialize')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('MERCHANT_OWNER', 'MERCHANT_STAFF')
  materialize(@Req() req: StaffRequest, @Param('sourceItemId') sourceItemId: string, @Body() body: Record<string, unknown>) {
    return this.service.materializeGlobalItem(this.principal(req), {
      sourceItemId,
      restaurantId: String(body.restaurantId ?? ''),
      menuSectionId: body.menuSectionId == null ? null : String(body.menuSectionId),
      nameOverride: body.nameOverride == null ? undefined : String(body.nameOverride),
      descriptionOverride: body.descriptionOverride == null ? null : String(body.descriptionOverride),
    });
  }

  @Get('health')
  health() {
    return { module: 'platform-catalog', status: 'available' };
  }

  private principal(req: StaffRequest): StaffPrincipal {
    if (!req.staffPrincipal) throw new Error('Authenticated staff principal is required');
    return req.staffPrincipal;
  }
}
