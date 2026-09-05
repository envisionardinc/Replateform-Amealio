/**
 * Stage D canonical commercial quote (doc 107).
 *
 * Merchandise is Stage A. This module is the ONLY totals calculator for
 * discount placement, tax lines, fee lines, and grand total.
 *
 * Production loads no tax/fee rules. Empty rules → explicit zero tax/fee.
 * Invalid typed rules fail closed. Display names never classify tax.
 */

export const COMMERCIAL_SNAPSHOT_SCHEMA = 'commercial.v1' as const;

export type CommercialErrorCode =
  | 'CLIENT_MONEY_NOT_AUTHORITATIVE'
  | 'TAX_CONFIGURATION_INVALID'
  | 'FEE_CONFIGURATION_INVALID'
  | 'UNSUPPORTED_FEE_TYPE'
  | 'CROSS_TENANT_PRICING_RULE'
  | 'DELIVERY_PRICING_NOT_IMPLEMENTED';

export class CommercialQuoteError extends Error {
  constructor(
    readonly code: CommercialErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CommercialQuoteError';
  }
}

export type TaxMode = 'EXCLUSIVE';

export interface TaxRule {
  id: string;
  /** Explicit tax code. Never inferred from a display name. */
  code: string;
  rateBps: number;
  mode: TaxMode;
  merchantId: string;
  restaurantId: string;
}

export const FEE_TYPES = [
  'PACKAGING',
  'CONVENIENCE',
  'SERVICE',
  'PLATFORM',
  'CHANNEL',
  'PAYMENT',
  'MINIMUM_ORDER',
] as const;

export type FeeType = (typeof FEE_TYPES)[number];

export interface FeeRule {
  id: string;
  type: FeeType;
  amountMinor: bigint;
  recipient: 'MERCHANT' | 'PLATFORM';
  taxTreatment: 'NONE';
  merchantId: string;
  restaurantId: string;
}

export interface CommercialLineInput {
  menuItemId: string | null;
  variantId?: string | null;
  name: string;
  variantSize?: string | null;
  quantity: number;
  variantPriceMinor: bigint;
  modifierTotalMinor: bigint;
  unitMerchandiseMinor: bigint;
  lineMerchandiseMinor: bigint;
  currencyCode: string;
  merchantId: string;
  restaurantId: string;
}

export interface CommercialTaxLine {
  code: string;
  rateBps: number;
  mode: TaxMode;
  amountMinor: bigint;
}

export interface CommercialFeeLine {
  type: FeeType;
  recipient: 'MERCHANT' | 'PLATFORM';
  amountMinor: bigint;
  taxTreatment: 'NONE';
}

export interface CommercialQuote {
  schema: typeof COMMERCIAL_SNAPSHOT_SCHEMA;
  currencyCode: string;
  merchantId: string;
  restaurantId: string;
  lines: CommercialLineInput[];
  merchandiseSubtotalMinor: bigint;
  discountMinor: bigint;
  taxableSubtotalMinor: bigint;
  taxes: CommercialTaxLine[];
  taxTotalMinor: bigint;
  fees: CommercialFeeLine[];
  feeTotalMinor: bigint;
  deliveryChargeMinor: bigint;
  grandTotalMinor: bigint;
}

export interface CommercialSnapshot {
  schema: typeof COMMERCIAL_SNAPSHOT_SCHEMA;
  currencyCode: string;
  lines: Array<{
    menuItemId: string | null;
    variantId: string | null;
    name: string;
    variantSize: string | null;
    quantity: number;
    variantPriceMinor: string;
    modifierTotalMinor: string;
    unitMerchandiseMinor: string;
    lineMerchandiseMinor: string;
  }>;
  merchandiseSubtotalMinor: string;
  discountMinor: string;
  taxableSubtotalMinor: string;
  taxes: Array<{
    code: string;
    rateBps: number;
    mode: TaxMode;
    amountMinor: string;
  }>;
  taxTotalMinor: string;
  fees: Array<{
    type: FeeType;
    recipient: 'MERCHANT' | 'PLATFORM';
    amountMinor: string;
    taxTreatment: 'NONE';
  }>;
  feeTotalMinor: string;
  deliveryChargeMinor: string;
  grandTotalMinor: string;
  promotion?: {
    offerId: string;
    couponId: string | null;
    couponCode: string | null;
    title: string;
    source: 'CODE' | 'AUTOMATIC';
  } | null;
}

const FEE_TYPE_SET = new Set<string>(FEE_TYPES);

export function composeCommercialQuote(input: {
  lines: CommercialLineInput[];
  discountMinor?: bigint;
  taxRules?: TaxRule[];
  feeRules?: FeeRule[];
  deliveryChargeMinor?: bigint;
  merchantId: string;
  restaurantId: string;
  currencyCode?: string;
}): CommercialQuote {
  if (input.lines.length === 0) {
    throw new CommercialQuoteError('TAX_CONFIGURATION_INVALID', 'commercial quote requires lines');
  }

  for (const line of input.lines) {
    if (line.restaurantId !== input.restaurantId || line.merchantId !== input.merchantId) {
      throw new CommercialQuoteError(
        'CROSS_TENANT_PRICING_RULE',
        'line restaurant/merchant does not match the quote context',
      );
    }
    if (line.lineMerchandiseMinor !== line.unitMerchandiseMinor * BigInt(line.quantity)) {
      throw new CommercialQuoteError(
        'TAX_CONFIGURATION_INVALID',
        'line merchandise is not unit × quantity',
      );
    }
    if (
      line.unitMerchandiseMinor !== line.variantPriceMinor + line.modifierTotalMinor ||
      line.lineMerchandiseMinor < 0n ||
      line.unitMerchandiseMinor < 0n
    ) {
      throw new CommercialQuoteError(
        'TAX_CONFIGURATION_INVALID',
        'line merchandise components are inconsistent',
      );
    }
  }

  const merchandiseSubtotalMinor = input.lines.reduce(
    (sum, line) => sum + line.lineMerchandiseMinor,
    0n,
  );
  const discountMinor = input.discountMinor ?? 0n;
  if (discountMinor < 0n) {
    throw new CommercialQuoteError('CLIENT_MONEY_NOT_AUTHORITATIVE', 'discountMinor must be >= 0');
  }
  if (discountMinor > merchandiseSubtotalMinor) {
    throw new CommercialQuoteError(
      'CLIENT_MONEY_NOT_AUTHORITATIVE',
      'discount cannot exceed merchandise subtotal',
    );
  }

  const taxableSubtotalMinor = merchandiseSubtotalMinor - discountMinor;
  const taxes = applyTaxRules(
    input.taxRules ?? [],
    taxableSubtotalMinor,
    input.merchantId,
    input.restaurantId,
  );
  const taxTotalMinor = taxes.reduce((sum, line) => sum + line.amountMinor, 0n);
  const fees = applyFeeRules(input.feeRules ?? [], input.merchantId, input.restaurantId);
  const feeTotalMinor = fees.reduce((sum, line) => sum + line.amountMinor, 0n);

  const deliveryChargeMinor = input.deliveryChargeMinor ?? 0n;
  if (deliveryChargeMinor !== 0n) {
    throw new CommercialQuoteError(
      'DELIVERY_PRICING_NOT_IMPLEMENTED',
      'delivery pricing is not part of Stage D',
    );
  }

  const currencyCode = input.currencyCode ?? input.lines[0]?.currencyCode ?? 'INR';
  return {
    schema: COMMERCIAL_SNAPSHOT_SCHEMA,
    currencyCode,
    merchantId: input.merchantId,
    restaurantId: input.restaurantId,
    lines: input.lines,
    merchandiseSubtotalMinor,
    discountMinor,
    taxableSubtotalMinor,
    taxes,
    taxTotalMinor,
    fees,
    feeTotalMinor,
    deliveryChargeMinor,
    grandTotalMinor: taxableSubtotalMinor + taxTotalMinor + feeTotalMinor + deliveryChargeMinor,
  };
}

export function snapshotCommercial(
  quote: CommercialQuote,
  promotion?: CommercialSnapshot['promotion'],
): CommercialSnapshot {
  return {
    schema: COMMERCIAL_SNAPSHOT_SCHEMA,
    currencyCode: quote.currencyCode,
    lines: quote.lines.map((line) => ({
      menuItemId: line.menuItemId,
      variantId: line.variantId ?? null,
      name: line.name,
      variantSize: line.variantSize ?? null,
      quantity: line.quantity,
      variantPriceMinor: line.variantPriceMinor.toString(),
      modifierTotalMinor: line.modifierTotalMinor.toString(),
      unitMerchandiseMinor: line.unitMerchandiseMinor.toString(),
      lineMerchandiseMinor: line.lineMerchandiseMinor.toString(),
    })),
    merchandiseSubtotalMinor: quote.merchandiseSubtotalMinor.toString(),
    discountMinor: quote.discountMinor.toString(),
    taxableSubtotalMinor: quote.taxableSubtotalMinor.toString(),
    taxes: quote.taxes.map((tax) => ({
      code: tax.code,
      rateBps: tax.rateBps,
      mode: tax.mode,
      amountMinor: tax.amountMinor.toString(),
    })),
    taxTotalMinor: quote.taxTotalMinor.toString(),
    fees: quote.fees.map((fee) => ({
      type: fee.type,
      recipient: fee.recipient,
      amountMinor: fee.amountMinor.toString(),
      taxTreatment: fee.taxTreatment,
    })),
    feeTotalMinor: quote.feeTotalMinor.toString(),
    deliveryChargeMinor: quote.deliveryChargeMinor.toString(),
    grandTotalMinor: quote.grandTotalMinor.toString(),
    promotion: promotion ?? null,
  };
}

export function serializeCommercialQuote(quote: CommercialQuote) {
  const snap = snapshotCommercial(quote);
  return {
    ...snap,
    merchantId: quote.merchantId,
    restaurantId: quote.restaurantId,
  };
}

export function lineFromMerchandise(input: {
  menuItemId: string;
  variantId: string;
  itemName: string;
  variantSize: string | null;
  quantity: number;
  variantPriceMinor: bigint;
  modifierTotalMinor: bigint;
  unitMerchandiseMinor: bigint;
  lineMerchandiseMinor: bigint;
  currencyCode: string;
  merchantId: string;
  restaurantId: string;
}): CommercialLineInput {
  return {
    menuItemId: input.menuItemId,
    variantId: input.variantId,
    name: input.itemName,
    variantSize: input.variantSize,
    quantity: input.quantity,
    variantPriceMinor: input.variantPriceMinor,
    modifierTotalMinor: input.modifierTotalMinor,
    unitMerchandiseMinor: input.unitMerchandiseMinor,
    lineMerchandiseMinor: input.lineMerchandiseMinor,
    currencyCode: input.currencyCode,
    merchantId: input.merchantId,
    restaurantId: input.restaurantId,
  };
}

export function lineFromOrderItem(input: {
  menuItemId?: string | null;
  nameSnapshot: string;
  variantSnapshot?: string | null;
  unitPriceMinor: bigint;
  quantity: number;
  currencyCode: string;
  merchantId: string;
  restaurantId: string;
}): CommercialLineInput {
  return {
    menuItemId: input.menuItemId ?? null,
    variantId: null,
    name: input.nameSnapshot,
    variantSize: input.variantSnapshot ?? null,
    quantity: input.quantity,
    variantPriceMinor: input.unitPriceMinor,
    modifierTotalMinor: 0n,
    unitMerchandiseMinor: input.unitPriceMinor,
    lineMerchandiseMinor: input.unitPriceMinor * BigInt(input.quantity),
    currencyCode: input.currencyCode,
    merchantId: input.merchantId,
    restaurantId: input.restaurantId,
  };
}

/**
 * Reject caller-supplied payable components. Zero/undefined is the same as
 * "not supplied" because the quote derives those as zero without rules.
 */
export function assertCallerChargesNotAuthoritative(input: {
  taxTotalMinor?: bigint;
  feeTotalMinor?: bigint;
  deliveryChargeMinor?: bigint;
}): void {
  if (input.taxTotalMinor !== undefined && input.taxTotalMinor !== 0n) {
    throw new CommercialQuoteError(
      'CLIENT_MONEY_NOT_AUTHORITATIVE',
      'taxTotalMinor is server-derived',
    );
  }
  if (input.feeTotalMinor !== undefined && input.feeTotalMinor !== 0n) {
    throw new CommercialQuoteError(
      'CLIENT_MONEY_NOT_AUTHORITATIVE',
      'feeTotalMinor is server-derived',
    );
  }
  if (input.deliveryChargeMinor !== undefined && input.deliveryChargeMinor !== 0n) {
    throw new CommercialQuoteError(
      'CLIENT_MONEY_NOT_AUTHORITATIVE',
      'deliveryChargeMinor is server-derived',
    );
  }
}

function applyTaxRules(
  rules: TaxRule[],
  taxableSubtotalMinor: bigint,
  merchantId: string,
  restaurantId: string,
): CommercialTaxLine[] {
  return rules.map((rule) => {
    if (!rule.code || rule.code.trim().length === 0) {
      throw new CommercialQuoteError('TAX_CONFIGURATION_INVALID', 'tax rule code is required');
    }
    if (rule.mode !== 'EXCLUSIVE') {
      throw new CommercialQuoteError(
        'TAX_CONFIGURATION_INVALID',
        'only exclusive tax mode is implemented',
      );
    }
    if (!Number.isInteger(rule.rateBps) || rule.rateBps < 0) {
      throw new CommercialQuoteError('TAX_CONFIGURATION_INVALID', 'tax rateBps must be >= 0');
    }
    assertRuleTenant(rule, merchantId, restaurantId);
    return {
      code: rule.code,
      rateBps: rule.rateBps,
      mode: 'EXCLUSIVE',
      amountMinor: (taxableSubtotalMinor * BigInt(rule.rateBps)) / 10000n,
    };
  });
}

function applyFeeRules(
  rules: FeeRule[],
  merchantId: string,
  restaurantId: string,
): CommercialFeeLine[] {
  return rules.map((rule) => {
    if (!FEE_TYPE_SET.has(rule.type)) {
      throw new CommercialQuoteError(
        'UNSUPPORTED_FEE_TYPE',
        `unsupported fee type ${String(rule.type)}`,
      );
    }
    if (rule.taxTreatment !== 'NONE') {
      throw new CommercialQuoteError(
        'FEE_CONFIGURATION_INVALID',
        'fee tax treatment other than NONE is not implemented',
      );
    }
    if (rule.recipient !== 'MERCHANT' && rule.recipient !== 'PLATFORM') {
      throw new CommercialQuoteError('FEE_CONFIGURATION_INVALID', 'fee recipient must be explicit');
    }
    if (rule.amountMinor < 0n) {
      throw new CommercialQuoteError('FEE_CONFIGURATION_INVALID', 'fee amount must be >= 0');
    }
    assertRuleTenant(rule, merchantId, restaurantId);
    return {
      type: rule.type,
      recipient: rule.recipient,
      amountMinor: rule.amountMinor,
      taxTreatment: 'NONE',
    };
  });
}

function assertRuleTenant(
  rule: { merchantId: string; restaurantId: string },
  merchantId: string,
  restaurantId: string,
): void {
  if (rule.merchantId !== merchantId || rule.restaurantId !== restaurantId) {
    throw new CommercialQuoteError(
      'CROSS_TENANT_PRICING_RULE',
      'pricing rule does not belong to this restaurant',
    );
  }
}
