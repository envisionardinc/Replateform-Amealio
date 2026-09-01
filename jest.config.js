/** Jest config — single test runner for the target platform (P1.6).
 * ts-jest emits decorator metadata required by NestJS DI (esbuild/tsx does not).
 * Covers NestJS app tests (apps/api) and the P1.5 database validation (tests/).
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  roots: ['<rootDir>/apps', '<rootDir>/tests'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testTimeout: 30000,
  verbose: true,
};
