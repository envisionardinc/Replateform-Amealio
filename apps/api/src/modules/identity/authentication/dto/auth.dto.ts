import { IsEmail, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';

/** Register a consumer with a password credential (P1.7.1B initial scope). */
export class RegisterConsumerDto {
  @IsString()
  @Matches(/^\+?\d{1,4}$/, { message: 'phoneCountryCode must be a valid country code' })
  phoneCountryCode!: string;

  @IsString()
  @Matches(/^\d{6,15}$/, { message: 'phone must be 6-15 digits' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

/** Login by phone (+country code) or email, plus password. */
export class LoginConsumerDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{1,4}$/)
  phoneCountryCode?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  @Matches(/^\d{6,15}$/)
  phone?: string;

  @ValidateIf((o) => !o.phone)
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
