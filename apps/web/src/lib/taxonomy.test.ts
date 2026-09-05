import { describe, expect, it } from 'vitest';
import { toggleCategory } from './taxonomy';

describe('toggleCategory', () => {
  it('selects, deselects, and ignores unavailable chips', () => {
    expect(toggleCategory('', 'mains', true)).toBe('mains');
    expect(toggleCategory('mains', 'mains', true)).toBe('');
    expect(toggleCategory('mains', 'breads', true)).toBe('breads');
    expect(toggleCategory('mains', 'desserts', false)).toBe('mains');
  });
});
