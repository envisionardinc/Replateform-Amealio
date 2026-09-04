import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Create a payment intent for an order (amount is server-derived from the order). */
export class CreatePaymentIntentDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MaxLength(128)
  razorpayOrderId!: string;
}

/** Verify a Razorpay client handoff. Amount/currency are optional (server uses the
 *  intent amount); when supplied they must match exactly. */
export class VerifyCaptureDto {
  @IsString()
  @MaxLength(128)
  razorpayOrderId!: string;

  @IsString()
  @MaxLength(128)
  razorpayPaymentId!: string;

  @IsString()
  @MaxLength(256)
  razorpaySignature!: string;

  // Sent as a string to preserve exact integer minor-unit precision (BigInt).
  @IsString()
  @IsOptional()
  amountMinor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  currencyCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  idempotencyKey?: string;
}
