import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface StaffSessionRecord {
  id: string;
  staffMemberId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

/**
 * Server-side staff/admin refresh sessions (P1.7.1E). Uses the P1.7.1D
 * `StaffSession` table — intentionally SEPARATE from the consumer `Session`.
 * A session row IS the revocation source of truth: deleting it revokes it
 * (no schema-level revokedAt is required — see the mandatory preflight).
 */
@Injectable()
export class StaffSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    staffMemberId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<StaffSessionRecord> {
    return this.prisma.staffSession.create({
      data: { staffMemberId, refreshTokenHash, expiresAt },
      select: { id: true, staffMemberId: true, refreshTokenHash: true, expiresAt: true },
    });
  }

  async findById(id: string): Promise<StaffSessionRecord | null> {
    try {
      return await this.prisma.staffSession.findUnique({
        where: { id },
        select: { id: true, staffMemberId: true, refreshTokenHash: true, expiresAt: true },
      });
    } catch {
      // Malformed UUID in a forged token id -> treat as not found (401 upstream).
      return null;
    }
  }

  /** Rotate the stored refresh hash + sliding expiry for an existing session. */
  rotate(id: string, refreshTokenHash: string, expiresAt: Date): Promise<StaffSessionRecord> {
    return this.prisma.staffSession.update({
      where: { id },
      data: { refreshTokenHash, expiresAt },
      select: { id: true, staffMemberId: true, refreshTokenHash: true, expiresAt: true },
    });
  }

  /** Revoke (delete) a session. Idempotent: a missing row is treated as revoked. */
  async revoke(id: string): Promise<void> {
    await this.prisma.staffSession.deleteMany({ where: { id } });
  }
}
