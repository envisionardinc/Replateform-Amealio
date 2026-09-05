import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import type { ConsumerCatalogItem, OrderChannel } from '../domain/catalog.types';
import {
  appearsOnConsumerMenu,
  isConsumerOrderable,
} from '../domain/orderability';
import {
  CONSUMER_CROSS_SELL_LIMIT,
  MerchandisingError,
  assertCrossSellPair,
  parseMerchandisingStatus,
  parseMerchandisingType,
  requiresCustomization,
  selectConsumerRelations,
  type MerchandisingRelationRecord,
} from '../domain/merchandising-relation';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';
import { MerchandisingRelationRepository } from '../infrastructure/merchandising-relation.repository';

export type CreateMerchandisingInput = {
  sourceItemId: string;
  targetItemId: string;
  type?: string;
  sortOrder?: number;
  status?: string;
  merchantId?: unknown;
};

export type UpdateMerchandisingInput = {
  sortOrder?: number;
  status?: string;
};

@Injectable()
export class MerchandisingRelationService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly items: MenuItemRepository,
    private readonly repo: MerchandisingRelationRepository,
  ) {}

  async create(
    principal: StaffPrincipal,
    input: CreateMerchandisingInput,
  ): Promise<MerchandisingRelationRecord> {
    this.rejectClientMerchantId(input.merchantId);
    let type: ReturnType<typeof parseMerchandisingType>;
    let status: ReturnType<typeof parseMerchandisingStatus>;
    try {
      type = parseMerchandisingType(input.type);
      status = parseMerchandisingStatus(input.status);
    } catch (err) {
      this.toHttp(err);
    }
    const source = await this.requireItem(input.sourceItemId, 'SOURCE_NOT_FOUND');
    const target = await this.requireItem(input.targetItemId, 'TARGET_NOT_FOUND');
    try {
      assertCrossSellPair(source, target);
    } catch (err) {
      this.toHttp(err);
    }
    await this.assertRestaurant(principal, source.restaurantId);
    const existing = await this.repo.findPair(source.id, target.id, type);
    if (existing) {
      return this.repo.update(existing.id, {
        sortOrder: input.sortOrder ?? existing.sortOrder,
        status,
      });
    }
    return this.repo.create({
      merchantId: source.merchantId,
      restaurantId: source.restaurantId,
      type,
      sourceItemId: source.id,
      targetItemId: target.id,
      sortOrder: input.sortOrder ?? 0,
      status,
    });
  }

  async update(
    principal: StaffPrincipal,
    id: string,
    input: UpdateMerchandisingInput,
  ): Promise<MerchandisingRelationRecord> {
    const existing = await this.requireOwned(principal, id);
    let status: ReturnType<typeof parseMerchandisingStatus> | undefined;
    try {
      status = input.status === undefined ? undefined : parseMerchandisingStatus(input.status);
    } catch (err) {
      this.toHttp(err);
    }
    return this.repo.update(existing.id, {
      sortOrder: input.sortOrder,
      status,
    });
  }

  async remove(principal: StaffPrincipal, id: string): Promise<void> {
    await this.requireOwned(principal, id);
    await this.repo.delete(id);
  }

  async listForSource(principal: StaffPrincipal, sourceItemId: string) {
    const source = await this.requireItem(sourceItemId, 'SOURCE_NOT_FOUND');
    await this.assertRestaurant(principal, source.restaurantId);
    return this.repo.listForSource(sourceItemId);
  }

  async listForRestaurant(principal: StaffPrincipal, restaurantId: string) {
    await this.assertRestaurant(principal, restaurantId);
    return this.repo.listForRestaurant(restaurantId);
  }

  async listConsumerForSource(sourceItemId: string, channel?: OrderChannel) {
    const source = await this.repo.loadItem(sourceItemId);
    if (!source || source.deletedAt) return [];
    const restaurant = await this.restaurants.findById(source.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE') {
      return [];
    }
    const authored = selectConsumerRelations(await this.repo.listForSource(sourceItemId));
    if (authored.length === 0) return [];
    const catalog = await this.items.listConsumerItems({
      restaurantId: source.restaurantId,
      channel,
      itemIds: authored.map((row) => row.targetItemId),
    });
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const visible: Array<ReturnType<typeof serializeCrossSell>> = [];
    for (const relation of authored) {
      const target = byId.get(relation.targetItemId);
      if (!target) continue;
      if (!appearsOnConsumerMenu(target, channel)) continue;
      if (!isConsumerOrderable(target)) continue;
      visible.push(serializeCrossSell(relation, target));
      if (visible.length >= CONSUMER_CROSS_SELL_LIMIT) break;
    }
    return visible;
  }

  serialize(row: MerchandisingRelationRecord) {
    return {
      id: row.id,
      merchantId: row.merchantId,
      restaurantId: row.restaurantId,
      type: row.type,
      sourceItemId: row.sourceItemId,
      targetItemId: row.targetItemId,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toHttp(err: unknown): never {
    if (err instanceof MerchandisingError) {
      if (err.code === 'SOURCE_NOT_FOUND' || err.code === 'TARGET_NOT_FOUND') {
        throw new NotFoundException({ message: err.message, code: err.code });
      }
      throw new BadRequestException({ message: err.message, code: err.code });
    }
    throw err;
  }

  private rejectClientMerchantId(merchantId: unknown): void {
    if (merchantId !== undefined) {
      throw new ForbiddenException('merchantId is not accepted on merchandising writes');
    }
  }

  private async requireItem(
    id: string,
    code: 'SOURCE_NOT_FOUND' | 'TARGET_NOT_FOUND',
  ) {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException({ message: 'item id is required', code });
    }
    const item = await this.repo.loadItem(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException({
        message: code === 'SOURCE_NOT_FOUND' ? 'source item is not available' : 'target item is not available',
        code,
      });
    }
    return item;
  }

  private async requireOwned(principal: StaffPrincipal, id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ message: 'relation not found', code: 'NOT_FOUND' });
    await this.assertRestaurant(principal, row.restaurantId);
    return row;
  }

  private async assertRestaurant(principal: StaffPrincipal, restaurantId: string): Promise<string> {
    const restaurant = await this.restaurants.findById(restaurantId);
    if (!restaurant || restaurant.deletedAt !== null) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.scope.assertRestaurantInScope(principal, restaurantId);
    return restaurant.merchantId;
  }
}

function serializeCrossSell(relation: MerchandisingRelationRecord, item: ConsumerCatalogItem) {
  return {
    id: item.id,
    restaurantId: item.restaurantId,
    name: item.name,
    description: item.description,
    availability: item.availability,
    isPublished: item.isPublished,
    orderable: true,
    soldOut: item.availability === 'SOLDOUT',
    requiresCustomization: requiresCustomization(item.groups),
    relation: {
      id: relation.id,
      type: relation.type,
      sortOrder: relation.sortOrder,
    },
    variants: item.variants.map((variant) => ({
      id: variant.id,
      size: variant.size,
      sku: variant.sku ?? null,
      priceMinor: variant.priceMinor.toString(),
      currencyCode: variant.currencyCode,
      available: variant.available,
    })),
  };
}
