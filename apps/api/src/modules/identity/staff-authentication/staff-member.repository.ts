import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { StaffRoleName } from './staff-principal';

export type StaffAccountStatusName = 'ACTIVE' | 'BLOCKED';

/**
 * Credential record used ONLY by the staff authentication layer to verify a
 * login. `secretHash` is the stored bcrypt hash of the PASSWORD credential and
 * is never exposed beyond this layer.
 */
export interface StaffAuthRecord {
  id: string;
  merchantId: string | null;
  staffRole: StaffRoleName;
  status: StaffAccountStatusName;
  secretHash: string | null;
}

/** Minimal identity used by the guard/refresh to re-check status per request. */
export interface StaffIdentity {
  id: string;
  merchantId: string | null;
  staffRole: StaffRoleName;
  status: StaffAccountStatusName;
  deletedAt: Date | null;
}

/** Non-secret profile view returned by `/me`. */
export interface StaffProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  merchantId: string | null;
  staffRole: StaffRoleName;
  status: StaffAccountStatusName;
}

/**
 * Data access for staff/admin authentication (P1.7.1E). Reads StaffMember +
 * its PASSWORD StaffCredential. Because login identifiers (email/phone) are NOT
 * unique in the schema (O1 open), lookups resolve to exactly ONE non-deleted
 * StaffMember or return null — an ambiguous identifier is never authenticated.
 */
@Injectable()
export class StaffMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveAuth(
    where: { email: { equals: string; mode: 'insensitive' } } | { phone: string },
  ): Promise<StaffAuthRecord | null> {
    const rows = await this.prisma.staffMember.findMany({
      where: { ...where, deletedAt: null },
      select: {
        id: true,
        merchantId: true,
        staffRole: true,
        status: true,
        credentials: {
          where: { type: 'PASSWORD' },
          select: { secretHash: true },
          take: 1,
        },
      },
      take: 2,
    });
    // Not found OR ambiguous (>1 match) => uniform authentication failure.
    if (rows.length !== 1) return null;
    const r = rows[0];
    return {
      id: r.id,
      merchantId: r.merchantId,
      staffRole: r.staffRole as StaffRoleName,
      status: r.status as StaffAccountStatusName,
      secretHash: r.credentials[0]?.secretHash ?? null,
    };
  }

  findAuthByEmail(email: string): Promise<StaffAuthRecord | null> {
    return this.resolveAuth({ email: { equals: email.trim(), mode: 'insensitive' } });
  }

  findAuthByPhone(phone: string): Promise<StaffAuthRecord | null> {
    return this.resolveAuth({ phone: phone.trim() });
  }

  async findIdentityById(id: string): Promise<StaffIdentity | null> {
    try {
      const row = await this.prisma.staffMember.findUnique({
        where: { id },
        select: { id: true, merchantId: true, staffRole: true, status: true, deletedAt: true },
      });
      if (!row) return null;
      return {
        id: row.id,
        merchantId: row.merchantId,
        staffRole: row.staffRole as StaffRoleName,
        status: row.status as StaffAccountStatusName,
        deletedAt: row.deletedAt,
      };
    } catch {
      // Malformed UUID (e.g. forged token subject) -> treat as not found.
      return null;
    }
  }

  async findProfileById(id: string): Promise<StaffProfile | null> {
    const row = await this.prisma.staffMember.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        merchantId: true,
        staffRole: true,
        status: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      merchantId: row.merchantId,
      staffRole: row.staffRole as StaffRoleName,
      status: row.status as StaffAccountStatusName,
    };
  }
}
