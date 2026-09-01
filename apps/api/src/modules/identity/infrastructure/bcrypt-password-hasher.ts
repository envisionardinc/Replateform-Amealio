import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PasswordHasher } from '../domain/ports/password-hasher';

/**
 * bcrypt adapter for the PasswordHasher port. Matches the baseline algorithm
 * (bcryptjs) so this is not an invented scheme. Used for NEW users only; NO
 * legacy password data is migrated in this phase.
 */
@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
  private readonly rounds = 10;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    return bcrypt.compare(plain, hash);
  }
}
