/**
 * Password hashing PORT. The baseline hashes with bcrypt (bcryptjs) via
 * @feathersjs/authentication-local — see amealio-vendordashboard
 * src/services/user-service/user-service.hooks.ts (hashPassword) and package.json
 * ("bcryptjs": "2.4.3"). The target adapter uses bcrypt for new users only;
 * NO legacy password data is migrated in this phase.
 */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(plain: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
