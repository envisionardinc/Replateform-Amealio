import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PhoneNumber } from '../domain/value-objects/phone-number';
import { EmailAddress } from '../domain/value-objects/email-address';
import { USER_REPOSITORY, UserRepository } from '../domain/ports/user.repository';
import { PASSWORD_HASHER, PasswordHasher } from '../domain/ports/password-hasher';
import { User } from '../domain/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

/**
 * Registers a consumer user.
 * Evidence-backed baseline behavior reproduced structurally:
 *  - keyed on (country_code, mobile_number); duplicate -> conflict (baseline 409,
 *    amealio-vendordashboard src/services/vendor-user/vendor-user.hooks.ts:26-30 for
 *    vendor; unique constraint for consumers in P1.5).
 *  - new users are UNVERIFIED (baseline user_verified default false;
 *    otp-authentication.class.ts create()). OTP verification is deferred.
 *  - password (when supplied) is bcrypt-hashed (baseline uses bcryptjs).
 * NOT implemented here (deferred): token/session issuance, OTP verify, social login.
 */
@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: CreateUserDto): Promise<User> {
    const phone = PhoneNumber.create(input.phoneCountryCode, input.phone);
    const email = input.email ? EmailAddress.create(input.email) : null;

    const existing = await this.users.findByPhone(phone.countryCode, phone.number);
    if (existing) {
      throw new ConflictException('An account with this phone number already exists');
    }

    const passwordHash = input.password ? await this.hasher.hash(input.password) : null;

    return this.users.create({
      phoneCountryCode: phone.countryCode,
      phone: phone.number,
      email: email?.value ?? null,
      passwordHash,
      isVerified: false,
    });
  }
}
