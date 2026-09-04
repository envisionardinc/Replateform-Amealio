import { BcryptPasswordHasher } from './bcrypt-password-hasher';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('hashes to a bcrypt string and verifies the correct password', async () => {
    const hash = await hasher.hash('CorrectHorse9');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    expect(hash).not.toContain('CorrectHorse9');
    expect(await hasher.verify('CorrectHorse9', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hasher.hash('CorrectHorse9');
    expect(await hasher.verify('wrong-password', hash)).toBe(false);
  });

  it('returns false for an empty hash', async () => {
    expect(await hasher.verify('anything', '')).toBe(false);
  });
});
