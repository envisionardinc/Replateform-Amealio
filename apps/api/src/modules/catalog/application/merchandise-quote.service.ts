import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderChannel } from '../domain/catalog.types';
import {
  MerchandiseConfigurationError,
  parseModifierGroupSelections,
  quoteMerchandise,
  snapshotMerchandise,
  type MerchandiseConfigurationInput,
  type MerchandiseQuote,
  type MerchandiseSnapshot,
  type ModifierGroupSelectionInput,
} from '../domain/merchandise-configuration';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';

/**
 * Server-authoritative merchandise quote for Stage A.
 * Loads catalog, validates configuration, returns variant + modifier totals.
 * Does not apply tax, fees, promotions, delivery, tip, or donation.
 */
@Injectable()
export class MerchandiseQuoteService {
  constructor(private readonly items: MenuItemRepository) {}

  async quote(input: {
    variantId: string;
    quantity: number;
    channel?: OrderChannel;
    modifierGroups?: ModifierGroupSelectionInput[];
    addOns?: unknown;
  }): Promise<MerchandiseQuote> {
    const loaded = await this.items.findMerchandiseCatalog(input.variantId, input.channel);
    if (!loaded) {
      throw new BadRequestException('Unknown menu variant');
    }
    const modifierGroups =
      input.modifierGroups ??
      (input.addOns !== undefined ? parseModifierGroupSelections(input.addOns) : []);
    try {
      return quoteMerchandise(
        loaded.catalog,
        {
          variantId: input.variantId,
          quantity: input.quantity,
          modifierGroups,
        } satisfies MerchandiseConfigurationInput,
        loaded.itemName,
      );
    } catch (err) {
      if (err instanceof MerchandiseConfigurationError) {
        throw new BadRequestException({
          message: err.message,
          code: err.code,
        });
      }
      throw err;
    }
  }

  snapshot(quote: MerchandiseQuote): MerchandiseSnapshot {
    return snapshotMerchandise(quote);
  }
}
