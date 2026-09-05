import { describe, expect, it } from 'vitest';
import { newIdempotencyKey } from './session';

describe('newIdempotencyKey', () => {
  it('returns unique keys for checkout retries', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(8);
  });
});
