import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import {
  PlatformOnly,
  RequireStaffRoles,
} from '../identity/staff-authentication/authorization/staff-authorization.decorators';
import { PlatformExperienceCatalogueService } from './platform-experience-catalogue.service';

interface StaffRequest extends Request {
  staffPrincipal?: StaffPrincipal;
}

/**
 * Platform Experience Media Folder catalogue HTTP surface.
 *
 * Legacy mapping (doc 83):
 *   POST/PATCH/GET /experience-media     → platform-experience-catalogue*
 *   PUT /experience-media (append media) → PUT …/:id/media
 *   DELETE /experience-media/:id/media   → DELETE …/:id/media
 *
 * Discovery (list/get/media read) is available to SUPER_ADMIN and merchant staff.
 * Mutations are SUPER_ADMIN / @PlatformOnly only.
 *
 * No server-side materialize/clone into merchant Experience in this slice.
 */
@Controller('platform-experience-catalogue')
export class PlatformExperienceCatalogueController {
  constructor(private readonly service: PlatformExperienceCatalogueService) {}

  @Post()
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  create(@Req() req: StaffRequest, @Body() body: Record<string, unknown>) {
    return this.service.createFolder(this.principal(req), {
      name: String(body.name ?? body.exp_folder_name ?? ''),
      categoryId: String(body.categoryId ?? body.category ?? ''),
      subcategoryId: String(body.subcategoryId ?? body.subcategory ?? ''),
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
      description: body.description == null ? undefined : String(body.description),
      userBenefits:
        body.userBenefits == null && body.what_users_get == null
          ? undefined
          : String(body.userBenefits ?? body.what_users_get),
      termsAndConditions:
        body.termsAndConditions == null && body.terms_and_conditions == null
          ? undefined
          : String(body.termsAndConditions ?? body.terms_and_conditions),
      status: body.status == null ? undefined : String(body.status),
      isAiGenerated:
        body.isAiGenerated === true || body.is_ai_generated === true ? true : undefined,
      legacyId: body.legacyId == null ? null : String(body.legacyId),
    });
  }

  @Get()
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('SUPER_ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF')
  list(
    @Req() req: StaffRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
  ) {
    return this.service.listFolders(this.principal(req), {
      page: page == null ? undefined : Number(page),
      limit: limit == null ? undefined : Number(limit),
      search,
      status,
      categoryId,
      subcategoryId,
    });
  }

  @Get(':id')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('SUPER_ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF')
  get(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.service.getFolder(this.principal(req), id);
  }

  @Patch(':id')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  update(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.updateFolder(this.principal(req), id, {
      name:
        body.name === undefined && body.exp_folder_name === undefined
          ? undefined
          : String(body.name ?? body.exp_folder_name),
      tags: body.tags === undefined ? undefined : (body.tags as string[]),
      description: body.description === undefined ? undefined : String(body.description),
      userBenefits:
        body.userBenefits === undefined && body.what_users_get === undefined
          ? undefined
          : String(body.userBenefits ?? body.what_users_get),
      termsAndConditions:
        body.termsAndConditions === undefined && body.terms_and_conditions === undefined
          ? undefined
          : String(body.termsAndConditions ?? body.terms_and_conditions),
      status: body.status === undefined ? undefined : String(body.status),
      isAiGenerated:
        body.isAiGenerated === undefined && body.is_ai_generated === undefined
          ? undefined
          : body.isAiGenerated === true || body.is_ai_generated === true,
    });
  }

  @Get(':id/media')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @RequireStaffRoles('SUPER_ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF')
  listMedia(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.service.listMedia(
      this.principal(req),
      id,
      includeArchived === 'true' || includeArchived === '1',
    );
  }

  @Put(':id/media')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  appendMedia(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.appendMedia(this.principal(req), id, {
      photos: body.photos as string[] | undefined,
      videos: body.videos as string[] | undefined,
    });
  }

  @Delete(':id/media')
  @UseGuards(JwtStaffGuard, StaffAuthorizationGuard)
  @PlatformOnly()
  archiveMedia(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.archiveMedia(this.principal(req), id, {
      mediaId: String(body.mediaId ?? ''),
      type: body.type == null ? undefined : String(body.type),
    });
  }

  private principal(req: StaffRequest): StaffPrincipal {
    if (!req.staffPrincipal) throw new Error('Authenticated staff principal is required');
    return req.staffPrincipal;
  }
}
