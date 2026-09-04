import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStaffGuard } from '../identity/staff-authentication/guards/jwt-staff.guard';
import { StaffAuthorizationGuard } from '../identity/staff-authentication/authorization/staff-authorization.guard';
import { RequireStaffRoles } from '../identity/staff-authentication/authorization/staff-authorization.decorators';
import type {
  RequestWithStaffPrincipal,
  StaffPrincipal,
} from '../identity/staff-authentication/staff-principal';
import { ExperienceService } from './application/experience.service';
import type {
  CreateExperienceInput,
  ExperienceMenuLinkInput,
  UpdateExperienceInput,
} from './domain/experience.types';

/**
 * Staff-facing merchant Experience configuration surface.
 *
 * Media fields are URL-string arrays (legacy Experience). Platform folder
 * discovery remains on `/platform-experience-catalogue*` — clients map folder
 * media into create/update payloads (see `mapPlatformFolderToExperienceMedia`).
 * There is no server-side clone/materialize endpoint here.
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
  async create(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.createExperience(
      this.principal(req),
      normalizeMoney(parseExperienceBody(body) as unknown as CreateExperienceInput),
    );
  }

  @Patch(':id')
  async update(
    @Req() req: Request & RequestWithStaffPrincipal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateExperience(
      this.principal(req),
      id,
      normalizeMoney(parseExperienceBody(body) as unknown as UpdateExperienceInput),
    );
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

type MoneyPayload = {
  listingPriceMinor?: unknown;
  adultPriceMinor?: unknown;
  kidsPriceMinor?: unknown;
  occasionPriceMinor?: unknown;
};

function normalizeMoney<T extends MoneyPayload>(input: T): T {
  const output = { ...input };
  for (const key of [
    'listingPriceMinor',
    'adultPriceMinor',
    'kidsPriceMinor',
    'occasionPriceMinor',
  ] as const) {
    const value = output[key];
    if (value !== undefined && value !== null && typeof value !== 'bigint') {
      output[key] = BigInt(value as string | number) as T[typeof key];
    }
  }
  return output;
}

/** Accept camelCase target fields plus legacy aliases (tc, promotional_videos). */
function parseExperienceBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };

  if (out.termsAndConditions === undefined && body.tc !== undefined) {
    out.termsAndConditions = body.tc;
  }
  if (out.promotionalVideos === undefined && body.promotional_videos !== undefined) {
    out.promotionalVideos = body.promotional_videos;
  }
  if (out.photoThumbnails === undefined && body.photoThumbnails === undefined) {
    // no-op; keep explicit
  }

  // Strip lineage-like keys if a client mistakenly sends them — do not persist.
  delete out.sourceFolderId;
  delete out.sourceExperienceId;
  delete out.clonedFrom;
  delete out.platformFolderId;

  return out;
}
