import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ProfilePreferences, UserProfileRecord } from '../domain/user-profile.types';

const PROFILE_SELECT = {
  userId: true,
  detailsSubmitted: true,
  completionPercentage: true,
  preferences: true,
} as const;

type Row = {
  userId: string;
  detailsSubmitted: boolean;
  completionPercentage: number;
  preferences: unknown;
};

function toRecord(row: Row): UserProfileRecord {
  const prefs =
    typeof row.preferences === 'object' &&
    row.preferences !== null &&
    !Array.isArray(row.preferences)
      ? (row.preferences as ProfilePreferences)
      : null;
  return {
    userId: row.userId,
    detailsSubmitted: row.detailsSubmitted,
    completionPercentage: row.completionPercentage,
    preferences: prefs,
  };
}

/**
 * Read/write access to the per-user `UserProfile` state (P1.7.8). Keyed by
 * `userId` (1:1). Ownership is enforced by `UserProfileService`. Preference
 * updates SHALLOW-MERGE to preserve unrelated keys.
 */
@Injectable()
export class UserProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<UserProfileRecord | null> {
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: PROFILE_SELECT,
      });
      return row ? toRecord(row) : null;
    } catch {
      return null;
    }
  }

  /** Create-or-update the profile state for a user (profile is 1:1 with User). */
  async upsertState(
    userId: string,
    data: { detailsSubmitted?: boolean; completionPercentage?: number },
  ): Promise<UserProfileRecord> {
    const row = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
      select: PROFILE_SELECT,
    });
    return toRecord(row);
  }

  /** Shallow-merge `patch` into `preferences`, preserving unrelated keys. */
  async mergePreferences(userId: string, patch: ProfilePreferences): Promise<UserProfileRecord> {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const base =
      existing &&
      typeof existing.preferences === 'object' &&
      existing.preferences !== null &&
      !Array.isArray(existing.preferences)
        ? (existing.preferences as ProfilePreferences)
        : {};
    const merged = { ...base, ...patch } as Prisma.InputJsonValue;
    const row = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, preferences: merged },
      update: { preferences: merged },
      select: PROFILE_SELECT,
    });
    return toRecord(row);
  }

  /** Write the full preferences object after an allowlisted merge/clear. */
  async savePreferences(
    userId: string,
    preferences: ProfilePreferences,
  ): Promise<UserProfileRecord> {
    const row = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, preferences: preferences as Prisma.InputJsonValue },
      update: { preferences: preferences as Prisma.InputJsonValue },
      select: PROFILE_SELECT,
    });
    return toRecord(row);
  }
}
