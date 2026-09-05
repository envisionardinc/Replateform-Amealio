import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import { ExperienceRepository } from '../infrastructure/experience.repository';
import type {
  CreateExperienceInput,
  ExperienceFoodModeName,
  ExperienceKindName,
  ExperienceMenuLinkInput,
  ExperienceMenuModeName,
  ExperienceRecord,
  ExperienceTypeName,
  UpdateExperienceInput,
} from '../domain/experience.types';

const TYPES = new Set<ExperienceTypeName>(['FOOD', 'EVENT']);
const KINDS = new Set<ExperienceKindName>(['SPECIAL', 'CURATED']);
const FOOD_MODES = new Set<ExperienceFoodModeName>([
  'NONE',
  'INCLUDED',
  'SEPARATE',
  'OCCASION_TEXT',
]);
const MENU_MODES = new Set<ExperienceMenuModeName>(['NONE', 'STANDARD', 'CUSTOM', 'PACKAGE']);

/**
 * Merchant Experience CONFIGURATION foundation (P1.7.20 + media URL fields).
 * Create/update/publish/soft-delete a merchant-owned `Experience` + custom-menu
 * references. Merchant-tenant-scoped. Media is URL-string arrays only (legacy
 * Experience photos/videos). No booking/payment, no platform-folder lineage,
 * no server-side clone/materialize.
 */
@Injectable()
export class ExperienceService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly repo: ExperienceRepository,
  ) {}

  async createExperience(
    principal: StaffPrincipal,
    input: CreateExperienceInput,
  ): Promise<ExperienceRecord> {
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    this.validateEnums(input);
    this.validateCapacity(input.totalSeats, input.minSeats, input.maxSeats);
    this.validatePrices(input);
    this.validateMedia(input);
    const merchantId = await this.assertRestaurant(principal, input.restaurantId);
    await this.assertCategory(input.categoryId);
    await this.assertCategory(input.subCategoryId);
    const menuLinks = await this.resolveMenuLinks(input.restaurantId, input.customMenus);
    return this.repo.create({ merchantId, input, menuLinks });
  }

  async getExperience(principal: StaffPrincipal, id: string): Promise<ExperienceRecord | null> {
    const exp = await this.repo.findById(id);
    if (!exp || (await this.isDeleted(id))) return null;
    await this.scope.assertRestaurantInScope(principal, exp.restaurantId);
    return exp;
  }

  async getByLegacyId(
    principal: StaffPrincipal,
    legacyId: string,
  ): Promise<ExperienceRecord | null> {
    const exp = await this.repo.findByLegacyId(legacyId);
    if (!exp) return null;
    await this.scope.assertRestaurantInScope(principal, exp.restaurantId);
    return exp;
  }

  async listExperiences(
    principal: StaffPrincipal,
    restaurantId: string,
  ): Promise<ExperienceRecord[]> {
    await this.assertRestaurant(principal, restaurantId);
    return this.repo.listByRestaurant(restaurantId);
  }

  async updateExperience(
    principal: StaffPrincipal,
    id: string,
    input: UpdateExperienceInput,
  ): Promise<ExperienceRecord> {
    await this.assertExperience(principal, id);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    this.validateEnums(input);
    this.validateCapacity(input.totalSeats, input.minSeats, input.maxSeats);
    this.validatePrices(input);
    this.validateMedia(input);
    await this.assertCategory(input.categoryId);
    await this.assertCategory(input.subCategoryId);

    const data: Prisma.ExperienceUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.type !== undefined) data.type = input.type;
    if (input.expType !== undefined) data.expType = input.expType;
    if (input.foodMode !== undefined) data.foodMode = input.foodMode;
    if (input.menuMode !== undefined) data.menuMode = input.menuMode;
    if (input.foodDescription !== undefined) data.foodDescription = input.foodDescription;
    if (input.occasionText !== undefined) data.occasionText = input.occasionText;
    if (input.categoryId !== undefined)
      data.category = input.categoryId
        ? { connect: { id: input.categoryId } }
        : { disconnect: true };
    if (input.subCategoryId !== undefined)
      data.subCategory = input.subCategoryId
        ? { connect: { id: input.subCategoryId } }
        : { disconnect: true };
    if (input.photos !== undefined) data.photos = input.photos;
    if (input.photoThumbnails !== undefined) data.photoThumbnails = input.photoThumbnails;
    if (input.videos !== undefined) data.videos = input.videos;
    if (input.promotionalVideos !== undefined) data.promotionalVideos = input.promotionalVideos;
    if (input.userBenefits !== undefined) data.userBenefits = input.userBenefits;
    if (input.termsAndConditions !== undefined) data.termsAndConditions = input.termsAndConditions;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.totalSeats !== undefined) data.totalSeats = input.totalSeats;
    if (input.minSeats !== undefined) data.minSeats = input.minSeats;
    if (input.maxSeats !== undefined) data.maxSeats = input.maxSeats;
    if (input.listingPriceMinor !== undefined) data.listingPriceMinor = input.listingPriceMinor;
    if (input.adultPriceMinor !== undefined) data.adultPriceMinor = input.adultPriceMinor;
    if (input.kidsPriceMinor !== undefined) data.kidsPriceMinor = input.kidsPriceMinor;
    if (input.occasionPriceMinor !== undefined) data.occasionPriceMinor = input.occasionPriceMinor;
    if (input.currencyCode !== undefined) data.currencyCode = input.currencyCode;
    if (input.startAt !== undefined) data.startAt = toDate(input.startAt);
    if (input.endAt !== undefined) data.endAt = toDate(input.endAt);
    if (input.scheduleConfig !== undefined)
      data.scheduleConfig = (input.scheduleConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    return this.repo.update(id, data);
  }

  async publishExperience(principal: StaffPrincipal, id: string): Promise<ExperienceRecord> {
    await this.assertExperience(principal, id);
    return this.repo.setPublication(id, true, false); // active + not draft
  }

  async unpublishExperience(principal: StaffPrincipal, id: string): Promise<ExperienceRecord> {
    await this.assertExperience(principal, id);
    return this.repo.setPublication(id, false, true); // inactive, back to draft
  }

  /** Replace the experience's custom-menu references (validated to the restaurant). */
  async setCustomMenus(
    principal: StaffPrincipal,
    id: string,
    links: ExperienceMenuLinkInput[],
  ): Promise<ExperienceRecord> {
    const restaurantId = await this.assertExperience(principal, id);
    const menuLinks = await this.resolveMenuLinks(restaurantId, links);
    return this.repo.replaceMenus(id, menuLinks);
  }

  async deleteExperience(principal: StaffPrincipal, id: string): Promise<void> {
    await this.assertExperience(principal, id);
    await this.repo.softDelete(id);
  }

  // ---- tenancy helpers ----
  private async assertRestaurant(principal: StaffPrincipal, restaurantId: string): Promise<string> {
    const restaurant = await this.restaurants.findById(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    return restaurant.merchantId;
  }

  private async assertExperience(principal: StaffPrincipal, id: string): Promise<string> {
    const s = await this.repo.experienceScope(id);
    if (!s || s.deletedAt !== null) throw new NotFoundException('Experience not found');
    await this.scope.assertRestaurantInScope(principal, s.restaurantId);
    return s.restaurantId;
  }

  private async isDeleted(id: string): Promise<boolean> {
    const s = await this.repo.experienceScope(id);
    return !s || s.deletedAt !== null;
  }

  private async assertCategory(categoryId?: string | null): Promise<void> {
    if (!categoryId) return;
    if (!(await this.repo.categoryExists(categoryId))) {
      throw new BadRequestException('categoryId does not exist');
    }
  }

  /** Validate + normalize custom-menu links: CUSTOM menus of the SAME restaurant, ≤1 default. */
  private async resolveMenuLinks(
    restaurantId: string,
    links?: ExperienceMenuLinkInput[],
  ): Promise<Array<{ menuId: string; isDefault: boolean }>> {
    if (!links || links.length === 0) return [];
    const seen = new Set<string>();
    let defaults = 0;
    const out: Array<{ menuId: string; isDefault: boolean }> = [];
    for (const l of links) {
      if (!l.menuId) throw new BadRequestException('menuId is required for a custom-menu link');
      if (seen.has(l.menuId)) throw new BadRequestException('duplicate custom-menu link');
      seen.add(l.menuId);
      if (!(await this.repo.menuIsCustomInRestaurant(l.menuId, restaurantId))) {
        throw new BadRequestException('custom menu must be a CUSTOM menu of this restaurant');
      }
      const isDefault = l.isDefault === true;
      if (isDefault) defaults += 1;
      out.push({ menuId: l.menuId, isDefault });
    }
    if (defaults > 1) throw new BadRequestException('at most one default custom menu is allowed');
    return out;
  }

  // ---- validation ----
  private validateEnums(input: CreateExperienceInput | UpdateExperienceInput): void {
    if (input.type !== undefined && !TYPES.has(input.type)) {
      throw new BadRequestException('type must be FOOD or EVENT');
    }
    if (input.expType != null && !KINDS.has(input.expType)) {
      throw new BadRequestException('expType must be SPECIAL or CURATED');
    }
    if (input.foodMode !== undefined && !FOOD_MODES.has(input.foodMode)) {
      throw new BadRequestException('invalid foodMode');
    }
    if (input.menuMode !== undefined && !MENU_MODES.has(input.menuMode)) {
      throw new BadRequestException('invalid menuMode');
    }
  }

  private validateCapacity(total?: number | null, min?: number | null, max?: number | null): void {
    for (const [k, v] of Object.entries({ totalSeats: total, minSeats: min, maxSeats: max })) {
      if (v != null && (!Number.isInteger(v) || v < 0)) {
        throw new BadRequestException(`${k} must be a non-negative integer`);
      }
    }
    if (min != null && max != null && max < min) {
      throw new BadRequestException('maxSeats cannot be less than minSeats');
    }
    if (max != null && total != null && max > total) {
      throw new BadRequestException('maxSeats cannot exceed totalSeats');
    }
  }

  private validatePrices(input: CreateExperienceInput | UpdateExperienceInput): void {
    for (const [k, v] of Object.entries({
      listingPriceMinor: input.listingPriceMinor,
      adultPriceMinor: input.adultPriceMinor,
      kidsPriceMinor: input.kidsPriceMinor,
      occasionPriceMinor: input.occasionPriceMinor,
    })) {
      if (v != null && (v as bigint) < 0n) {
        throw new BadRequestException(`${k} must be >= 0`);
      }
    }
  }

  private validateMedia(input: CreateExperienceInput | UpdateExperienceInput): void {
    for (const [field, value] of Object.entries({
      photos: input.photos,
      photoThumbnails: input.photoThumbnails,
      videos: input.videos,
      promotionalVideos: input.promotionalVideos,
      tags: input.tags,
    })) {
      if (value === undefined) continue;
      if (!Array.isArray(value) || value.some((u) => typeof u !== 'string' || !u.trim())) {
        throw new BadRequestException(`${field} must be an array of non-empty URL/strings`);
      }
    }
  }
}

function nonEmpty(s?: string): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}
function toDate(v?: string | Date | null): Date | null {
  if (v === undefined || v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
