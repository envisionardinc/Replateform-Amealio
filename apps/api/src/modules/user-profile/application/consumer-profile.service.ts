import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ProfilePreferences } from '../domain/user-profile.types';
import { UserProfileRepository } from '../infrastructure/user-profile.repository';
import { UserProfileService } from './user-profile.service';

const PREF_KEYS = ['dietary_preferences', 'allergies'] as const;
type PrefKey = (typeof PREF_KEYS)[number];

export type ConsumerProfileView = {
  userId: string;
  phoneCountryCode: string;
  phone: string;
  email: string | null;
  isVerified: boolean;
  detailsSubmitted: boolean;
  completionPercentage: number;
  preferences: { dietary_preferences: string[]; allergies: string[] };
};

@Injectable()
export class ConsumerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: UserProfileService,
    private readonly repo: UserProfileRepository,
  ) {}

  async getMine(userId: string): Promise<ConsumerProfileView> {
    const user = await this.requireUser(userId);
    const profile = await this.profiles.getProfile(userId);
    return this.toView(user, profile?.preferences ?? null, profile);
  }

  async patchMine(
    userId: string,
    patch: {
      email?: string | null;
      preferences?: { dietary_preferences?: string[] | null; allergies?: string[] | null };
    },
  ): Promise<ConsumerProfileView> {
    await this.requireUser(userId);
    if (patch.email !== undefined) {
      await this.writeEmail(userId, patch.email);
    }
    if (patch.preferences) {
      await this.writePreferences(userId, patch.preferences);
    }
    return this.getMine(userId);
  }

  private async requireUser(userId: string) {
    if (!userId) throw new UnauthorizedException('Consumer authentication required');
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        phoneCountryCode: true,
        phone: true,
        email: true,
        isVerified: true,
      },
    });
    if (!user) throw new NotFoundException('Profile not found');
    return user;
  }

  private async writeEmail(userId: string, email: string | null): Promise<void> {
    const next = email === null ? null : email.trim().toLowerCase();
    if (next) {
      const clash = await this.prisma.user.findFirst({
        where: { email: next, id: { not: userId } },
        select: { id: true },
      });
      if (clash) throw new ConflictException('email is already in use');
    }
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { email: next } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('email is already in use');
      }
      throw err;
    }
  }

  private async writePreferences(
    userId: string,
    patch: { dietary_preferences?: string[] | null; allergies?: string[] | null },
  ): Promise<void> {
    const current = (await this.profiles.getProfile(userId))?.preferences ?? {};
    const next: ProfilePreferences = { ...current };
    for (const key of PREF_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const value = patch[key as PrefKey];
      if (value === null) {
        delete next[key];
        continue;
      }
      if (value !== undefined) next[key] = this.normalizeLabels(value, key);
    }
    await this.repo.savePreferences(userId, next);
  }

  private normalizeLabels(value: string[], key: string): string[] {
    const labels = value.map((item) => item.trim()).filter(Boolean);
    if (labels.length !== value.length) {
      throw new BadRequestException(`${key} entries must be non-empty strings`);
    }
    if (labels.some((item) => item.length > 40)) {
      throw new BadRequestException(`${key} entries must be at most 40 characters`);
    }
    const unique = [...new Set(labels)];
    if (unique.length > 10) {
      throw new BadRequestException(`${key} may contain at most 10 labels`);
    }
    return unique;
  }

  private toView(
    user: {
      id: string;
      phoneCountryCode: string;
      phone: string;
      email: string | null;
      isVerified: boolean;
    },
    preferences: ProfilePreferences | null,
    profile: { detailsSubmitted: boolean; completionPercentage: number } | null | undefined,
  ): ConsumerProfileView {
    return {
      userId: user.id,
      phoneCountryCode: user.phoneCountryCode,
      phone: user.phone,
      email: user.email,
      isVerified: user.isVerified,
      detailsSubmitted: profile?.detailsSubmitted ?? false,
      completionPercentage: profile?.completionPercentage ?? 0,
      preferences: {
        dietary_preferences: asStringArray(preferences?.dietary_preferences),
        allergies: asStringArray(preferences?.allergies),
      },
    };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}
