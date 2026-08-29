import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const srcAlias = fileURLToPath(new URL('./src', import.meta.url));
const serverOnlyStub = fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url));

const alias = { '@': srcAlias, 'server-only': serverOnlyStub };

export default defineConfig({
  resolve: { alias },
  test: {
    // A single worker keeps the shared integration schema deterministic.
    pool: 'forks',
    maxWorkers: 1,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
          testTimeout: 10_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          globalSetup: ['tests/integration/global-setup.ts'],
          // Integration tests share one PostgreSQL schema, so they must not
          // run concurrently with each other. Isolation stays on so each file
          // gets its own module registry — without it, whichever file loaded
          // `next/headers` first would win, and per-file mocks would not apply.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
