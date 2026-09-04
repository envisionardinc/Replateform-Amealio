import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Create a separate tip payment for an order. The tip amount is server-calculated
 * from `Order.grandTotalMinor`; the client supplies only the SELECTION (an approved
 * percentage in bps, or a custom amount in minor units). The beneficiary is NOT a
 * client input (server-resolved from merchant config).
 */
export class CreateTipDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MaxLength(128)
  razorpayOrderId!: string;

  // Approved percentage option in basis points (1000/1500/2000). Mutually
  // exclusive with customAmountMinor.
  @IsInt()
  @IsOptional()
  percentBps?: number;

  // Custom tip amount in integer minor units, sent as a string to preserve exact
  // BigInt precision. Mutually exclusive with percentBps.
  @IsString()
  @IsOptional()
  customAmountMinor?: string;
}

/** Verify a Razorpay client handoff for the tip payment. */
export class VerifyTipCaptureDto {
  @IsString()
  @MaxLength(128)
  razorpayOrderId!: string;

  @IsString()
  @MaxLength(128)
  razorpayPaymentId!: string;

  @IsString()
  @MaxLength(256)
  razorpaySignature!: string;

  @IsString()
  @IsOptional()
  amountMinor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  currencyCode?: string;
}
