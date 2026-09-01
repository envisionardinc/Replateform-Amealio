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
 * Persistence PORT for consumer users. Domain/application depend on this
 * abstraction; the Prisma adapter lives in infrastructure. Domain never imports
 * Prisma directly (P1.6 dependency-direction convention).
 */
export abstract class UserRepository {
  abstract create(data: NewUserData): Promise<User>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByPhone(phoneCountryCode: string, phone: string): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
