import { User } from '../user.entity';

/** Data needed to persist a new consumer user. */
export interface NewUserData {
  phoneCountryCode: string;
  phone: string;
  email?: string | null;
  passwordHash?: string | null;
  isVerified?: boolean;
}

/**
 * Internal credential record used ONLY by the authentication layer to verify a
 * login. Deliberately separate from the public `User` entity so credential
 * material (passwordHash) is never exposed through domain/API responses.
 */
export interface AuthUserRecord {
  id: string;
  passwordHash: string | null;
  isBlocked: boolean;
  isVerified: boolean;
}

/**
 * Persistence PORT for consumer users. Domain/application depend on this
 * abstraction; the Prisma adapter lives in infrastructure. Domain never imports
 * Prisma directly (P1.6 dependency-direction convention).
 */
export abstract class UserRepository {
  abstract create(data: NewUserData): Promise<User>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByPhone(phoneCountryCode: string, phone: string): Promise<User | null>;
  abstract findAuthByPhone(phoneCountryCode: string, phone: string): Promise<AuthUserRecord | null>;
  abstract findAuthByEmail(email: string): Promise<AuthUserRecord | null>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
