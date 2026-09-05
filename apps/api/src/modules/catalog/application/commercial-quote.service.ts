import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderChannel } from '../domain/catalog.types';
import {
  CommercialQuoteError,
  composeCommercialQuote,
  lineFromMerchandise,
  serializeCommercialQuote,
  snapshotCommercial,
  type CommercialQuote,
  type CommercialSnapshot,
} from '../domain/commercial-quote';
import type {
  MerchandiseQuote,
  ModifierGroupSelectionInput,
} from '../domain/merchandise-configuration';
import { MerchandiseQuoteService } from './merchandise-quote.service';

/**
 * Server-authoritative commercial quote (doc 107).
 *
 * Wraps Stage A merchandise quoting and composes discount/tax/fee/grand.
 * Production tax/fee rule tables do not exist — empty rules yield explicit zeros.
 * Never reads ItemChannelConfig.surcharges. Never calls PromotionEvaluationService.
 */
@Injectable()
export class CommercialQuoteService {
  constructor(private readonly merchandise: MerchandiseQuoteService) {}

  async quote(input: {
    variantId: string;
    quantity: number;
    channel?: OrderChannel;
    modifierGroups?: ModifierGroupSelectionInput[];
    addOns?: unknown;
    discountMinor?: bigint;
  }): Promise<CommercialQuote> {
    const merch = await this.merchandise.quote({
      variantId: input.variantId,
      quantity: input.quantity,
      channel: input.channel,
      modifierGroups: input.modifierGroups,
      addOns: input.addOns,
    });
    return this.fromMerchandise([merch], input.discountMinor ?? 0n);
  }

  fromMerchandise(quotes: MerchandiseQuote[], discountMinor = 0n): CommercialQuote {
    if (quotes.length === 0) {
      throw new BadRequestException({
        message: 'commercial quote requires merchandise lines',
        code: 'TAX_CONFIGURATION_INVALID',
      });
    }
    const first = quotes[0];
    try {
      return composeCommercialQuote({
        lines: quotes.map((q) =>
          lineFromMerchandise({
            menuItemId: q.menuItemId,
            variantId: q.variantId,
            itemName: q.itemName,
            variantSize: q.variantSize,
            quantity: q.quantity,
            variantPriceMinor: q.variantPriceMinor,
            modifierTotalMinor: q.modifierTotalMinor,
            unitMerchandiseMinor: q.unitMerchandiseMinor,
            lineMerchandiseMinor: q.lineMerchandiseMinor,
            currencyCode: q.currencyCode,
            merchantId: q.merchantId,
            restaurantId: q.restaurantId,
          }),
        ),
        discountMinor,
        taxRules: [],
        feeRules: [],
        deliveryChargeMinor: 0n,
        merchantId: first.merchantId,
        restaurantId: first.restaurantId,
        currencyCode: first.currencyCode,
      });
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  snapshot(quote: CommercialQuote): CommercialSnapshot {
    return snapshotCommercial(quote);
  }

  serialize(quote: CommercialQuote) {
    return serializeCommercialQuote(quote);
  }

  private toHttp(err: unknown): never {
    if (err instanceof CommercialQuoteError) {
      throw new BadRequestException({
        message: err.message,
        code: err.code,
      });
    }
    throw err;
  }
}
