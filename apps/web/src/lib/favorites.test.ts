import { describe, expect, it } from 'vitest';
import type { Favorite } from './api';
import { favoriteHref, favoriteTitle, favoritesByType, isFavorited } from './favorites';

const restaurant: Favorite = {
  id: '1',
  targetType: 'RESTAURANT',
  targetId: 'r1',
  createdAt: '2026-09-05T00:00:00.000Z',
  restaurant: { id: 'r1', name: 'DEV Test Kitchen', city: 'Pune', status: 'ACTIVE' },
  item: null,
};

const item: Favorite = {
  id: '2',
  targetType: 'MENU_ITEM',
  targetId: 'i1',
  createdAt: '2026-09-05T00:00:00.000Z',
  restaurant: null,
  item: {
    id: 'i1',
    name: 'Paneer',
    restaurantId: 'r1',
    availability: 'AVAILABLE',
    isPublished: true,
  },
};

describe('consumer favorites (doc 97)', () => {
  it('detects membership and filters by type', () => {
    expect(isFavorited([restaurant, item], 'RESTAURANT', 'r1')).toBe(true);
    expect(isFavorited([restaurant, item], 'MENU_ITEM', 'missing')).toBe(false);
    expect(favoritesByType([restaurant, item], 'MENU_ITEM')).toEqual([item]);
  });

  it('builds list links without inventing a discovery API', () => {
    expect(favoriteHref(restaurant)).toBe('/restaurants/r1');
    expect(favoriteHref(item)).toBe('/items/i1');
    expect(favoriteTitle(restaurant)).toBe('DEV Test Kitchen');
    expect(favoriteTitle(item)).toBe('Paneer');
  });
});
