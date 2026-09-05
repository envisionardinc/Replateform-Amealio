import { describe, expect, it } from 'vitest';
import { AMEALIO_TOKENS, BRAND_NAME } from './tokens';

describe('amealio design tokens (doc 93)', () => {
  it('preserves verified consumer navy/blue and lowercase brand', () => {
    expect(BRAND_NAME).toBe('amealio');
    expect(AMEALIO_TOKENS.color.navy).toBe('#001D51');
    expect(AMEALIO_TOKENS.color.blue).toBe('#0B82E6');
    expect(AMEALIO_TOKENS.color.page).toBe('#F4F5FA');
    expect(AMEALIO_TOKENS.color.error).toBe('#DF031F');
    expect(AMEALIO_TOKENS.font.family).toBe('Mulish');
  });

  it('does not use the first-slice scaffold green or merchant purple', () => {
    const values = Object.values(AMEALIO_TOKENS.color);
    expect(values).not.toContain('#0f6b4c');
    expect(values).not.toContain('#123528');
    expect(values).not.toContain('#40299B');
    expect(values).not.toContain('#fc5a47');
  });
});
