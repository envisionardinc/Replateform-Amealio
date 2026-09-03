import { APPROVED_TIP_PERCENT_BPS } from './tip.types';

/**
 * Pure, server-authoritative tip calculation + validation (P1.7.38). No I/O.
 * Money is exact BigInt minor units; percentage tips floor to the minor unit
 * (integer division — no floating point). The basis is the order's canonical
 * `grandTotalMinor` (the approved "total order amount"); no new order-total
 * concept is introduced.
 */

export interface ResolvedTip {
  amountMinor: bigint;
  percentBps: number | null;
  isCustom: boolean;
}

export class TipValidationError extends Error {}

/** floor(basisMinor × percentBps / 10000) using exact integer arithmetic. */
export function calculatePercentageTip(basisMinor: bigint, percentBps: number): bigint {
  return (basisMinor * BigInt(percentBps)) / 10000n;
}

/**
 * Resolve the collected tip amount from the request, enforcing the approved
 * options. Exactly one of `percentBps` / `customAmountMinor` must be provided.
 * Rejects negative/zero/malformed values and non-approved percentages. The
 * resulting percentage tip may be 0 only if the basis is 0 — which is itself
 * rejected upstream (an order with a zero grand total cannot be tipped).
 */
export function resolveTip(args: {
  basisMinor: bigint;
  percentBps?: number | null;
  customAmountMinor?: bigint | null;
}): ResolvedTip {
  const hasPercent = args.percentBps !== undefined && args.percentBps !== null;
  const hasCustom = args.customAmountMinor !== undefined && args.customAmountMinor !== null;

  if (hasPercent === hasCustom) {
    throw new TipValidationError(
      'Provide exactly one of percentBps (approved option) or customAmountMinor',
    );
  }
  if (args.basisMinor <= 0n) {
    throw new TipValidationError('Tip basis (order grand total) must be greater than zero');
  }

  if (hasPercent) {
    const bps = args.percentBps as number;
    if (!Number.isInteger(bps) || !APPROVED_TIP_PERCENT_BPS.includes(bps)) {
      throw new TipValidationError(
        `percentBps must be one of the approved options: ${APPROVED_TIP_PERCENT_BPS.join(', ')}`,
      );
    }
    const amountMinor = calculatePercentageTip(args.basisMinor, bps);
    if (amountMinor <= 0n) {
      throw new TipValidationError('Computed tip amount must be greater than zero');
    }
    return { amountMinor, percentBps: bps, isCustom: false };
  }

  const custom = args.customAmountMinor as bigint;
  if (typeof custom !== 'bigint') {
    throw new TipValidationError('customAmountMinor must be an integer minor-unit value');
  }
  if (custom <= 0n) {
    throw new TipValidationError('customAmountMinor must be greater than zero');
  }
  return { amountMinor: custom, percentBps: null, isCustom: true };
}
