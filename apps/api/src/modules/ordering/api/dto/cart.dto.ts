import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

const TYPES = [
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
] as const;

const STATUSES = [
  'INITIAL',
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'PACKING',
  'READY',
  'ON_THE_WAY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
] as const;

export class AddCartItemDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: (typeof TYPES)[number];

  @IsOptional()
  @IsObject()
  customization?: Record<string, unknown>;

  @IsOptional()
  addOns?: unknown;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CheckoutItemDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsObject()
  customization?: Record<string, unknown>;

  @IsOptional()
  addOns?: unknown;
}

export class CheckoutDto {
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: (typeof TYPES)[number];

  @IsIn(['PREPAID', 'COD', 'PAY_LATER'])
  settlement!: 'PREPAID' | 'COD' | 'PAY_LATER';

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tipMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  donationMinor?: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];
}

export class CancelConsumerOrderDto {
  @IsOptional()
  @IsIn(STATUSES)
  expectedStatus?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
