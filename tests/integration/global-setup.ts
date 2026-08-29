import { execFileSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Prepares the isolated integration database once per run.
 *
 * `.env.test` must point at a throwaway database: every test truncates it. The
 * guard below refuses to run against anything not obviously a test database, so
 * a mistyped DATABASE_URL cannot wipe development data.
 */
export default function globalSetup(): void {
  loadEnv({ path: resolve(process.cwd(), '.env.test'), override: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.test.example to .env.test.');
  }
  if (!/test/i.test(databaseUrl)) {
    throw new Error(
      `Refusing to run integration tests against "${databaseUrl}": the database name must contain "test".`,
    );
  }

  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
