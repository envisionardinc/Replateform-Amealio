import { describe, expect, it } from 'vitest';
import { ACCESS_PREFIX_GUARD } from './session-keys';

describe('staff session keys', () => {
  it('does not reuse the consumer session prefix', () => {
    expect(ACCESS_PREFIX_GUARD).toBe('amealio.staff.');
    expect(ACCESS_PREFIX_GUARD).not.toBe('amealio.');
  });
});
