import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Database fixtures for the browser suite.
 *
 * Playwright drives the real production server, so the tests cannot reach into
 * the application's own Prisma client. Instead they shell out to a seeding
 * script that talks to the same test database the server is configured with.
 */

/** Variables the browser suite needs, wherever they come from. */
const REQUIRED = ['DATABASE_URL', 'APP_ORIGIN', 'SESSION_SECRET', 'JUSTGIVING_URL'] as const;

/**
 * Configuration for the browser suite.
 *
 * Reads `.env.e2e` for local runs, and falls back to the ambient environment so
 * CI can supply the same values directly without committing a file.
 */
export function e2eEnv(): Record<string, string> {
  const path = resolve(process.cwd(), '.env.e2e');
  const env: Record<string, string> = {};

  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    for (const key of REQUIRED) {
      const value = process.env[key];
      if (!value) {
        throw new Error(
          `.env.e2e is missing and ${key} is not set. ` +
            'Copy .env.e2e.example to .env.e2e, or export the variables directly.',
        );
      }
      env[key] = value;
    }
    if (process.env.LOG_LEVEL) env.LOG_LEVEL = process.env.LOG_LEVEL;
    return env;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** Wipes the test database and loads the browser-suite fixture. */
export function resetAndSeed(): void {
  execFileSync('node_modules/.bin/tsx', ['tests/e2e/seed-e2e.ts'], {
    stdio: 'pipe',
    env: { ...process.env, ...e2eEnv(), ALLOW_SAMPLE_SEED: 'true' },
  });
}

export interface AdminAccount {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export const ADMIN: AdminAccount = {
  email: 'e2e.admin@example.invalid',
  password: 'e2e-admin-password-long-enough',
  displayName: 'E2E Administrator',
};

export const SECOND_ADMIN: AdminAccount = {
  email: 'e2e.second@example.invalid',
  password: 'e2e-second-password-long-enough',
  displayName: 'E2E Second Admin',
};
