import type { Favorite, FavoriteTargetType } from './api';

export const FAVORITES_COPY = {
  title: 'Favorites',
  lede: 'Saved restaurants and dishes. These do not change discovery ranking or checkout.',
  signIn: 'Sign in to save and view favorites.',
  emptyRestaurants: 'No saved restaurants.',
  emptyItems: 'No saved dishes.',
  saved: 'Saved',
  saveRestaurant: 'Save restaurant',
  saveItem: 'Save dish',
} as const;

export function isFavorited(
  rows: Favorite[],
  targetType: FavoriteTargetType,
  targetId: string,
): boolean {
  return rows.some((row) => row.targetType === targetType && row.targetId === targetId);
}

export function favoritesByType(rows: Favorite[], targetType: FavoriteTargetType): Favorite[] {
  return rows.filter((row) => row.targetType === targetType);
}

export function favoriteHref(row: Favorite): string | null {
  if (row.targetType === 'RESTAURANT') return `/restaurants/${row.targetId}`;
  if (row.targetType === 'MENU_ITEM') return `/items/${row.targetId}`;
  return null;
}

export function favoriteTitle(row: Favorite): string {
  if (row.targetType === 'RESTAURANT') return row.restaurant?.name ?? 'Restaurant';
  return row.item?.name ?? 'Dish';
}
