import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

/**
 * Server-side refresh sessions (P1.7.1B). Uses the P1.5 `Session` table
 * (references `User` — appropriate for consumer auth; NOT modified for staff).
 * A session row IS the revocation source of truth: deleting it revokes it.
 */
@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, refreshTokenHash: string, expiresAt: Date): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: { userId, refreshTokenHash, expiresAt },
      select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true },
    });
  }

  async findById(id: string): Promise<SessionRecord | null> {
    try {
      return await this.prisma.session.findUnique({
        where: { id },
        select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true },
      });
    } catch {
      // e.g. malformed UUID in a forged token id -> treat as not found (401 upstream).
      return null;
    }
  }

  /** Rotate the stored refresh hash + sliding expiry for an existing session. */
  rotate(id: string, refreshTokenHash: string, expiresAt: Date): Promise<SessionRecord> {
    return this.prisma.session.update({
      where: { id },
      data: { refreshTokenHash, expiresAt },
      select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true },
    });
  }

  /** Revoke (delete) a session. Idempotent: missing row is treated as revoked. */
  async revoke(id: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id } });
  }
}
