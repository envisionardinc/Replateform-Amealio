import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const CONSUMER_FAVORITE_TYPES = ['RESTAURANT', 'MENU_ITEM'] as const;
export type ConsumerFavoriteType = (typeof CONSUMER_FAVORITE_TYPES)[number];

export class ListFavoritesQueryDto {
  @IsOptional()
  @IsIn(CONSUMER_FAVORITE_TYPES)
  targetType?: ConsumerFavoriteType;
}

export class PutFavoriteDto {
  @IsIn(CONSUMER_FAVORITE_TYPES)
  targetType!: ConsumerFavoriteType;

  @IsUUID()
  targetId!: string;
}
