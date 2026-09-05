import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateDinerDto {
  @IsUUID()
  restaurantId!: string;

  @IsIn(['SEATING', 'RESERVATION'])
  intent!: 'SEATING' | 'RESERVATION';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kidsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  highChairs?: number;

  @IsOptional()
  @IsString()
  specialRequests?: string;

  @IsOptional()
  @IsISO8601()
  reservationAt?: string;
}

export class CancelDinerDto {
  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class SeatDinerDto {
  @IsUUID()
  tableId!: string;
}

export class ListMerchantDinerQueryDto {
  @IsUUID()
  restaurantId!: string;

  @IsOptional()
  @IsIn(['PENDING', 'NOT_SEATED', 'SEATED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
  status?: 'PENDING' | 'NOT_SEATED' | 'SEATED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
}

export class ListMerchantTablesQueryDto {
  @IsUUID()
  restaurantId!: string;
}