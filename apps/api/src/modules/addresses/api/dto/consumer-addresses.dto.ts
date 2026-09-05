import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullable(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class CreateAddressDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(40)
  label?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(200)
  line2?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(80)
  state?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(16)
  pinCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class PatchAddressDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(40)
  label?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(200)
  line2?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(80)
  state?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => trimNullable(value))
  @IsString()
  @MaxLength(16)
  pinCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
