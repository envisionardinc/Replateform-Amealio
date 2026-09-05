import { Injectable } from '@nestjs/common';
import { FavouriteTargetType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type FavouriteRow = {
  id: string;
  userId: string;
  targetType: FavouriteTargetType;
  targetId: string;
  createdAt: Date;
};

const SELECT = {
  id: true,
  userId: true,
  targetType: true,
  targetId: true,
  createdAt: true,
} as const;

const SUPPORTED = [FavouriteTargetType.RESTAURANT, FavouriteTargetType.MENU_ITEM] as const;

@Injectable()
export class FavouriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  listMine(userId: string, targetType?: 'RESTAURANT' | 'MENU_ITEM'): Promise<FavouriteRow[]> {
    return this.prisma.favourite.findMany({
      where: {
        userId,
        targetType: targetType ?? { in: [...SUPPORTED] },
      },
      select: SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  findMine(
    userId: string,
    targetType: 'RESTAURANT' | 'MENU_ITEM',
    targetId: string,
  ): Promise<FavouriteRow | null> {
    return this.prisma.favourite.findUnique({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      select: SELECT,
    });
  }

  async addMine(
    userId: string,
    targetType: 'RESTAURANT' | 'MENU_ITEM',
    targetId: string,
  ): Promise<FavouriteRow> {
    try {
      return await this.prisma.favourite.create({
        data: { userId, targetType, targetId },
        select: SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.findMine(userId, targetType, targetId);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async removeMine(
    userId: string,
    targetType: 'RESTAURANT' | 'MENU_ITEM',
    targetId: string,
  ): Promise<void> {
    try {
      await this.prisma.favourite.delete({
        where: { userId_targetType_targetId: { userId, targetType, targetId } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return;
      }
      throw err;
    }
  }
}
