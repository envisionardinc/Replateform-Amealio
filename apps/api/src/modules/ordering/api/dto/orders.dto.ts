import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

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

const TYPES = [
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
] as const;

export class ListOrdersQueryDto {
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn(TYPES)
  type?: (typeof TYPES)[number];

  @IsOptional()
  @IsIn(['active', 'history'])
  lane?: 'active' | 'history';
}

export class PatchOrderStatusDto {
  @IsIn(STATUSES)
  toStatus!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @IsIn(STATUSES)
  expectedStatus?: (typeof STATUSES)[number];
}

export class AssignDeliveryDto {
  @IsUUID()
  deliveryPersonId!: string;

  @IsOptional()
  @IsIn(STATUSES)
  expectedStatus?: (typeof STATUSES)[number];
}

export class IssueDeliverySessionDto {
  @IsUUID()
  deliveryPersonId!: string;
}
