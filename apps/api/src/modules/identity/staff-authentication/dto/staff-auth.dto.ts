import { IsEmail, IsString, MinLength, ValidateIf } from 'class-validator';

/**
 * Staff/admin login by email OR phone, plus password (P1.7.1E). At least one
 * identifier is required (if both are absent, both validators fail). Login
 * identifiers are NOT globally unique in the schema (O1 open) — the service
 * treats an ambiguous identifier as an authentication failure.
 */
export class StaffLoginDto {
  @ValidateIf((o) => !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  @MinLength(3)
  phone?: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class StaffRefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class StaffLogoutDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
