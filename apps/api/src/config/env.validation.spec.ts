import { validateEnv, NodeEnv } from './env.validation';

describe('env validation', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public' };

  it('accepts a valid config and applies defaults', () => {
    const cfg = validateEnv({ ...base });
    expect(cfg.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(cfg.NODE_ENV).toBe(NodeEnv.development);
    expect(cfg.PORT).toBe(3000);
  });

  it('coerces PORT to a number', () => {
    const cfg = validateEnv({ ...base, PORT: '4001' });
    expect(cfg.PORT).toBe(4001);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment configuration/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'prd' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...base, PORT: '99999' })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
