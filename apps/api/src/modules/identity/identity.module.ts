import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/ports/user.repository';
import { PASSWORD_HASHER } from './domain/ports/password-hasher';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { RegisterUserUseCase } from './application/register-user.use-case';
import { GetUserUseCase } from './application/get-user.use-case';
import { RolesGuard } from './authorization/roles.guard';

/**
 * Identity domain module (P1.7.1 — minimal, evidence-backed foundation).
 * Provides consumer-user management, a bcrypt password hasher, and role-based
 * authorization infrastructure. Ports are bound to their infrastructure adapters
 * here (composition root). NO HTTP endpoints are exposed (no legacy API contract
 * is invented); NO token/OTP/social-auth or permission-tree behavior is implemented.
 */
@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    RegisterUserUseCase,
    GetUserUseCase,
    RolesGuard,
  ],
  exports: [RegisterUserUseCase, GetUserUseCase, RolesGuard, USER_REPOSITORY, PASSWORD_HASHER],
})
export class IdentityModule {}
