import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuthUserRecord, NewUserData, UserRepository } from '../domain/ports/user.repository';
import { User } from '../domain/user.entity';

/** Prisma adapter for the UserRepository port (P1.5 `User` table). */
@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: NewUserData): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        phoneCountryCode: data.phoneCountryCode,
        phone: data.phone,
        email: data.email ?? null,
        passwordHash: data.passwordHash ?? null,
        isVerified: data.isVerified ?? false,
      },
    });
    return PrismaUserRepository.toDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? PrismaUserRepository.toDomain(row) : null;
  }

  async findByPhone(phoneCountryCode: string, phone: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { phoneCountryCode_phone: { phoneCountryCode, phone } },
    });
    return row ? PrismaUserRepository.toDomain(row) : null;
  }

  async findAuthByPhone(phoneCountryCode: string, phone: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({
      where: { phoneCountryCode_phone: { phoneCountryCode, phone } },
      select: { id: true, passwordHash: true, isBlocked: true, isVerified: true },
    });
    return row;
  }

  async findAuthByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, isBlocked: true, isVerified: true },
    });
    return row;
  }

  private static toDomain(row: Prisma.UserGetPayload<object>): User {
    return new User({
      id: row.id,
      phoneCountryCode: row.phoneCountryCode,
      phone: row.phone,
      email: row.email,
      isVerified: row.isVerified,
      isBlocked: row.isBlocked,
      createdAt: row.createdAt,
    });
  }
}
