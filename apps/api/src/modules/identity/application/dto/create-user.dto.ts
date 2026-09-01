import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * Input for registering a consumer user (structural validation only).
 * Not exposed as an HTTP endpoint in P1.7.1 (no legacy API contract is invented);
 * used by the application use-case and tests.
 */
export class CreateUserDto {
  @IsString()
  @Matches(/^\+?\d{1,4}$/, { message: 'phoneCountryCode must be a valid country code' })
  phoneCountryCode!: string;

  @IsString()
  @Matches(/^\d{6,15}$/, { message: 'phone must be 6-15 digits' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
