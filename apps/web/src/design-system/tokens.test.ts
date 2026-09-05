import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AMEALIO_TOKENS, BRAND_NAME } from './tokens';

const stylesCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../styles.css'),
  'utf8',
);

describe('amealio design tokens (doc 93)', () => {
  it('preserves verified consumer navy/blue and lowercase brand', () => {
    expect(BRAND_NAME).toBe('amealio');
    expect(AMEALIO_TOKENS.color.navy).toBe('#001D51');
    expect(AMEALIO_TOKENS.color.blue).toBe('#0B82E6');
    expect(AMEALIO_TOKENS.color.page).toBe('#F4F5FA');
    expect(AMEALIO_TOKENS.color.error).toBe('#DF031F');
  });

  it('uses Inter as the only target font family', () => {
    expect(AMEALIO_TOKENS.font.family).toBe('Inter');
    expect(stylesCss).toMatch(/family=Inter/);
    expect(stylesCss).toMatch(/--ame-font:\s*'Inter'/);
    expect(stylesCss).toMatch(/body\s*\{[^}]*font-family:\s*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/h1,\s*h2,\s*h3\s*\{[^}]*font-family:\s*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/\.btn\s*\{[^}]*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/\.field\s*\{[^}]*font-family:\s*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/\.field input[\s\S]*var\(--ame-font\)/);
    expect(stylesCss).toMatch(/\.card\s*\{[^}]*font-family:\s*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/\.app-tabbar a[\s\S]*var\(--ame-font\)/);
    expect(stylesCss).toMatch(/\.banner\s*\{[^}]*font-family:\s*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/\.badge\s*\{[^}]*font-family:\s*var\(--ame-font\)/s);
    expect(stylesCss).toMatch(/\.chip\s*\{[^}]*var\(--ame-font\)/s);
    expect(stylesCss).not.toMatch(/Mulish/i);
    expect(stylesCss).not.toMatch(/family=Mulish/i);
  });

  it('does not use the first-slice scaffold green or merchant purple', () => {
    const values = Object.values(AMEALIO_TOKENS.color);
    expect(values).not.toContain('#0f6b4c');
    expect(values).not.toContain('#123528');
    expect(values).not.toContain('#40299B');
    expect(values).not.toContain('#fc5a47');
  });
});
