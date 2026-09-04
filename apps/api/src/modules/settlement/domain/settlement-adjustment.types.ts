export type SettlementAdjustmentTypeName = 'ORDER_REFUND' | 'TIP_REFUND';
export type SettlementAdjustmentDirectionName = 'DEBIT' | 'CREDIT';

export interface CreateSettlementAdjustmentInput {
  settlementId: string;
  merchantId: string;
  type: SettlementAdjustmentTypeName;
  direction: SettlementAdjustmentDirectionName;
  amountMinor: bigint;
  currencyCode: string;
  idempotencyKey: string;
  orderId?: string | null;
  paymentIntentId?: string | null;
  tipPaymentId?: string | null;
  refundId?: string | null;
  reason?: string | null;
}

export interface SettlementAdjustmentResult {
  adjustmentId: string;
  settlementId: string;
  merchantId: string;
  type: SettlementAdjustmentTypeName;
  direction: SettlementAdjustmentDirectionName;
  amountMinor: bigint;
  currencyCode: string;
  idempotencyKey: string;
  orderId: string | null;
  paymentIntentId: string | null;
  tipPaymentId: string | null;
  refundId: string | null;
  reason: string | null;
  createdAt: Date;
  created: boolean;
}

/**
 * Signed current position of a historical settlement after append-only
 * adjustments. Positive = still payable to merchant; negative = recoverable
 * from merchant. `settlementAmountMinor` itself is never mutated.
 */
export interface SettlementAdjustmentPosition {
  settlementId: string;
  settlementAmountMinor: bigint;
  debitAmountMinor: bigint;
  creditAmountMinor: bigint;
  adjustedAmountMinor: bigint;
  payableAmountMinor: bigint;
  recoverableAmountMinor: bigint;
  settlementStatus: string;
}
