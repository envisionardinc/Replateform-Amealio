import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';
import { MerchantScopeService } from '../../merchant/application/merchant-scope.service';
import { RestaurantRepository } from '../../merchant/infrastructure/restaurant.repository';
import type { OrderChannel } from '../domain/catalog.types';
import type { ItemAvailabilityName } from '../domain/catalog-write.types';
import {
  ComboError,
  assertNoClientComboMoney,
  comboIsOrderable,
  quoteCombo,
  snapshotCombo,
  type ComboQuote,
  type ComboRecord,
  type ComboSelectionInput,
} from '../domain/combo';
import { ComboRepository, type ComboCreateData } from '../infrastructure/combo.repository';

const AVAILABILITIES = new Set<ItemAvailabilityName>(['AVAILABLE', 'SOLDOUT', 'NOTAVAILABLE']);

export type CreateComboInput = {
  restaurantId: string;
  name: string;
  description?: string | null;
  isPublished?: boolean;
  availability?: ItemAvailabilityName;
  substitutable?: boolean;
  comboPriceMinor: bigint;
  currencyCode?: string;
  sortOrder?: number;
  sectionIds?: string[];
  slots: Array<{
    name?: string | null;
    sortOrder?: number;
    options: Array<{ menuItemId: string; isDefault?: boolean; sortOrder?: number }>;
  }>;
};

export type UpdateComboInput = {
  name?: string;
  description?: string | null;
  isPublished?: boolean;
  availability?: ItemAvailabilityName;
  substitutable?: boolean;
  comboPriceMinor?: bigint;
  sortOrder?: number;
  deletedAt?: Date | null;
};

/**
 * Merchant-owned food combo / meal deal (doc 109).
 * Quotes fixed comboPriceMinor only. composeCommercialQuote remains the totals authority.
 */
@Injectable()
export class ComboService {
  constructor(
    private readonly scope: MerchantScopeService,
    private readonly restaurants: RestaurantRepository,
    private readonly repo: ComboRepository,
  ) {}

  async create(principal: StaffPrincipal, input: CreateComboInput): Promise<ComboRecord> {
    if (!nonEmpty(input.name)) throw new BadRequestException('name is required');
    if (input.comboPriceMinor < 0n) {
      throw new BadRequestException('comboPriceMinor must be >= 0');
    }
    if (input.availability !== undefined && !AVAILABILITIES.has(input.availability)) {
      throw new BadRequestException('invalid availability');
    }
    this.assertSlots(input.slots);
    const merchantId = await this.assertRestaurant(principal, input.restaurantId);
    const itemIds = input.slots.flatMap((slot) => slot.options.map((option) => option.menuItemId));
    if (!(await this.repo.assertItemsInRestaurant(itemIds, input.restaurantId, merchantId))) {
      throw new BadRequestException('combo components must belong to this restaurant');
    }
    if (!(await this.repo.assertSectionsInRestaurant(input.sectionIds ?? [], input.restaurantId))) {
      throw new BadRequestException('combo sections must belong to this restaurant');
    }
    return this.repo.create({
      merchantId,
      restaurantId: input.restaurantId,
      name: input.name.trim(),
      description: input.description ?? null,
      isPublished: input.isPublished,
      availability: input.availability,
      substitutable: input.substitutable,
      comboPriceMinor: input.comboPriceMinor,
      currencyCode: input.currencyCode,
      sortOrder: input.sortOrder,
      slots: input.slots,
      sectionIds: input.sectionIds,
    } satisfies ComboCreateData);
  }

  async update(
    principal: StaffPrincipal,
    comboId: string,
    input: UpdateComboInput,
  ): Promise<ComboRecord> {
    const existing = await this.requireOwned(principal, comboId);
    if (input.name !== undefined && !nonEmpty(input.name)) {
      throw new BadRequestException('name cannot be empty');
    }
    if (input.comboPriceMinor !== undefined && input.comboPriceMinor < 0n) {
      throw new BadRequestException('comboPriceMinor must be >= 0');
    }
    if (input.availability !== undefined && !AVAILABILITIES.has(input.availability)) {
      throw new BadRequestException('invalid availability');
    }
    void existing;
    return this.repo.update(comboId, {
      ...input,
      name: input.name?.trim(),
    });
  }

  async listForRestaurant(principal: StaffPrincipal, restaurantId: string) {
    await this.assertRestaurant(principal, restaurantId);
    return this.repo.listForRestaurant(restaurantId);
  }

  async getForStaff(principal: StaffPrincipal, comboId: string) {
    return this.requireOwned(principal, comboId);
  }

  async quote(input: {
    comboId: string;
    quantity: number;
    channel?: OrderChannel;
    selections?: ComboSelectionInput[];
    comboPriceMinor?: bigint;
    discountMinor?: bigint;
    grandTotalMinor?: bigint;
  }): Promise<ComboQuote> {
    try {
      assertNoClientComboMoney({
        comboPriceMinor: input.comboPriceMinor,
        discountMinor: input.discountMinor,
        grandTotalMinor: input.grandTotalMinor,
      });
    } catch (err) {
      this.toHttp(err);
    }
    const combo = await this.repo.findById(input.comboId);
    if (!combo || combo.deletedAt) {
      throw new NotFoundException({ message: 'combo not found', code: 'COMBO_NOT_FOUND' });
    }
    const restaurant = await this.restaurants.findById(combo.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE') {
      throw new BadRequestException('Restaurant is not accepting orders');
    }
    const itemIds = combo.slots.flatMap((slot) => slot.options.map((option) => option.menuItemId));
    const components = await this.repo.loadComponents(itemIds, input.channel);
    try {
      return quoteCombo({
        combo,
        quantity: input.quantity,
        components,
        selections: input.selections,
      });
    } catch (err) {
      this.toHttp(err);
    }
  }

  async listConsumer(restaurantId: string, channel?: OrderChannel) {
    const combos = await this.repo.listForRestaurant(restaurantId, true);
    return this.withOrderable(combos, channel);
  }

  async listConsumerForSections(sectionIds: string[], channel?: OrderChannel) {
    const combos = await this.repo.listForSections(sectionIds);
    return this.withOrderable(combos, channel);
  }

  async getConsumer(comboId: string, channel?: OrderChannel) {
    const combo = await this.repo.findById(comboId);
    if (!combo || combo.deletedAt || !combo.isPublished) {
      throw new NotFoundException({ message: 'combo not found', code: 'COMBO_NOT_FOUND' });
    }
    const restaurant = await this.restaurants.findById(combo.restaurantId);
    if (!restaurant || restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE') {
      throw new NotFoundException('Restaurant not found');
    }
    const [view] = await this.withOrderable([combo], channel);
    return view;
  }

  snapshot(quote: ComboQuote) {
    return snapshotCombo(quote);
  }

  serialize(combo: ComboRecord, extras?: { orderable?: boolean }) {
    return {
      id: combo.id,
      restaurantId: combo.restaurantId,
      merchantId: combo.merchantId,
      name: combo.name,
      description: combo.description,
      isPublished: combo.isPublished,
      availability: combo.availability,
      substitutable: combo.substitutable,
      comboPriceMinor: combo.comboPriceMinor.toString(),
      currencyCode: combo.currencyCode,
      sortOrder: combo.sortOrder,
      sectionIds: combo.sectionIds,
      orderable: extras?.orderable,
      slots: combo.slots.map((slot) => ({
        id: slot.id,
        name: slot.name,
        sortOrder: slot.sortOrder,
        options: slot.options.map((option) => ({
          id: option.id,
          menuItemId: option.menuItemId,
          isDefault: option.isDefault,
          sortOrder: option.sortOrder,
        })),
      })),
    };
  }

  serializeQuote(quote: ComboQuote) {
    return {
      comboId: quote.comboId,
      restaurantId: quote.restaurantId,
      merchantId: quote.merchantId,
      name: quote.name,
      quantity: quote.quantity,
      currencyCode: quote.currencyCode,
      comboPriceMinor: quote.comboPriceMinor.toString(),
      unitMerchandiseMinor: quote.unitMerchandiseMinor.toString(),
      lineMerchandiseMinor: quote.lineMerchandiseMinor.toString(),
      modifierTotalMinor: quote.modifierTotalMinor.toString(),
      components: quote.components,
      snapshot: snapshotCombo(quote),
    };
  }

  toHttp(err: unknown): never {
    if (err instanceof ComboError) {
      if (err.code === 'COMBO_NOT_FOUND') {
        throw new NotFoundException({ message: err.message, code: err.code });
      }
      throw new BadRequestException({ message: err.message, code: err.code });
    }
    throw err;
  }

  private async withOrderable(combos: ComboRecord[], channel?: OrderChannel) {
    const itemIds = [
      ...new Set(
        combos.flatMap((combo) =>
          combo.slots.flatMap((slot) => slot.options.map((option) => option.menuItemId)),
        ),
      ),
    ];
    const components = await this.repo.loadComponents(itemIds, channel);
    return combos.map((combo) => {
      const optionIds = combo.slots.flatMap((slot) =>
        slot.options.map((option) => option.menuItemId),
      );
      const related = components.filter((row) => optionIds.includes(row.menuItemId));
      return {
        ...this.serialize(combo, {
          orderable: comboIsOrderable({ combo, components: related }),
        }),
        components: related.map((row) => ({
          menuItemId: row.menuItemId,
          name: row.name,
          available: row.availability === 'AVAILABLE' && row.isPublished && row.hasAvailableVariant,
        })),
      };
    });
  }

  private assertSlots(slots: CreateComboInput['slots']): void {
    if (!slots || slots.length === 0) {
      throw new BadRequestException('combo requires at least one component slot');
    }
    for (const slot of slots) {
      if (!slot.options || slot.options.length === 0) {
        throw new BadRequestException('each combo slot requires at least one component');
      }
    }
  }

  private async requireOwned(principal: StaffPrincipal, comboId: string): Promise<ComboRecord> {
    const combo = await this.repo.findById(comboId);
    if (!combo || combo.deletedAt) {
      throw new NotFoundException({ message: 'combo not found', code: 'COMBO_NOT_FOUND' });
    }
    await this.assertRestaurant(principal, combo.restaurantId);
    return combo;
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

function nonEmpty(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
